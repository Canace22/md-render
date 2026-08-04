# 移除应用内同步能力（Notion + 云端快照 + 同步面板）

## 背景

工作区的多端同步与版本历史已经改为**由本地项目目录自己的 Git 仓库承担**，app 内再维护一套同步逻辑属于重复建设：

- 云端快照同步需要自建服务器（`server/cloud-sync`）、维护 revision 冲突协议
- Notion 推拉需要反代绕 CORS、Token 管理、页面/数据库两套映射、自动推送调度
- 两者都要在 store 里长期挂状态、进持久化、进 SQLite `app_state`

Git 已经把这些问题解决得更好，因此整体下线。

## 改动范围

### 删除的文件

| 类别 | 文件 |
|---|---|
| 组件 | `SyncPanel.jsx`、`CloudSyncChannel.jsx`、`NotionPanel.jsx`（后者已是死代码） |
| 云同步 | `utils/cloudSyncService.js` |
| Notion | `utils/notion{Service,Converter,AutoPush,BatchSync,IncrementalSync,Workspace}.js` |
| 单测 | `tests-unit/notion*.test.js`（6 个） |
| 服务端 | `server/cloud-sync/`、`server/notion-proxy/` |
| 文档/Skill | `docs/cloud-sync-technical-plan.md`、`.agents/skills/md-render-cloud-sync/` |

### 状态层（`useEditorStore.js` + `stateKeys.js`）

移除 `notionToken / notionFilePages / notionDatabaseId / notionProxyBase /
notionAutoPushEnabled / syncEnabled` 与全部 `cloud*` 字段，连同：

- 对应的 localStorage key、`persistNotionSnapshot` / `readNotionPersistSnapshot` 及
  `editorPersistHydrated` 首启保护（这套机制只为「别用空 Notion 配置覆盖已有值」而存在）
- action：`setNotionToken/DatabaseId/ProxyBase`、`setFileNotionPageId`、
  `mergeNotionFilePages`、`hydrateNotionFileContent`、`setSyncEnabled`、
  `setCloudSyncBaseUrl/WorkspaceId`、`buildCloudSyncPayload`、`markCloudSyncSuccess`、
  `applyCloudWorkspacePayload`
- `EDITOR_STATE_KEYS` 里的 `notion_* / cloud_*` 六+六个 key

`VALID_SURFACES` 去掉 `'sync'` 与 `'notion'`；`selectNodeKeepSurface`（只为「同步页打开时
点目录不跳走」而生）一并删除。

> 迁移说明：老用户 localStorage / SQLite 里残留的 `md-renderer-notion-*`、
> `md-renderer-cloud-*` 键不会被读取，属于惰性垃圾，不影响启动。

### 编辑器（`MarkdownEditor.jsx`）

删掉自动推送 scheduler、Notion 懒加载 effect、`handleNotionPull/Push`、
`handleOpenNotionWorkspace`、`handleBatchPull/Push`、`handleIncrementalPull`、
`handleCloudUpload/Pull/UseRemote/ForceUpload` 及配套 loading/message state。
保存路径上原本挂着的「落盘后顺带推 Notion」分支一并摘掉。

**保留**：`handleManualSyncLocalProject`（从磁盘同步）、`lastSyncedMarkdownRef`
（磁盘 echo 基线）、`syncMarkdownFromSelectedFile`（store 内部同步）——这些名字里带 sync，
但和对外同步无关。

### 入口重排

「同步」独立面板整体下线，侧栏 rail 的云图标移除。原本只存在于同步页的两组能力搬进
**编辑器设置**：

- **本地项目目录**：打开本地文件夹 / 从磁盘同步（仅 `localProjectSupported` 时渲染）
- **备份（JSON）**：导入 / 导出工作区

`SettingsPanel` 的 props 相应从 `notionProxyBase / notionToken / cloudSyncBaseUrl`
换成 `local` / `backup` 两个对象。`DocHeader` 上的 `onOpenNotion` / `notionLinked`
（本就是 DocHeader 未声明的死 props）一并去掉。

### 顺带修掉的既有 bug：冷启动时「返回文稿」失效

`lastContentSurfaceRef` 初值取自 `surface`，而记录它的 effect 又跳过 `'settings'`——
上次退出时停在设置页的话，ref 初值就是 `'settings'` 且永远刷不新，「返回文稿」
`setSurface('settings')` 等于原地不动。侧栏齿轮的 toggle 走同一个 ref，同样失效。

修法是加一个 `leaveSettings()`，ref 里若还是 `'settings'` 就回落到
`selectedContentSurface`（有选中文件夹 → `folder`，有选中文件 → `paper`，否则 `overview`），
两个出口统一走它。该问题在移除同步功能前就存在（当时 effect 还多跳过 `'notion'`/`'sync'`）。

### 其它

- `vite.config.js`：`server.proxy` 整块删除（只有 `/notion-api` 和 `/cloud-sync-api`）
- `server/deploy.sh` + `ecosystem.config.cjs` + `server/README.md`：只剩 `ai-proxy`
- `styles.css`：清掉 `.sync-*`、`.notion-*`、`.doc-header-notion-btn` 等约 50 条死规则；
  唯一还用得上的 spinner 动画改名 `.notion-btn-spinner` → `.settings-btn-spinner`
- `workspaceUtils.js`：删 `remapNotionFilePagesAfterPathChange`，
  `getFolderChannelLabel` 去掉 `notionSyncRoot` 分支
- `KnowledgeBasePanel.jsx`：「外部来源」统计与来源列表去掉 Notion 同步根
- `architecture-boundaries.test.js`：断言的 key 从 `cloud_last_synced_hash`
  换成 `daily_workspace_json`

## 验证

| # | 场景 | 预期 | 结果 |
|---|------|------|------|
| 1 | `pnpm build` | 无未解析导入 | ✅ 10.27s 通过 |
| 2 | `pnpm test:unit` | 无新增失败 | ✅ 232 通过；3 个失败为环境问题（见下） |
| 3 | Web 端启动 | 首屏正常渲染 | ✅ |
| 4 | 浏览器 console | 无报错 | ✅ 仅 vite HMR 日志 |
| 5 | 侧栏 rail | 无云图标，其余入口在位 | ✅ |
| 6 | 设置页渲染 | 无 Notion / 云端配置项 | ✅ |
| 7 | 设置页新分组 | 本地项目目录 + 备份（JSON）可见 | ✅ |
| 8 | 「从磁盘同步」按钮 | 无本地项目时禁用 | ✅ |
| 9 | 文档视图 | 文件树 + 编辑器正常，DocHeader 无 Notion 按钮 | ✅ |
| 10 | 设置 ↔ 文档往返 | 「返回文稿」回到原文档 | ✅ |
| 11 | 冷启动进设置页后点「返回文稿」 | 落到当前选中文档 | ✅ 修复后通过 |
| 12 | 冷启动进设置页后点侧栏齿轮 | 同上（toggle 走同一出口） | ✅ 修复后通过 |

> 11 / 12 的复现方式：`localStorage.setItem('md-renderer-surface','settings')` 后刷新。

**3 个失败与本次改动无关**（已用 HEAD worktree 复现同样失败，且这些测试文件与其直接依赖
`git diff HEAD` 为空）：

- `canvas-bookmark.test.js` / `excalidraw-canvas-agent.test.js`：
  `roughjs/bin/rough` ESM 解析失败（Excalidraw 0.18.1 依赖问题）
- `knowledge-graph-sync.test.js`：`better-sqlite3` 原生模块 ABI 不匹配
  （NODE_MODULE_VERSION 130 vs 127，需 `pnpm rebuild better-sqlite3`）

## 已知遗留

- `docs/content-creation-roadmap.md`、`docs/knowledge-base-roadmap.md` 中仍有 Notion
  相关的历史规划与竞品对比表述，作为带时间语境的规划文档保留原样。
- 本机 `.env`（已 gitignore）里的 `NOTION_TOKEN` / `NOTION_DATABASE_URL` 现已无人读取，
  可自行清理。
