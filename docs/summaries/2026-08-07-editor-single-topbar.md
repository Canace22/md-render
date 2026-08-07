# 编辑器界面重构：一条顶栏 + 纸内标题 + 悬浮动作 + 幕布式大纲

## 背景

按 Claude Design 稿 `编辑器界面优化.dc.html` 落地。改之前，文档视图从上到下堆了四条横栏：
标签页栏、面包屑栏、标题 + 字数栏、快捷工具栏。真正写字的纸面被挤到屏幕下半部分，
四条栏里大部分内容在写作时并不需要一直看见。

设计稿的思路是按「用的频率」重排：全局导航合成一条，文档级信息进纸面，文档级动作悬浮，
大纲平时收成一条刻度。

## 改动范围

### 新增 `EditorTopBar.jsx`（唯一顶栏）

把原来的 `TabBar` + `obsidian-header-bar`（面包屑）合成一条 40px 的栏：

- 左：侧栏折叠按钮 + 面包屑，**面包屑末级换成「当前文档下拉」**——点开是已打开文档列表，
  每项带关闭按钮，底部是关闭其他 / 关闭右侧 / 关闭全部。标签页栏的能力一条不少，但不再占一整行。
- 右：AI 助手（带文字的胶囊）+ 主题切换。

`Breadcrumb` 为此加了一个 `currentSlot` prop：传了就用它替换末级节点，没传还是原来的纯文本。
`TabBar.jsx` 随之删除。

注意一个边界：下拉只在 `tabs` 里有当前文档时才渲染。从侧边栏「文档」视图直接落到某个文件、
还没开标签页时，末级退回纯文本——和原来标签页栏是空的行为一致。

### `DocHeader.jsx` 重写：标题下沉进纸面

原来是纸面上方一条独立横栏（标题 + 字数 + 元数据入口）。现在整块移进 `.paper-surface`，
排在正文前面，和正文同一列、同一张纸：

- `<h1>` 34px，下面一行 12.5px 的弱化元信息：所属目录 · 字数 · 字符数
- 元数据面板收进同一行右端的「元数据」开关，展开才渲染 `DocMetaPanel`

`MarkdownEditor` 为此加了 `selectedParentLabel`（从 `findParentId` 取父节点名），
并把传给 `DocHeader`/`TocPanel` 的内容统一成 `resolvedMarkdown`。

`useTitleEditing` 顺手删掉了 `titleInputWidth` / `titleMeasureRef`——标题输入框现在是
`width: 100%`，不再需要按文字宽度撑开。

### `EditorQuickToolbar.jsx`：横栏 → 正文右上的悬浮胶囊

不再占一行，`position: absolute` 挂在 `.editor-layout` 上。三个动作的表达也改了：

- 预览、复制富文本是**圆形图标钮**（无 label）
- 复制公众号是**主动作**，绿色实心胶囊（有 label）
- 复制成功不再靠改文案，图标换成对勾 2s 后复位

约定固化成一条 CSS 规则：`.toolbar-button-with-label` = 主动作胶囊，没有 label 的走图标钮。

### `TocPanel.jsx`：常驻侧栏 → 幕布式大纲

原来是 220px 常驻侧栏，吃掉正文宽度。现在默认只在最右露出一条 44px 的迷你刻度
（每个标题一根短线，层级越深越短，当前节高亮），hover 才拉开 280px 的完整大纲盖在正文上。

`collapsed` 的语义从「显示/隐藏」变成「是否常驻」，展开态 = `!collapsed || hovered`。
滚动跟随用 `requestAnimationFrame` 节流，容差 120px。

### `styles.css`

删掉 `.tab-bar-*`、`.obsidian-header-bar`、`.right-area-header`、`.toc-panel` / `.toc-card` /
`.toc-link` 整套旧规则（含暗色版本），新增顶栏、文档下拉、纸内标题块、悬浮胶囊、幕布大纲五组样式。

## 踩到的坑：`#markdown-output` 的 id 优先级让 `.paper-content` 的内边距长期是死规则

标题块按设计给了 `padding: 72px 104px 0`，但正文实际渲染出来只缩进 30px，两者对不齐。

原因是纸面那个 div 同时挂了 `id="markdown-output"` 和 `class="paper-content"`，而
`#markdown-output { padding: 30px }`（0,1,0,0）优先级高于 `.paper-content`（0,0,1,0）。
也就是说 `.paper-content` 里的 `padding` 声明**在这次改动之前就一直没生效过**，
包括窄屏 media query 里那条。

修法是把内边距按 id 限定写成 `#markdown-output.paper-content`（0,1,1,0），
只抬 `padding` 一条的优先级——`background` 留在原来的 `.paper-content` 里，
避免盖掉 `body.theme-dark .paper-content` 的暗色底。窄屏 media query 同样处理，
并把标题块的横向内边距一起收到 28px。

顺带一个视觉问题：标题块和正文是兄弟节点，白底只在正文那个 div 上，标题看起来浮在纸外。
在 `.paper-surface` 上定义了一个局部变量 `--paper-bg`（亮色 `#ffffff` / 暗色 `#020617`，
对齐 `#markdown-output` 现有的两个主题底色），标题块用它取底，两段拼成一张连续的纸。

## 验证

Web 端 `pnpm dev`（Electron dev 的 :3000）实机验证，1440×900：

| # | 场景 | 预期 | 结果 |
|---|------|------|------|
| 1 | 打开文档 | 顶部只剩一条 40px 栏，纸面上移 | ✅ |
| 2 | 标题与正文 | 左边缘对齐在同一列（104px） | ✅ 计算样式实测 x 一致 |
| 3 | 标题块底色 | 与正文同底，看不出接缝 | ✅ 亮/暗都验过 |
| 4 | 大纲默认态 | 右侧 44px 刻度，8 个标题 8 根线 | ✅ |
| 5 | hover 大纲 | 拉开 280px 面板，当前节高亮 | ✅ |
| 6 | 文档下拉 | 列出已打开文档 + 关闭其他/右侧/全部 | ✅ 暗色下也正常 |
| 7 | 未开标签页时 | 面包屑末级退回纯文本，不报错 | ✅ |
| 8 | 悬浮动作胶囊 | 正文右上，复制公众号是绿色主动作 | ✅ |
| 9 | 切暗色主题 | 顶栏 / 纸面 / 下拉都跟随 | ✅ |
| 10 | 控制台 | 无 React / CSS 报错 | ✅ 仅一条无关的 404 |

未跑 `pnpm test:unit` / E2E。E2E 里 `#markdown-output` 的定位器没变，仍然有效。

## 已知遗留

- 大纲展开后会盖住悬浮动作胶囊（幕布 `z-index: 8` > 胶囊 `5`）。设计稿本身就是幕布压在正文上，
  暂按设计保留；如果觉得挡手，把胶囊提到 `z-index: 9` 即可。
- `.preview-panel[data-style=...] #markdown-output` 和 `.panel-body #markdown-output` 这两组
  选择器在 JSX 里已经没有对应 DOM 了，属于历史遗留死规则，这次没顺手删（不在本次改动范围内）。
