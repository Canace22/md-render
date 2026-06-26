# MD Render 云同步服务

这是给 MD Render 前端使用的最小云端工作区同步 API，部署在你自己的服务器上，不依赖 Notion。

同步模型是“全量快照 + revision 乐观锁”：

- 前端上传当前工作区快照。
- 服务端保存 `payload`，并递增 `revision`。
- 前端再次上传时带 `baseRevision`。
- 如果云端 revision 已变化，服务端返回 `409` 和云端快照，前端让用户选择“使用云端版本”或“覆盖云端”。

## 本地启动

需要 Node 18+。

```bash
node server/cloud-sync/server.js
```

默认监听：

```text
http://localhost:8791
```

开发模式下，前端未配置 `VITE_CLOUD_SYNC_API` 时会默认请求 `/cloud-sync-api`，Vite 会代理到 `http://localhost:8791`。

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `8791` | 服务监听端口 |
| `CLOUD_SYNC_DATA_DIR` | `server/cloud-sync/data` | 快照数据目录 |
| `ALLOW_ORIGIN` | `*` | 允许访问的前端来源 |
| `CLOUD_SYNC_TOKEN` | 空 | 可选访问令牌，设置后请求必须带同值 token |

生产环境建议显式设置数据目录：

```bash
PORT=8791 CLOUD_SYNC_DATA_DIR=/var/lib/md-render-cloud-sync node server/cloud-sync/server.js
```

如果服务暴露到公网，建议设置访问令牌：

```bash
CLOUD_SYNC_TOKEN=change-me node server/cloud-sync/server.js
```

前端构建时同步设置：

```text
VITE_CLOUD_SYNC_TOKEN=change-me
```

## API

### 健康检查

```http
GET /health
```

返回：

```json
{ "ok": true }
```

### 获取工作区快照

```http
GET /workspaces/:workspaceId/snapshot
```

返回：

```json
{
  "workspaceId": "my-workspace",
  "revision": 1,
  "updatedAt": "2026-06-26T00:00:00.000Z",
  "clientId": "client-id",
  "payload": {}
}
```

### 上传工作区快照

```http
PUT /workspaces/:workspaceId/snapshot
Content-Type: application/json

{
  "baseRevision": 1,
  "clientId": "client-id",
  "payload": {}
}
```

成功返回：

```json
{
  "revision": 2,
  "updatedAt": "2026-06-26T00:00:00.000Z",
  "snapshot": {
    "workspaceId": "my-workspace",
    "revision": 2,
    "updatedAt": "2026-06-26T00:00:00.000Z",
    "clientId": "client-id",
    "payload": {}
  }
}
```

如果 `baseRevision` 落后，返回 `409`：

```json
{
  "message": "云端工作区已有更新。",
  "revision": 2,
  "snapshot": {}
}
```

## 生产部署

建议用 Nginx 或 Caddy 做 HTTPS 反向代理。前端环境变量填反代后的地址，不要带尾斜杠。

```text
VITE_CLOUD_SYNC_API=https://your-server.example.com/cloud-sync/api
VITE_CLOUD_SYNC_TOKEN=change-me
```

Nginx 示例：

```nginx
location /cloud-sync/api/ {
    proxy_pass http://127.0.0.1:8791/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

如果前端和服务端不在同一个域名下，建议把 `ALLOW_ORIGIN` 收紧成你的前端域名：

```bash
ALLOW_ORIGIN=https://your-app.example.com node server/cloud-sync/server.js
```
