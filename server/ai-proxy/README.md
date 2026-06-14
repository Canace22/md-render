# AI 转发代理（OpenAI 兼容）

> ⚠️ **可选，仅 Web 端需要。** 桌面 app（Electron）的 AI 请求走主进程直连（`apps/editor/main/aiRequest.js`），
> Node 没有 CORS 限制，**不需要本代理**。只有当你要把工具部署成纯浏览器 Web 版时，才需要起这个代理来绕过 CORS。

浏览器前端直连第三方 AI API 会被 CORS 拦截。这个零依赖单文件服务把前端的 `/v1/*` 请求透传给上游 OpenAI 兼容服务，并补上 CORS 头。和 `../notion-proxy` 同一套思路。

## 为什么需要它

- 解决 CORS：前端无法直接 `fetch` 第三方 AI API。
- 生产可用：不只在 dev 的 Vite proxy 下能用，打包后的 app 也能用。
- key 不落地：API key 由前端在 `Authorization` 头携带，本服务不读、不存、不打印。

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
2. 构建时注入 `VITE_AI_PROXY=https://你的服务器:8788/v1`。

## 部署

参考 `../notion-proxy/DEPLOY-centos-nginx.md`，把端口和上游换成本服务的即可。
