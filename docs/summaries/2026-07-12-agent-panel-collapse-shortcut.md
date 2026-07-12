# AI 助手面板「收起即断」与开关快捷键 — 改动说明

日期：2026-07-12

## 背景

AI 助手面板有两个体验问题：

1. **收起就断线**：面板通过 `{agentPanelOpen && <AgentPanel/>}` 条件渲染。一收起，`AgentPanel` 被卸载，触发其卸载清理副作用里的 `abortRef.current?.abort()`，把正在进行的回复请求掐断；同时面板本地状态（输入草稿、已选文件、当前 Tab、设置表单）全部丢失。会话消息本身走全局 `agentSlice`、切页不丢，但**进行中的 run** 和面板本地 UI 状态在卸载时会一起没。
2. **没有开关快捷键**：只能点工具栏的 Bot 按钮开关面板，缺少键盘快捷键。

## 改动概述

最小化改动，仅动 1 个文件 `components/MarkdownEditor.jsx`，无外部契约变更。

- **常挂载替代条件渲染**：`{agentPanelOpen && <div class="agent-panel-dock">…}` 改为始终渲染该 dock，用 `style={{ display: 'none' }}` + `aria-hidden` 在收起时隐藏。组件不再卸载，卸载清理里的 abort 不触发，进行中的回复不中断，面板本地状态也保留。收起时 `display:none` 不占布局宽度。
- **新增 `Cmd/Ctrl+J` 开关面板**：在组件内加一个 `useEffect` 注册全局 `keydown` 监听，`(metaKey||ctrlKey) && !shiftKey && !altKey && key==='j'` 时 `preventDefault` 并翻转 `agentPanelOpen`；卸载时 `removeEventListener` 清理。
- **工具栏按钮 tooltip** 补上快捷键提示「（⌘/Ctrl+J）」。

## 关键决策

- **用 `display:none` 保持挂载，而非改动卸载清理逻辑**：卸载时 abort 在途请求本身是正确的清理行为，不该删。让面板收起时不卸载，从根上绕开这次误伤，顺带把「草稿/附件/Tab 状态收起后还在」也一并解决，改动面更小、更安全。
- **快捷键选 `Cmd/Ctrl+J`**：编辑器（CodeMirror）无 `J` 键位绑定，避开 Shift/Alt 组合避免误触；跨 Mac/Win 统一。
- **权衡**：面板现在随编辑器常驻挂载，启动时会预取 provider/tools（原为首次打开才取）。开销很小，换来「收起不断线」；若需按需加载可改为「首次打开后才常驻」。

## 影响范围

| 层 | 文件 |
|----|------|
| 组件 | `components/MarkdownEditor.jsx`（渲染方式 1 处、新增 keydown useEffect、按钮 tooltip） |

`AgentPanel.jsx` 未改；`window.electronAPI`、workspace 结构、全局会话切片均保持兼容。

## 验证

沙盒无依赖、无 pnpm，未能跑 `pnpm test:unit`，需本地执行确认（记忆中的预存基线失败可忽略）。改动为纯 JSX/JS，不触及被测逻辑。

10 条输入用例预期：

| # | 场景 | 预期 |
|---|------|------|
| 1 | 回复进行中点收起 | 回复继续，重开可见完整结果 |
| 2 | 空闲收起再重开 | 输入草稿/已选文件/当前 Tab 均保留 |
| 3 | 面板关时按 ⌘/Ctrl+J | 打开 |
| 4 | 面板开时按 ⌘/Ctrl+J | 收起 |
| 5 | 面板关闭 | dock 不占布局宽度（display:none） |
| 6 | 按 ⌘/Ctrl+Shift+J | 不触发（!shiftKey 拦截） |
| 7 | 单按 J | 不触发（需 meta/ctrl） |
| 8 | 大写锁定下 ⌘/Ctrl+J | 仍触发（toLowerCase） |
| 9 | 悬停工具栏 Bot 按钮 | tooltip 显示「打开/关闭 AI 助手（⌘/Ctrl+J）」 |
| 10 | 编辑器整体卸载 | keydown 监听被清理，无泄漏 |

## 已知问题 / 后续

- 面板常驻挂载带来启动时的 provider/tools 预取，如需可改为按需加载。
- 建议补一条冒烟测试：`Cmd/Ctrl+J` 翻转 `agentPanelOpen`、收起时 dock 仍在 DOM，防回归。
