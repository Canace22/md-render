---
name: md-render-agent
description: 给 md-render 的 AI 助手（Cowork 式 agent）加工具、改引擎、调面板时的规范。涉及 core/agent/ 下的 agentEngine / toolRegistry / aiClient 或 AgentPanel.jsx 时加载。
---

# md-render AI 助手（agent）开发规范

## 它是什么

编辑器里的 Cowork 式 AI 助手：用户提需求 → agent loop 自己调工具、读写工作区、分步完成。最小闭环已落地，新增能力主要是「往工具表加条目」。

## 模块分工（改之前先认清边界）

| 文件 | 职责 | 关键约束 |
|------|------|---------|
| `core/agent/agentEngine.js` | agent loop（调模型→执行工具→回填→循环） | 纯逻辑，**不碰 IPC / store / React**。模型调用走 aiClient，工具走 host，进度走 onEvent |
| `core/agent/toolRegistry.js` | OpenAI tools 定义 + 执行器 | 工具定义是纯数据；执行器依赖注入的 `host`，**不直接 import store/IPC**（这样可单测） |
| `core/agent/aiClient.js` | 调 OpenAI 兼容接口 + AI 配置读写 | 配置走 localStorage（key 前缀 `md-renderer-ai-*`），**key 绝不入库** |
| `apps/editor/main/aiRequest.js` | 主进程 Node 直连 AI | 桌面 app 的 AI 主路径，无 CORS |
| `components/AgentPanel.jsx` | 对话/任务清单 UI + 注入 host | host 在这里对接 store（markdown / updateSelectedFileContent）和 `electronAPI.db.search` |
| `server/ai-proxy/` | OpenAI 兼容转发代理 | **仅 Web 端需要**，桌面 app 用不到（见下） |

## AI 请求走哪条路（重要，别改回代理）

- **桌面 app（Electron，默认）**：走主进程 IPC `window.electronAPI.ai.chat` → `aiRequest.js`，Node 直连无 CORS，**不需要任何代理服务器**。设置里不显示代理地址框。
- **Web 端兜底**：没有 IPC 时 aiClient 才回退到代理 fetch（需配 `VITE_AI_PROXY` / 运行时代理地址），这时才用 `server/ai-proxy`。
- `aiClient.hasAiBridge()` 判断当前走哪条路；`isAiConfigured()` 在 Electron 下只校验 key，Web 下还要校验代理地址。
- 改 AI 调用时优先用 IPC 路径，别为桌面 app 引入代理依赖。

## 加一个新工具的标准步骤（最常见任务）

1. 在 `toolRegistry.js` 的 `TOOL_DEFINITIONS` 加 OpenAI function 定义（name/description/parameters）。
2. 在 `EXECUTORS` 加同名执行器：`async (args, host) => 返回字符串`。结果必须是字符串（回填给模型）。
3. 在 `TOOL_LABELS` 加中文标签（任务清单 UI 显示）。
4. 如果工具需要新的宿主能力，在 `AgentPanel.jsx` 的 `host` 对象里补对应方法，对接 store/IPC。
5. **执行器只通过 host 拿能力，不要 import store 或 window.electronAPI**——否则单测没法注入假 host。

## 不看代码想不到的坑

- preload 暴露的是 `window.electronAPI`（不是 `window.electron`）；搜索是 `await window.electronAPI.db.search(query)`，返回 `{ results: [...] }`。
- 写当前文档用 store 的 `updateSelectedFileContent(content)`，不要直接 setMarkdown（那个不落盘）。
- 工具执行器要对坏 JSON 参数、空参数容错，返回友好字符串而非抛错（toolRegistry 已用 try/catch 包裹）。
- agent loop 有 maxSteps 上限，防止模型反复调工具死循环。

## 验证

工具/引擎是纯逻辑，可用 node ESM 注入假 host + 假 callChatCompletion 直接跑，不必起整个 app。典型 case：read 拿到内容、write 真改文档、空内容被拒、search 有/无结果、未知工具、坏 JSON、完整 loop（先调工具再收尾）。
