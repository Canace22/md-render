# 本地 Agent 接入（打开就能用，不填 key）

日期：2026-10-05

## 背景

AI 助手之前必须先起 `server/ai-proxy` 并填 API Key。很多用户本机已经装了 Codex / Claude Code / Cursor，而且有自己的登录、规则、skills 和 MCP。这次让 md-render 直接驱动这些 agent：自动检测、默认选中、能切换 agent 和模型，优先用用户本地的 Harness。任务清单见根目录 `TASK.md`。

## 原理

一整轮交给本机 CLI 跑（无头模式 + JSONL 输出），md-render 只做三件事：拼参数起进程、把 JSONL 翻译成现有的 `tool_start / tool_done / done` 事件、把自己的工具通过 `mcp-bridge` 借给 agent。

```
AgentPanel.runTurn ─┬─ API 服务商 → runAgent()
                    └─ 本机 agent → runLocalAgent() → IPC local-agent:run
                         → main：spawn CLI（login shell 环境、独立进程组、注入 md-render MCP、resume）
                         → 适配器 parseLine → local-agent:event → renderer 步骤 / 活动记录
```

## 改动

| 任务 | 文件 | 做法 |
|------|------|------|
| L0 检测 | `shared/localAgents.js`、`main/localAgents/detect.js`、`shellEnv.js`、`ipc/localAgentHandlers.js`、`preload.js` | 注册表纯数据；PATH → login shell PATH → 常见目录 → 桌面 app 自带 CLI；Cursor 的 `agent` 重名靠真实路径/版本号确认；并行 + 单项超时 + 缓存 |
| L1 运行 | `runner.js`、`adapters/{codex,claudeCode,cursor,common}.js`、`workDir.js`、`mcpConfig.js` | 独立进程组 + 守护进程实现真取消；三家适配器 `buildArgs / parseLine` 都是纯函数；cwd 只允许项目根或内容库；MCP 用 Electron 自身跑 bridge |
| L1-6 打包 | `scripts/package-electron.mjs`、`package.json` | esbuild 把 `server/mcp-bridge` 打成 `resources/mcp-bridge/index.mjs` |
| L1-8 白名单 | `server/mcp-bridge/{index,bridgeClient}.js` | `MD_RENDER_ALLOWED_TOOLS` 在 bridge 层过滤，三家通用 |
| L1-9~12 | `core/agent/localAgentClient.js`、`sessionUtils.js`、`agentSlice.js`、`activity.js`、`AgentActivityTab.jsx` | `runLocalAgent` 与 `runAgent` 同签名；改文件/跑命令进活动记录（来源 `local-agent`，显示 agent 名）；会话存 `agentId + externalSessionId` |
| L2 / U1~U3 | `aiSources.js`、`aiClient.js`、`hooks/useAiSource.js`、`AgentSourcePicker.jsx`、`AgentLocalSources.jsx`、`AgentPanel.jsx` | 统一来源列表、`pickDefaultSource`、每来源记模型、安全模式；输入框旁切换器、设置页检测结果、首次提示 |
| L3 | `tests-unit/local-agents.test.js` + 三家 JSONL 样本、SKILL.md、README、产品功能说明 | 28 条单测 |

## 设计取舍

- 来源逻辑放在新文件 `aiSources.js`，`aiClient.js` 只包一层：避免两边互相 import。
- 本机 agent 的中间文字不逐条进面板，只显示步骤和最终答复，和 API 路径保持一致。
- Cursor 只能从工作目录的 `.cursor/mcp.json` 读 MCP：只合并 `md-render` 一项，文件不合法就不写，并在答复末尾提示。
- 换 agent 不把之前的对话塞给新 agent（各家历史格式不同），直接开新会话并提示。

## 测试 case

1. 三家都装 → 默认 Codex；只装 Cursor → Cursor；都没装 → 内置 key 服务商（单测）
2. login shell 里才有 `codex` 能检测到；PATH 里非 Cursor 的 `agent` 被忽略；单个 CLI 卡住不拖垮整体（单测）
3. Claude Code + opus → 参数带 `--model opus --dangerously-skip-permissions`，跟随默认不带 `--model`（单测）
4. 三家 JSONL 样本：工具 start/done 的 callId 对得上，结束事件带最终正文和会话 id（单测）
5. Stop：子进程（含它拉起的 `sleep`）被 kill，不再推事件（单测）
6. Cursor `mcp.json` 已有配置原样保留，只多 `md-render` 一项（单测）

## 未验证

- 在 macOS 上用真实的 Codex / Claude Code / Cursor 跑通一轮（这次在 Linux 环境里只用假 CLI 和录好的样本验证了链路；各家 JSONL 字段以本机实际输出为准，有出入时改对应适配器的 `parseLine`）
- `pnpm electron:build` 打包后 bridge 能从 resources 启动
- 面板切换器 / 设置页的实际界面效果
