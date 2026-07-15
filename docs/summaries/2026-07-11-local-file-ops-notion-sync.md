# 本地文件操作修复 + Notion 同步重构 — 改动说明

日期：2026-07-11

## 背景

工作空间/目录/文件操作的多处交互与磁盘实际状态脱节：拖拽移动只改内存树（刷新后弹回）、外部改动监听链路写好了但从未挂载、文件重命名/移动后 Notion 映射断裂导致重复建页。同时希望：Web 端能直接以 Notion 数据库为存储读写内容，App 工作空间能自动同步到 Notion。

## 改动概述

### 本地文件操作（App）

- **拖拽移动落盘**：磁盘节点可拖拽，拖入文件夹时先走 rename IPC 在磁盘移动，成功后同步内存树。子树的 relativePath/id、openTabs、selectedId、Notion 映射统一重映射。
- **外部改动自动刷新**：`useLocalProjectWatcher` hook 与 `LocalProjectConflictModal` 此前未被任何组件挂载（整条链路是死的），现挂载于 `MarkdownEditor`。外部改动自动刷新；有未保存编辑时弹冲突框（保留本地 / 使用磁盘）。
- 文件操作错误提示从 `alert()` 统一为 antd `message`。

### Notion 同步

- **保存后自动推送**（`utils/notionAutoPush.js`）：按文件 30s 防抖，已推送过的页面原地更新；「目录」Select 属性取最近一层父文件夹名；数据库 schema 做模块级缓存。开关持久化为 `notionAutoPushEnabled`（storage key `md-renderer-notion-auto-push`，SQLite 键 `notion_auto_push`）。
- **映射迁移**：`notionFilePages` 的 key（`project:<root>:file:<rel>`）在重命名/移动后自动迁移（`remapNotionFilePagesAfterPathChange`），修复重复建页。
- **Web 端 Notion 即工作区**（`utils/notionWorkspace.js`）：「打开为工作区」只查页面清单秒开成懒加载树（按「目录」分组）；文件节点带 `notionLazy: true`，选中时才拉正文（`hydrateNotionFileContent`，会 bump `editorReloadToken` 强制编辑器重载）；编辑后自动写回原页面。**notionLazy 未拉正文前绝不写回**，防止空内容覆盖远端。

### Web 端本地文件夹（`utils/webFsBridge.js`）

- 基于 File System Access API（Chrome/Edge）：打开文件夹、读树、编辑落盘、新建/重命名/删除/移动（复制+删除模拟，FSA 无跨目录 move）。
- `projectRootPath` 用合成标识 `webfs:<名>:<rand>`；目录句柄存 IndexedDB（`md-renderer-webfs`），刷新后可恢复（可能需重新授权）。
- `localProjectBridge` 为统一路由层：Electron → IPC，Web + webfs 路径 → webFsBridge。

## 关键决策

- **能力分层**：`isLocalProjectSupported()`（桌面或 Web FSA）与 `isDesktopProjectSupported()`（仅 Electron）分开。MdRender Projects 目录、增量落盘拉取、Finder reveal 等必须用 desktop 判断；新建/重命名/删除/移动/保存用宽判断。Web 端不在本地项目上下文时，新建/导入回落内存工作区流程，而不是报错。
- **移动 = 磁盘 rename 先行**：先落盘成功再改内存树，失败不动树，保证树与磁盘一致；复用既有 `remapDiskNodeAfterRename` 语义。
- **自动推送选单向（本地→Notion）+ 手动拉取保留**，未做双向合并：简单且不丢数据，冲突场景交给 last-manual-pull。
- **懒加载而非整库拉取**作为 Web 工作区形态：大库秒开，正文按需加载。
- 纯逻辑全部下沉 `workspaceUtils.js` / utils 模块（依赖注入），可单测。

## 影响范围

| 层 | 文件 |
|----|------|
| 新增 utils | `notionAutoPush.js`、`notionWorkspace.js`、`webFsBridge.js` |
| Store | `useEditorStore.js`（`moveDiskBackedNodeToFolder`、`hydrateNotionFileContent`、`notionAutoPushEnabled` 持久化三处对齐）、`workspaceUtils.js`（3 个纯函数） |
| 组件 | `MarkdownEditor.jsx`（handleMoveNode、自动推送调度、懒加载 effect、能力分层）、`WorkspaceSidebar.jsx`（拖拽源/放置目标拆分）、`SyncPanel.jsx`（自动同步开关、打开为工作区按钮） |
| 主进程/共享 | `shared/stateKeys.js` 加 `notion_auto_push`（`database.js` 白名单经此生效） |
| 测试 | `tests-unit/workspace-move-disk-node.test.js`、`notionAutoPush.test.js`、`notionWorkspace.test.js`（共 19 条） |

外部契约未变：IPC channel、`window.electronAPI` 字段、workspace 节点结构、server endpoint 均保持兼容。

## 已知问题 / 后续

- Notion 推送仍是「全删块重写」（`updatePageBlocks`），Notion 端块级评论会丢；块级 diff 增量更新待做。
- webFsBridge 读 markdown 不剥离 frontmatter（Electron 侧会剥），frontmatter 会显示在编辑器正文中；无磁盘 watcher（FSA 无监听 API）。
- 自动推送在 30s 窗口内文件被移动时，快照仍持旧 fileId，极端情况下可能新建重复页（窗口小，暂不处理）。
- 全量单测基线失败 5 文件 7 条（excalidraw/sqlite 沙盒环境问题），与本轮无关，清单见 `.agents/skills` 相关记录。
