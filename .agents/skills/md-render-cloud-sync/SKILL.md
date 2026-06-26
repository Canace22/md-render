---
name: md-render-cloud-sync
description: 在 md-render 里新增或修改“同步到自己的服务器”的云端工作区同步能力时使用。触发场景包括“云端同步到我的服务器”“自建同步服务”“cloud-sync server”“revision 冲突”“VITE_CLOUD_SYNC_API”“工作区快照同步”“部署同步 API”。略主动。
---

# md-render 自建云同步

这个 skill 用于维护 md-render 的自建云同步链路：前端构建安全化工作区快照，服务端保存快照并用 revision 做乐观锁。

## 为什么这么做

md-render 的云同步不是 Notion 这类第三方 API 转发，而是把当前工作区同步到用户自己的服务器。最小可靠模型是“全量快照 + revision 冲突保护”：先保证跨设备不静默覆盖，再逐步演进到资源级增量同步。

## 先看这些入口

- 前端 service：`apps/editor/renderer/src/utils/cloudSyncService.js`
- 前端入口：`apps/editor/renderer/src/components/MarkdownEditor.jsx` 里的 `handleCloudUpload` / `handleCloudPull`
- 同步面板：`apps/editor/renderer/src/components/CloudSyncChannel.jsx`
- 状态字段：`apps/editor/renderer/src/store/useEditorStore.js` 里的 `cloudLastSyncedRevision` / `cloudLastSyncedHash`
- 本地 dev 代理：`apps/editor/vite.config.js`
- 自建服务端：`server/cloud-sync/server.js`
- 部署说明：`server/cloud-sync/README.md`

## 实现原则

- 前端不要直接碰 Node API；云同步请求放在 renderer utils/service 中。
- 服务地址优先读 `VITE_CLOUD_SYNC_API` / `VITE_CLOUD_SYNC_BASE_URL`，开发环境可回退 `/cloud-sync-api`。
- 服务端 API 保持简单：`GET /workspaces/:workspaceId/snapshot` 和 `PUT /workspaces/:workspaceId/snapshot`。
- 上传必须带 `baseRevision`；服务端当前 revision 不一致时返回 `409` 和云端快照。
- 服务端写文件要原子化：先写临时文件，再 rename。
- 同一个 workspace 的 PUT 要串行化，避免并发上传覆盖同一个 revision。
- 生产暴露到公网时要支持访问令牌或反向代理鉴权；不要把真实 token 写进源码、README 示例或 `.env.example`。
- `server/cloud-sync/data/` 这类本地数据目录必须进 `.gitignore`。

## 修改步骤

1. 定向搜索现有 cloud sync 入口，确认当前协议和 UI 文案。
2. 如果改服务端协议，先保持前端 `fetchCloudWorkspaceSnapshot` / `uploadCloudWorkspaceSnapshot` 返回结构兼容。
3. 如果新增本地开发能力，在 `vite.config.js` 加 `/cloud-sync-api` 代理，目标默认本地服务端口。
4. 如果新增环境变量，优先写到部署 README；`.env.example` 只放不会触发敏感扫描的非密钥配置。
5. 更新 `.gitignore`，确保服务端数据、日志和临时文件不会被提交。
6. 提交前跑 `pre-commit-secrets` staged 扫描；如果扫描脚本误报，优先修扫描脚本，不绕过提交前检查。

## 验证

默认不主动跑项目单测，除非用户明确要求。可以做轻量协议验证：

| # | 输入 | 预期 |
|---|------|------|
| 1 | `GET /health` | 服务返回健康状态，若启用鉴权则按设计要求 token |
| 2 | 未带 token 访问受保护接口 | 返回 `401 Unauthorized` |
| 3 | 首次 `PUT`，`baseRevision=0` | 成功，返回 `revision=1` |
| 4 | `GET snapshot` | 返回刚上传的 payload |
| 5 | 旧 `baseRevision` 再次 `PUT` | 返回 `409` 和当前云端 snapshot |
| 6 | 正确 `baseRevision` 再次 `PUT` | 成功递增 revision |
| 7 | 非 JSON body | 返回 400/500 范围内的明确错误，不写坏数据 |
| 8 | 缺少 payload | 返回 `400` |
| 9 | workspaceId 带空格或特殊字符 | 前端 encode，服务端可稳定落盘 |
| 10 | 临时验证数据写到 `/tmp` | 验证后清理，不污染工作区 |

## 完成标准

- 前端能连到自建服务端或 dev proxy。
- 服务端具备 revision 冲突保护、可选鉴权、CORS 和持久化。
- 本地数据目录被忽略。
- README 说明本地启动、生产反代、环境变量和 API。
- 已列出 10 条 case；用户未要求时不跑项目单测。
