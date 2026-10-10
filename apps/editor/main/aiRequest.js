/**
 * AI 请求：通过 ai-proxy server 发起，不直连 LLM。
 *
 * 调用链路：Renderer → IPC → Main → ai-proxy server → LLM API
 *
 * API Key 存在 ai-proxy server 的 .env 里，Main 进程也不接触 key。
 * Main 只传 providerId + messages 给 server，server 解析 key 并转发。
 */

import { readChatStream } from '@shared/sseChat.js';

const AI_PROXY_TIMEOUT_MS = 60000;
const KNOWLEDGE_SEARCH_TIMEOUT_MS = 30000;
const URL_READ_TIMEOUT_MS = 30000;
const ATTACHMENT_TEXT_TIMEOUT_MS = 45000;
const TOOL_EXEC_TIMEOUT_MS = 5 * 60 * 1000; // 工具执行最长 5 分钟

const normalizeAiProxyBase = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const isNetworkError = (err) => {
  const message = String(err?.message ?? err ?? '').toLowerCase();
  return err?.name === 'AbortError'
    || message === 'fetch failed'
    || message.includes('econnrefused')
    || message.includes('enotfound')
    || message.includes('network');
};

const formatProxyError = (err, aiProxyBase) => {
  const base = normalizeAiProxyBase(aiProxyBase) || 'AI 代理服务';
  if (err?.name === 'AbortError') {
    return `AI 代理请求超时：${base} 暂无响应，请检查服务是否正常。`;
  }
  if (isNetworkError(err)) {
    return `AI 代理连接失败：无法连接 ${base}。请先启动 server/ai-proxy，或检查 AI_PROXY_BASE 配置。`;
  }
  return err?.message || String(err);
};

/**
 * 调用 ai-proxy server 的 /api/chat 接口。
 *
 * @param {object} params
 * @param {string} params.aiProxyBase  server 地址，如 http://localhost:8788
 * @param {string} params.providerId   预设服务商 id
 * @param {Array}  params.messages     聊天消息
 * @param {Array}  [params.tools]      工具定义
 * @param {string} [params.model]      覆盖默认模型
 * @returns {Promise<object>} choices[0].message
 */
export async function requestChatCompletion({ aiProxyBase, providerId, messages, tools, model }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  if (!providerId) throw new Error('未指定 providerId');
  if (!messages || !messages.length) throw new Error('消息不能为空');

  const base = normalizeAiProxyBase(aiProxyBase);
  const url = `${base}/api/chat`;

  const payload = { providerId, messages };
  if (model) payload.model = model;
  if (Array.isArray(tools) && tools.length) payload.tools = tools;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`AI 请求失败 (${response.status}): ${text.slice(0, 300)}`);
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('AI 返回内容为空');
    return message;
  } catch (err) {
    throw new Error(formatProxyError(err, base));
  } finally {
    clearTimeout(timer);
  }
}

const buildChatPayload = ({ providerId, messages, tools, model }) => {
  if (!providerId) throw new Error('未指定 providerId');
  if (!messages || !messages.length) throw new Error('消息不能为空');
  const payload = { providerId, messages };
  if (model) payload.model = model;
  if (Array.isArray(tools) && tools.length) payload.tools = tools;
  return payload;
};

/**
 * 流式调用 /api/chat：边收边通过 onDelta 推正文片段，结束后返回完整 message。
 * 超时按「多久没收到新数据」算（空闲超时），长回答不会被总时长掐断。
 * signal 由调用方控制（用户点停止时 abort）。
 */
export async function requestChatCompletionStream({
  aiProxyBase,
  providerId,
  messages,
  tools,
  model,
  signal,
  onDelta = () => {},
}) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  const payload = { ...buildChatPayload({ providerId, messages, tools, model }), stream: true };
  const base = normalizeAiProxyBase(aiProxyBase);

  const controller = new AbortController();
  let timedOut = false;
  let timer = null;
  const resetIdleTimer = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, AI_PROXY_TIMEOUT_MS);
  };
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onExternalAbort);
  resetIdleTimer();

  try {
    const response = await fetch(`${base}/api/chat`, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`AI 请求失败 (${response.status}): ${text.slice(0, 300)}`);
    }
    return await readChatStream(response, { onDelta, onChunk: resetIdleTimer });
  } catch (err) {
    if (signal?.aborted && !timedOut) throw new Error('已取消');
    throw new Error(formatProxyError(err, base));
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onExternalAbort);
  }
}

/**
 * 调用 ai-proxy server 的 /api/tools/exec 执行本地脚本工具。
 *
 * @param {object} params
 * @param {string} params.aiProxyBase  server 地址
 * @param {string} params.toolName      工具名（如 pdf_to_docx）
 * @param {object} params.args          工具参数
 * @returns {Promise<object>} { ok, exitCode, stdout, stderr, error }
 */
export async function requestToolExec({ aiProxyBase, toolName, args }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  if (!toolName) throw new Error('未指定 toolName');

  const url = `${aiProxyBase.replace(/\/+$/, '')}/api/tools/exec`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TOOL_EXEC_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolName, args: args || {} }),
    });

    const data = await response.json().catch(() => null);
    if (!response.ok) {
      return {
        ok: false,
        exitCode: data?.exitCode ?? null,
        stdout: data?.stdout ?? '',
        stderr: data?.stderr ?? '',
        error: data?.error || `server 返回 ${response.status}`,
      };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      stdout: '',
      stderr: '',
      error: `工具执行失败: ${err.message || String(err)}`,
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取 server 注册的工具 schema（OpenAI tools 格式）。
 */
export async function requestToolSchema({ aiProxyBase }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  const url = `${aiProxyBase.replace(/\/+$/, '')}/api/tools/schema`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`获取工具 schema 失败 (${res.status})`);
  return res.json();
}

/**
 * 获取 server 已配置的 provider 列表（含 key 的才会返回 hasKey: true）。
 * 唯一数据源是 server/ai-proxy/providers.js，主进程不再维护副本。
 */
export async function requestProviders({ aiProxyBase }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  const url = `${normalizeAiProxyBase(aiProxyBase)}/api/providers`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`获取 provider 列表失败 (${res.status})`);
  const data = await res.json();
  return Array.isArray(data?.providers) ? data.providers : [];
}

/**
 * 通过 ai-proxy 检索公开的外挂知识库。
 */
export async function requestKnowledgeSearch({ aiProxyBase, query, sources }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  if (!String(query ?? '').trim()) throw new Error('知识库搜索关键词为空');

  const url = `${aiProxyBase.replace(/\/+$/, '')}/api/knowledge/search`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), KNOWLEDGE_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, sources }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `外挂知识库搜索失败 (${response.status})`);
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('外挂知识库搜索超时');
    throw new Error(formatProxyError(err, aiProxyBase));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 通过 ai-proxy 读取公开 http/https 网页正文。
 */
export async function requestUrlRead({ aiProxyBase, url }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  if (!String(url ?? '').trim()) throw new Error('网页地址为空');

  const endpoint = `${normalizeAiProxyBase(aiProxyBase)}/api/url/read`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), URL_READ_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(data?.error || `网页读取失败 (${response.status})`);
    }
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('网页读取超时');
    throw new Error(formatProxyError(err, aiProxyBase));
  } finally {
    clearTimeout(timer);
  }
}

/** 通过 ai-proxy 提取 PDF 附件文字。 */
export async function requestAttachmentText({ aiProxyBase, base64 }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  if (!String(base64 ?? '').trim()) throw new Error('PDF 内容为空');

  const endpoint = `${normalizeAiProxyBase(aiProxyBase)}/api/attachments/text`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ATTACHMENT_TEXT_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(data?.error || `PDF 读取失败 (${response.status})`);
    return data;
  } catch (err) {
    if (err?.name === 'AbortError') throw new Error('PDF 读取超时');
    throw new Error(formatProxyError(err, aiProxyBase));
  } finally {
    clearTimeout(timer);
  }
}
