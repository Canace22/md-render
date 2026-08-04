# Agent 控制桥 + MCP：让别的 AI 操作本 app

日期：2026-07-24

## 背景

app 内已有一套完整的 AI agent 工具（`toolRegistry.js`，28 个本地工具 + server 动态工具），
但它们只服务于 app 自己的 AI，执行逻辑依赖注入的 `host`，直接对接 renderer 的 store/IPC，
外部程序无法调用。本次目标：把这套能力**对外暴露成标准 MCP 接口**，让 Claude Desktop、
Cursor 等 MCP 客户端能操作本 app。

产品决策（与用户确认）：接口形态选 **MCP Server**；能力范围选 **只读为主 + 安全写**，
破坏性操作（删除/移动/重命名/清空白板/修复）不对外。

## 方案：三层薄桥，复用现有工具逻辑

```
别的 AI (Claude Desktop / Cursor)
    │ MCP (stdio)
    ▼
server/mcp-bridge/          ← 独立 MCP server 进程
    │ HTTP 127.0.0.1 + token
    ▼
apps/editor/main/agentBridge.js   ← 主进程控制桥（安全网关）
    │ 反向 IPC
    ▼
AgentPanel 里的 bridgeListener    ← 复用现有 host + executeTool（零重复）
```

关键取舍：AgentPanel 是**常挂载**的（收起仅 `display:none`），所以直接复用它现成的
`host` 闭包和 `executeTool`，**不重写任何工具业务逻辑**；桥只做转发 + 安全校验。

## 改动

- 新增 `apps/editor/shared/agentBridgeTools.js`：安全工具白名单**单一事实源** +
  纯校验/过滤函数（`isSafeTool` / `filterSafeToolDefs` / `validateInvoke`）。放 shared 层，
  主进程与 renderer 共用，避免漂移。
- 新增 `apps/editor/main/agentBridge.js`：只监听 `127.0.0.1` 的 HTTP 控制桥，随机 token，
  启动时把 `{ url, token }` 写进 `userData/agent-bridge.json`（0600）。`/tools` 拉安全 schema，
  `/invoke` 校验白名单后经反向 IPC 转发给 renderer 执行。
- 改 `apps/editor/main/main.js`：`whenReady` 里 `createWindow` 后启动控制桥，失败不影响主流程。
- 改 `apps/editor/main/preload.js`：新增 `agentBridge.onInvoke` / `agentBridge.reply` 通道。
- 新增 `apps/editor/renderer/src/core/agent/bridgeListener.js`：收到 invoke 请求，
  按同一份白名单二次校验（纵深防御）后用 `executeTool(toolCall, host)` 执行并回帖。
  纯函数 `handleBridgeRequest` 便于单测。
- 改 `apps/editor/renderer/src/components/AgentPanel.jsx`：用 `hostRef` + 一次性 `useEffect`
  安装监听器，始终拿最新 host 闭包。
- 新增 `server/mcp-bridge/`（`index.js` + `package.json` + `README.md`）：stdio MCP server，
  读握手文件，`ListTools`→`/tools`，`CallTool`→`/invoke`。README 含 Claude Desktop 配置说明。

## 安全设计

- 桥只绑 `127.0.0.1`，随机 token 握手，握手文件 0600。
- 双层白名单校验：主进程 `agentBridge.js`（网关）+ renderer `bridgeListener.js`（纵深防御），
  同一份 `agentBridgeTools.js`。
- 只放行「只读 + 安全写（只新增/需当面确认）+ 导航」；`write_active_doc` 仍走 diff 暂存需用户点应用；
  删除/移动/重命名/清空白板/`apply_safe_repair`/`update_editorial_memory` 一律不暴露。

## 验证

- 新增 `apps/editor/tests-unit/agent-bridge.test.js`（9 条）：白名单放行/拒绝、破坏性工具全拦、
  `validateInvoke` 边界、`handleBridgeRequest` 的 `__list_tools__` 过滤 / 安全工具走 executeTool /
  破坏性工具不触达 executeTool。全部通过。
- `node --check` 校验 `agentBridge.js` / `mcp-bridge/index.js` / `preload.js` 均通过。
- 全量单测：4 文件 6 条失败，均为既有基线失败（canvas-bookmark、excalidraw-canvas-agent、
  knowledge-graph-sync、novel-entity-extract），与本次改动无关，未引入新失败。

## 测试 case（关键）

1. `isSafeTool('read_active_doc')` → true；`isSafeTool('delete_workspace_items')` → false。
2. `validateInvoke({ name:'delete_workspace_items' })` → `{ ok:false }`。
3. `handleBridgeRequest({ name:'__list_tools__' }, ...)` → 只含安全工具的 schema。
4. 安全工具经桥调用 → 转成 `toolCall` 交 `executeTool`，参数序列化正确。
5. 破坏性工具经桥调用 → 直接拒绝，`executeTool` 不被调用。

## 部署脚本联动

- `server/ecosystem.config.cjs`：补上 `cloud-sync`（默认端口 8791，`CLOUD_SYNC_TOKEN` 可选），
  此前它有 `server.js` 却没进 PM2，属于遗漏。
- `server/deploy.sh`：端口/防火墙/健康检查覆盖 cloud-sync（设 token 时探 401、否则 404）；
  新增 `setup_mcp_bridge`（`--skip-mcp` 可跳过）——只 `npm install` 装依赖，**不进 PM2**：
  mcp-bridge 是 stdio 进程，由 Claude Desktop 本地按需拉起且依赖桌面 app 运行，PM2 守护无意义。
  部署总结里打印 Claude Desktop 的配置片段。

## 后续可选

- 如需对外开放某个当前被拦的工具，在 `agentBridgeTools.js` 的 `SAFE_*` 列表评估后追加即可。
- MCP server 依赖 `@modelcontextprotocol/sdk`，首次使用需 `cd server/mcp-bridge && npm install`。
