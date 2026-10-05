/**
 * OpenAI 兼容流式响应（SSE）的纯函数工具，main 和 renderer 共用。
 *
 * 原理：上游按行推 `data: {json}`，每个 json 里只有这次新增的片段（delta）。
 * - createSseParser：把任意切开的文本块拼回完整行，取出 data 里的 JSON
 * - createChatAccumulator：把 delta 依次合并成一条完整的 assistant message（含 tool_calls）
 */

const DATA_PREFIX = 'data:';
const DONE_MARK = '[DONE]';

/**
 * @param {(payload: object) => void} onData  每解析出一个 JSON 片段调用一次
 * @returns {{ push: (chunk: string) => void, flush: () => void }}
 */
export const createSseParser = (onData) => {
  let buffer = '';

  const handleLine = (rawLine) => {
    const line = rawLine.trim();
    if (!line.startsWith(DATA_PREFIX)) return;
    const data = line.slice(DATA_PREFIX.length).trim();
    if (!data || data === DONE_MARK) return;
    try {
      onData(JSON.parse(data));
    } catch {
      /* 坏片段直接跳过，不影响后续 */
    }
  };

  return {
    push(chunk) {
      buffer += String(chunk ?? '');
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? '';
      lines.forEach(handleLine);
    },
    flush() {
      if (buffer) handleLine(buffer);
      buffer = '';
    },
  };
};

const mergeToolCallDelta = (toolCalls, delta) => {
  const index = Number.isInteger(delta?.index) ? delta.index : toolCalls.length;
  const current = toolCalls[index] ?? { id: '', type: 'function', function: { name: '', arguments: '' } };
  toolCalls[index] = {
    id: delta.id || current.id,
    type: delta.type || current.type,
    function: {
      name: current.function.name + (delta.function?.name ?? ''),
      arguments: current.function.arguments + (delta.function?.arguments ?? ''),
    },
  };
};

/**
 * 合并流式 delta。push 返回这次新增的正文文本（没有则为空串），方便边收边显示。
 */
export const createChatAccumulator = () => {
  let content = '';
  const toolCalls = [];

  return {
    push(payload) {
      const delta = payload?.choices?.[0]?.delta;
      if (!delta) return '';
      (delta.tool_calls ?? []).forEach((item) => mergeToolCallDelta(toolCalls, item));
      const text = typeof delta.content === 'string' ? delta.content : '';
      content += text;
      return text;
    },
    getMessage() {
      const calls = toolCalls.filter(Boolean);
      return {
        role: 'assistant',
        content,
        ...(calls.length ? { tool_calls: calls } : {}),
      };
    },
  };
};

/** 响应是不是 SSE（上游不支持流式时会直接回 JSON，要兼容） */
export const isEventStream = (contentType) => /text\/event-stream/i.test(String(contentType ?? ''));

/**
 * 读完一个 fetch Response 的流式正文，返回完整 message。
 * onDelta(text) 每收到一段正文调用一次。上游回的是普通 JSON 时按非流式处理。
 */
export const readChatStream = async (response, { onDelta = () => {}, onChunk = () => {} } = {}) => {
  if (!isEventStream(response.headers?.get?.('content-type'))) {
    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    if (!message) throw new Error('AI 返回内容为空');
    if (message.content) onDelta(String(message.content));
    return message;
  }

  const accumulator = createChatAccumulator();
  const parser = createSseParser((payload) => {
    const text = accumulator.push(payload);
    if (text) onDelta(text);
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk();
    parser.push(decoder.decode(value, { stream: true }));
  }
  parser.push(decoder.decode());
  parser.flush();
  return accumulator.getMessage();
};
