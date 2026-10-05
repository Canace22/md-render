# 能力层下沉 + 提案机制（AI Native 重构 P2）

日期：2026-10-05

## 背景

- 工具执行依赖 `AgentPanel` 里 `useMemo` 出来的 host：AI 面板不挂载，MCP 就用不了；同一轮里闭包是旧快照，曾导致「编辑部记忆」重复建档。
- 写入确认是全局唯一的 `agentPendingWrite`，只在编辑器 `DiffOverlay` 里显示；外部 agent 改不了别的文档，用户不在编辑器时也看不到。
- 工具只能按「当前打开的文档」操作，没有乐观锁；外部 agent 做了什么用户看不到；MCP 单独维护一份白名单；产品规则只在 app 内 system prompt 里。

## 改动

| 任务 | 文件 | 做法 |
|------|------|------|
| P2-1 | `shared/capabilities/*`、`main/capabilities/agentDataFiles.js`、`ipc/agentDataHandlers.js` | 内容 hash、风险分级、提案模型、活动日志条目（纯函数）；主进程读写 `MdRender/.agent/proposals/*.json`、`.agent/activity/<日期>.jsonl`；watcher 忽略隐藏目录 |
| P2-2 | `core/agent/createHost.js`、`hooks/useAgentRuntime.js` | host 搬出组件，每次调用读 `getState()`；MCP 控制桥和启动时并入提案挂在 app 级，不依赖 AI 面板 |
| P2-3 | `core/agent/docTools.js` | `read_doc` / `propose_edit` / `update_doc_meta` / `list_docs` / `get_proposal_status`；`read_active_doc` 带 baseHash，`write_active_doc` 保留为等确认的别名 |
| P2-4 | `proposalSlice.js` | `baseHash` 不一致拒绝「内容已变化，请重新读取」；应用前再比一次，提案后被改过判 conflict |
| P2-5 | `store/slices/proposalSlice.js` | 改正文 / 删除都生成提案并落盘；同一文档一个待确认，不同文档互不影响；app 内可等结果，MCP 立即返回 |
| P2-6 | `core/agent/activityLog.js` | app 内 AI 和 MCP 的每次工具调用都记 who / tool / 目标 / 摘要，不记正文 |
| P2-7 | `utils/platformRender.js` | `render_platform_html(id, template)`，和「复制公众号」同一条链路 |
| P2-8 / P2-10 | `shared/agentBridgeTools.js` | 对外工具由风险分级推出：读、导航、可逆写、走提案的覆盖/删除放行；重建清空白板、安全修复不放行 |
| P2-9 | `shared/appKnowledge.js`、`agentEngine.js`、`server/mcp-bridge` | 规则拆成引擎通用（ENGINE_RULES）和产品规则（AGENT_INSTRUCTIONS）；控制桥 `/tools` 返回 instructions，MCP 缓存后用作 Server instructions |
| U3 | `ProposalInbox.jsx` | 顶栏收件箱带数字，抽屉里看 diff、应用、放弃、打开文档；最近处理记录 |
| U4 | `AgentActivityTab.jsx` | AI 面板「活动」页，按天看操作，标注来源；外部文件改动也记一条 |

## 设计取舍

- 能力层的「数据」此时还在 renderer store（P3 才文件化），所以 host 仍在 renderer，只是和组件解耦；主进程只负责 `.agent/` 文件。
- app 内删除仍弹确认框（当面确认体验更好），外部 agent 删除走提案，避免 MCP 调用被弹框卡住。
- 活动日志记全部工具调用，活动页默认「只看改动」。
- MCP instructions 只能在握手时给：用上次缓存的版本，app 开着时启动预取（最多等 3 秒）。

## 已知限制

- 「外部改动」只知道某个本地项目被改了，不知道具体文件（watcher 只上报项目根）。
- 收件箱只处理提案；重建 / 清空白板仍只对 app 内 AI 开放。
- 删除提案应用时，磁盘挂载项目里的条目仍删不掉（和原来一致），会在提示里列出。

## 验证

- 新增 / 改写单测：`agent-capabilities`（11）、`agent-write-target`（11，改为提案）、`agent-create-host`（8）、`agent-activity-log`（3）、`platform-render`（3）、`agent-bridge`（按分级更新 + instructions 2 条）。全量 420 条中 3 个文件失败，均为本机环境问题（原生模块、excalidraw 依赖）。

建议手动过一遍：

1. 关掉 AI 面板，用 Claude Desktop 调 `read_doc`、`propose_edit`，顶栏收件箱出现数字
2. 切到「今日速记」，从收件箱展开 diff 并应用，再用 `get_proposal_status` 查到 applied
3. agent 读完后手动改一个字，再 `propose_edit`，被拒「内容已变化」
4. 外部 agent 调 `delete_workspace_items`，收件箱出现删除提案，确认后才删
5. AI 面板「活动」页能看到上面几步，来源分别是 app 内 AI / 外部 AI
