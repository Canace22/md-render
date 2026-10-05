---
name: md-render-kb-source
description: 知识库新增节点类型 / 外部来源，以及 SQLite documents 与 FTS5 同步、索引膨胀和数据保全清理的规范。涉及"导入书签/Notion/本地文件""加一种条目类型""接入新来源""nodeType""documents 表加字段""知识库搜不到""索引膨胀""数据库异常变大"时触发。
---

# 知识库新增节点类型 / 外部来源规范

知识库的条目（文档、书签、概念……）**全部复用 `file` 节点**，用 `nodeType` 区分种类，不另起新结构。它们落在 SQLite `documents` 表并由 FTS5 索引。新增一种类型/来源最常见的漏步是：加了 nodeType 却忘了在 `KNOWLEDGE_NODE_TYPE_OPTIONS` 注册（于是 `normalizeNodeType` 把它打回 `document`），或给节点加了字段却没同步进 DB 的 flatten/upsert/迁移。

## 数据模型铁律

- **节点 = file**：`{ id, type:'file', name, nodeType, content, summary, tags, aliases, relatedIds, createdAt, updatedAt, ...自定义字段 }`。
- **nodeType 必须注册**：任何新 `nodeType` 先加进 `workspaceUtils.js` 的 `KNOWLEDGE_NODE_TYPE_OPTIONS`，否则 `normalizeNodeType` / `ensureKnowledgeFields` 会在每次 hydrate 时把它重置成 `document`，自定义字段也可能在 `{...node, ...createDefaultKnowledgeFields(node)}` 中保不住（spread 顺序：node 在前，自定义字段会保留，但 nodeType 必须合法）。
- **搜索靠 FTS 已索引的列**：`documents_fts` 只索引 `name, content, summary, aliases, tags`。新字段（如 url）**默认搜不到**——要么把内容塞进上述某列，要么接受「只用标题/标签可搜」。给 FTS 加新列需重建虚拟表+三个触发器，成本高，非必要别做。
- **纯函数放 workspaceUtils.js**：建节点的工厂函数（如 `createBookmarkNode`）写成纯函数放这里，详见 [[md-render-store]]。

## 新增一种来源的步骤（按顺序，缺一不可）

```mermaid
flowchart TD
    A["1. 注册 nodeType<br/>KNOWLEDGE_NODE_TYPE_OPTIONS"] --> B["2. 工厂函数 createXxxNode<br/>workspaceUtils.js 纯函数"]
    B --> C["3. 解析/抓取纯函数<br/>utils/xxxImport.js（node 可单测）"]
    C --> D["4. store action<br/>useEditorStore：建节点入树+persistWorkspace"]
    D --> E["5. DB 同步<br/>database.js"]
    E --> F["6. UI：导入入口 + 条目渲染分支"]
    F --> G["7. 单测 10 case + pnpm test:unit"]
```

1. **注册 nodeType**：`KNOWLEDGE_NODE_TYPE_OPTIONS` 加 `{ value, label }`。
2. **工厂函数**：`createXxxNode()` 纯函数，返回 file 节点；自定义字段（如 `url`）直接挂在节点上。
3. **解析纯函数**：放 `renderer/src/utils/`，**不要依赖 DOM**——vitest 环境是 `node`（见 `vitest.config.js`），`DOMParser` 不可用。解析 HTML 用正则状态机，不用 DOMParser。
4. **store action**：在 `useEditorStore` 加 action，用 `addChildNode` 入树、`persistWorkspace(next)` 落盘、`set(...)`。自动建归类目录时打自定义标记字段（如 `bookmarkFolder:true`）以便复用时定位，而不是靠目录名匹配。
5. **DB 同步**（`apps/editor/main/database.js`）——新增字段要改 **4 处**：
   - `SCHEMA` 的 `CREATE TABLE documents` 加列（新库）；
   - `initDatabase` 里加一行 `try { db.exec('ALTER TABLE documents ADD COLUMN xxx TEXT'); } catch {}`（老库迁移，仿 `disk_path` / `url`）；
   - `flattenWorkspace` 的 push 对象带上该字段；
   - `syncDocuments` 的 `upsert` SQL 列名 + `VALUES` 占位符都要加。
6. **UI**：导入入口（弹窗 modal 放在 `MarkdownEditor` 底部、状态用 `useState`）；条目渲染——若该类型不该用 BlockNote 编辑器，在 `MarkdownEditor` 的 paper 分支按 `selectedFile?.nodeType === 'xxx'` 分流到专用卡片组件。
7. **样式**用 `design-tokens.css` 的 CSS 变量（`--color-bg-surface` / `--color-border` / `--color-text-primary` 等），不硬编码颜色。

## 打开外链

渲染进程里 `window.open(url, '_blank')` 即可——main 进程已设 `setWindowOpenHandler` → `shell.openExternal` 转交系统浏览器；web 端开新标签页。**不需要新增 IPC**。

## documents / FTS 同步与膨胀修复

- `documents` 同步必须用 `INSERT ... ON CONFLICT(id) DO UPDATE` 保留 rowid，并用 NULL 安全的 `IS NOT` 比较跳过未变化行。禁止 `INSERT OR REPLACE`：它隐式删除旧行，默认不触发删除触发器，旧 FTS 记录会残留；频繁全工作区同步会累积到数十 GB。FTS 更新触发器只监听索引字段且判断值真的变化，老库在初始化时事务化升级触发器；重复写相同 `disk_path` 也应跳过。
- 实际体积先看文件大小、`page_count` / `freelist_count`；正文体积用 `octet_length`，不要把数据库文件大小等同于内容量。禁止在主线程扫描大 FTS 表；外部只读诊断也必须有耗时上限。
- 清理巨大坏索引时，运行 `scripts/rebuild-knowledge-db.py 源库 新库`：在一致性快照中只复制有效业务表和 schema，保留 rowid、历史 id、自增序列与所有设置，再在新库重建 FTS。脚本不原地修改源库，拒绝覆盖目标和未知 schema，并逐表核对哈希、完整性与外键。
- 正式切换必须先正常退出 app，确认没有数据库持有者；保留有效数据的独立备份，再替换数据库及对应 WAL/SHM。关闭的 WAL 模式库若普通只读打开失败，仅在无持有者、无未提交 WAL 时加 `--offline-source`；脚本会以 immutable 只读打开并核对源库未变化，禁止对运行中或仍有 WAL 的库使用该选项。启动修复版并复检后，才清理旧的大库。不要直接删整个 userData，也不要复制或 VACUUM 整个几十 GB 的坏库。
- 建议 case：重复保存不换 rowid、原样保存不触发索引写入、改文后旧词消失/新词可搜、删除后无孤立索引、重建后正文/历史/设置哈希一致。默认不主动跑测试，用户明确要求时再运行。

## 参考实现

书签导入是完整范例：`utils/bookmarkImport.js`（解析）+ `createBookmarkNode`（工厂）+ `importBookmarks`（store）+ `BookmarkImportModal`/`BookmarkCard`（UI）+ `tests/bookmark-import.test.js`（单测）。改动遵循 [[safe-change-workflow]]。
