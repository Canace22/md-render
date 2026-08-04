# MD Render MCP Bridge

让**别的 AI**（Claude Desktop、Cursor 等 MCP 客户端）操作 MD Render 桌面版。

## 原理

```
别的 AI ──MCP(stdio)──▶ mcp-bridge ──HTTP(127.0.0.1+token)──▶ MD Render 主进程控制桥 ──IPC──▶ app 执行工具
```

- MD Render 桌面版启动时，主进程会开一个只监听 `127.0.0.1` 的控制桥，
  并把 `{ url, token }` 写进握手文件 `<userData>/md-render/agent-bridge.json`（权限 0600）。
- 本 MCP server 读握手文件拿到地址和令牌，把 app 的**安全工具**注册成 MCP 工具。
- 只暴露「只读 + 安全写 + 导航」白名单（见 `apps/editor/shared/agentBridgeTools.js`）；
  删除、移动、重命名、清空白板、修复等破坏性操作**不对外**。

## 安装

```bash
cd server/mcp-bridge
npm install
```

## 在 Claude Desktop 里配置

编辑 `claude_desktop_config.json`，加一段（把路径换成你机器上的绝对路径）：

```json
{
  "mcpServers": {
    "md-render": {
      "command": "node",
      "args": ["/绝对路径/md-render/server/mcp-bridge/index.js"]
    }
  }
}
```

保存后重启 Claude Desktop。**确保 MD Render 桌面版正在运行**，否则握手文件不存在、工具列表为空。

## 环境变量（可选）

| 变量 | 说明 |
|------|------|
| `MD_RENDER_BRIDGE_FILE` | 自定义握手文件路径（默认按平台猜 userData） |
| `MD_RENDER_BRIDGE_URL` + `MD_RENDER_BRIDGE_TOKEN` | 直接指定控制桥地址和令牌，跳过握手文件 |

## 暴露的工具（安全子集）

- **只读**：`read_active_doc`、`get_active_doc_meta`、`read_doc_by_id`、`search_docs`、
  `search_external_knowledge`、`list_recent_docs`、`get_workspace_brief`、
  `get_daily_overview`、`recall_related_docs`、`read_editorial_memory`、`inspect_app_health`
- **安全写**（只新增 / 需当面确认）：`create_new_doc`、`create_content_entry`、
  `create_agent_artifact`、`create_folder`、`add_daily_entry`、`add_todo_entry`、
  `append_canvas_cards`、`write_active_doc`（暂存 diff，需用户点「应用」）
- **导航**：`open_surface`、`open_canvas`、`open_workspace_item`

## 排查

- 工具列表为空 / 连接失败 → 确认 MD Render 桌面版在运行，且握手文件存在。
- `curl http://127.0.0.1:<port>/health` 应返回 `{"ok":true}`（端口见握手文件）。
