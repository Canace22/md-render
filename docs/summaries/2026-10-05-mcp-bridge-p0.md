# MCP 止血（AI Native 重构 P0）

日期：2026-10-05

## 背景

外部 AI（Claude Desktop / Cursor）经 MCP 操作 md-render 时有几个硬伤：

- MCP server 启动时只读一次握手文件，读不到直接 `process.exit`。先开 Claude Desktop 后开 app，工具永远不可用；app 重启后端口和 token 变了，也得重启 Claude Desktop。
- app 退出不删握手文件，MCP 连到旧端口只报 `fetch failed`。
- 工具失败（如「写入失败：内容为空」）被当成成功返回，客户端拿不到 `isError`。
- `write_active_doc` 要等用户点「应用」才返回，MCP 调用会一直挂着直到超时。
- 已有待确认改动时再写，会静默覆盖，上一次写入的 Promise 永远不结束。

## 改动

| 任务 | 文件 | 做法 |
|------|------|------|
| P0-1 | `server/mcp-bridge/bridgeClient.js`（新）、`index.js` | 每次调用重新读握手文件；读不到返回「md-render 没在运行」+ `isError`；每 5 秒探测，app 启动/重启后发 `tools/list_changed`；缓存上次工具列表，app 没开时先用缓存注册 |
| P0-2 | `main/agentBridge.js`、`main.js` | 导出 `stopAgentBridge`，`before-quit` 时关 server、删握手文件（只删 token 一致的） |
| P0-3 | `shared/agentBridgeTools.js`、`bridgeListener.js` | `isFailureResult`：`ok:false`，或开头一句（去掉「」引用）含「失败/出错/拒绝」 → 回填 `ok:false`，MCP 端标 `isError` |
| P0-4 | `bridgeListener.js`、`AgentPanel.jsx` | `writeActiveDoc(content, { wait })`；桥接调用经 `toBridgeHost` 一律 `wait:false`，暂存后立即返回 |
| P0-5 | `agentSlice.js`、`AgentPanel.jsx` | 已有待确认改动时 `stageAgentWrite` 立即 resolve `null`，返回「写入被拒绝：…」，不覆盖 |
| P0-6 | `tests-unit/agent-bridge.test.js`、`agent-write-target.test.js` | 补 23 条单测 |

## 已知限制

- 待确认改动只在编辑器的 `DiffOverlay` 里显示。用户不在编辑器界面时，外部 agent 的后续写入会一直收到「写入被拒绝」，直到用户回到编辑器处理。U3（待确认收件箱）解决。
- app 被强杀时握手文件会残留；MCP 端把连接失败也识别成「没在运行」兜底。
- 是否响应 `tools/list_changed` 取决于 MCP 客户端；不响应时靠工具缓存兜底（首次使用且 app 没开时只有 `md_render_status` 一个工具）。

## 验证

- 单测：`agent-bridge.test.js`、`agent-write-target.test.js`、`architecture-boundaries.test.js` 全过；全量 352 条里 3 个文件失败，均为本机环境问题（`better-sqlite3` 原生模块架构不符、excalidraw 依赖缺 `roughjs`），与本次改动无关。
- 用假控制桥跑 MCP stdio 冒烟：app 没开 → 只有状态工具、调用返回「没在运行」；写入握手文件 5 秒内收到 `list_changed`；正常调用 `isError:false`；失败结果 `isError:true`；关掉 server 后（残留握手文件）返回「没在运行」；删掉握手文件后仍能用缓存列出工具。

建议手动过一遍：

1. 先开 Claude Desktop 再开 md-render，调用 `read_active_doc` 正常
2. 重启 md-render，不重启 Claude Desktop，工具仍可用
3. 退出 md-render，`agent-bridge.json` 不存在；Claude Desktop 调用返回「md-render 没在运行」
4. 经 MCP 调 `write_active_doc`，1 秒内返回「已暂存」；编辑器出现 diff，点「应用」后文档更新
5. diff 未处理时再调一次 `write_active_doc`，返回「写入被拒绝」且 `isError: true`
6. app 内 AI 写入仍然等用户点「应用/放弃」后才继续
