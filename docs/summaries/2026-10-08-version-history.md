# 文档版本历史（参照 Obsidian「文件恢复」）

日期：2026-10-08

## 背景

SQLite 里早就有 `versions` 表，`db:save` 时也在存快照，但：

- 规则要求「距上次 ≥5 分钟 **且** 长度变化 ≥50 字」，改错字、替换一段同长文字永远不存；
- 存的是**新**正文，停笔很久后第一次编辑前的原稿反而丢了；
- 没有清理；界面只有「元数据」折叠面板里一个很深的列表，恢复后编辑器还不刷新。

## 做法

参照 Obsidian 核心插件「文件恢复」：有改动就按间隔存快照、保留 N 天、在弹窗里查看/恢复。

| 层 | 文件 | 改动 |
|----|------|------|
| 常量 | `apps/editor/shared/versionHistory.js`（新） | 间隔 5 分钟、保留 7 天、清理节流 1 小时、列表上限 200，main / renderer 共用 |
| 存储 | `main/database.js` | `saveVersions` 改为在 `syncDocuments` **之前**调用，存「即将被覆盖的旧正文」；去掉 50 字门槛；按保留期清理；新增 `saveVersionSnapshot`（恢复前手动存）；加 `(document_id, created_at)` 索引 |
| IPC | `main/ipc/dbHandlers.js` / `preload.js` / `services/electronBridge.js` | 调整调用顺序（快照失败不影响保存）；新增 `db:save-version-snapshot` |
| UI | `components/VersionHistoryModal.jsx`（新）+ `hooks/useVersionHistory.js`（新）+ `utils/versionHistory.js`（新） | 左侧时间列表，右侧「预览 / 与当前对比」，复制、恢复此版本 |
| 入口 | `core/commands/commandRegistry.js` + `MarkdownEditor.jsx` + `DocMetaPanel.jsx` | 命令面板「查看文档版本历史」、元数据面板「版本历史」按钮；恢复走 `applyContentFromOutside`（见下） |

## 顺带修复：编辑器外改正文不刷新、不落盘

`updateFileContentById` 只改 store：编辑器实例不会重建，画面还是旧的；落盘只在编辑器 onChange 里做，本地项目文件也不写。受影响的有 AI 提案「应用」、外部改动提示条「恢复为修改前」、元数据面板里旧的版本恢复。

- store 新增 `applyContentFromOutside(fileId, content)`：先写 store，再把请求排进 `externalContentRequests`。
- `MarkdownEditor` 接手请求：当前文档且编辑器已挂载 → `editor.replaceBlocks` 整篇替换（onChange 落盘、可撤销）；否则当前文档重建编辑器，并直接写回本地文件（`saveContentToDiskNow`），AI 改别的文档时也能落盘了。
- `proposalSlice` / `ExternalChangeBanner` / 版本历史恢复 / 灵感摘录（`createHost.pinInspiration`）都改走这个入口；
- AI 面板「插入引用」以前把 Markdown 直接拼到正文字符串后面，编辑过的文档（BlockNote JSON）会被拼坏；改为 `core/agent/referenceBlock.js` 按格式追加，再走同一入口；元数据面板里的版本列表换成打开版本历史弹窗的按钮，删掉对应的死样式。

## 已知限制

- 重命名 / 移动本地项目文件会换 id（`file:<相对路径>`），旧路径的历史会随 `syncDocuments` 清掉；删除文件同理（Obsidian 能找回已删除文件，这里没做）。
- 快照时间是「存档时间」，不是那份内容最后编辑的时间。
- 仅桌面版（依赖 SQLite）；网页版点命令会提示不可用。

## 验证

- 单测：`tests-unit/version-history.test.js`（快照规则、5 分钟合并、保留期清理、手动快照去重、时间文案）。
- 单测 `tests-unit/agent-write-target.test.js` 的假 store 同步改为 `applyContentFromOutside`。
- 手动：打开文档改几处 → 等 5 分钟再改 → 命令面板打开版本历史 → 对比 / 恢复 → Cmd+Z 撤销恢复。
