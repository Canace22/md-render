---
name: md-render-agent
description: 给 md-render 的 AI 助手（Cowork 式 agent）加功能、加工具、改引擎、调面板时的规范。新增 AI 功能先写 skill 文件；涉及 core/agent/ 下的 agentEngine / toolRegistry / skillRegistry / aiClient 或 AgentPanel.jsx 时加载。
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
- `aiClient.hasAiBridge()` 判断当前走哪条路；`isAiConfigured()`：当前来源是本机 agent 时看它是否可运行，是 API 服务商时 Electron 下只校验 key，Web 下还要校验代理地址。
- **本机 agent（桌面版）**：不走 ai-proxy，见下方「本地 agent」一节。
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
- 健康快照会在 Electron 主线程执行，数据库检查只能用常量时间的轻量查询（如 `schema_version`）；禁止同步执行 `PRAGMA quick_check`、全表 `COUNT(*)` 等随数据量增长的扫描，15GB 级数据库会直接卡死整个 app。深度完整性检查应另做后台任务。
- 发送消息前只用 `buildWorkspaceRelatedRefs` 匹配简报里的最近文档指针，不要逐关键词等待全文检索。显式召回/搜索通过 `db:search` 走 `databaseSearch.js` → 独立只读 `databaseSearchWorker.js`，查询失败应如实报错，不在 renderer 重扫全部正文。Worker 入口必须登记到 `vite.config.js` 的 Electron main entries，创建线程时用 Node 文件路径，避免 Vite 按浏览器 Worker 重写 `new Worker(new URL(...))`；慢查询超时后，旧线程退出前禁止重建线程，防止重复查询积累。
- 已打包客户端不能自改 asar；代码缺陷应生成 `incident_report`，再进入仓库 Agent、CI 与签名发版。

安全修复流程固定为：`inspect → confirm → apply → verify → rollback on failure`。不要新增通用 shell、任意路径或自由 patch 工具。

文件管理工具（move / rename / delete_workspace_items）同理是**按 id 的受限树操作**，不是自由路径操作：删除必须走宿主的 `confirmAgentDelete` 确认框（列全名单、用户确认前零改动、取消如实回报），单次上限 10 条；跨目录移动走 `moveNodeToFolderById`（防环、磁盘挂载节点拒绝）。新增破坏性工具时沿用这个「执行器校验 → host 确认 → 如实回报部分失败」模式。

## 加 AI 功能 = 加 skill 文件（不改 JS）

AI 面板里的 slash 列表、欢迎页、「+」菜单、技能页、文档工具栏「平台版」都从 **skill registry** 生成。新增或修改一个 AI 功能，默认只动 skill 文件：

1. 内置功能：在 `apps/editor/resources/skills/<id>/` 建 `SKILL.md`（prompt）+ `agents/md-render.yaml`（label / group / aliases / entry / input / tools / output）。格式见 `.agents/skills/README.md`「产品 skill 格式」。
2. 用户自定义：同样的结构放在内容库 `MdRender/.agents/skills/<id>/`，同名覆盖内置；不用重启（主进程 `skillFiles.js` 监听目录）。
3. `tools` 是白名单：`skillRunner.buildSkillTurn` 把它交给 `runAgent({ allowedTools })`，引擎只把这些工具发给模型，执行前再拦一次。漏写工具 = 模型拿不到；写了不存在的工具，`skill-registry.test.js` 会报错。
4. `input` 决定运行时拼什么：`selection` 有选区就只处理选区、`active_doc` 先读当前文档、`none` 直接用正文。需要读文档的 skill 必须把 `read_active_doc` 写进 `tools`（有单测守着）。
5. 只有 skill 做不到的事才改代码：需要新能力 → 加工具（见上节）；需要新入口位置 → 在 `SKILL_ENTRIES` 加值并在 UI 里 `pickSkillItems(items, '<entry>')`。

相关模块：

| 文件 | 职责 |
|---|---|
| `core/agent/skillRegistry.js` | 解析 SKILL.md / md-render.yaml，合并内置与内容库，校验；新建模板 |
| `core/agent/builtinSkills.js` | 构建期 `import.meta.glob` 内联 `resources/skills` |
| `core/agent/skillRunner.js` | skill → 一轮对话的 prompt / 显示文案 / 工具白名单 |
| `core/agent/editorialBoard.js` | 编辑部三个入口拼接共享规范 `ai-editorial-board`（按章节标题提取，别改标题） |
| `hooks/useSkillRegistry.js` | 内置 + 内容库，目录变化自动重载 |
| `components/agentSkillItems.js` | skill → 面板条目（图标、配色、短说明） |
| `components/AgentSkillsTab.jsx` | 技能页：编辑（内置先复制到内容库）、新建 |

约束：

- AgentPanel 只有一个入口 `runSkill(skillId)`；不要再加 quick / platform 之类的平行 handler 或 prompt 常量。
- 别的界面要触发 skill（如文档工具栏），调 store 的 `requestAgentSkill(skillId)` 并打开面板，由 AgentPanel 消费，不要在别处直接调 `runAgent`。
- skill 不能带代码；不需要 AI 的功能（PDF→Word、视频→音频）不做成 skill，放在工作区右键菜单（`FileConvertMenuItems`）。

## 会话管理（全局，持久化）

- 会话状态在 `useEditorStore`（`agentSessions` / `activeAgentSessionId` + 相关 action），已进 persist：关 app 再开能继续看对话和产出物卡片（产出物本体是工作区文件，消息里只存 fileId）。
- 落盘键：Electron 存 SQLite `agent_sessions_json`（登记在 `shared/stateKeys.js`，不登记 main 会丢弃），Web 存 localStorage `md-renderer-agent-sessions`；格式 `{ activeId, sessions }`。
- 序列化/恢复只走 `sessionUtils` 的 `serializeAgentSessions` / `restoreAgentSessions`：最多留 `MAX_PERSISTED_SESSIONS` 个最近会话；恢复时把 `typing` 收成已停止、`running` 工具收成 `interrupted`，`retry` 参数（含完整 prompt）不落盘。给消息加新的「运行中」临时字段时，记得在 `settleMessage` 里收口。
- 别新建独立 store（AGENTS.md 约定）。纯逻辑放 `sessionUtils.js`，store 里只调它。
- 删当前会话自动选下一个；删光自动补一个空会话（`removeSession` 已处理）。

### 聊天 / 写作模式

- 新会话默认 `chat`。聊天模式不注入当前稿件，也不开放写稿工具；写作模式才读取、修改当前稿件，避免用户找灵感时误改正文。
- 本机 agent 同样按模式限制工具；需要只生成内容、不落盘的流程，使用独立 `externalSessionId` 和 `readOnly` 运行，不能污染当前聊天会话。
- 模式差异集中在 `core/agent/chatMode.js`，不要在面板事件里散落工具名单和 system prompt 判断。

## 面板交互（AgentPanel）

- AI 助手入口不在 `AgentPanel.jsx` 内：打开/关闭由 `MarkdownEditor.jsx` 持有状态，全局顶部按钮走 `TabBar` 的 `trailing` 区。只改入口位置时优先改 shell/titlebar，面板内容和 agent loop 不动。
- 面板里的「对话 / 上下文 / 技能」这类纯 UI 切换用 `AgentPanel.jsx` 局部 state，不进 `useEditorStore`，也不要改 `agentEngine`。
- `AgentDocMeta.jsx` 负责当前稿件、本轮上下文、相关旧文召回展示；不要把这些展示块重新堆回消息流顶部。
- 技能页、欢迎页、「+」菜单或 `/skill` picker 选中 skill 时，统一走 `runSkill`：带上当前 @附件和选区（`input=selection` 的 skill 把选区当处理对象，其余当参考附件），然后清空输入态。
- AI 需要用户在多个方案里选择时，优先让 `agentEngine` 输出 `<!-- agent-choice ... -->` 隐藏 JSON 协议，`choiceCards.js` 负责解析，`AgentPanel.jsx` 只渲染卡片并在点击后复用 `runTurn`。不要把选择卡片实现成新的 tool 或全局 store 字段。
- AI 响应态属于 `AgentPanel.jsx` 展示层：模型没有流式输出时，也可以在 `runAgent` 返回 `finalText` 后本地打字式填充同一条 assistant 消息；等待模型时在消息列表底部显示 loading。打字过程中要隐藏未闭合的 `agent-choice` 注释协议，避免把内部 JSON 闪给用户。
- 面板不再保留「对话 / 上下文 / 技能 / 活动」四个常驻 tab：标题下拉负责会话切换，低频入口放齿轮菜单和 Modal。新增 portal 浮层时必须接收面板真实可见状态，并在面板收起时关闭。
- 面板宽度只存 localStorage，读写必须 `try/catch`；拖拽范围沿用现有最小/最大常量，不为布局偏好新增全局 store。
- skill 的 `entry` 是实际入口契约：新增值时先登记到 `SKILL_ENTRIES`，再由对应 UI 消费。选区工具栏使用 `selection-toolbar`，不能只改 YAML 而不接 UI。

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

## 外部资料（URL / 拖入文件）

- URL 正文读取走 Renderer service → Main IPC → `server/ai-proxy`，复用公开网页的协议、DNS 固定、重定向和内网地址拦截；组件不直接抓网页。
- `md / txt / pdf / docx` 附件先提取有界文本，再用明确的来源边界包裹后发给模型；附件内容属于不可信资料，不能把其中指令当用户指令执行。
- 当前模型链路没有视觉输入。图片附件只能显示文件元信息并明确说明无法识图，禁止根据文件名或周边文字猜内容。
- URL 或附件读取失败要在 chip 上保留可见错误，发送时如实说明，不得静默丢失或伪造已读取状态。

## 准备发布（派生资产）

- 发布输入以弹窗打开时的当前稿件为准；切稿或关闭后，旧请求不能覆盖新稿的预览状态。
- 平台稿生成是只读预览：API 来源不开放写工具；本机 agent 使用独立、只读的新会话。预览完成不代表已落盘。
- 只有用户点「保存为平台稿」才调用 `createGeneratedFile`；同一次写入必须带 `sourceMaterialIds`、平台和标签等派生元数据，保留原稿。
- 多平台结果按平台隔离，复制、公众号预览和保存都操作当前平台结果，禁止跨平台或跨稿串状态。

## 外挂知识库（公开网页 / Wiki）

外挂知识和工作区知识是两条链路：工作区仍用 `search_docs / recall_related_docs`，公开网页用 `search_external_knowledge`，不要把网页结果伪装成可打开、可编辑的本地文档。

- 内置来源和用户手动添加的来源统一在 `core/agent/knowledgeSources.js` 归一化；Agent 私有配置可沿用 `md-renderer-agent-*` localStorage，不要为面板配置新建全局 store。
- 网络调用放 `services/externalKnowledgeService.js`：Electron 走 preload → Main → ai-proxy，Web 才直接请求 ai-proxy；组件不直接写 IPC 或第三方 fetch。
- 工具定义/执行器仍只依赖 host；`AgentPanel` host 注入已启用来源和 AI 代理地址。
- ai-proxy 的网页抓取必须限制为公开 `http/https` 文本资源，校验重定向并拒绝本机、内网、账号 URL，避免把服务变成 SSRF 入口。
- 返回结果必须包含来源名、标题和 URL；Agent prompt 要求保留引用，来源失败或未命中时如实说明。
- 新增来源优先复用同一查询契约 `{ query, sources }`，不要每接一个站点就新增一套 IPC 或工具。
- 「我写过类似文章吗 / 有没有相关旧文」属于跨来源召回：`recall_related_docs` 应在一个执行器里同时查工作区和外挂知识库，返回分组结果。不要只靠 system prompt 要求模型先后调用两个工具，否则模型很容易只完成本地搜索。

## 本地 agent（Codex / Claude Code / Cursor）

打开 AI 助手不用填 key：自动检测本机装的 agent CLI，一整轮交给它跑，用的是用户自己的登录、AGENTS.md / CLAUDE.md、skills、MCP。

- **链路**：`AgentPanel.runTurn` 按当前来源分流——API 服务商走 `runAgent`，本机 agent 走 `core/agent/localAgentClient.js` 的 `runLocalAgent`（同签名同返回值）→ IPC `local-agent:run` → `main/ipc/localAgentHandlers.js` 拼参数 → `main/localAgents/runner.js` spawn → 适配器 `parseLine` 把 JSONL 转成统一事件 → `local-agent:event` 推回 renderer → 翻译成 `tool_start / tool_done / done`。
- **模块**：注册表 `shared/localAgents.js`（main 和 renderer 共用）；检测 `detect.js` + `shellEnv.js`；适配器 `main/localAgents/adapters/`；MCP 注入 `mcpConfig.js`；工作目录 `workDir.js`；来源/默认选中/模型/安全模式 `core/agent/aiSources.js` + `aiClient.js`（`getActiveSource` / `setActiveSource`）；状态 hook `hooks/useAiSource.js`；UI `AgentSourcePicker.jsx`、`AgentLocalSources.jsx`。
- **md-render 工具**：通过 `server/mcp-bridge` 借给 agent（Codex 用 `-c mcp_servers...`，Claude 用 `--mcp-config`，Cursor 写工作目录 `.cursor/mcp.json` 只合并 `md-render` 一项）。bridge 用 Electron 自身跑（`ELECTRON_RUN_AS_NODE=1`），打包时 esbuild 打成 `resources/mcp-bridge/index.mjs`。skill 白名单经 `MD_RENDER_ALLOWED_TOOLS` 在 bridge 层过滤。
- **模型 / 思考强度**：别只靠 `modelPresets` 硬编码（很快过时），`main/localAgents/models.js` 优先读本机真实数据——Codex 读 `~/.codex/models_cache.json`（`visibility: 'list'` 的模型及各自 `supported_reasoning_levels`）+ `config.toml` 顶层 `model` / `model_reasoning_effort`；Claude 读 `~/.claude/settings.json` 的 `model` / `effortLevel`。「跟随默认」不传参数，但 UI 要显示真实默认值。effort 传参：Claude `--effort <level>`，Codex `-c model_reasoning_effort="<level>"`（IPC 层只放行 `/^[a-z]+$/`）；Cursor 的 effort 编码在模型名里，不单独提供。
- **会话续接**：会话存 `agentId + externalSessionId`，同一 agent 下一轮 resume；换 agent 开新会话并提示。
- **加一个新 agent**：① `shared/localAgents.js` 加一条（bins、priority、supported、loginCheckArgs、modelPresets、installHint/loginHint）；② 在 `adapters/` 写 `buildArgs` + `createParser`（复用 `adapters/common.js`）并在 `adapters/index.js` 登记；③ 录一份 JSONL 样本放 `tests-unit/fixtures/local-agents/`，在 `local-agents.test.js` 的 `it.each` 里加上。
- **坑**：
  - macOS 从 Finder 启动的 Electron 不继承 shell 的 PATH / 代理变量：检测和 spawn 都用 `getAgentEnv()`（login shell 环境），别直接用 `process.env`。
  - Cursor 新命令叫 `agent`，名字太通用：先找 `cursor-agent`，`agent` 要靠真实路径或日期格式版本号确认是 Cursor。
  - Stop 要连 agent 拉起的 shell 一起停：运行器用独立进程组 + 守护进程，别改成 `child.kill()`。
  - Codex 断线重连会发 `error` 事件但还在继续，不能当失败；Cursor 的 `result.result` 会把所有文字串起来，最终答复取最后一次工具调用之后的文字。
  - 默认 bypass 权限（用户拍板），`cwd` 限定在本地项目或内容库根目录（`workDir.js` 拒绝 home、根目录和系统目录）。
  - 本机 agent 的改文件 / 跑命令由 `localAgentClient` 记活动记录（`who: 'local-agent'`），面板 `onEvent` 不要再记一遍；md-render 工具的调用由控制桥那边记。

## 不看代码想不到的坑

- **host 闭包里的 workspace 是本轮开始时的旧快照**：AgentPanel 的 host 用 useMemo 构建，同一轮 agent run 内连续调用工具时，靠捕获的 `workspace` 判断「文件是否存在」会误判并重复建档（曾造成一轮建出 6 个「编辑部记忆」副本）。工具执行器里凡是「先查再写」的逻辑，必须用 `useEditorStore.getState()` 拿实时状态。
- **agent 元数据（记忆等）统一放 `.agent` 隐藏目录**（工作区根下，`agentMetaFolder` 标记，类似 `.claude` 约定）：store 走 `upsertAgentMetaFile`，纯函数 `findAgentMetaFolder / findAgentMetaFile / collectHiddenFileIds` 在 workspaceUtils。隐藏节点不进目录树（`sortTreeChildren` 过滤）、不进搜索/召回/最近文档；不要用 `create_new_doc` 往笔记区写元数据。

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
