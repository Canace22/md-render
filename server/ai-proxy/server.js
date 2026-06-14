/**
 * AI API 转发服务（OpenAI 兼容，零依赖，单文件）
 *
 * 作用：浏览器/Electron 前端直连第三方 AI API 会被 CORS 拦截。
 * 本服务部署在你的服务器上，把前端发来的 /v1/* 请求原样转发给
 * 上游 OpenAI 兼容服务（OpenAI、DeepSeek、Moonshot、各类中转站等），
 * 并给响应补上 CORS 头，浏览器即可放行。流式（SSE）原样透传。
 *
 * 设计要点（与 notion-proxy 保持一致的风格）：
 * - 纯透传：API key 由前端在 Authorization 头里携带，本服务不读取、不存储、不打印。
 * - 上游可变：前端用 `X-AI-Upstream` 头指定上游域名（如 api.openai.com）；
 *   没传则用环境变量 AI_UPSTREAM_HOST 的默认值。这样一个代理能服务多家。
 * - 无第三方依赖，Node 18+ 直接运行：`node server.js`
 *
 * 环境变量：
 * - PORT             监听端口，默认 8788
 * - ALLOW_ORIGIN     允许的来源，默认 *（自用足够；如需收紧填具体域名）
 * - AI_UPSTREAM_HOST 默认上游域名，默认 api.openai.com
 *
 * 前端对应配置：VITE_AI_PROXY=https://你的服务器:8788/v1
 */

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8788;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const DEFAULT_UPSTREAM_HOST = process.env.AI_UPSTREAM_HOST || 'api.openai.com';

// 透传给上游的请求头白名单（其余一律不转发，避免泄露/干扰）
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept'];

// 只允许转发到 OpenAI 兼容的合法域名格式，避免被当成开放代理（SSRF 防护）
const isValidUpstreamHost = (host) =>
  /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(host || ''));

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,X-AI-Upstream',
  'Access-Control-Max-Age': '86400',
});

const server = http.createServer((req, res) => {
  // 预检请求直接放行
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // 只转发 /v1 下的请求
  if (!req.url.startsWith('/v1/')) {
    res.writeHead(404, corsHeaders());
    res.end('Not Found');
    return;
  }

  const upstreamHost = req.headers['x-ai-upstream'] || DEFAULT_UPSTREAM_HOST;
  if (!isValidUpstreamHost(upstreamHost)) {
    res.writeHead(400, { ...corsHeaders(), 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: `非法上游域名: ${upstreamHost}` }));
    return;
  }

  // 收集请求体后转发
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    const body = Buffer.concat(chunks);

    const headers = {};
    for (const name of FORWARD_HEADERS) {
      if (req.headers[name]) headers[name] = req.headers[name];
    }

    const upstream = https.request(
      {
        hostname: upstreamHost,
        path: req.url, // 已含 /v1/...，OpenAI 兼容 API 正是 /v1 前缀
        method: req.method,
        headers,
      },
      (aiRes) => {
        // 原样透传状态码与内容类型；SSE 流由 pipe 自然透传
        res.writeHead(aiRes.statusCode, {
          ...corsHeaders(),
          'Content-Type': aiRes.headers['content-type'] || 'application/json',
        });
        aiRes.pipe(res);
      },
    );

    upstream.on('error', (err) => {
      res.writeHead(502, { ...corsHeaders(), 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: `代理转发失败: ${err.message}` }));
    });

    if (body.length) upstream.write(body);
    upstream.end();
  });
});

server.listen(PORT, () => {
  console.log(`AI 转发服务已启动: http://0.0.0.0:${PORT}/v1  →  https://${DEFAULT_UPSTREAM_HOST}/v1`);
});
