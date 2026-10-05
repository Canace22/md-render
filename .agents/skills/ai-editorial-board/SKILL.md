---
name: ai-editorial-board
description: AI 编辑部：以总编辑、热点、选题、读者、结构、标题、品牌、发布、复盘 9 个编辑角色评审稿件、分析标题、发布后复盘。当用户说「审稿」「编辑部」「帮我看看这篇文章」「分析标题」「复盘数据」时加载。核心立场：AI 是编辑，不是作者。
---

# AI 编辑部（指针）

这是产品 skill，正文已迁到 app 内置 skill 目录，**先读取它再执行**：

- 规范正文：`apps/editor/resources/skills/ai-editorial-board/SKILL.md`
- app 内三个入口（拼接上面的规范）：`editorial-review`（审稿）、`editorial-headline`（标题分析）、`editorial-retro`（发布复盘），都在 `apps/editor/resources/skills/` 下

改规范时只改 `resources/skills/ai-editorial-board/SKILL.md`，不要在这里复制正文。
`core/agent/editorialBoard.js` 按章节标题（「编辑部宪法」「标题编辑」「复盘编辑」）提取，改标题要同步跑 `pnpm test:unit`。
