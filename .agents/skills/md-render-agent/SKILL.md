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
| `server/ai-proxy/` | OpenAI 兼容转发代理 + 本地脚本工具服务 | 当前桌面 AI 聊天和 server 工具都会用到；Web 端没有 IPC 时也会直接 fetch 它 |

## AI 请求走哪条路（重要，按真实链路排错）

- **桌面 app（Electron，默认）**：Renderer 走 IPC `window.electronAPI.ai.chat` → `apps/editor/main/aiRequest.js` → `server/ai-proxy` 的 `/api/chat`。这条路没有浏览器 CORS，但如果 `server/ai-proxy` 没启动或 `AI_PROXY_BASE` 指错，面板会报 AI 代理连接失败。
- **Web 端兜底**：没有 IPC 时 `aiClient` 才直接 fetch `server/ai-proxy`（需配 `VITE_AI_PROXY` / 运行时代理地址）。
- `aiClient.hasAiBridge()` 判断当前走哪条路；`isAiConfigured()` 在 Electron 下只校验 key，Web 下还要校验代理地址。
- 改 AI 调用时优先保留 IPC 路径；代理地址默认在 main 进程读 `AI_PROXY_BASE || http://localhost:8788`，前端设置里的 server 地址主要给 Web 兜底用。
- 开发启动用 `pnpm electron:dev` / `pnpm --filter @md-render/editor electron:dev`，脚本会先探活本地 ai-proxy，没启动就自动拉起；如果设置了远程 `AI_PROXY_BASE` 则跳过本地服务。

## 加一个新工具的标准步骤（最常见任务）

1. 在 `toolRegistry.js` 的 `TOOL_DEFINITIONS` 加 OpenAI function 定义（name/description/parameters）。
2. 在 `EXECUTORS` 加同名执行器：`async (args, host) => 返回字符串`。结果必须是字符串（回填给模型）。
3. 在 `TOOL_LABELS` 加中文标签（任务清单 UI 显示）。
4. 如果工具需要新的宿主能力，在 `AgentPanel.jsx` 的 `host` 对象里补对应方法，对接 store/IPC。
5. **执行器只通过 host 拿能力，不要 import store 或 window.electronAPI**——否则单测没法注入假 host。

## 改内置 slash skill

- 输入框里的 `/skill` 列表在 `AgentPanel.jsx` 的 `PROJECT_SLASH_SKILLS` 等常量里，不会自动读取 `.agents/skills/`。
- `type: 'insert'` 的项目 skill 只是把 `insertText` 填进输入框；真正执行仍靠 agent prompt 和 `toolRegistry` 工具。
- 如果只是改“选题 / 新稿件 / 资料单”等入口的工作流提示，优先更新 `insertText` 和搜索别名，复用现有 `create_content_entry`，不要急着加新工具或新 store 字段。
- 需要结构化落库时，再扩展 `create_content_entry` 参数、执行器和 `AgentPanel` host，仍保持执行器只通过 host 取能力。

## 会话管理（全局，不持久化）

- 会话状态在 `useEditorStore`（`agentSessions` / `activeAgentSessionId` + 相关 action），**故意不进 persist 的 partialize 白名单**：切页保留、关 app 清空。要做"关 app 还在"才把字段加进 partialize。
- 别新建独立 store（AGENTS.md 约定）。纯逻辑放 `sessionUtils.js`，store 里只调它。
- 删当前会话自动选下一个；删光自动补一个空会话（`removeSession` 已处理）。

## 面板交互（AgentPanel）

- 面板里的「对话 / 上下文 / 技能」这类纯 UI 切换用 `AgentPanel.jsx` 局部 state，不进 `useEditorStore`，也不要改 `agentEngine`。
- `AgentDocMeta.jsx` 负责当前稿件、本轮上下文、相关旧文召回展示；不要把这些展示块重新堆回消息流顶部。
- 技能页或 `/skill` picker 选中 `insert` 类型时，只把 `insertText` 填进输入框并切回对话；真正执行仍由用户发送后进入 agent loop。
- 技能页触发 `quick` / `platform` / `script` 时复用现有 handler，不新增一套执行入口。

## @文件（引用工作区文件作上下文）

- 交互在 `AgentPanel.jsx`：输入框检测末尾 `@关键词`（正则 `/(?:^|\s)@([^\s@]*)$/`）→ 弹文件选择器 → 选中加入 `attachedFiles`。
- 真正起作用的一步：**发送时用 `buildInputWithAttachments(text, attachedFiles)` 把文件内容拼进 prompt**，再传给 `runAgent`。只藏 UI、不拼内容 = 模型读不到文件（曾经的坑）。
- UI 上用户消息只存 `files`（文件名数组）做标记，不存正文，避免会话体积膨胀。
- 当前只列 `.md` 文件、单文件超 `MAX_ATTACH_CHARS`(6000) 截断、附件去重。
- **扩展引用类型**（@文件夹 / @搜索结果 / @整个工作区）时：在 `sessionUtils` 加新的拼接函数或扩展 `buildInputWithAttachments`，保持"拼接逻辑是纯函数、UI 只负责选"的分工。

## 不看代码想不到的坑

- preload 暴露的是 `window.electronAPI`（不是 `window.electron`）；搜索是 `await window.electronAPI.db.search(query)`，返回 `{ results: [...] }`。
- 截图里如果只显示 `fetch failed`，先查主进程是否连不上 `server/ai-proxy`，不要只按前端 CORS 排查。当前友好错误在 `apps/editor/main/aiRequest.js` 和 `AgentPanel.jsx` 两层兜底。
- 写当前文档用 store 的 `updateSelectedFileContent(content)`，不要直接 setMarkdown（那个不落盘）。
- 工具执行器要对坏 JSON 参数、空参数容错，返回友好字符串而非抛错（toolRegistry 已用 try/catch 包裹）。
- agent loop 有 maxSteps 上限，防止模型反复调工具死循环。

## 验证

工具/引擎/会话/附件都是纯逻辑，可用 node ESM 注入假 host + 假 callChatCompletion 直接跑，不必起整个 app。典型 case：

- 工具/引擎：read 拿到内容、write 真改文档、空内容被拒、search 有/无结果、未知工具、坏 JSON、完整 loop。
- 会话（sessionUtils）：新建独立 id、删非激活/删激活跳下一个/删空补新、标题派生、mapSession 不可变。
- @文件（buildInputWithAttachments）：无附件原样、单/多附件含文件名+内容、用户话在末尾、超长截断、空内容不崩。
