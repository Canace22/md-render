# 今日速记：笔记按周汇总 + 标记已整理

日期：2026-10-12

## 背景

速记一天一篇，笔记散落在每天的「💡 笔记」分区里，回头整理时要一天天翻。需要在右侧把所有笔记按周汇总，方便查看和整理，整理过的能标记出来。

## 做法

「已整理」**不新增数据结构**：就是笔记行尾的 `#已整理` 标签。Markdown 文件、Obsidian、AI 都能直接看到，外部改文件也不会丢；在编辑器里手动打这个标签也算已整理。

| 层 | 文件 | 改动 |
|----|------|------|
| 块级纯函数 | `shared/daily/dailyBlocks.js` | `getSectionItems`（分区顶层条目）、`updateBlockById`、`isBlockOrganized` / `setBlockOrganized` / `stripOrganizedTag` |
| 工作区纯函数 | `utils/dailyWorkspace.js` | `getWeekStartDateKey` / `getWeekEndDateKey`（周一开头）、`setDailyNoteOrganized` |
| 汇总纯函数 | `utils/dailyNotes.js`（新） | 收集所有日子的笔记、按周分组（本周 / 上周标签）、筛选 |
| 状态 | `store/useEditorStore.js` | `setDailyNoteOrganized` action（改块 + 落盘备份） |
| UI | `daily/DailyNotesPanel.jsx`（新）、`DailyNotebook.jsx`、`DailyToolbar.jsx` | 右侧面板；收起后工具栏出现「笔记汇总」按钮 |

交互：

- 面板默认展开，筛选默认「未整理」，可切「已整理 / 全部」；每周显示「已整理数 / 总数」，可折叠。
- 点笔记 → 切到那天并把光标定位到那一行（编辑器按 `日期:nonce` 重挂，同一天内跳转也能定位）。
- 点右侧圆圈 → 标为已整理 / 取消；当天正在编辑的话，编辑器按「外部改动」整篇替换。
- 窄屏（≤820px）隐藏面板。

## 已知限制

- 只汇总「💡 笔记」分区的顶层条目；子级作为摘要显示。
- 纯图片条目不能打标签（没有行内文字），只能查看。

## 验证

- 单测：`tests-unit/daily-notes.test.js`（7 条）及速记相关原有用例全部通过。
- 全量单测里 12 条失败在改动前就存在（sqlite / excalidraw 等环境依赖），与本次无关。
