# 今日速记正文改成富文本：支持换行、列表、加粗、颜色

## 背景

今日速记的每条记录（任务 / 笔记 / 事件）和待办池条目，正文都是一个单行 `Input`，
写长一点的内容只能挤成一行。用户直接反馈：「内容没法换行」。

查下来光换输入框不够——**数据层就在主动压换行**：

```js
// utils/dailyWorkspace.js（改动前）
const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
```

`\s` 包含 `\n`，item 和 todo 的 `text` 都走这个函数，所以即使 UI 让你敲进了换行，
落盘那一刻也会被压成一行。这才是「没法换行」的真正原因。

所以这次是三层一起改：数据层允许多行并新增结构化正文，输入层换成 BlockNote，
展示层按结构渲染。

## 数据模型：`richText` 是源，`text` 是投影

条目正文变成两份：

| 字段 | 内容 | 用途 |
|------|------|------|
| `richText` | BlockNote 的 block 数组（段落 + 无序 / 有序 / 待办列表） | 编辑与展示的源，存颜色、加粗这类 Markdown 表达不了的样式 |
| `text` | 由 `richText` 派生的**多行** Markdown 风格纯文本 | 去重、carryOver、Agent 工具、导出、搜索 |

选 block JSON 而不是 HTML，是为了避开 HTML 那一整套麻烦：不需要写 HTML 消毒器，
展示层不用 `dangerouslySetInnerHTML`，而且纯 JSON 能直接塞进 `daily-workspace.json` 备份。
`text` 的列表带 `- ` / `1. ` / `- [ ] ` 前缀，投影本身就是合法 Markdown，导出和 Agent 侧读起来不别扭。

规则收口在两处：

- 新增 `utils/dailyRichText.js`（纯函数，不依赖 DOM）：`normalizeRichText` / `richTextToPlainText` /
  `plainTextToRichText` / `hasRichFormatting` / `resolveRichTextColorVar`。
- `dailyWorkspace.js` 新增 `resolveContent` + `applyContent`：**有 `richText` 就以它为准**，
  `text` 每次归一化时重新派生，两者永远不会漂移。

几条约束：

- 单段无样式的内容**不存** `richText`（`hasRichFormatting` 判断），纯文本条目不白存一份结构。
- `normalizeRichText` 是白名单：不支持的块类型（表格 / 图片…）降级成段落且内容不丢，
  非法颜色被剔除，`javascript:` 之类的链接降级成纯文本。
- 搬运条目的四条路径（`moveDailyEntryItem` / `sendDailyEntryTaskToTodo` /
  `carryOverIncompleteTasks` / `promoteTodoToDaily`）都把 `richText` 一起带走，
  任务丢进待办池再捡回来格式不会掉。
- `normalizeText`（压掉所有空白）只留给 `buildTodoDedupKey`——去重本来就该忽略换行差异；
  正文改走保留 `\n` 的 `normalizeContentText`。

## 输入：BlockNote，且必须懒加载

`DailyRichTextEditor.jsx` 用 `useCreateBlockNote` + `BlockNoteView`，
schema 经 `buildSchema` 排除标题 / 引用 / 代码块 / 表格 / 图片 / 分割线等，
只留段落和三种列表——**存储层认得的和编辑器给得出的严格对齐**，
不会出现「写得进去、渲染不出来」的块。

这里有个不绕不过去的坑：`apps/editor/vitest.config.js` 是 `environment: 'node'`，
daily 的组件测试用 `renderToStaticMarkup` 直接渲染 `DailyItemRow`（含 `isEditing` 分支）。
BlockNote 的 React 层要 DOM，静态 import 会让现有 daily 测试全挂。

做法是把富文本编辑器单独拆一个文件，在 `DailyContentEditor.jsx` 里
`lazy(() => import(...))` + `canUseDOM` 守卫，没有 DOM 时渲染 `Input.TextArea` 降级
（降级形态至少也能换行）。`lazy` 不渲染就不发起 import，node 路径永远碰不到 BlockNote，
顺带还拿到了代码分割。守卫不能省：`renderToStaticMarkup` 遇到未 resolve 的 lazy 会直接抛。

交互上回车让给了换行 / 新建列表项，保存改成 `⌘/Ctrl + Enter` 和「保存」按钮，
Esc 仍是取消。加粗 / 变色走 BlockNote 选中文字后浮出的工具栏，列表走 `/` 菜单，
编辑框下面挂了一行提示说明这三件事。

## 展示：按结构渲染，不碰 innerHTML

`DailyRichContent.jsx` 把 block 数组渲染成 React 元素，连续同类列表块合并成一个 `ul` / `ol`。
不走 `dangerouslySetInnerHTML`，所以既不需要消毒，也能在 node 环境静态渲染（测试直接覆盖）。

段落用 `<div class="daily-rich-paragraph">` 而不是 `<p>`：段落底下可以缩进出子列表，
`<ul>` 套在 `<p>` 里是非法嵌套，浏览器会自动断标签导致排版错乱。

没有 `richText` 的老条目（以及 Agent 写入的条目）走 `plainTextToRichText`，按行渲染，
所以历史数据不用迁移也能立刻享受到换行展示。

颜色只认 BlockNote 的 9 个色名，色值在 `styles.css` 里以 `--daily-rich-text-*` /
`--daily-rich-bg-*` 收口，逐一对齐 `@blocknote/core` 的调色板，
保证「编辑时看到的」＝「保存后看到的」。

## 改动清单

新增：

- `renderer/src/utils/dailyRichText.js`
- `renderer/src/components/daily/DailyContentEditor.jsx`
- `renderer/src/components/daily/DailyRichTextEditor.jsx`
- `renderer/src/components/daily/DailyRichContent.jsx`
- `renderer/src/hooks/useCopyText.js`（从 `DailyNotebook.jsx` 抽出，让它回到 300 行以内）
- `tests-unit/daily-rich-text.test.jsx`

修改：

- `renderer/src/utils/dailyWorkspace.js`：正文保留换行、新增 `richText`、搬运路径带上 `richText`
- `renderer/src/store/useEditorStore.js`：`addDailyItem` / `updateDailyItem` / `addTodoItem` 收 `richText`
- `renderer/src/components/DailyNotebook.jsx`：编辑草稿从 `value` 变成 `{ text, richText }`
- `renderer/src/components/daily/DailyItemRow.jsx`、`DailyTodoColumn.jsx`、`DailyEntryList.jsx`
- `renderer/src/styles/styles.css`：编辑区改纵向布局 + 富文本展示与调色板
- `tests-unit/daily-unified-list.test.jsx`：`editingDraftValue` → `editingDraft`

## 验证

已执行：

- `pnpm test:unit`：293 passed。daily 三个套件 41 条全绿
  （`daily-rich-text` 15 / `daily-unified-list` 13 / `dailyWorkspace-switch-date` 13）。
  另有 3 个**改动前就存在**的环境性失败：`knowledge-graph-sync`（better-sqlite3 原生模块未编译）、
  `canvas-bookmark` 与 `excalidraw-canvas-agent`（excalidraw 依赖的 `open-color.json`
  在 Node 24 下要求 import attribute），都与 daily 无关。
- `pnpm build`：通过，`DailyRichTextEditor` 被单独切成一个 chunk。
- node 直连 BlockNote 验 schema 与文档往返：`buildSchema` 排除后只剩
  paragraph / bulletListItem / numberedListItem / checkListItem；
  `BlockNoteEditor.create({ schema })` 的真实 `editor.document` 经 `normalizeRichText`
  往返后，加粗、`textColor`、`checked` 全部保留，`props` 里的 `"default"` 噪声被清掉。

未执行：浏览器 / Electron 里的实际交互与视觉（项目规范默认不跑 E2E）。
所以「工具栏浮层位置、滚动容器里的表现、暗色下的观感」这几项需要人工过一眼。

## 已知限制

- BlockNote 0.47 的调色板亮 / 暗主题共用同一套色值，深色主题下选「棕」「绿」这类暗色会偏难读。
  这与主编辑器行为一致，没有单独给速记做暗色覆盖，否则速记页会和其它页配色割裂。
- Agent 的 `add_daily_entry` / `add_todo_entry` 仍然只写纯文本（`richText` 为可选参数），
  模型写进来的条目不带格式。
- 富文本只开放段落和三种列表；标题、引用、代码块、表格、图片没有开。
