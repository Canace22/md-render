# 本地 Agent 接入任务清单

> 目标：打开 AI 助手就能用，不用填 API key。自动检测用户本机已装的 agent，默认选中一个，用户可以切换 agent 和模型；优先使用用户本地的 Harness（他们自己的登录、CLAUDE.md / AGENTS.md、skills、MCP、hooks）。
> 创建：2026-10-05
> 关联：[`docs/ai-native-architecture-plan.md`](docs/ai-native-architecture-plan.md) 4.6 节、[`server/mcp-bridge/README.md`](server/mcp-bridge/README.md)、[`.agents/skills/md-render-agent/SKILL.md`](.agents/skills/md-render-agent/SKILL.md)
> 约定：做完一条就勾选，提交信息用「完成任务：<编号> <标题>」；阶段完成后在 `docs/summaries/` 写总结。

**状态说明**：`[ ]` 待做 · `[~]` 进行中 · `[x]` 完成 · `⛔` 被决策阻塞

---

## 原理

两种「本地」，接法不同：

| 类型 | 例子 | 怎么接 |
|---|---|---|
| **本地 agent（Harness）** | 首批：Codex、Claude Code、Cursor CLI；只检测：Gemini CLI、Qwen Code、OpenCode | 一整轮交给它跑。md-render 用无头模式启动 CLI，把输出的 JSONL 转成现有的 `tool_start / tool_done / assistant_text / done` 事件。md-render 的工具通过现有 `mcp-bridge` 借给它用 |
| **本地模型服务** | Ollama、LM Studio | 本质是 OpenAI 兼容接口，后续作为 provider 接进现有 `agentEngine`（本期只检测） |

```
AgentPanel.runTurn
  ├─ API 服务商 → runAgent()（现有）
  └─ 本地 agent → runLocalAgent()（签名、返回值、事件和 runAgent 一致）
        │ IPC localAgent:run
        ▼
  Main：spawn CLI（cwd = 工作目录，默认 bypass 权限，注入 md-render MCP，resume 续会话）
        │ 按行解析 JSONL → 事件 → webContents.send
        ▼
  agent 直接读写文件 / 跑命令；需要 app 能力时回调 md-render 工具（mcp-bridge）
```

**默认选中规则**：用户上次的选择（仍可用时）→ 按优先级取第一个可用的本地 agent（Codex > Claude Code > Cursor）→ 内置 key 的 API 服务商 → 打开设置页。
「可用」= 已检测到 + 已适配 +（能判断时）已登录。

**各 agent 无头调用速查**（实现时以本机 `--help` 为准）：

| | Codex | Claude Code | Cursor CLI |
|---|---|---|---|
| 命令 | `codex exec --json` | `claude -p --output-format stream-json --verbose` | `agent -p --output-format stream-json`（旧名 `cursor-agent`） |
| 跳过权限（默认） | `--dangerously-bypass-approvals-and-sandbox` | `--dangerously-skip-permissions` | `--force` |
| 模型 | `-m <model>` | `--model <model>` | `--model <model>` |
| 续会话 | `codex exec resume <threadId>` | `--resume <sessionId>` | `--resume <chatId>` |
| 注入 MCP | `-c mcp_servers.md-render.command=...` | `--mcp-config <json>` | 工作目录 `.cursor/mcp.json` + `--approve-mcps` |
| 登录检测 | `codex login status` | 首轮失败兜底 | `agent status` |
| 模型列表 | 预设 + 读 `~/.codex/config.toml` 默认值 | 预设别名 | `agent models` |

---

## D 决策

- [x] **D1** 默认优先级：**Codex > Claude Code > Cursor**
- [x] **D2** 本地 agent 可以直接改文件，**默认 bypass 全部权限**；设置里提供「安全模式」开关（默认关）
- [x] **D3** 首批适配：**Codex、Claude Code、Cursor CLI**；Gemini CLI / Qwen Code / OpenCode / Ollama / LM Studio 本期只检测，显示「即将支持」

> 2026-10-05 用户拍板：Codex 优先；默认 bypass，允许直接改文件；首批适配 Codex、Claude Code、Cursor。
>
> **bypass 的影响**：agent 能在工作目录里任意改文件、跑命令，没有逐条确认。兜底措施：cwd 限定在工作目录（L1-2）、每步命令和改动进活动记录（L1-10）、Stop 直接 kill 进程、需要时打开安全模式。

---

## L0 检测

- [x] **L0-1** agent 注册表（纯数据）：`id / label / bins / kind(agent|model-server) / priority / supported`
  - 范围：`apps/editor/shared/localAgents.js`
  - 优先级：codex 10 > claude 20 > cursor 30；只检测的条目 `supported: false`
  - 验收：加一个新 agent 只改这张表 + 写一个适配器
- [x] **L0-2** 检测 CLI：先查 PATH，查不到就用 `$SHELL -lc 'command -v <bin>'`，再兜底常见目录（`~/.local/bin`、`/opt/homebrew/bin`、`/usr/local/bin`、`~/.npm-global/bin`、`~/.claude/local`、`~/.cursor/bin`）；取版本号；结果缓存，提供「重新检测」
  - 范围：`apps/editor/main/localAgents/detect.js`
  - 坑 1：macOS 从 Finder 启动的 Electron 不继承 shell 的 PATH；spawn 时也要带上 login shell 的环境变量（用户的代理、登录态依赖它）
  - 坑 2：Cursor 的命令叫 `agent`，名字太通用。先找 `cursor-agent`，再找 `agent` 并用 `--version` / 路径确认是 Cursor，不是就忽略
  - 验收：单个 CLI 卡住不拖垮整体（每项超时 3 秒，并行检测）
- [x] **L0-3** 检测本地模型服务（只检测）：探测 Ollama `localhost:11434/api/tags`、LM Studio `localhost:1234/v1/models`
- [x] **L0-4** 登录态检测：Codex `codex login status`、Cursor `agent status`；Claude Code 标记「未验证」，首轮报鉴权错误时给引导（「在终端运行一次 `claude` 完成登录」）
- [x] **L0-5** IPC + preload：`localAgent.detect({ refresh })` 返回 `[{ id, label, version, path, status: ready|unverified|needs-login|unsupported }]`
  - 范围：`main/ipc/localAgentHandlers.js`、`registerIpcHandlers.js`、`preload.js`

## L1 运行

- [x] **L1-1** 通用运行器：spawn、按行切 JSONL、stderr 收集、超时、Stop 时 kill 子进程（含子进程树，真取消）；每次运行用独立 runId 推事件
  - 范围：`apps/editor/main/localAgents/runner.js`
- [x] **L1-2** 工作目录：当前挂载了本地项目就用项目根目录，否则用内容库根目录；不允许 home 或系统目录
- [x] **L1-3** Codex 适配器（纯函数）：`buildArgs({ prompt, model, sessionId, safeMode, mcpConfig })` + `parseLine(line) → events[]`
  - 范围：`main/localAgents/adapters/codex.js`
- [x] **L1-4** Claude Code 适配器：同上，系统提示走 `--append-system-prompt`
  - 范围：`main/localAgents/adapters/claudeCode.js`
- [x] **L1-5** Cursor 适配器：同上；MCP 通过工作目录的 `.cursor/mcp.json` 注入，**只合并 `md-render` 一项，不覆盖用户已有配置**，配合 `--approve-mcps`
  - 范围：`main/localAgents/adapters/cursor.js`
- [~] **L1-6** 注入 md-render MCP：生成 mcp-bridge 的启动配置；打包后 mcp-bridge 放进 resources，用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1` 跑（用户机器不一定有 node）
  - 范围：`main/localAgents/mcpConfig.js`、`vite.config.js` / electron-builder 配置
- [ ] **L1-7** 系统提示：`ENGINE_RULES` + `AGENT_INSTRUCTIONS`（含 agent-choice 选择卡片协议）和 app 内 AI 同源；不支持追加系统提示的 agent 拼在 prompt 开头
- [x] **L1-8** skill 工具白名单：在 mcp-bridge 层过滤（启动时传 `MD_RENDER_ALLOWED_TOOLS` 环境变量），三家 agent 通用；`null` 表示放行全部 md-render 工具
- [ ] **L1-9** renderer 侧 `runLocalAgent()`：和 `runAgent` 同签名、同返回值，订阅 IPC 事件转 `onEvent`；agent 自己的工具（改文件、跑命令）也映射成 `tool_start / tool_done`，标签如「改文件 xxx.md」「运行命令」
  - 范围：`renderer/src/core/agent/localAgentClient.js`
- [ ] **L1-10** 活动记录：本地 agent 的每次改文件、跑命令写进活动记录（复用 U4），来源标注 agent 名
- [ ] **L1-11** 会话续接：会话上存 `agentId` + `externalSessionId`（Codex threadId / Claude sessionId / Cursor chatId）；下一轮用 resume；切换 agent 后从新会话开始，并提示「已切换到 X，新会话开始」
  - 范围：`sessionUtils.js`、`agentSlice`
- [ ] **L1-12** 直接改文件后 app 同步：本地项目里的文件复用 `localProjectWatcher` 刷新；正在编辑的文件被改时依赖 U6（外部修改提示）
  - 已知限制：内置文档还在 SQLite（P3 未做），agent 改不到真文件，只能走 md-render MCP 工具；system prompt 里写清这一点

## L2 选择与切换

- [ ] **L2-1** 统一「AI 来源」列表：本地 agent + API 服务商，带分组和状态
  - 范围：`aiClient.js`（`listAiSources` / `getActiveSource` / `setActiveSource`），存 `md-renderer-ai-source`
- [ ] **L2-2** 默认选中：纯函数 `pickDefaultSource(detected, saved, builtinProviders)`，规则见「原理」；`isAiConfigured()` 有可用本地 agent 即为 true
- [ ] **L2-3** 模型列表（按来源）：
  - Codex：跟随默认（显示 `~/.codex/config.toml` 里的 `model`）/ 预设 / 自定义
  - Claude Code：跟随默认 / `sonnet` / `opus` / `haiku` / 自定义
  - Cursor：`agent models` 返回的真实列表；失败时退回预设 + 自定义
  - API 服务商：沿用现有 `md-renderer-ai-model:<id>`
  - 「跟随默认」= 不传模型参数，让用户本地 Harness 的配置生效
- [ ] **L2-4** 每个来源单独记住选过的模型：`md-renderer-ai-model:<sourceId>`
- [ ] **L2-5** 安全模式（默认关）：开启后 Codex 用 `--sandbox workspace-write`、Claude 用 `--permission-mode acceptEdits`、Cursor 不加 `--force`；存 `md-renderer-local-agent-safe-mode`

**UI（L2）**

- [ ] **U1** 面板输入框旁的「来源 · 模型」切换器：一级选 agent，二级选模型；不可用的置灰并写明原因（未登录 / 即将支持）
- [ ] **U2** 设置页「AI 来源」：检测结果、版本、路径、「重新检测」、「安全模式」开关；没检测到任何本地 agent 时显示安装指引 + 回落到 API 服务商
- [ ] **U3** 首次打开：自动选中后用一行提示「已使用本机 Codex，可在这里切换」

## L3 收尾

- [ ] **L3-1** 单测：detect（含 `agent` 重名识别）、三个适配器的 `buildArgs / parseLine`（用录好的 JSONL 样本）、`pickDefaultSource`、Cursor `mcp.json` 合并、白名单过滤
  - 范围：`tests-unit/local-agents.test.js`、`tests-unit/fixtures/local-agents/*.jsonl`
- [ ] **L3-2** 更新 `.agents/skills/md-render-agent/SKILL.md`：新增「本地 agent」一节（链路、坑、加新 agent 的步骤）
- [ ] **L3-3** 更新 `README.md` / `docs/产品功能说明.md`：开箱即用说明、bypass 默认行为与安全模式

## 后续（本期不做）

- [ ] **N1** Ollama / LM Studio 作为 provider 接进 `aiProviders.js`，走现有 `runAgent`
- [ ] **N2** 适配 Gemini CLI / Qwen Code / OpenCode；超过 4 个适配器时评估统一走 ACP

---

## 测试 case

1. Codex、Claude Code、Cursor 都装了：默认选中 Codex；只装了 Cursor：默认选中 Cursor；一个都没装：回落到内置 key 服务商，行为和现在一致
2. GUI 启动时 PATH 里没有 `codex`，但 login shell 里有：能检测到，并能正常运行；PATH 里有个不是 Cursor 的 `agent`：不会被识别成 Cursor
3. 切到 Claude Code + `opus`，发一句话：实际进程参数带 `--model opus` 和 `--dangerously-skip-permissions`；切回「跟随默认」后不带 `--model`
4. 三家各用录好的 JSONL 样本：工具调用 → `tool_start`，结果 → `tool_done`（callId 对得上），结束事件 → `done` 并带最终正文
5. 同一会话第二轮：用 resume 续上，agent 记得上一轮内容；中途换 agent：新会话，有提示
6. 让 agent 改本地项目里的一篇文档：磁盘文件被改，编辑器刷新，活动记录有一条「Codex 改文件」
7. 运行中点 Stop：子进程（含它拉起的命令）被 kill，没有残留进程；在途步骤显示「结果未确认」
8. 打开安全模式后让 agent 跑 `rm` 之类的命令：被拒绝；关掉后恢复 bypass
9. Cursor 首次运行：工作目录里已有的 `.cursor/mcp.json` 配置原样保留，只多出 `md-render` 一项
10. 删掉上次选中的 agent 后重启：自动换成下一个可用的，不报错

## 验收

1. 装了 Codex / Claude Code / Cursor 任一个的用户，打开 AI 助手第一句话就能跑通，全程不填 key、不点权限确认
2. 来源和模型都能在面板里一键切换，切换结果在重启后保留
3. 本地 agent 下，用户自己的配置、skills、MCP 生效；md-render 的工具也能被调用

## 明确不做

不替用户安装或登录 agent · 不读取或保存任何 agent 的凭证 · 不做多 agent 并行编排
