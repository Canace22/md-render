/**
 * AI 代理服务（OpenAI 兼容，零依赖，单文件）
 *
 * 两种模式并存：
 *
 * 1. Provider 模式（推荐）—— POST /api/chat
 *    前端只传 providerId + messages，服务端自动解析 key 并转发给 LLM。
 *    API Key 存在服务端 .env，前端永远不接触。
 *
 * 2. 透明代理模式（兼容）—— /v1/*
 *    前端自带 key，服务端只做 CORS 透传。
 *
 * 环境变量（.env）：
 * - PORT              监听端口，默认 8788
 * - ALLOW_ORIGIN      允许的来源，默认 *
 * - AI_UPSTREAM_HOST  透明代理默认上游，默认 api.openai.com
 * - MINIMAX_API_KEY   MiniMax key
 */

const http = require('http');
const https = require('https');
const { ALLOW_ORIGIN, DEFAULT_UPSTREAM_HOST, PORT } = require('./config');
const { PROVIDERS, listProviders, resolveProvider } = require('./providers');
const { searchKnowledgeSources } = require('./knowledgeSearch');
const { executeTool, loadTools, toolsToOpenAISchema } = require('./toolRunner');

const TOOLS = loadTools();

// ── 工具函数 ───────────────────────────────────────────────
const FORWARD_HEADERS = ['authorization', 'content-type', 'accept'];
const isValidUpstreamHost = (host) => /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(host || ''));

const corsHeaders = () => ({
  'Access-Control-Allow-Origin': ALLOW_ORIGIN,
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization,Content-Type,Accept,X-AI-Upstream,X-AI-Provider',
  'Access-Control-Max-Age': '86400',
});

const jsonRes = (res, statusCode, data) => {
  res.writeHead(statusCode, { ...corsHeaders(), 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
};

// ── 转发请求到 LLM API ────────────────────────────────────
function forwardToLLM({ baseURL, apiKey, body, res }) {
  const url = new URL(`${baseURL}/chat/completions`);

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };

  const upstream = https.request(
    {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname,
      method: 'POST',
      headers,
    },
    (aiRes) => {
      res.writeHead(aiRes.statusCode, {
        ...corsHeaders(),
        'Content-Type': aiRes.headers['content-type'] || 'application/json',
      });
      aiRes.pipe(res);
    },
  );

  upstream.on('error', (err) => {
    jsonRes(res, 502, { error: `代理转发失败: ${err.message}` });
  });

  if (body.length) upstream.write(body);
  upstream.end();
}

// ── HTTP Server ────────────────────────────────────────────
const server = http.createServer((req, res) => {
  // 预检请求
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  // ── Provider 模式：POST /api/chat ──
  if (req.method === 'POST' && req.url === '/api/chat') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const { providerId, messages, tools, model, temperature, max_tokens } = payload;

        if (!providerId) return jsonRes(res, 400, { error: '缺少 providerId' });
        if (!messages || !Array.isArray(messages)) return jsonRes(res, 400, { error: '缺少 messages' });

        const provider = resolveProvider(providerId);
        if (!provider) return jsonRes(res, 400, { error: `未知或未配置的 provider: ${providerId}` });

        const llmBody = {
          model: model || provider.defaultModel,
          messages,
          temperature: temperature ?? 0.3,
          ...(max_tokens ? { max_tokens } : {}),
        };
        if (Array.isArray(tools) && tools.length) {
          llmBody.tools = tools;
          llmBody.tool_choice = 'auto';
        }

        forwardToLLM({
          baseURL: provider.baseURL,
          apiKey: provider.apiKey,
          body: Buffer.from(JSON.stringify(llmBody)),
          res,
        });
      } catch (err) {
        jsonRes(res, 400, { error: `请求解析失败: ${err.message}` });
      }
    });
    return;
  }

  // ── Provider 列表：GET /api/providers ──
  if (req.method === 'GET' && req.url === '/api/providers') {
    return jsonRes(res, 200, { providers: listProviders() });
  }

  // ── 外挂知识库检索：POST /api/knowledge/search ──
  if (req.method === 'POST' && req.url === '/api/knowledge/search') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const result = await searchKnowledgeSources(payload);
        return jsonRes(res, result.ok ? 200 : 400, result);
      } catch (err) {
        return jsonRes(res, 400, { ok: false, error: `请求解析失败: ${err.message}`, results: [] });
      }
    });
    return;
  }

  // ── 工具列表：GET /api/tools ──
  if (req.method === 'GET' && req.url === '/api/tools') {
    const list = Object.values(TOOLS).map((t) => ({
      name: t.name,
      label: t.label,
      description: t.description,
    }));
    return jsonRes(res, 200, { tools: list });
  }

  // ── 工具执行：POST /api/tools/exec ──
  if (req.method === 'POST' && req.url === '/api/tools/exec') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
        const { toolName, args } = payload;
        if (!toolName) return jsonRes(res, 400, { error: '缺少 toolName' });

        const result = await executeTool(TOOLS, { toolName, args: args || {} });
        const status = result.ok ? 200 : 500;
        return jsonRes(res, status, result);
      } catch (err) {
        jsonRes(res, 400, { error: `请求解析失败: ${err.message}` });
      }
    });
    return;
  }

  // ── 工具 schema（OpenAI 格式）：GET /api/tools/schema ──
  if (req.method === 'GET' && req.url === '/api/tools/schema') {
    return jsonRes(res, 200, { tools: toolsToOpenAISchema(TOOLS) });
  }

  // ── 健康检查：GET /api/health ──
  if (req.method === 'GET' && req.url === '/api/health') {
    return jsonRes(res, 200, { ok: true, providers: Object.keys(PROVIDERS) });
  }

  // ── 透明代理模式（兼容）：/v1/* ──
  if (req.url.startsWith('/v1/')) {
    const upstreamHost = req.headers['x-ai-upstream'] || DEFAULT_UPSTREAM_HOST;
    if (!isValidUpstreamHost(upstreamHost)) {
      return jsonRes(res, 400, { error: `非法上游域名: ${upstreamHost}` });
    }

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
          path: req.url,
          method: req.method,
          headers,
        },
        (aiRes) => {
          res.writeHead(aiRes.statusCode, {
            ...corsHeaders(),
            'Content-Type': aiRes.headers['content-type'] || 'application/json',
          });
          aiRes.pipe(res);
        },
      );

      upstream.on('error', (err) => {
        jsonRes(res, 502, { error: `代理转发失败: ${err.message}` });
      });

      if (body.length) upstream.write(body);
      upstream.end();
    });
    return;
  }

  // 404
  jsonRes(res, 404, { error: 'Not Found' });
});

server.listen(PORT, () => {
  console.log(`✅ AI 代理服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`   Provider 模式: POST /api/chat (key 存服务端)`);
  console.log(`   透明代理模式:  /v1/* (key 由前端携带)`);
  const configured = Object.entries(PROVIDERS)
    .filter(([, cfg]) => process.env[cfg.apiKeyEnv])
    .map(([id]) => id);
  console.log(`   已配置 provider: ${configured.join(', ') || '无'}`);
  const toolNames = Object.keys(TOOLS);
  console.log(`   本地工具 (${toolNames.length}): ${toolNames.join(', ') || '无'}`);
});
