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
| `core/agent/aiClient.js` | 调 OpenAI 兼容接口 + AI 配置读写 | Electron 下走 `window.electronAPI.ai.chat`，Web 下才直接 fetch；配置走 localStorage（key 前缀 `md-renderer-ai-*`），**key 绝不入库** |
| `apps/editor/main/aiRequest.js` | 主进程转发 AI 请求 | 桌面 app 的主路径：Renderer → IPC → Main → `server/ai-proxy`；无浏览器 CORS，但仍依赖 ai-proxy 可连通 |
| `core/agent/sessionUtils.js` | 会话纯函数（增删/标题派生）+ @文件附件拼接 | 无副作用，可单测；store 只是薄 action 调它 |
| `components/AgentPanel.jsx` | 对话/会话列表/@文件 UI + 注入 host | host 在这里对接 store（markdown / updateSelectedFileContent）和 `electronAPI.db.search` |
| `components/MarkdownEditor.jsx` + `components/TabBar.jsx` | AI 助手全局 titlebar 入口、右侧 dock 开关 | 入口状态留在编辑器 shell，不为开关新建全局 store；只调整入口时不要改 agent 引擎 |
| `server/ai-proxy/` | OpenAI 兼容转发代理 + 本地脚本工具服务 | 当前桌面 AI 聊天和 server 工具都会用到；Web 端没有 IPC 时也会直接 fetch 它 |

## AI 请求走哪条路（重要，按真实链路排错）

- **桌面 app（Electron，默认）**：Renderer 走 IPC `window.electronAPI.ai.chat` → `apps/editor/main/aiRequest.js` → `server/ai-proxy` 的 `/api/chat`。这条路没有浏览器 CORS，但如果 `server/ai-proxy` 没启动或 `AI_PROXY_BASE` 指错，面板会报 AI 代理连接失败。
- **Web 端兜底**：没有 IPC 时 `aiClient` 才直接 fetch `server/ai-proxy`（需配 `VITE_AI_PROXY` / 运行时代理地址）。
- `aiClient.hasAiBridge()` 判断当前走哪条路；`isAiConfigured()` 在 Electron 下只校验 key，Web 下还要校验代理地址。
- 改 AI 调用时优先保留 IPC 路径；代理地址优先级是：AI 面板本机设置（localStorage `md-renderer-ai-server`，由 renderer 透传给 IPC）→ 打包时从 `AI_PROXY_BASE` / `VITE_AI_PROXY` 注入的默认值 → main 进程运行时 `AI_PROXY_BASE` → `http://localhost:8788`。
- 打包后如果看到还在连 `localhost:8788`，先查 `apps/editor/.env` 是否有 `AI_PROXY_BASE`、`apps/editor/vite.config.js` 是否把它注入到 `__MD_RENDER_AI_PROXY_BASE__`、以及 `AgentPanel.jsx` / `aiClient.js` 是否把保存的 `aiProxyBase` 传给 `window.electronAPI.ai.chat/execTool/listTools`。
- 开发启动用 `pnpm electron:dev` / `pnpm --filter @md-render/editor electron:dev`，脚本会先探活本地 ai-proxy，没启动就自动拉起；如果设置了远程 `AI_PROXY_BASE` 则跳过本地服务。

## 加一个新工具的标准步骤（最常见任务）

1. 在 `toolRegistry.js` 的 `TOOL_DEFINITIONS` 加 OpenAI function 定义（name/description/parameters）。
2. 在 `EXECUTORS` 加同名执行器：`async (args, host) => 返回字符串`。结果必须是字符串（回填给模型）。
3. 在 `TOOL_LABELS` 加中文标签（任务清单 UI 显示）。
4. 如果工具需要新的宿主能力，在 `AgentPanel.jsx` 的 `host` 对象里补对应方法，对接 store/IPC。
5. **执行器只通过 host 拿能力，不要 import store 或 window.electronAPI**——否则单测没法注入假 host。

## App 专家、诊断与安全自愈

当 Agent 需要理解 md-render 自身、排查发布后问题或产出可复用文档时，优先使用已有产品契约，不要在单个组件里临时加 prompt：

- 产品事实和边界在 `core/agent/appKnowledge.js`，由 `agentEngine.js` 注入 system prompt。
- 内容指针来自 `taskContext.js`，必须带稳定 `id` 和有界元数据；正文只能通过工具按需读取。
- 方案、简报、调研、清单、平台稿、事故报告使用 `create_agent_artifact`，走 `createGeneratedFile` 并保留 `sourceMaterialIds`。
- 发生应用异常时先调用 `inspect_app_health`；只能把 `availableRepairs` 返回的 id 交给 `apply_safe_repair`，由 host 强制确认并复检/回滚。
- 运行诊断放在 Main IPC，必须脱敏路径、凭证和正文。远端 `ai-proxy` 不是用户本机的修复通道。
- 已打包客户端不能自改 asar；代码缺陷应生成 `incident_report`，再进入仓库 Agent、CI 与签名发版。

安全修复流程固定为：`inspect → confirm → apply → verify → rollback on failure`。不要新增通用 shell、任意路径或自由 patch 工具。

## 改内置 slash skill

- 输入框里的 `/skill` 列表在 `AgentPanel.jsx` 的 `PROJECT_SLASH_SKILLS` 等常量里，不会自动读取 `.agents/skills/`。
- `type: 'agent'` 的项目 skill 把 `promptText` 当内部指令；点击后必须直接进入 `runTurn`，用户消息只显示 skill 名称，不得把 prompt 填入输入框。
- 如果只是改“选题 / 新稿件 / 资料单”等入口的工作流提示，优先更新 `promptText` 和搜索别名，复用现有 `create_content_entry`，不要急着加新工具或新 store 字段。
- 需要结构化落库时，再扩展 `create_content_entry` 参数、执行器和 `AgentPanel` host，仍保持执行器只通过 host 取能力。

## 会话管理（全局，不持久化）

- 会话状态在 `useEditorStore`（`agentSessions` / `activeAgentSessionId` + 相关 action），**故意不进 persist 的 partialize 白名单**：切页保留、关 app 清空。要做"关 app 还在"才把字段加进 partialize。
- 别新建独立 store（AGENTS.md 约定）。纯逻辑放 `sessionUtils.js`，store 里只调它。
- 删当前会话自动选下一个；删光自动补一个空会话（`removeSession` 已处理）。

## 面板交互（AgentPanel）

- AI 助手入口不在 `AgentPanel.jsx` 内：打开/关闭由 `MarkdownEditor.jsx` 持有状态，全局顶部按钮走 `TabBar` 的 `trailing` 区。只改入口位置时优先改 shell/titlebar，面板内容和 agent loop 不动。
- 面板里的「对话 / 上下文 / 技能」这类纯 UI 切换用 `AgentPanel.jsx` 局部 state，不进 `useEditorStore`，也不要改 `agentEngine`。
- `AgentDocMeta.jsx` 负责当前稿件、本轮上下文、相关旧文召回展示；不要把这些展示块重新堆回消息流顶部。
- 技能页、欢迎页或 `/skill` picker 选中 `agent` 类型时，立即调用 `runTurn`；带上当前 @附件和选区，然后清空输入态。
- 技能页触发 `quick` / `platform` / `script` 时复用现有 handler，不新增一套执行入口。
- AI 需要用户在多个方案里选择时，优先让 `agentEngine` 输出 `<!-- agent-choice ... -->` 隐藏 JSON 协议，`choiceCards.js` 负责解析，`AgentPanel.jsx` 只渲染卡片并在点击后复用 `runTurn`。不要把选择卡片实现成新的 tool 或全局 store 字段。
- AI 响应态属于 `AgentPanel.jsx` 展示层：模型没有流式输出时，也可以在 `runAgent` 返回 `finalText` 后本地打字式填充同一条 assistant 消息；等待模型时在消息列表底部显示 loading。打字过程中要隐藏未闭合的 `agent-choice` 注释协议，避免把内部 JSON 闪给用户。

## Codex 式任务反馈与响应安全

- 把模型 `assistant.content` 当成不可信输入：在 `agentEngine` 写入 history、发事件和返回 `finalText` **之前**，先用 `assistantResponse.js` 清理回复开头的 `<think>` / `<analysis>` 私有推理块；UI 复用同一函数兼容旧会话。
- 只识别回复开头的精确标签，不要全局删除，否则会误伤 XML / 代码示例和 `<analysis-result>` 这类正常标签。opening tag 或 reasoning 块未闭合时不回显原文，给可重试的安全兜底。
- Assistant 正文用 `AgentMessageContent.jsx` 安全渲染 Markdown：禁用原始 HTML，不自动加载模型给出的远程图片。不要复用现有 `MarkdownRenderer + dangerouslySetInnerHTML`，因为它不适合直接注入模型输出。
- 工具过程和最终答复分层：连续 tool 消息聚合成可折叠的工作记录，最终答复始终独立；产出物卡片放在折叠区外，避免完成瞬间被隐藏。工具运行时不再叠加通用“思考中”。
- `tool_start` / `tool_done` 必须带稳定 `callId`，UI 按 `callId` 收口步骤，不按会重复的 label 猜。不要默认展示原始 args / result，其中可能有正文、路径或诊断信息；只留白名单的产出物元数据。
- 停止与重入要双重防护：`runLockRef` 防同一渲染帧内双启动，`runId` 防旧请求清掉新请求的状态；`callChatCompletion` 返回后再检查一次 `AbortSignal`，丢弃迟到响应。
- Electron IPC / 已启动工具不一定能物理取消。Stop 只能保证不再执行后续步骤和不再回流迟到答复；在途步骤显示 `interrupted / 结果未确认`，不得误报“操作已停止”。
- 没有真实流式通道时，优先展示结构化进度，最终答复到达后立即呈现；不要用长时间的“假逐字”代替真进度。真流式属于 proxy / Main IPC / Renderer 的独立改造。

## @文件（引用工作区文件作上下文）

- 交互在 `AgentPanel.jsx`：输入框检测末尾 `@关键词`（正则 `/(?:^|\s)@([^\s@]*)$/`）→ 弹文件选择器 → 选中加入 `attachedFiles`。
- 真正起作用的一步：**发送时用 `buildInputWithAttachments(text, attachedFiles)` 把文件内容拼进 prompt**，再传给 `runAgent`。只藏 UI、不拼内容 = 模型读不到文件（曾经的坑）。
- UI 上用户消息只存 `files`（文件名数组）做标记，不存正文，避免会话体积膨胀。
- 当前只列 `.md` 文件、单文件超 `MAX_ATTACH_CHARS`(6000) 截断、附件去重。
- **扩展引用类型**（@文件夹 / @搜索结果 / @整个工作区）时：在 `sessionUtils` 加新的拼接函数或扩展 `buildInputWithAttachments`，保持"拼接逻辑是纯函数、UI 只负责选"的分工。

## 不看代码想不到的坑

- preload 暴露的是 `window.electronAPI`（不是 `window.electron`）；搜索是 `await window.electronAPI.db.search(query)`，返回 `{ results: [...] }`。
- 截图里如果只显示 `fetch failed` 或打包 app 仍连 `localhost:8788`，先查主进程是否拿到了正确的 `aiProxyBase`，不要只按前端 CORS 排查。当前友好错误在 `apps/editor/main/aiRequest.js` 和 `AgentPanel.jsx` 两层兜底。
- 写当前文档用 store 的 `updateSelectedFileContent(content)`，不要直接 setMarkdown（那个不落盘）。
- 工具执行器要对坏 JSON 参数、空参数容错，返回友好字符串而非抛错（toolRegistry 已用 try/catch 包裹）。
- agent loop 有 maxSteps 上限，防止模型反复调工具死循环。

## 验证

工具/引擎/会话/附件都是纯逻辑，可用 node ESM 注入假 host + 假 callChatCompletion 直接跑，不必起整个 app。典型 case：

- 工具/引擎：read 拿到内容、write 真改文档、空内容被拒、search 有/无结果、未知工具、坏 JSON、完整 loop。
- 会话（sessionUtils）：新建独立 id、删非激活/删激活跳下一个/删空补新、标题派生、mapSession 不可变。
- @文件（buildInputWithAttachments）：无附件原样、单/多附件含文件名+内容、用户话在末尾、超长截断、空内容不崩。
- 产出物：未知类型和空内容拒绝，来源 id 去重，平台元数据保留，原文不覆盖，成功结果可按 id 重新打开。
- 诊断/修复：Web 只读降级，代理不可达时才提供可用修复，用户取消不改配置，复检失败自动回滚。
