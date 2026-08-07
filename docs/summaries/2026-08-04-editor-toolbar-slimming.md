# 编辑器工具栏瘦身：只留预览与两种复制

## 背景

编辑器顶部的 `EditorQuickToolbar` 原本挂了 9 个按钮：6 个块插入（H1 / H2 / 引用 / 无序列表 /
有序列表 / 分割线）+ 3 个动作（复制内容 / 预览 / 复制）。实际使用中只有复制和预览被用到。

6 个块按钮属于纯冗余入口——同样的块类型有三条更快的路径：

- `BlockNoteView` 已开 `slashMenu`（`MarkdownEditor.jsx:2602`），空段落占位符就写着「输入 '/' 以使用命令」
- BlockNote 原生 Markdown 快捷输入：`# ` / `> ` / `- ` / `1. ` / `---`
- 选中文字浮出的 `formattingToolbar`

删掉它们不丢任何能力，只是把入口收敛到本来就更近的地方。

## 改动范围

### `EditorQuickToolbar.jsx`（193 → 89 行）

删除 `TOOL_ITEMS` 常量、`applyBlock`、`insertDivider`、`isInlineBlockContent`、
`handleToolClick`、`blockEntries` 映射、动作分隔线 entry，以及随之无用的 6 个 lucide 图标导入。

保留的三个动作做了两处可用性调整：

- **顺序**改为 预览 → 复制富文本 → 复制公众号，微信主动作落在最右
- **文案**：原「复制内容」/「复制」肉眼无法区分，改为「复制富文本」/「复制公众号」；
  前者的 title 补上具体去处（Notion / 飞书 / Word）

两个 copy handler 的重复逻辑（try / `ok === false` 早退 / 2s 后复位）收成一个 `runCopy(handler, markCopied)`；
2000 这个魔法数字提为 `COPIED_HINT_DURATION` 常量。

新增 `data-disabled` 属性透传 `disabled`——此前未选中文档时按钮看着可点、点了静默 no-op。

`editor` prop 保留：`EditorToolbar` 的 `onFocusEditor` 是必填项。

### `styles.css`

- `.editor-quick-toolbar-shell .toolbar-center` 加 `justify-content: flex-end`，动作条右对齐
- 新增 `[data-disabled='true']` → `opacity: 0.45` + `pointer-events: none`
- 删除迁移遗留的死规则：`.editor-quick-toolbar-scroller` / `-actions` / `-divider` / `-btn`
  （含 `:hover` `:focus` `:disabled` `.is-copied` 变体）及其 `body.theme-dark` 版本，
  以及作用域内已无对应 DOM 的 `.editor-toolbar-divider`

### 顺带修掉的既有 bug：暗色主题下工具栏按钮是白底

工具栏早前从自绘按钮迁到 blocknote-core 的通用 `EditorToolbar` 后，DOM 上的类名从
`.editor-quick-toolbar-btn` 变成了 `.toolbar-button`。亮色的胶囊样式当时补了作用域覆盖，
但 `body.theme-dark` 下那 4 条规则仍挂在旧类名上，全部失效——深色背景上按钮保持
`rgba(255,255,255,0.84)` 白底 + `#475467` 浅灰字。

修法是把暗色规则改挂到实际生效的 `body.theme-dark .editor-quick-toolbar-shell .toolbar-button.ant-btn`
上（含 `:hover` / `:focus`）。该问题在本次瘦身前就存在。

## 验证

Web 端 `pnpm dev`（:3001）实机验证：

| # | 场景 | 预期 | 结果 |
|---|------|------|------|
| 1 | 选中文档，工具栏 | 右对齐三个胶囊：预览 / 复制富文本 / 复制公众号 | ✅ |
| 2 | 未选中文档 | `opacity: 0.45`、`pointer-events: none` | ✅ 计算样式实测 |
| 3 | 点「预览」 | 弹出 `WechatPreviewModal`（内含模板切换 + 复制到公众号） | ✅ |
| 4 | 点「复制公众号」成功 | label 变「已复制！」2s 后复原 | ✅ |
| 5 | 点「复制富文本」成功 | 同上，剪贴板含 HTML + Markdown 纯文本 | ✅ |
| 6 | 图片上传中点复制 | handler 返回 `false`，**不**进入「已复制！」态，只弹 warning | ✅ 逻辑路径未变 |
| 7 | 空文档点复制 | warning「没有可复制的内容」，label 不变 | ✅ 同上 |
| 8 | 连点两个复制 | 两个 label 各自独立计时 | ✅ state 仍分离 |
| 9 | 输入 `# ` / `/` | 标题、斜杠菜单照常可用 | ✅ 占位符即提示 |
| 10 | 切暗色主题 | 按钮深底浅字，hover 变亮 | ✅ 修复后通过 |

未跑 `pnpm test:unit` / E2E——全仓搜索确认无测试引用 `editor-quick-toolbar` testid 或任一按钮文案。

## 已知遗留

「复制富文本」与「复制公众号」两个入口并存，是用户明确要求保留的：前者走
`editor.blocksToHTMLLossy` 导出通用富文本，后者走 `copyToWeChat` 套微信模板并内联样式，
去处不同。若后续觉得仍嫌挤，可把富文本收进溢出下拉（`EditorToolbar` 已支持
`toolbar-dropdown` entry 类型）。
