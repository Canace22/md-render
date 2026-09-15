# 选区工具栏：文字色和背景色拆成两个按钮

日期：2026-09-15

## 背景

选中文字后，BlockNote 默认的 `ColorStyleButton` 把「文本」和「背景色」塞进同一个下拉。找背景要先点开再滚到下半截，入口不够直。

## 改动

新增 `EditorFormattingToolbar.jsx`：关掉默认 `formattingToolbar`，用 `FormattingToolbarController` 包一层 `getFormattingToolbarItems()`，把原来的颜色按钮换成两个独立入口。

- 文字色：只改 `textColor`，色标是带颜色的 A
- 背景色：只改 `backgroundColor`，色标是带底色的 A
- 点「默认」走 `removeStyles`，其它颜色走 `addStyles`
- 正文编辑器和今日速记共用这一套

`@blocknote/react` 没导出 `ColorPicker`，所以色板用官方 Menu + `.bn-color-icon` 自己画一列，不另做一套色。

## 验证

建议在选区工具栏上手动过一遍（未跑单测 / E2E）：

1. 选中一段字，工具栏出现两个颜色按钮，不再是一个合菜单
2. 点文字色 → 红色，选中字变红，背景不变
3. 点背景色 → 黄色，选中字有黄底，字色不变
4. 两个都设成非默认后，再分别点「默认」，只清对应那一项
5. 只放光标不选字时，点颜色仍作用在当前样式上（和原来一致）
6. 只读文档不出现这两个按钮
7. 加粗 / 斜体 / 链接按钮位置和原来一样
8. 今日速记条目编辑时同样是两个按钮
9. 暗色主题下色标仍跟 BlockNote 主题走
10. 选代码块等没有 inline content 的块时，颜色按钮不出现
