# 编辑器输入时反复失焦 — 文件监听自写 echo 重建编辑器

日期：2026-07-15

## 现象

打开本地项目里的文档编辑，focus 进编辑器后没多久就失焦、光标丢失，无法正常连续输入。

## 根因

链路：输入 → `handleEditorChange` 防抖保存（`PROJECT_SAVE_DEBOUNCE_MS=400`）→ 写盘 →
系统文件监听（`fs.watch` 递归，`localProjectWatcher.js`）捕获到这次「自己写的」变更 →
渲染层 `useLocalProjectWatcher` 回灌 → `useEditorStore.refreshDiskBackedProject`（`conflictResolution: 'auto'`）。

`auto` 模式下，`refreshDiskBackedProject` 会对**当前选中文件**执行
`patch.editorReloadToken = editorReloadToken + 1`。而 `editorReloadToken` 是 `useCreateBlockNote`
的重建依赖之一 —— 一旦 +1，**整个 BlockNote 编辑器被重建**，焦点和光标随之丢失。

自写 echo 本应被主进程的 `markLocalProjectRootIgnored`（`WRITE_IGNORE_MS=900`）忽略窗口挡掉，
但这是**时序 hack**：忽略窗口和渲染层的 `diskSavePendingFileIds` 保护标志都在保存完成时几乎同时失效，
只要文件系统事件晚于该窗口到达（macOS FSEvents 合并/延迟等），echo 就会漏过来，把正在编辑的文档
从磁盘重载 —— 表现为「输入着输入着就失焦」。

## 改动（基线 echo 识别，替代时序忽略窗口）

不再靠时间窗口猜「是不是自己写的」，改成**内容基线**精确识别，参考 VS Code / Office 的做法。

1. **保存成功即更新基线**（`components/MarkdownEditor.jsx`）：文档保存、图片地址写回落盘成功后，
   调用新增的 `markLocalFileDiskSaved(fileId, diskMarkdown)`，把「刚写下去的正文」记为该文件的
   `diskContentSnapshot`（新基线）。磁盘读取会剥离 frontmatter、只返回正文，与我们写入的正文一致，
   所以基线与回读内容严格对齐，无 frontmatter 错位。

2. **回灌时按基线判定**（`store/useEditorStore.js` 的 `refreshDiskBackedProject`）：
   新增 `isDiskEcho(fileId)` = 磁盘正文 `==` 该文件基线。`shouldPreserveFile`（auto 模式）改为：
   - 有在途保存 → 保留本地（避免半写覆盖）；
   - 是自写 echo（磁盘 == 基线）→ 保留本地、**不 bump `editorReloadToken`**（不重建、不丢焦点）；
   - 否则（磁盘 != 基线，真·外部改动）→ 走重载分支，采用磁盘内容并重建编辑器（外部改动热更新）。
   并对被保留的选中文件按 `selectedId` 兜底写回本地内容（磁盘树按 `relativePath` 派生 id，
   `preserveDirtyInTree` 可能匹配不到 selectedId）。

`use-disk`（手动「从磁盘同步」）和 `keep-local`（冲突弹窗）路径行为不变。

副带好处：`diskContentSnapshot` 更新为「上次保存内容」后，`detectLocalProjectConflicts` 在
pending 窗口内也能靠基线把自写 echo 判成「无冲突」，避免误弹冲突对话框。

## 关键决策与权衡

- **内容基线 > 时间窗口**：echo 判定比对的是「磁盘现在 vs 上次写下去」，两边都是正文 Markdown，
  格式一致、确定性强，不再依赖 FS 事件到达时机。
- **恢复了外部改动热更新**：相比一刀切「正在编辑的文件永不重载」，基线法能区分「自写 echo」和
  「真·外部改动」，前者忽略、后者仍然热更新。
- **有未保存编辑时的外部改动**：此时 `diskSavePendingFileIds` 为真 → 保留本地，不会静默覆盖；
  真正的双写冲突由既有的冲突检测 / 弹窗兜底。

## 测试

`tests-unit/watcher-echo-preserve-selected.test.js`（4 例）：

- 自写 echo（磁盘 == 基线）→ 不重建、保留本地；
- 真·外部改动（磁盘 != 基线、无在途保存）→ 重载并采用磁盘；
- 有在途保存 → 保留本地、不重建；
- 手动 `use-disk` → 采用磁盘并重建。

全套单测：266 passed，6 failed 均为既有基线（`novel-entity-extract` / `canvas-bookmark` /
`excalidraw-canvas-agent` / `knowledge-graph-sync`，与本次改动无关）。
