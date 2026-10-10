# 文档评论（参照 Claude Cowork）

日期：2026-10-10

## 背景

文档编辑器没有评论功能。参照 Claude Cowork：选中文字 → 选区工具栏最前面的「评论」按钮 → 右侧写评论，原文高亮。

## 做法

评论**不写进正文**：线程按 fileId 存在 store，用「块 id + 引文 + 块内偏移」锚定原文；高亮用浏览器的 CSS Custom Highlight API 画，不改 ProseMirror 文档，所以不影响撤销栈、落盘内容、导出和公众号复制。

| 层 | 文件 | 改动 |
|----|------|------|
| 纯函数 | `utils/commentThreads.js`（新） | 线程增删改、回复、持久化清洗、`findQuoteOffset`（取离原偏移最近的那处引文） |
| DOM | `utils/commentAnchors.js`（新） | 从编辑器选区取锚点；锚点还原成 Range；画/清高亮；点击点落在哪条评论里 |
| 状态 | `store/slices/commentSlice.js`（新）+ `useEditorStore.js` + `shared/stateKeys.js` | `commentThreads` 持久化（localStorage `md-renderer-comment-threads` / SQLite `comment_threads_json`）；面板开关、草稿、激活项是运行时状态 |
| Hook | `hooks/useCommentHighlights.js`（新） | 编辑器变化后下一帧重新定位并高亮；点高亮文字激活对应评论；记录原文已改掉的线程 |
| UI | `EditorCommentButton.jsx` / `CommentsPanel.jsx` / `CommentThreadCard.jsx`（新） | 选区工具栏「评论」按钮；右侧评论面板（草稿、回复、解决/重新打开、删除）；`EditorQuickToolbar` 加评论开关（显示未解决数） |
| 样式 | `styles.css` + `design-tokens.css` | 面板、卡片、高亮色 token（亮/暗） |

交互：

- 选中文字 → 点「评论」→ 右侧面板出现草稿卡（选中文字保持高亮），⌘/Ctrl+Enter 发送、Esc 取消。
- 点卡片 → 正文滚到引文处并加深高亮；点正文里的高亮文字 → 打开面板并激活对应评论，激活后可回复。
- 解决后不再高亮、卡片变灰沉底，可重新打开；原文被改掉时卡片标「原文已修改」。
- 面板展开时目录让出右侧；窄屏（≤960px）面板浮在正文上。

## 已知限制

- 跨块选区只锚定第一个块里选中的部分。
- 本地项目文件重命名/移动会换 id（`file:<相对路径>`），评论跟不过去。
- 评论只存在本机应用状态里，不写进 Markdown 文件，也不随 Git 同步。
- 依赖 CSS Custom Highlight API（Electron/Chromium 105+ 支持）；不支持的浏览器里评论照常可用，只是没有正文高亮。

## 验证

- `pnpm build` 通过。
- 单测：`tests-unit/comment-threads.test.js`（按项目约定未主动执行）。
