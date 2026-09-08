# 被收起的功能加提示：顶栏「全部功能」入口 + 命令面板底部说明

## 背景

前两轮界面收敛把入口一路往里收：工具栏瘦身删掉 6 个块按钮、四条横栏合成一条顶栏、
大纲收成一条 44px 刻度，最后 `命令面板 Cmd+K` 又把 19 条低频命令（导入 / 导出四种格式 /
切换 10 个视图 / 书签导入 / 从磁盘同步…）统一收口。

收口本身没问题，问题是**收进去之后界面上没有任何痕迹**：

- 命令面板只有 `Cmd/Ctrl+K` 一个唤起方式，顶栏、侧栏、纸内工具条都没有可见入口。
  没读过 commit message 的人不可能知道「导出 PDF」现在在哪。
- 大纲收起态是一排没有标签的刻度线，还挂着 `aria-hidden`，看不出它是可展开的目录。

这次只补提示，不改任何功能位置。

## 改动范围

### 新增 `utils/shortcutLabel.js`

快捷键的展示文案。原先顶栏 AI 助手写死的是 `⌘/Ctrl+J` 这种两边都列的写法，
新入口要在按钮上放一个 kbd 徽标，两个符号并排太挤，所以按平台只显示一个：
mac 出 `⌘K`，其余平台出 `Ctrl+K`。平台读不到时退回 `Ctrl`——宁可在 mac 上多显示三个字母，
也不要在 Windows 上显示一个按不出来的 ⌘。

只管展示，不参与按键判定；判定仍在各 hook 里 `metaKey || ctrlKey` 两边都收。

### `EditorTopBar.jsx`：右侧新增「全部功能」入口

放在 AI 助手左边，样式与 AI 助手同一套胶囊（`titlebar-command-entry`），
`放大镜图标 + 全部功能 + ⌘K 徽标` 三段。它渲染在 `editor-top-bar-actions` 里，
不受 `showDocumentContext` 约束，所以**任何视图下都在**，不只是文档页。

`title` 直接把面板里有什么写出来：「全部功能：导入 / 导出 / 切换视图等入口都在这里（⌘K）」，
`aria-keyshortcuts` 同时声明 `Meta+K Control+K`。

### `useCommandPalette.js`：多导出一个 `show`

原来只有 `open` 状态和 `close`，快捷键是 toggle。按钮需要「只开不关」的语义，
补一个 `show`，`MarkdownEditor` 把它接到新按钮的 `onOpenCommandPalette` 上。
Cmd+K 的 toggle 行为不变。

### `CommandPalette.jsx`：底部常驻说明 + 命令自带快捷键徽标

- 底部一条 footer：左边 `↑↓ 选择 · ↵ 执行 · Esc 关闭`，右边一句
  「界面上没露出的功能都能在这里找到」——面板本身也要自己说明白它是干什么的。
- 注册表里的命令可以声明 `shortcutKey`，面板在标题右边渲染成徽标。
  目前只有「打开 / 关闭 AI 助手」声明了 `J`，让用户顺带学到 ⌘J。
  该字段**只做展示**，实际监听仍在 `MarkdownEditor`。

### `TocPanel.jsx`：收起态刻度加 `title`

一行注释 + 一个 `title="文档大纲：鼠标移上来展开"`。刻度容器仍保持 `aria-hidden`，
原生 tooltip 不受影响。

### `styles.css`

新增 `.titlebar-command-entry` 及其 kbd 徽标、`.command-palette-footer`、
`.command-palette-item-kbd` 三组规则。颜色全部走 `--color-border` / `--color-bg-active` /
`--color-text-secondary` 这类已分主题的 token，暗色不需要单写 `body.theme-dark` 覆盖——
这正是上次「暗色规则挂在旧类名上全部失效」踩过的坑，这次从一开始就不写硬编码色值。

## 验证

worktree 里 `pnpm install` 后执行：

| # | 验证项 | 方式 | 结果 |
|---|--------|------|------|
| 1 | 7 个改动文件语法 | esbuild 逐个 parse | ✅ |
| 2 | 生产构建 | `vite build`（临时 config，见下） | ✅ 159+ 模块，无报错 |
| 3 | 新文案进了产物 | grep bundle：全部功能 / 界面上没露出的功能都能在这里找到 / 文档大纲：鼠标移上来展开 | ✅ 三条都在 |
| 4 | 命令注册表单测 | `vitest run tests-unit/command-registry.test.js` | ✅ 9 passed |
| 5 | 新增 `shortcutLabel` 单测 | mac / Win32 / 空主键三例 | ✅ 3 passed |
| 6 | 全量单测 | `pnpm test:unit` | 265 passed；2 个 suite 收集失败（见「已知遗留」） |
| 7 | dev server 启动 | `vite --port 3111` | ✅ 日志零 error |
| 8 | 改动模块能被 dev 加载 | curl EditorTopBar / CommandPalette / TocPanel / shortcutLabel / useCommandPalette / styles.css | ✅ 全 200 |
| 9 | CSS 规则进了 dev 产物 | curl styles.css grep `titlebar-command-entry` | ✅ |
| 10 | 顶栏按钮文案渲染 | curl 转译后的 EditorTopBar.jsx | ✅ 含「全部功能」 |

**未做**：没有在真实窗口里目视确认按钮位置、暗色配色和 hover 效果——本次没有浏览器自动化，
截图类验证留给使用者。E2E 未跑（定位器未涉及本次改动的类名）。

## 已知遗留

- **`dayjs` 未在任何 package.json 声明**（既有问题，非本次引入）。它是 antd 的传递依赖，
  主仓靠旧的扁平 `node_modules` 才解析得到；全新 worktree 严格安装后
  `vite build` / `vite dev` 都会在 `DailyNotebook.jsx` 直接失败，整个应用起不来。
  本次为完成构建验证，临时用一个 alias 指到 `.pnpm/node_modules/dayjs`（验证后已删），
  并在 worktree 的 `node_modules` 里做了一个软链（gitignore 覆盖，不进版本库）。
  正解是把 `dayjs` 加进 `apps/editor/package.json` 依赖，会动 lockfile，不在本次范围内。
  已把这条坑写进 `md-render-electron-startup` skill 的诊断步骤。
- `canvas-bookmark` / `excalidraw-canvas-agent` 两个 suite 在 Node 25 下收集失败
  （`open-color.json` 需要 `import attribute: type json`），与本次改动无关，265 条用例全部通过。
- 大纲收起态仍是 `aria-hidden`，读屏用户在收起状态下拿不到目录；这次只加了鼠标 tooltip，
  无障碍层面的补齐没做。
