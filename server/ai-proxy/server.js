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
 * - XIAOMI_API_KEY    小米 MiMo key
 * - MINIMAX_API_KEY   MiniMax key
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ── 加载 .env ──────────────────────────────────────────────
function loadDotEnv() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let value = trimmed.slice(eqIdx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnv();

const PORT = process.env.PORT || 8788;
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';
const DEFAULT_UPSTREAM_HOST = process.env.AI_UPSTREAM_HOST || 'api.openai.com';

// ── Provider 配置（key 从 .env 读取） ──────────────────────
const PROVIDERS = {
  'xiaomi-mimo': {
    label: '小米 MiMo',
    baseURL: 'https://token-plan-sgp.xiaomimimo.com/v1',
    defaultModel: 'mimo-v2.5-pro',
    apiKeyEnv: 'XIAOMI_API_KEY',
  },
  'minimax': {
    label: 'MiniMax',
    baseURL: 'https://api.minimaxi.com/v1',
    defaultModel: 'MiniMax-M3',
    apiKeyEnv: 'MINIMAX_API_KEY',
  },
};

function resolveProvider(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;
  const apiKey = process.env[provider.apiKeyEnv] || '';
  if (!apiKey) return null;
  return { ...provider, apiKey };
}

// ── 本地工具注册（OpenAI tool calling 格式） ──────────────
//
// 每个工具是 tools/<tool-name>/ 目录，包含：
//   manifest.json  工具描述 + 命令模板
//   *.py / *.sh    实际执行脚本
//
// server 自动扫描 tools/ 目录加载所有工具。
// AI 调用工具时，server 负责 spawn 脚本并把结果返回。
const TOOLS_DIR = path.join(__dirname, 'tools');
const TOOL_TIMEOUT_MS = 5 * 60 * 1000; // 5 分钟

function loadTools() {
  const tools = {};
  if (!fs.existsSync(TOOLS_DIR)) return tools;

  for (const entry of fs.readdirSync(TOOLS_DIR)) {
    const dir = path.join(TOOLS_DIR, entry);
    if (!fs.statSync(dir).isDirectory()) continue;

    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      if (!manifest.name || !manifest.command) continue;

      // 找执行脚本：manifest.script > 当前目录第一个 .py > 第一个 .sh
      let script = manifest.script;
      if (!script) {
        const files = fs.readdirSync(dir);
        const pyFile = files.find((f) => f.endsWith('.py'));
        const shFile = files.find((f) => f.endsWith('.sh'));
        script = pyFile || shFile;
        if (script) script = path.join(dir, script);
      } else {
        script = path.isAbsolute(script) ? script : path.join(dir, script);
      }

      tools[manifest.name] = {
        ...manifest,
        script,
        dir,
      };
    } catch (err) {
      console.warn(`[tools] 跳过 ${entry}: ${err.message}`);
    }
  }
  return tools;
}

const TOOLS = loadTools();

/** 把工具暴露成 OpenAI tool calling schema */
function toolsToOpenAISchema() {
  return Object.values(TOOLS).map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/** 渲染命令参数：替换 {{var}} 占位符 */
function renderTemplate(template, vars) {
  return String(template).replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (!(key in vars)) return '';
    return String(vars[key] ?? '');
  });
}

/** 执行一个工具：spawn 脚本，stdin/stdout 收结果 */
function executeTool({ toolName, args }) {
  return new Promise((resolve) => {
    const tool = TOOLS[toolName];
    if (!tool) {
      return resolve({ ok: false, error: `未知工具: ${toolName}` });
    }

    // 必填参数校验
    const required = tool.parameters?.required || [];
    const missing = required.filter((k) => args[k] == null || args[k] === '');
    if (missing.length) {
      return resolve({ ok: false, error: `缺少必填参数: ${missing.join(', ')}` });
    }

    // 渲染命令：必选 args + 可选 args
    // 自动注入特殊变量：script（工具脚本绝对路径）
    const renderVars = { script: tool.script, ...args };
    const cmdArgs = (tool.args || []).map((t) => renderTemplate(t, renderVars));
    if (tool.args_optional) {
      for (const [key, tmpl] of Object.entries(tool.args_optional)) {
        if (args[key] != null && args[key] !== '') {
          cmdArgs.push(renderTemplate(tmpl, renderVars));
        }
      }
    }
    // 布尔 flag
    if (tool.flags) {
      for (const [key, flag] of Object.entries(tool.flags)) {
        if (args[key] === true) cmdArgs.push(flag);
      }
    }

    const child = spawn(tool.command, cmdArgs, {
      cwd: tool.dir,
      env: { ...process.env },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (c) => { stdout += c.toString('utf-8'); });
    child.stderr.on('data', (c) => { stderr += c.toString('utf-8'); });

    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve({ ok: false, error: '执行超时（>5min）', stdout, stderr });
    }, TOOL_TIMEOUT_MS);

    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: `spawn 失败: ${err.message}`, stdout, stderr });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ ok: true, exitCode: code, stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        resolve({
          ok: false,
          exitCode: code,
          error: `退出码 ${code}`,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        });
      }
    });
  });
}

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
    const list = Object.entries(PROVIDERS).map(([id, cfg]) => ({
      id,
      label: cfg.label,
      baseURL: cfg.baseURL,
      defaultModel: cfg.defaultModel,
      hasKey: Boolean(process.env[cfg.apiKeyEnv]),
    }));
    return jsonRes(res, 200, { providers: list });
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

        const result = await executeTool({ toolName, args: args || {} });
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
    return jsonRes(res, 200, { tools: toolsToOpenAISchema() });
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
