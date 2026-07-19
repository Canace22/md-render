# AI 协作文档体检与修正

日期：2026-07-19

## 背景

对项目的 AI 协作体系（根 `AGENTS.md`、`CLAUDE.md`、分层 `AGENTS.md`、`.cursor/rules/`、18 个 `.agents/skills/`）做一次全面体检：核对引用路径是否存在、约定是否与代码脱节、skill 索引表与实际目录是否一致，并补齐其他 AI 工具的适配入口。

## 体检结论

整体质量良好：CLAUDE.md 入口表路径全部有效；技术栈版本与 `package.json` 一致；AGENTS.md 的 skill 索引表与 `.agents/skills/` 实际 18 个目录完全同步；skills 正文引用的代码路径均存在。

发现的脱节点：

- `AGENTS.md` 目录结构图缺少 `packages/blocknote-core`（本地 BlockNote 底层包，已有对应 skill 引用）和整个 `server/` 层（cloud-sync / ai-proxy / notion-proxy）。
- `CLAUDE.md` 常见入口表缺少三个高频区域：AI 助手（`core/agent/`）、云同步与代理服务端（`server/`）、BlockNote 底层包。
- 缺少 GitHub Copilot 的指针入口；`AGENTS.md` 头部的工具指针说明也未覆盖 Copilot / Codex。
- `agents/openai.yaml` 适配仅 `md-render-excalidraw-canvas` 一个 skill 存在，约定未在目录约定表中登记，容易被误认为遗漏。

## 改动

- `AGENTS.md`：目录结构图补 `packages/blocknote-core` 与 `server/` 三个子目录；头部指针说明补 Copilot / Codex；目录约定表登记 `agents/openai.yaml` 为可选适配（不强制补齐）。
- `CLAUDE.md`：常见入口表新增 AI 助手（agent 引擎/工具/面板）、云同步/代理服务端、BlockNote 底层机制包三行。
- 新增 `.github/copilot-instructions.md`：纯指针文件，指向根 `AGENTS.md` 与分层规则，不复制正文。

## 验证

- 脚本核对三个改动文件中所有 `apps/`、`packages/`、`server/` 引用路径均存在于仓库。
- 未改动任何代码文件，无需跑测试。
