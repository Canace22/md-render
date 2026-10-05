# MD Render MCP Bridge

让**别的 AI**（Claude Desktop、Cursor 等 MCP 客户端）操作 MD Render 桌面版。

## 原理

```
别的 AI ──MCP(stdio)──▶ mcp-bridge ──HTTP(127.0.0.1+token)──▶ MD Render 主进程控制桥 ──IPC──▶ app 执行工具
```

- MD Render 桌面版启动时，主进程会开一个只监听 `127.0.0.1` 的控制桥，
  并把 `{ url, token }` 写进握手文件 `<userData>/md-render/agent-bridge.json`（权限 0600）。
- 本 MCP server 读握手文件拿到地址和令牌，把 app 的工具注册成 MCP 工具，并把产品规则作为 MCP `instructions`（和 app 内 AI 同源，见 `apps/editor/shared/appKnowledge.js`）。
- 能用哪些工具按风险分级决定（`apps/editor/shared/capabilities/riskLevels.js`，app 内 AI 用同一份）：
  读、导航、可逆写直接执行；改正文、删除生成**待确认提案**，立即返回，用户在 app 收件箱里确认；
  重建 / 清空白板、安全修复不对外。AI 面板关着也能用；每次调用都记进内容库 `.agent/activity/`。

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

保存后重启 Claude Desktop。MD Render 桌面版可以先开也可以后开：

- 没开时，工具调用会返回「md-render 没在运行」（`isError: true`），不会让 MCP server 退出；
- app 启动或重启后，server 每 5 秒探测一次握手文件，发现变化就通知客户端刷新工具列表，**不用重启 Claude Desktop**；
- 上次成功拉到的工具列表会缓存在握手文件同目录的 `agent-bridge-tools.cache.json`，app 没开时先用它注册工具。

## 环境变量（可选）

| 变量 | 说明 |
|------|------|
| `MD_RENDER_BRIDGE_FILE` | 自定义握手文件路径（默认按平台猜 userData） |
| `MD_RENDER_BRIDGE_URL` + `MD_RENDER_BRIDGE_TOKEN` | 直接指定控制桥地址和令牌，跳过握手文件 |

## 暴露的工具

- **读**：`read_doc`（按 id，带 `baseHash`）、`read_active_doc`、`get_active_doc_meta`、`read_doc_by_id`、`list_docs`、
  `search_docs`、`search_external_knowledge`、`list_recent_docs`、`get_workspace_brief`、`recall_related_docs`、
  `read_editorial_memory`、`read_daily`、`render_platform_html`、`get_proposal_status`、`inspect_app_health`
- **可逆写**（直接生效）：`create_new_doc`、`create_content_entry`、`create_agent_artifact`、`create_folder`、
  `add_daily_entry`、`add_todo_entry`、`append_canvas_cards`、`update_doc_meta`、`move_workspace_item`、
  `rename_workspace_item`、`update_editorial_memory`
- **提案**（立即返回 `pending`，用户在收件箱确认）：`propose_edit`、`write_active_doc`、`delete_workspace_items`
- **导航**：`open_surface`、`open_canvas`、`open_workspace_item`

改正文的推荐流程：`read_doc` 拿 `baseHash` → `propose_edit(id, content, baseHash)` → 隔一会儿 `get_proposal_status`。返回「内容已变化」就重新读。

## 排查

- 只看到 `md_render_status` 一个工具 → app 没开且还没有缓存；打开 app 后客户端会收到刷新通知。
- 返回「md-render 没在运行」→ 确认 MD Render 桌面版在运行，且握手文件存在（app 退出时会删除它）。
- `curl http://127.0.0.1:<port>/health` 应返回 `{"ok":true}`（端口见握手文件）。
