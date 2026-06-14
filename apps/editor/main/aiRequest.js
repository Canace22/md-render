/**
 * 主进程 AI 请求：Node 端直连 OpenAI 兼容接口。
 *
 * 走主进程的好处：Node 没有浏览器的 CORS 限制，前端无需部署任何代理服务器。
 * key 由前端通过 IPC 传入，仅用于本次请求的 Authorization 头，不存储、不打印。
 *
 * baseURL 是各家完整基址（含路径），因为不是所有家都用 /v1：
 * 例如阿里百炼是 .../compatible-mode/v1。请求统一拼 `${baseURL}/chat/completions`。
 */

const AI_REQUEST_TIMEOUT_MS = 60000;

const isHttpsUrl = (value) => /^https:\/\/[^\s]+$/i.test(String(value || ''));

/**
 * 调用一次 chat/completions（非流式，带 tools）。
 * @param {object} params
 * @param {Array}  params.messages
 * @param {Array}  [params.tools]
 * @param {string} params.apiKey
 * @param {string} params.baseURL   完整基址，如 https://api.deepseek.com/v1
 * @param {string} params.model
 * @returns {Promise<object>} choices[0].message
 */
export async function requestChatCompletion({ messages, tools, apiKey, baseURL, model }) {
  if (!apiKey) throw new Error('未配置 API key');
  if (!model) throw new Error('未配置模型名称');
  const base = String(baseURL ?? '').trim().replace(/\/+$/, '');
  if (!isHttpsUrl(base)) throw new Error(`非法 Base URL: ${baseURL}`);

  const payload = { model, messages, temperature: 0.3 };
  if (Array.isArray(tools) && tools.length) {
    payload.tools = tools;
    payload.tool_choice = 'auto';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
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
