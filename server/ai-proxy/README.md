# AI 转发代理（OpenAI 兼容）

> 桌面 app（Electron）的 AI 请求也会经过主进程转发到本服务（`apps/editor/main/aiRequest.js`）；Web 端则直接请求本服务。
> 服务除了模型请求还提供工具 schema 和转换脚本执行入口，公网部署前必须加鉴权和限流；不要把这些远端工具当成用户本机修复通道。

这个零依赖单文件服务提供 `/api/chat` 、`/api/health` 、工具 schema 和工具执行接口，供 Electron 主进程和 Web 端统一调用。

## 为什么需要它

- 解决 CORS：前端无法直接 `fetch` 第三方 AI API。
- 生产可用：不只在 dev 的 Vite proxy 下能用，打包后的 app 也能用。
- key 不落地：提供商 key 由服务端配置，前端只传 provider id。

## 启动

```bash
node server.js
# 默认监听 8788，默认上游 api.openai.com
```

环境变量：

| 变量 | 默认 | 说明 |
|------|------|------|
| `PORT` | `8788` | 监听端口 |
| `ALLOW_ORIGIN` | `*` | 允许的来源，自用足够；收紧填具体域名 |
| `AI_UPSTREAM_HOST` | `api.openai.com` | 默认上游域名 |

## 多上游

一个代理可服务多家 OpenAI 兼容服务商：前端用 `X-AI-Upstream` 头指定上游域名（如 `api.deepseek.com`、`api.moonshot.cn`），不传则用 `AI_UPSTREAM_HOST` 默认值。服务端只放行合法域名格式，避免被当成开放代理。

## 前端配置

两种方式（前端按"localStorage 优先 → VITE_ 兜底"读取，和 notion-proxy 一致）：

1. 运行时在「设置」里填代理地址（持久化在 localStorage，打包后也能改）。
2. 构建时注入 `VITE_AI_PROXY=https://你的服务器:8788`（填代理根地址，不要加 `/v1`）。

## 部署

参考 `../notion-proxy/DEPLOY-centos-nginx.md`，把端口和上游换成本服务的即可。
