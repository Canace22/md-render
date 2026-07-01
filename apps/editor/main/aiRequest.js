/**
 * AI 请求：通过 ai-proxy server 发起，不直连 LLM。
 *
 * 调用链路：Renderer → IPC → Main → ai-proxy server → LLM API
 *
 * API Key 存在 ai-proxy server 的 .env 里，Main 进程也不接触 key。
 * Main 只传 providerId + messages 给 server，server 解析 key 并转发。
 */

const AI_PROXY_TIMEOUT_MS = 60000;
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
 * 获取 server 注册的工具列表（不含 schema，仅摘要）。
 */
export async function requestToolList({ aiProxyBase }) {
  if (!aiProxyBase) throw new Error('未配置 AI 代理地址（aiProxyBase）');
  const url = `${aiProxyBase.replace(/\/+$/, '')}/api/tools`;
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error(`获取工具列表失败 (${res.status})`);
  return res.json();
}
