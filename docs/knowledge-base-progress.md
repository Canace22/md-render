# 知识库功能实施进度

> 对应规划文档：[knowledge-base-roadmap.md](./knowledge-base-roadmap.md)
> 最后更新：2026-06-04

---

## 总体进度

```
P0 存储基建   ████████████████████  100%  ✅
P1 核心知识库  ████████████████████  100%  ✅
P2 智能增强   ░░░░░░░░░░░░░░░░░░░░    0%  🔜
P3 生态扩展   ░░░░░░░░░░░░░░░░░░░░    0%  🔜
```

---

## P0：存储基建 ✅

### P0.1 SQLite 持久化（已完成）

**目标**：替换 localStorage（5~10MB 上限），支持 1000+ 篇文档无性能问题。

**改动文件**：

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/editor/main/database.js` | 新建 | SQLite 封装层，完整 schema |
| `apps/editor/main/main.js` | 修改 | initDatabase + 5 个 IPC handlers |
| `apps/editor/main/preload.js` | 修改 | `electronAPI.db.*` 桥接方法 |
| `apps/editor/renderer/src/store/useEditorStore.js` | 修改 | 异步存储适配器，自动迁移 |
| `apps/editor/vite.config.js` | 修改 | `better-sqlite3` externalize |
| `apps/editor/package.json` | 修改 | 添加依赖，electron:rebuild 脚本 |

**关键实现**：
- SQLite schema：`app_state`、`documents`（含 FTS5 虚拟表 + 3 个同步触发器）、`links`、`versions`
- zustand persist 异步适配器：Electron 走 SQLite，Web 走 localStorage，首次启动自动迁移
- WAL 模式 + 事务批量写入

**注意事项**：
- `better-sqlite3` 是原生模块，需要 `pnpm electron:rebuild` 重新编译
- Vite build 必须 `external: ['better-sqlite3']` 否则打包失败

---

### P0.2 .md 文件双向同步（已完成）

**目标**：保证内置工作区文档始终有对应 .md 文件备份，数据可读。

**改动文件**：

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/editor/main/mdSync.js` | 新建 | 写盘逻辑 |
| `apps/editor/main/database.js` | 修改 | `disk_path` 字段 + `updateDocumentDiskPaths` |
| `apps/editor/main/main.js` | 修改 | db:save/migrate 触发异步写盘 |

**关键实现**：
- `documents` 表新增 `disk_path TEXT`（ALTER TABLE 迁移兼容旧 DB）
- 本地项目节点：`disk_path = path.join(projectRootPath, relativePath)`（已有文件，不重复写）
- 内置文档：写入 `~/Documents/MdRender/Artifacts/{name}.md`，写完回填 `disk_path`
- fire-and-forget 写盘，不阻塞 IPC 响应

---

## P1：核心知识库能力 ✅

### P1.1 双向链接（已完成）

**目标**：`[[文档名]]` 语法建立文档间引用，反向链接面板展示被引用关系。

**改动文件**：

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/editor/main/database.js` | 修改 | `extractWikilinks` + `syncAllLinks` + `getBacklinks` |
| `apps/editor/main/main.js` | 修改 | db:save 调用 syncAllLinks；新增 `db:get-backlinks` IPC |
| `apps/editor/main/preload.js` | 修改 | `getBacklinks` 桥接 |
| `apps/editor/renderer/src/components/KnowledgeMetaPanel.jsx` | 修改 | 反向链接区域 |
| `apps/editor/renderer/src/components/DocHeader.jsx` | 修改 | 透传 `onOpenFile` |
| `apps/editor/renderer/src/components/MarkdownEditor.jsx` | 修改 | 传 `onOpenFile={selectNode}` |

**关键实现**：
- 正则 `/\[\[([^\]|]{1,200})(?:\|[^\]]{0,200})?\]\]/g` 解析 `[[name]]` 和 `[[name|text]]`
- 名称→ID 映射：同时匹配 `name` 和 `name.md` 两种形式
- `syncAllLinks` 在每次 `db:save` 时同步调用（事务批量，性能可接受）
- `KnowledgeMetaPanel` 切换文档时 `useEffect` 拉取反向链接，仅 Electron 显示

**待完善**：
- BlockNote 编辑器 `[[` 输入触发自动补全（P1 规划内，未实施）

---

### P1.2 全文搜索 FTS5（已完成）

**目标**：搜索走主进程 SQLite FTS5，替代前端内存过滤，支持 1000 篇 < 100ms。

**改动文件**：

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/editor/renderer/src/components/KnowledgeBasePanel.jsx` | 修改 | FTS IPC 搜索 + 降级逻辑 |

**关键实现**：
- 搜索框 300ms 防抖后调用 `window.electronAPI.db.search(query)`
- 返回结果含 `excerpt`（SQLite `snippet()` 生成，`<mark>` 标注命中词）
- 前端 HTML 转义后还原 `<mark>` 标签（防 XSS）
- Electron 显示 "FTS" badge；Web 降级为内存过滤

---

### P1.3 图谱视图（已完成）

**目标**：可视化文档关联关系，支持 500+ 节点、缩放、拖拽、点击跳转。

**改动文件**：

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/editor/main/database.js` | 修改 | `getGraphData()` |
| `apps/editor/main/main.js` | 修改 | `db:get-graph` IPC |
| `apps/editor/main/preload.js` | 修改 | `getGraph` 桥接 |
| `apps/editor/renderer/src/components/GraphView.jsx` | 新建 | d3-force 图谱组件 |
| `apps/editor/renderer/src/components/KnowledgeBasePanel.jsx` | 修改 | graph 模式渲染 GraphView |
| `apps/editor/package.json` | 修改 | 添加 d3-force/drag/zoom/selection |

**关键实现**：
- d3-force 四力：link + charge + center + collision
- 节点大小随连接度自适应（高连接度节点更大）
- d3-drag：节点拖拽后回归力场（释放 fx/fy）
- d3-zoom：滚轮缩放（0.08–5x）+ 鼠标平移，双击重置视角
- 按 `node_type` 着色（concept/method/tech/component/document）
- `overview` 模式保留原静态预览，`graph` 模式使用完整 d3 图谱
- Web 降级：从 workspace `relatedIds` 构建边

---

### P1.4 版本历史（已完成）

**目标**：文档变更超阈值自动快照，支持时间线查看和一键恢复。

**改动文件**：

| 文件 | 类型 | 说明 |
|------|------|------|
| `apps/editor/main/database.js` | 修改 | `saveVersions` + `getVersions` + `getVersionById` |
| `apps/editor/main/main.js` | 修改 | db:save 调用 saveVersions；新增 2 个 IPC |
| `apps/editor/main/preload.js` | 修改 | `getVersions` + `getVersionContent` 桥接 |
| `apps/editor/renderer/src/components/KnowledgeMetaPanel.jsx` | 修改 | 版本历史列表 + 恢复按钮 |
| `apps/editor/renderer/src/components/DocHeader.jsx` | 修改 | 透传 `onRestoreVersion` |
| `apps/editor/renderer/src/components/MarkdownEditor.jsx` | 修改 | 传 `onRestoreVersion={updateSelectedFileContent}` |

**关键实现**：
- 快照条件：距上次版本 ≥5 分钟 且 内容差异 ≥50 字符
- 首次保存：无条件创建初始快照
- UI：最近 30 条版本，显示日期时间 + 字数，点击「恢复」直接还原

---

## P2：智能增强 🔜（未开始）

### P2.1 语义搜索

**技术选型**：`sqlite-vec` + ONNX Runtime（本地 embedding）

**风险点**：
- sqlite-vec 需要 Electron 原生编译（同 better-sqlite3，需 electron-rebuild）
- ONNX Runtime 首次下载模型 ~100MB（建议作为可选功能）
- 推荐模型：`text2vec-base-chinese`（中文优化）或 `all-MiniLM-L6-v2`

**实施步骤**（未执行）：
1. POC 验证 sqlite-vec + Electron 兼容性
2. 加 `vec_documents` 虚拟表
3. embedding 生成 + 写入向量
4. 混合搜索：FTS5 关键词得分 + 余弦相似度加权

### P2.2 AI 自动摘要/标签

- 接入 LLM API（字段 `summary`/`tags` 已就绪，只需填充数据）

### P2.3 AI 问答 RAG

- 依赖 P2.1 语义搜索

---

## P3：生态扩展 🔜（未开始）

| 功能 | 说明 |
|------|------|
| Web Clipper | Chrome 扩展，一键剪藏到知识库 |
| 批量导入 | Obsidian vault / Logseq graph / 纯 .md 目录 |
| 插件系统 | 开放 API，允许第三方扩展 |

---

## 技术债 / 待完善

| 项目 | 优先级 | 说明 |
|------|--------|------|
| `[[` 编辑器自动补全 | 中 | BlockNote mention 触发，参考 `NovelMentionMenu` |
| 版本 diff 预览 | 低 | 恢复前展示内容差异 |
| 图谱节点过滤 | 低 | 按 nodeType / 标签过滤显示 |
| FTS 中文分词 | 低 | 初期 unicode61 够用，后续可换 jieba |
| 迁移备份校验 | 中 | localStorage → SQLite 迁移后校验文档数 |

---

*文档版本：v1.0 | 更新日期：2026-06-04*
