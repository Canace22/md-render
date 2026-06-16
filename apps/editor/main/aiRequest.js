/**
 * AI 请求：通过 ai-proxy server 发起，不直连 LLM。
 *
 * 调用链路：Renderer → IPC → Main → ai-proxy server → LLM API
 *
 * API Key 存在 ai-proxy server 的 .env 里，Main 进程也不接触 key。
 * Main 只传 providerId + messages 给 server，server 解析 key 并转发。
 */

const AI_PROXY_TIMEOUT_MS = 60000;

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

  const url = `${aiProxyBase.replace(/\/+$/, '')}/api/chat`;

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
  } finally {
    clearTimeout(timer);
  }
}
