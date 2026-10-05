import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/core/agent/aiClient.js', () => ({
  callChatCompletion: vi.fn(),
}));

import { callChatCompletion } from '../renderer/src/core/agent/aiClient.js';
import { runAgent } from '../renderer/src/core/agent/agentEngine.js';
import {
  createChatAccumulator,
  createSseParser,
  readChatStream,
} from '../shared/sseChat.js';
import {
  appendStreamDelta,
  buildErrorMessage,
  endStreamMessage,
  finalizeAssistantReply,
  isConnectionError,
  removeMessageAt,
  stopTypingMessages,
} from '../renderer/src/core/agent/streamMessages.js';
import { buildAssistantRenderPayload } from '../renderer/src/core/agent/assistantResponse.js';

const sse = (delta) => `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;

const makeStreamResponse = (chunks, contentType = 'text/event-stream') => {
  const encoder = new TextEncoder();
  const body = new ReadableStream({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
      controller.close();
    },
  });
  return new Response(body, { headers: { 'content-type': contentType } });
};

describe('SSE 解析', () => {
  it('被切开的行能拼回来，[DONE] 和坏 JSON 跳过', () => {
    const got = [];
    const parser = createSseParser((payload) => got.push(payload));
    const text = `${sse({ content: '你' })}data: {坏的}\n\n${sse({ content: '好' })}data: [DONE]\n\n`;
    parser.push(text.slice(0, 15));
    parser.push(text.slice(15));
    parser.flush();
    expect(got.map((item) => item.choices[0].delta.content)).toEqual(['你', '好']);
  });

  it('累加器合并正文和分片的 tool_calls', () => {
    const acc = createChatAccumulator();
    expect(acc.push({ choices: [{ delta: { content: '先看看' } }] })).toBe('先看看');
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'read_', arguments: '{"a"' } }] } }] });
    acc.push({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'active_doc', arguments: ':1}' } }] } }] });
    expect(acc.getMessage()).toEqual({
      role: 'assistant',
      content: '先看看',
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'read_active_doc', arguments: '{"a":1}' } }],
    });
  });

  it('readChatStream 边收边回调，返回完整 message', async () => {
    const deltas = [];
    const message = await readChatStream(
      makeStreamResponse([sse({ content: '第一' }), sse({ content: '段' })]),
      { onDelta: (text) => deltas.push(text) },
    );
    expect(deltas).toEqual(['第一', '段']);
    expect(message.content).toBe('第一段');
    expect(message.tool_calls).toBeUndefined();
  });

  it('上游不支持流式、直接回 JSON 时也能用', async () => {
    const deltas = [];
    const json = JSON.stringify({ choices: [{ message: { role: 'assistant', content: '整段' } }] });
    const message = await readChatStream(makeStreamResponse([json], 'application/json'), {
      onDelta: (text) => deltas.push(text),
    });
    expect(message.content).toBe('整段');
    expect(deltas).toEqual(['整段']);
  });
});

describe('流式消息（纯函数）', () => {
  it('第一段新建 typing 消息，后续追加到同一条', () => {
    let list = [{ role: 'user', text: '问' }];
    list = appendStreamDelta(list, 'r:1', '你');
    list = appendStreamDelta(list, 'r:1', '好');
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ role: 'assistant', text: '你好', typing: true, streamId: 'r:1' });
  });

  it('调工具前收掉光标；最终答复替换同一条，没有流式消息就追加', () => {
    let list = appendStreamDelta([], 'r:1', '我先读一下');
    list = endStreamMessage(list, 'r:1');
    expect(list[0].typing).toBe(false);
    list = appendStreamDelta(list, 'r:2', '<think>x</think>结论');
    list = finalizeAssistantReply(list, 'r:2', '结论');
    expect(list).toHaveLength(2);
    expect(list[1]).toMatchObject({ text: '结论', typing: false });
    expect(finalizeAssistantReply([], '', '直接追加')).toEqual([{ role: 'assistant', text: '直接追加' }]);
  });

  it('停止时保留已输出内容并标「已停止」', () => {
    const list = stopTypingMessages(appendStreamDelta([], 'r:1', '一半'));
    expect(list[0]).toMatchObject({ text: '一半', typing: false, stopped: true });
  });

  it('出错消息：带重试参数，连接类错误给「打开设置」', () => {
    const msg = buildErrorMessage('AI 代理连接失败：无法连接 http://x', { promptText: 'p' });
    expect(msg).toMatchObject({ error: true, connectionError: true, retry: { promptText: 'p' } });
    expect(isConnectionError('模型不支持工具')).toBe(false);
    expect(removeMessageAt([1, 2, 3], 1)).toEqual([1, 3]);
  });

  it('打字中推理块没闭合时不显示兜底文案', () => {
    expect(buildAssistantRenderPayload({ text: '<think>还在想', typing: true }).displayText).toBe('');
  });
});

describe('runAgent stream', () => {
  beforeEach(() => callChatCompletion.mockReset());

  it('stream=true 时把片段转成 assistant_delta，最终 assistant_text 带步数', async () => {
    callChatCompletion.mockImplementation(async (params) => {
      const onDelta = params?.onDelta ?? (() => {});
      onDelta('流');
      onDelta('式');
      return { role: 'assistant', content: '流式' };
    });
    const events = [];
    const result = await runAgent({ userInput: 'hi', config: {}, host: {}, stream: true, onEvent: (ev) => events.push(ev) });
    expect(result.finalText).toBe('流式');
    expect(events.filter((ev) => ev.type === 'assistant_delta').map((ev) => ev.text)).toEqual(['流', '式']);
    expect(events.find((ev) => ev.type === 'assistant_text')).toMatchObject({ step: 1, text: '流式' });
  });

  it('不传 stream 时不给 callChatCompletion 传 onDelta', async () => {
    callChatCompletion.mockResolvedValue({ role: 'assistant', content: 'ok' });
    await runAgent({ userInput: 'hi', config: {}, host: {} });
    expect(callChatCompletion.mock.calls[0][0].onDelta).toBeUndefined();
  });
});
