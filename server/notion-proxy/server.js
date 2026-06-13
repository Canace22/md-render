/**
 * Notion API 转发服务（零依赖，单文件）
 *
 * 作用：浏览器/Electron 前端无法直连 Notion API（被 CORS 拦截）。
 * 本服务部署在你的服务器上，把前端发来的 /v1/* 请求原样转发给
 * https://api.notion.com，并给响应补上 CORS 头，浏览器即可放行。
 *
 * 设计要点：
 * - 纯透传：token 由前端在 Authorization 头里携带，本服务不读取、不存储、不打印。
 * - 无第三方依赖，Node 18+ 直接运行：`node server.js`
 *
 * 环境变量：
 * - PORT        监听端口，默认 8787
 * - ALLOW_ORIGIN 允许的来源，默认 *（自用足够；如需收紧填具体域名）
 *
 * 前端对应配置：VITE_NOTION_PROXY=https://你的服务器:8787/v1
 */

const http = require('http');
const https = require('https');

const PORT = process.env.PORT || 8787;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const NOTION_HOST = 'api.notion.com';

// 透传给 Notion 的请求头白名单（其余一律不转发，避免泄露/干扰）
const FORWARD_HEADERS = ['authorization', 'notion-version', 'content-type'];

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Notion-Version,Content-Type',
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
        hostname: NOTION_HOST,
        path: req.url, // 已含 /v1/...，Notion API 正是 /v1 前缀
        method: req.method,
        headers,
      },
      (notionRes) => {
        res.writeHead(notionRes.statusCode, {
          ...corsHeaders(),
          'Content-Type': notionRes.headers['content-type'] || 'application/json',
        });
        notionRes.pipe(res);
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
  console.log(`Notion 转发服务已启动: http://0.0.0.0:${PORT}/v1  →  https://${NOTION_HOST}/v1`);
});
