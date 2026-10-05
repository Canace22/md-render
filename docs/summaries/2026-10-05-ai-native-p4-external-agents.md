# 外部 agent 接入（AI Native 重构 P4）

日期：2026-10-05

## 背景

P1–P3 之后，skill 是文件、数据是文件、写操作走提案。P4 要做的是让 Claude Code、Codex 这类外部 agent 直接打开 `~/Documents/MdRender` 就能干活，并且和 app 内 AI 用同一份说明、同一批 skill。

## 改动

| 任务 | 文件 | 做法 |
|------|------|------|
| P4-1 | `shared/vaultAgentsMd.js`、`main/vaultAgentFiles.js` | 内容库根目录生成 `AGENTS.md`：app 托管段（`MANAGED_BEGIN/END`）放 `AGENT_INSTRUCTIONS` 和「app 工具 ↔ 文件路径」对照表，用户段原样保留；内置 skill 同步到 `.agents/skills/`（带 `.md-render-managed.json` 标记，用户改过就不再覆盖）；`.claude/skills` 软链到 `.agents/skills` |
| P4-2（部分） | `tests-unit/vault-agent-files.test.js` | 一致性单测：AGENTS.md 托管段与系统提示同源、三个目标 skill 都在副本里、改过的副本不被覆盖。Claude Code 实跑需要在本机做 |
| P4-3 / P4-4 | `docs/agent-product-roadmap.md`、`docs/产品功能说明.md`、`README.md`、`server/mcp-bridge/README.md` | 合并路线文档，补充内容库、提案、外部 agent 的说明 |
| U8 | `ExternalAgentSettings.jsx`、`utils/mcpConfig.js`、`vault:agent-info` / `vault:open` IPC | 设置页显示内容库路径；一键复制 MCP 配置、打开 / 重新生成 AGENTS.md |
| U9 | `surfaceLabels.js`、`toolRegistry.js`、`shared/appKnowledge.js` | 去掉「同步中心」界面入口（AI 不再能 `open_surface('sync')`）；命令面板里的「从磁盘同步本地项目」是另一个功能，保留 |

## 设计取舍

- AGENTS.md 只托管一段，用户自己写的内容永远不动，删掉标记就等于退出托管
- skill 副本按「是否改过」决定是否覆盖，而不是按时间，避免误删用户改动
- MCP 配置只生成文本让用户复制，不去改各家 agent 的配置文件（路径和格式各不相同，改错了难排查）

## 测试 case

1. 空内容库首次同步：生成 AGENTS.md、31 个 skill 副本和 `.claude/skills` 软链
2. AGENTS.md 已有用户内容：同步后用户段不变，只更新托管段
3. 用户改过某个 skill 副本：再次同步不覆盖
4. 设置页点「复制 MCP 配置」：剪贴板里是 mcpServers JSON，找不到 bridge 路径时用占位符并提示替换
5. 问 AI「打开同步中心」：不再出现该选项

## 未验证

- Claude Code 在本机实跑三个 skill（P4-2）
- `pnpm build` 与端到端界面操作
