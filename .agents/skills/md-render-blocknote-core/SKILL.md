---
name: md-render-blocknote-core
description: 在 renderer 里接入/改动 @narrative/blocknote-core（编辑器底层机制包）时的规范与避坑。涉及 buildSchema、EditorToolbar、编辑器焦点/全选、消费 dist、Arco→AntD、vite CJS interop。
---

# 接入 @narrative/blocknote-core

`packages/blocknote-core`（包名 `@narrative/blocknote-core`）是从剧本项目抽出的**通用 BlockNote 机制包**：schema 组装、工具栏、插入/过滤、查找、剪贴板。本项目按「**只消费 dist 构建产物**」方式接入（renderer 不引入包的 .ts 源码，符合 AGENTS.md 禁 TS）。

## 关键约定

- renderer 通过 vite/vitest 的 `resolve.alias` 把 `@narrative/blocknote-core` 指到 `packages/blocknote-core/dist/index.js`。
- 包内 UI 已从 Arco 改为 **AntD**（本项目 UI 库）。改包 UI 时继续用 antd 的 `Button/Divider/Dropdown/message`，**不要引回 Arco**。
- 改包源码（src/*.ts/tsx）后必须 **重建 dist**；tsc 不拷非 ts 资源（如 .css），需手动 `cp` 到 dist。

## 常见的坑

1. **buildSchema 默认排除 heading / quote**（剧本编辑器不要 `#`/`>` input rule）。本项目是 Markdown 编辑器，**必须传 `excludeDefaultBlocks: []`** 才能保留标题/引用。buildSchema 内部已合并 defaultBlockSpecs，调用时只传自定义块（如 codeBlock）。

2. **dist 是 CommonJS，vite 命名导入会失败**。包经 alias 指到 `packages/`（非 node_modules），默认不走 commonjs 插件，`import { EditorToolbar } from '@narrative/blocknote-core'` 报 "not exported"。修法：vite.config 加
   ```js
   build: { commonjsOptions: { include: [/blocknote-core[\\/]dist/, /node_modules/] } }
   ```

3. **barrel(index.js) 会 eager 加载所有组件**，含 FindBar 的样式。原本是 `.scss`，会让整个 app 构建要求 sass 工具链。已改为 **plain `.css`**（本项目用 CSS，不用 Sass）。再加组件时别引 scss。

4. **EditorToolbar 是数据驱动、无单项 disabled**。业务侧用 `entries` 表达按钮/分隔线/下拉；disabled 态在 wrapper 里让 `onItemClick` no-op。不聚焦编辑器的按钮（AI/复制/预览）要设 `skipFocusEditor: true`。

5. **全选快捷键要同时守住选区和焦点**。默认全文全选直接保留 BlockNote/Tiptap 原生行为，不接管 `keydown`；如果 document 级 `keyup` 会写 Zustand，要跳过对应快捷键，避免重渲染后焦点丢失。`Meta/Control` 的 `keyup` 可能落在编辑器容器外，不能只依赖容器的 capture 阻止；要让 document 监听复用同一份快捷键释放状态做判断。这份释放状态不能和两段式全选进度共用，pointer/blur 可以重置全选进度，但必须等 `A` 和对应修饰键都释放后才结束 keyup 保护。手动取消选区后焦点可能落到纸张空白或普通容器，此时要在 document capture 做最窄的全选兜底，仅当编辑器仍挂载且事件目标不是 input/textarea/select/可编辑元素时阻止“全页全选”。只有产品明确要求“首次当前行、长按或第二次全文”时，才在 `editor.domElement` 范围内接管：用公开的 `editor.transact()` + `TextSelection/AllSelection`，忽略单独的 Meta/Control keydown，后续 repeat 保持全文，并在 pointer、blur、其它按键或 editor 实例变化时重置。不要调用私有 `_tiptapEditor` API，也不要劫持链接框等浮层输入框的全选。

6. **自定义粘贴不能打乱 BlockNote 的 MIME 优先级**。在用 `text/plain` / `text/html` 做 Markdown 启发式判断前，先把 `vscode-editor-data`、`blocknote/html`、`text/markdown` 交回 `defaultPasteHandler`，否则内部复制会丢颜色/背景等不可用 Markdown 表达的结构，VS Code 代码也可能被误判成列表/标题。代码块特判只能在 HTML 确实是“纯单代码块”时执行；混合 HTML 必须走默认粘贴，且自定义插入要用 `pasteHTML` / `pasteMarkdown` 保留 ProseMirror 的选区替换语义，不要手工 `updateBlock/insertBlocks` 绕过选区。

   外部纯文本 HTML 的识别不要限制得过严：浏览器、微信等常用带 `class` / `data-*` / 排版 `style` 的 `span` 包裹文本。这些仍应走纯文本空行归一化，否则 BlockNote 的 HTML 粘贴会把 `<br><br>` 变成多余空段落；但链接、列表、代码块及颜色/粗斜体/删除线等语义样式仍要交回默认 HTML 粘贴。现成判断：`apps/editor/renderer/src/utils/markdownUtils.js` 的 `looksLikePlainTextHtml`。

7. **迁到通用组件后，旧类名的样式会静默失效——先查暗色主题**。业务侧自绘按钮换成 `EditorToolbar` 渲染时，DOM 类名从业务名（如 `.editor-quick-toolbar-btn`）变成包内通用名（`.toolbar-button` / `.editor-toolbar` / `.toolbar-center`）。迁移时通常只补了亮色的作用域覆盖，`body.theme-dark` 那几条还挂在旧类名上，于是暗色下按钮保持白底浅灰字——亮色看着正常，问题能潜伏很久。改完务必 `grep` 一遍旧类名：只剩 CSS 命中、没有 JSX 命中的，就是死规则，删掉并把对应的暗色规则改挂到新类名上。

8. **选区 FormattingToolbar 的文字色和背景色默认合在一个按钮里。** `ColorStyleButton` 没有 kind 参数；`ColorPicker` / `ColorIcon` 也不从 `@blocknote/react` 包入口导出。要拆开时：`formattingToolbar={false}`，子节点挂 `FormattingToolbarController`，用 `getFormattingToolbarItems()` 替换 `key === 'colorStyleButton'`。色板自己用 `Components.Generic.Menu` + `.bn-color-icon` 的 `data-text-color` / `data-background-color`，不要另造色值。现成实现：`apps/editor/renderer/src/components/EditorFormattingToolbar.jsx`。

9. **工具栏 tooltip 文案会被 `#markdown-output p` 盖成正文色。** BlockNote/Mantine 的 tooltip 用 `<p>`，且 `withinPortal={false}` 还挂在编辑器里；`#markdown-output p` 是 ID 选择器，会压过 `.bn-tooltip` 的 `color`。本项目又把 tooltip 做成深底白字（暗色主题反过来），结果字和底一个色。修的时候必须用带 `#markdown-output` 的选择器把 `.bn-tooltip p` 抢回来，只改 `.bn-tooltip` 不够。

10. **在编辑器外改正文，别直接调 `updateFileContentById`。** 编辑器实例只在 `selectedId / contentResetKey / editorReloadToken` 变化时重建，只改 store 的话画面不变；落盘又只在编辑器 onChange 里做，本地项目文件也不会写。统一走 store 的 `applyContentFromOutside(fileId, content)`：它先写 store，再排请求给 `MarkdownEditor`——当前文档用 `editor.replaceBlocks` 整篇替换（等同一次正常编辑：onChange 落盘、可 Cmd/Ctrl+Z），编辑器没挂载或是别的文档就直接落盘。现有调用：AI 提案应用（`proposalSlice`）、外部改动「恢复为修改前」、版本历史恢复、AI 面板插入引用、灵感摘录。要往正文**追加**内容时，先按格式拼好整篇（参考 `core/agent/referenceBlock.js` / `inspirationNote.js`：BlockNote JSON 追加块、Markdown 追加文本），绝不能把 Markdown 字符串直接拼到 `__bn:` JSON 后面。编辑器自己的 onChange 仍用 `updateSelectedFileContent`，不要改成它（会循环）。

11. **只做视觉标记（评论高亮等）别改文档、也别上 BlockNote 自带 comments。** 自带 comments 依赖 Yjs 线程存储，且评论 mark 不进 Markdown；用 backgroundColor 样式又会写进正文和撤销栈。做法：数据另存（块 id + 引文 + 偏移），用 CSS Custom Highlight API（`CSS.highlights` + `::highlight()`）画；`editor.onChange` 后下一帧重新定位。取选区 DOM 用公开的 `editor.prosemirrorView.domAtPos`，块内容节点是 `.bn-block[data-id] > .bn-block-content`。现成实现：`utils/commentAnchors.js` + `hooks/useCommentHighlights.js`。

12. **给块加 CSS 计数器（标题编号等）别用 `counter-reset` 分层。** 每个块都包在自己的 `.bn-block-outer > .bn-block` 里，标题之间不是兄弟节点，挂在某个标题上的 `counter-reset` 只管它自己的子孙，后面的标题读不到。做法：计数器统一在外层容器（`#markdown-output`）上 `counter-reset`，各级标题用 `counter-set` 清零下级。编号画在 `h*` 的 `::before` 上时，要排除空块 `:not(:has(> .ProseMirror-trailingBreak:only-child))`——BlockNote 的占位提示也是 `.bn-inline-content::before`，会被覆盖；空块也不该占号。现成实现：`styles.css` 里的 `.heading-numbered`。

## 重建 dist 的命令（沙箱无 tsc bin 时）

```bash
cd packages/blocknote-core
node ../../node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/bin/tsc -p tsconfig.build.json
cp src/components/*.css dist/components/   # tsc 不拷 css
```
> 类型报错（缺 @types/react）不阻断 JS emit；dist 的 .js 才是 renderer 实际消费物。

## 验证

- 真正的端到端验证是 `pnpm build`（vite 构建），能跑通才说明 alias + CJS interop + 资源都对。
- 纯逻辑（filterSuggestionItemsByQuery / stringToBlockContent）可在 vitest node 环境直接从 `dist/utils/editorBlockInsert.js` 导入测试。

### node 里能验什么（比想象中多）

卡住 node 的其实是 **barrel `dist/index.js` 会连带加载 FindBar 的 `.css`**（`ERR_UNKNOWN_FILE_EXTENSION`），
不是 `@blocknote/core` 本身。绕开 barrel 直接引子路径，就能在 node 里验不少东西：

```js
const { buildSchema } = await import('packages/blocknote-core/dist/schema/buildSchema.js');
const { BlockNoteEditor } = await import('@blocknote/core');
const schema = buildSchema({ blockSpecs: {}, excludeDefaultBlocks: [...] });
const editor = BlockNoteEditor.create({ schema, initialContent });
editor.document; // 真实文档结构，可用来验序列化/归一化往返
```

能验：schema 组装成不成功、块名对不对（`defaultBlockSpecs` 的真实 key：paragraph / heading / quote /
bulletListItem / numberedListItem / checkListItem / toggleListItem / codeBlock / table / image / video /
audio / file / divider）、`editor.document` 的真实形状（颜色落在 `styles.textColor`，`props` 里未设置的项
是 `"default"` 字符串而不是缺省）。
**不能验**：React 层（`useCreateBlockNote` / `BlockNoteView`）与样式——那部分只能靠 `pnpm build` + 手动跑。

相关：[[safe-change-workflow]] [[md-render-store]]
