# 编辑器输入时反复失焦 — 文件监听自写 echo 重建编辑器

日期：2026-07-15

## 现象

打开本地项目里的文档编辑，focus 进编辑器后没多久就失焦、光标丢失，无法正常连续输入。

## 根因

链路：输入 → `handleEditorChange` 防抖保存（`PROJECT_SAVE_DEBOUNCE_MS=400`）→ 写盘 →
系统文件监听（`fs.watch` 递归，`localProjectWatcher.js`）捕获到这次「自己写的」变更 →
渲染层 `useLocalProjectWatcher` 回灌 → `useEditorStore.refreshDiskBackedProject`（`conflictResolution: 'auto'`）。

在 `auto` 模式下，`refreshDiskBackedProject` 会对**当前选中文件**执行
`patch.editorReloadToken = editorReloadToken + 1`。而 `editorReloadToken` 是 `useCreateBlockNote`
的重建依赖之一 —— 一旦 +1，**整个 BlockNote 编辑器被重建**，焦点和光标随之丢失。

自写 echo 本应被主进程的 `markLocalProjectRootIgnored`（`WRITE_IGNORE_MS=900`）忽略窗口挡掉，
但这是**时序 hack**：忽略窗口和渲染层的 `diskSavePendingFileIds` 保护标志都在保存完成时几乎同时失效，
只要文件系统事件晚于该窗口到达（macOS FSEvents 合并/延迟、含 frontmatter 的读改写等都会拉长时延），
echo 就会漏过来，把正在编辑的文档从磁盘重载 —— 表现为「输入着输入着就失焦」。

## 改动

只动 1 个文件 `renderer/src/store/useEditorStore.js` 的 `refreshDiskBackedProject`：

1. `shouldPreserveFile`：`auto`（文件监听）模式下，**当前选中文件永远保留本地内容**，
   不再从磁盘重载 —— 从根上不 bump `editorReloadToken`，编辑器不重建，焦点不丢。
2. 生成 `nextWorkspace` 后，对被保留的选中文件**兜底写回本地内容**。因为磁盘树按 `relativePath`
   派生 id，`preserveDirtyInTree` 里用磁盘原始 id 可能匹配不到 selectedId，这里按 selectedId
   直接回填，避免本地富文本内容被回灌的有损 Markdown 覆盖。

`use-disk`（手动「从磁盘同步」）和 `keep-local`（冲突弹窗）路径行为不变。

## 关键决策与权衡

- **用行为约束替代时序忽略窗口**：不去调更长的忽略时间（还是会漏），而是让「正在编辑的文件」
  在文件监听回灌时天然免疫。确定性、无时序脆弱性。
- **权衡**：当前打开的文件若被**外部程序**改动，将不再被监听自动热重载，需手动「从磁盘同步」或重开。
  这与主流编辑器「不悄悄冲掉你正在编辑的文档」的行为一致，且既有的冲突弹窗 / 手动同步仍覆盖有意场景。

## 测试

新增 `tests-unit/watcher-echo-preserve-selected.test.js`：

- auto 回灌：`editorReloadToken` **不** +1（编辑器不重建），本地内容保留。
- `use-disk` 手动同步：`editorReloadToken` +1（重建），采用磁盘内容。

全套单测：264 passed，6 failed 均为既有基线（`novel-entity-extract` / `canvas-bookmark` /
`excalidraw-canvas-agent` / `knowledge-graph-sync`，与本次改动无关）。
