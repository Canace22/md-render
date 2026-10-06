# md-render 数据迁移方案（数据层文件化）

> 状态：草案，待评审 · 2026-10-05
> 属于 `docs/ai-native-architecture-plan.md` 的 P3 阶段。主方案只写了「备份 → 脚本 → 双读 → 切换 → 观察 → 删旧」这个框架，本文把它展开。

## 一句话

把内容从 SQLite 和 localStorage 搬到 `~/Documents/MdRender` 下的真文件。迁移只增不删，id 保持不变，可以重复执行，执行前先预演，执行后可以回滚。

---

## 1. 现有数据盘点

以代码为准（`main/database.js`、`useEditorStore.js`、`mdSync.js`）：

| 数据 | 现在存在哪 | 迁移难点 | 迁到哪 |
|---|---|---|---|
| 内置文档树（文件夹 / 文档 / 书签） | SQLite `app_state` 里的 `workspace_json`（整棵树一个 JSON），`documents` 表是它的镜像。Web 版在 localStorage `md-renderer-workspace` | 文件名冲突；wikilink 按名字解析 | `Projects/内置文档/<原目录结构>/*.md`（落点待定，见第 7 节） |
| 文档元数据 | 部分在 frontmatter（`title / author / published / created`，平台稿另有 `platform / source / description`），其余是节点字段：`status`、`tags`、目标平台、`sourceMaterialIds`、`summary`、`aliases`、`relatedIds`、时间戳 | 字段多处来源，需要合并规则 | 全部写进 frontmatter |
| 书签节点 | `nodeType: 'bookmark'` + `url` 字段 | 没有正文 | `.md`，frontmatter 写 `type: bookmark`、`url` |
| 正文里的内嵌图片 | 没有项目根时，`uploadFile` 会降级成 base64 data URL 直接写进正文 | 单篇可能很大，Obsidian 里显示不了 | 抽出到 `assets/`，正文改成相对路径 |
| 版本历史 | SQLite `versions` 表 | 量大，没有对应的文件格式 | **不迁**。`knowledge.db` 归档只读；迁移后由 git 接管历史 |
| 反向链接 | SQLite `links` 表（从 `[[名字]]` 解析） | 属于派生数据 | 不迁，从文件重建索引 |
| 白板 | `workspace.canvasState`，**只有一个**白板，有两种引擎：卡片（`nodes / edges / viewport`）和 Excalidraw | 两种格式要分别映射 | 卡片 → `Canvas/白板.canvas`（JSON Canvas）；Excalidraw → `Canvas/白板.excalidraw` |
| Daily + 待办池 | localStorage `md-renderer-daily-workspace`（**桌面版也在 localStorage**） | 富文本（粗体、颜色）；只有 renderer 能读 localStorage | `Daily/YYYY-MM-DD.md` + `Todo.md` |
| 编辑部记忆 | 工作区树里的隐藏 `.agent` 节点 | 历史上出现过多份重复副本 | `.agent/memory/editorial.md` |
| 本地项目（`Projects/` 下已挂载的） | 已经是真文件，有 watcher | 只缺稳定 id | 不搬，只补 frontmatter `id` |
| `Artifacts/` 下的旧导出 | `mdSync.js` 单向导出：**扁平、按名字、同名直接覆盖**；Hermes 或手动放的文件也在这里 | 分不清哪些是导出副本、哪些是真内容 | 不当作数据源，单独处理（见 3.2） |
| 设置类 localStorage（主题、排版样式、发布平台、AI 地址、外挂知识源、命令使用频率） | localStorage | 属于设备设置，不是内容 | **不迁**，留在本机 |

---

## 2. 原则

1. **只增不删**。迁移只写新文件，不删除 SQLite 和 localStorage 里的旧数据。旧数据至少保留到下一个大版本，由用户手动清理。
2. **id 不变**。现有节点 id 原样写进 frontmatter 的 `id`。`sourceMaterialIds`、`relatedIds`、会话里的 @引用都依赖它。只有新建的内容才用新 id。
   （主方案 4.1 里写的 ULID 只适用于新内容。）
3. **幂等**。可以重复执行，按 id 判断是否已迁移，中断后再跑会接着做。
4. **先预演，后执行**。正式写入前先 dry-run，生成报告给用户看。
5. **不覆盖已有文件**。目标路径已经存在且内容不同时记为冲突，写进报告，不覆盖。
6. **可回滚**。切换后的观察期内，可以一键切回旧存储。

---

## 3. 难点和处理

### 3.1 文件名和链接

- 文件名清洗沿用 `mdSync.js` 的 `sanitizeFilename`（去掉 `/\:*?"<>|`，截断 100 字）。
- 同一目录下重名时，加后缀 ` (2)`、` (3)`。
- **改了名就要改链接**。wikilink 是按名字解析的（`syncAllLinks`）。所有被改名的文档，都要在全库正文里把 `[[旧名]]` 改写成 `[[新名|旧名]]`，保证显示文字不变。报告里列出每一处改写。
- 原名写进 frontmatter `aliases`，搜索仍然能用原名搜到。

### 3.2 `Artifacts/` 里的旧导出

现在的导出是扁平的，同名会互相覆盖，而且这个目录里还混着 Hermes 写的文件和你手动放的文件。处理方式：

- 迁移**不往 `Artifacts/` 根目录写任何东西**。
- 对 `Artifacts/` 根目录下的每个 `.md`，和 SQLite 里同名文档的正文比较 hash：
  - **一致**：判定为导出副本。移到 `.agent/migration/legacy-artifacts/`，不删除。
  - **不一致，或者 SQLite 里没有同名文档**：判定为外部内容，原地不动，写进报告。
- `Artifacts/内容运营/` 等子目录不是导出写的，不碰。
- 迁移完成后关闭 `writeBuiltInDocsToDisk`（`db:save` 不再触发导出）。

### 3.3 内嵌的 base64 图片

- 扫描正文里的 `data:image/...;base64,...`。
- 用现有 `saveBinaryAsset` 的扩展名白名单写到所在目录的 `assets/` 下，文件名用内容 hash，同一张图只存一份。
- 正文替换成相对路径，规则和 `localMediaMarkdown.js` 一致。
- 报告里列出抽取了几张图、节省了多少体积。

### 3.4 Daily 和待办池

- localStorage 只有 renderer 能读，所以由 **renderer 读出数据、通过 IPC 交给主进程写文件**，不在主进程里猜 localStorage 的位置。
- 格式先定一个最简单、Obsidian 能直接看的版本（是否采用见第 7 节）：

```markdown
---
date: 2026-10-05
---
## 任务
- [ ] 写公众号初稿 [type:: task] [category:: creation] [priority:: high] [id:: daily-xxx]
- [x] 回复读者留言 [category:: work] [id:: daily-yyy]

## 事件
- 14:00 选题会 [type:: event] [id:: daily-zzz]

## 笔记
- 今天想到的标题：**「不同步」才是最好的同步** [id:: daily-www]
```

- 属性用 Dataview 的行内字段写法 `[key:: value]`，Obsidian 装了 Dataview 插件就能查询。
- 富文本：粗体、斜体、列表转成 markdown；**颜色**用 `<span style="color:…">`（Obsidian 能渲染）。
- **硬性要求**：`parse(serialize(day))` 必须和原数据相等，转换前后完全一致才允许切换。不一致的条目在报告里列出。

### 3.5 白板

- 卡片引擎 → JSON Canvas：卡片转成 `text` 节点（标题 + 正文），连线转成 `edges`。JSON Canvas 表达不了的字段（`typeLabel` 等）作为节点的额外字段保留。`viewport` 存在同一个文件的自定义字段里。
- Excalidraw 引擎 → 原样存成 `.excalidraw`（就是 JSON，excalidraw.com 和 Obsidian 的 Excalidraw 插件都能打开）。
- 现在只有一个白板。迁移后格式上天然支持多个，但 UI 是否支持多白板不在本次范围内。

### 3.6 编辑部记忆

- 收集所有名为「编辑部记忆」的节点，包括 `.agent` 下的和散落在外面的副本。
- 按条目去重后合并成一个文件，副本里独有的条目也保留下来。
- 原来的副本不删，在报告里列出，由你决定是否清理。

### 3.7 大库和性能

- 已知有 15GB 级别的库，体积主要来自版本历史和媒体。迁移不碰 `versions` 表。
- 迁移放在主进程的 worker 里，参考已有的 `databaseSearchWorker.js`，逐篇写文件，不阻塞窗口。界面显示进度。
- 对大库，要在报告里预估耗时和需要的磁盘空间。

### 3.8 迁移期间的编辑

- 迁移是启动时的一次性步骤：用户确认后进入「迁移中」状态，期间工作区只读，完成后自动切换。
- 不做「边用边迁」的双写，因为复杂度高、容易出不一致。

### 3.9 Web 版

- 用户选好目录（`webFsBridge`）后，走同一套迁移逻辑。
- 不选目录的话，保持现有 localStorage 存储，不强制迁移。

### 3.10 迁移之后外部新建的文件

- Obsidian、Hermes、Claude Code 新建的 `.md` 没有 `id`。watcher 第一次发现时，往 frontmatter 补一个 `id` 写回文件，并记一条活动日志。
- frontmatter 格式不合法的文件只当作纯正文读取，不改写，在 app 里标一个「元数据解析失败」的提示。

---

## 4. 执行流程

每一类数据都走同一套流程：

```
A 预演 ─▶ B 备份 ─▶ C 写入暂存区 ─▶ D 校验 ─▶ E 切换 ─▶ F 观察一个版本 ─▶ G 移除旧代码路径
                                      │不通过
                                      └──▶ 停止，保留旧存储，输出报告
```

| 步骤 | 做什么 | 产物 |
|---|---|---|
| A 预演 | 只读扫描，计算目标路径、改名、冲突、base64 图片、无法映射的字段、预估体积 | `.agent/migration/report-<日期>.md` |
| B 备份 | 复制 `knowledge.db`（连同 `-wal`、`-shm` 文件），导出相关的 localStorage key；如果 `MdRender` 还不是 git 仓库，就初始化并做一次提交 | `.agent/migration/backup-<日期>/` |
| C 写入 | 先写到 `.agent/migration/staging/`，全部成功后再逐个移动到目标位置；中途失败不会留下半成品 | 新文件 |
| D 校验 | 逐条比对：文档数量、每篇正文 hash（考虑链接改写和图片抽取）、元数据字段、链接数量、Daily 往返一致 | 校验结果追加到报告 |
| E 切换 | `app_state` 写入 `storage_source = files` 和 `migration_version`；旧存储变为只读，不再写入 | 一次 git 提交：「迁移到文件存储」 |
| F 观察 | 保留回滚入口，运行一个版本 | — |
| G 清理 | 删除旧的读写代码路径；**旧数据文件仍然保留**，由用户手动删除 | — |

### 回滚

- 观察期内，设置里提供「切回旧存储」。
- 切换之后的修改都在文件里，旧存储里没有。所以回滚时要先**从文件反向导入回 SQLite**，再切换存储源。
- 反向导入复用「从文件重建索引」的逻辑。P3 本来就需要这个能力，不额外开发。

### 版本兼容

- 新版检测到未迁移的数据时，提示迁移，但不强制，可以选「以后再说」。
- 如果迁移后又装回旧版：旧版只认 SQLite，能打开迁移前的内容，但看不到迁移后的修改。发布说明里要写清楚这一点。

---

## 5. 迁移顺序

按「数据小、相对独立、出错影响小」排序。每一步单独发版。

| 顺序 | 内容 | 为什么排这里 | 单步验收 |
|---|---|---|---|
| 1 | 编辑部记忆 | 只有一个文件，最适合用来验证整套流程 | 合并后条目不少；app 内 AI 和 Claude Code 读到的是同一份 |
| 2 | Daily + 待办池 | 现在只在 localStorage，清缓存就会丢，迁出收益最大 | 往返一致；在 Obsidian 里勾选任务，app 同步显示 |
| 3 | 白板 | 只有一个，结构清楚 | 两种引擎都能还原；Obsidian 能打开 |
| 4 | 元数据 → frontmatter | 先在已经是文件的本地项目上做，风险低 | 在 Obsidian 改 `status`，创作看板随之更新 |
| 5 | 内置文档实体迁移 | 量最大、冲突最多，放到流程验证完之后 | 第 6 节全部 case 通过 |
| 6 | 清理 `Artifacts/` 旧导出、关闭单向导出 | 依赖第 5 步 | `Artifacts/` 只剩真内容 |

---

## 6. 测试 case

1. **同名文档和链接**：两个不同文件夹下都有「周报」，另一篇正文里有 `[[周报]]` → 迁移后得到 `周报.md` 和 `周报 (2).md`；链接改写后指向原来的那篇，显示文字不变；报告里列出这次改写。
2. **base64 图片**：一篇正文里有 2 张相同的 base64 图 → `assets/` 下只有 1 个文件；正文里是相对路径；Obsidian 和 app 都能显示。
3. **Daily 往返**：带粗体、颜色、已完成、优先级、分类的一天 → 序列化后再解析，和原数据完全相等。
4. **中断重跑**：写到一半强制退出 → 目标目录没有半成品；重跑后结果和一次跑完的完全相同（文件 hash 一致）。
5. **重建一致**：迁移完成后删掉 `knowledge.db` 并重启 → 文档数量、搜索结果、反向链接和迁移前一致。
6. **回滚**：切换后修改一篇稿子，再切回旧存储 → SQLite 里能看到这次修改。

---

## 7. 需要你决定或提供的

1. **内置文档放在哪**：`Projects/内置文档/` 下保留原目录结构（推荐），还是让你在迁移前手动指定每个顶级文件夹的去处？
2. **Daily 格式**：用 3.4 里的 markdown + Dataview 行内字段（推荐，Obsidian 能直接看），还是 md 正文加一个隐藏的 json 文件存结构化数据（转换更稳，但 Obsidian 里可读性差）？
3. **允许读取真实数据做一次预演吗**：需要只读访问 `~/Documents/MdRender` 和 `~/Library/Application Support/md-render`。我会先统计文档数、重名数、base64 图片数、`Artifacts/` 冲突数、各部分体积，不做任何修改。用真实数字定下迁移顺序和耗时，比现在凭代码推断靠谱。
