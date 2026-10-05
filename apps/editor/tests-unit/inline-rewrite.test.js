import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/core/agent/aiClient.js', () => ({
  callChatCompletion: vi.fn(),
}));

import { callChatCompletion } from '../renderer/src/core/agent/aiClient.js';
import {
  buildInlineRewriteMessages,
  runInlineRewrite,
} from '../renderer/src/core/agent/inlineRewrite.js';

describe('inline rewrite', () => {
  beforeEach(() => callChatCompletion.mockReset());

  it('空选区会被拒绝', () => {
    expect(() => buildInlineRewriteMessages({ text: '  ', instruction: 'polish' }))
      .toThrow('请先选中');
  });

  it('未知指令会被拒绝', () => {
    expect(() => buildInlineRewriteMessages({ text: '原文', instruction: 'unknown' }))
      .toThrow('未知的改写方式');
  });

  it('前后文只作为理解材料传入', () => {
    const messages = buildInlineRewriteMessages({
      text: '中间段',
      context: { before: '前一段', after: '后一段' },
      instruction: 'formal',
    });
    expect(messages[1].content).toContain('前一段（仅供理解');
    expect(messages[1].content).toContain('选中原文：\n中间段');
  });

  it('请求不带工具并返回正文', async () => {
    callChatCompletion.mockResolvedValue({ content: '改好的文字' });
    const result = await runInlineRewrite({ text: '原文', instruction: 'polish' });
    expect(result).toBe('改好的文字');
    expect(callChatCompletion.mock.calls[0][0].tools).toBeUndefined();
  });

  it('流式回调返回累积正文且隐藏私有推理', async () => {
    callChatCompletion.mockImplementation(async ({ onDelta }) => {
      onDelta('<think>想');
      onDelta('完了</think>改');
      onDelta('写');
      return { content: '<think>想完了</think>改写' };
    });
    const deltas = [];
    await runInlineRewrite({ text: '原文', instruction: 'concise', onDelta: (text) => deltas.push(text) });
    expect(deltas).toEqual(['', '改', '改写']);
  });

  it('空结果提示重试', async () => {
    callChatCompletion.mockResolvedValue({ content: '<analysis>未完' });
    await expect(runInlineRewrite({ text: '原文', instruction: 'shorten' }))
      .rejects.toThrow('没有返回可用');
  });
});
