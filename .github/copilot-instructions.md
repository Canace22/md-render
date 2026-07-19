# GitHub Copilot 指引

本项目所有 AI 协作规则的真相源是根目录 [`AGENTS.md`](../AGENTS.md)，请严格遵循其中规范，不要复制正文到本文件。

区域专属规则：

- Electron 主进程 → [`apps/editor/main/AGENTS.md`](../apps/editor/main/AGENTS.md)
- 渲染进程 → [`apps/editor/renderer/AGENTS.md`](../apps/editor/renderer/AGENTS.md)

可复用工作流见 [`.agents/skills/`](../.agents/skills/)，任务匹配某 Skill 触发场景时先读对应 `SKILL.md` 再执行。
