import { describe, expect, it, vi } from 'vitest';
import { buildQuickActionInstruction } from '../renderer/src/utils/aiActions.js';
import { runAgent } from '../renderer/src/core/agent/agentEngine.js';

// 模型调用是从 aiClient 来的，单测里 mock 掉，不真打网络。
vi.mock('../renderer/src/core/agent/aiClient.js', () => ({
  callChatCompletion: vi.fn(),
}));
import { callChatCompletion } from '../renderer/src/core/agent/aiClient.js';

describe('buildQuickActionInstruction 写回引导', () => {
  it('压缩：指令里包含调用写入工具', () => {
    expect(buildQuickActionInstruction('compress')).toContain('write_active_doc');
  });

  it('扩写：指令里包含调用写入工具', () => {
    expect(buildQuickActionInstruction('expand')).toContain('write_active_doc');
  });

  it('润色：指令里包含调用写入工具', () => {
    expect(buildQuickActionInstruction('polish')).toContain('write_active_doc');
  });

  it('润色别名（中文）同样带写回引导', () => {
    expect(buildQuickActionInstruction('润色')).toContain('write_active_doc');
  });

  it('压缩别名（中文）同样带写回引导', () => {
    expect(buildQuickActionInstruction('压缩')).toContain('write_active_doc');
  });

  it('标题建议：不改正文，不应引导写回', () => {
    expect(buildQuickActionInstruction('title')).not.toContain('write_active_doc');
  });

  it('未知动作兜底到压缩，仍带写回引导', () => {
    expect(buildQuickActionInstruction('天马行空')).toContain('write_active_doc');
  });

  it('改语气：改写类，带写回引导', () => {
    expect(buildQuickActionInstruction('tone')).toContain('write_active_doc');
    expect(buildQuickActionInstruction('改语气')).toContain('write_active_doc');
  });

  it('提炼要点 / 小标题：不改正文，不引导写回', () => {
    expect(buildQuickActionInstruction('key_points')).not.toContain('write_active_doc');
    expect(buildQuickActionInstruction('subheadings')).not.toContain('write_active_doc');
  });

  it('续写：追加类，引导读全文后追加到末尾再写回', () => {
    const instruction = buildQuickActionInstruction('continue');
    expect(instruction).toContain('write_active_doc');
    expect(instruction).toContain('追加');
  });

  it('改写类带选区：只改这段，并把原文嵌进指令', () => {
    const instruction = buildQuickActionInstruction('polish', { selectionText: '这段选中文本' });
    expect(instruction).toContain('这段选中文本');
    expect(instruction).toContain('replace');
    expect(instruction).toContain('write_active_doc');
  });

  it('不改正文类动作忽略选区，维持整篇行为', () => {
    const instruction = buildQuickActionInstruction('title', { selectionText: '这段选中文本' });
    expect(instruction).not.toContain('这段选中文本');
    expect(instruction).not.toContain('write_active_doc');
  });

  it('提纲：不改正文，给3种提纲且不引导写回', () => {
    const instruction = buildQuickActionInstruction('outline');
    expect(instruction).not.toContain('write_active_doc');
    expect(instruction).toContain('3 种');
    expect(buildQuickActionInstruction('提纲')).not.toContain('write_active_doc');
  });
});

describe('runAgent 写回路径', () => {
  const makeHost = () => ({
    readActiveDoc: vi.fn(async () => ({ title: 't', content: '原文' })),
    writeActiveDoc: vi.fn(async () => '改动已应用到当前文档。'),
    searchDocs: vi.fn(async () => []),
  });

  it('模型调用 write_active_doc 时，host.writeActiveDoc 被执行', async () => {
    callChatCompletion
      .mockResolvedValueOnce({
        content: '',
        tool_calls: [
          { id: '1', function: { name: 'write_active_doc', arguments: JSON.stringify({ content: '压缩后正文' }) } },
        ],
      })
      .mockResolvedValueOnce({ content: '完成', tool_calls: [] });

    const host = makeHost();
    const { finalText } = await runAgent({ userInput: '压缩', config: {}, host });

    expect(host.writeActiveDoc).toHaveBeenCalledWith('压缩后正文');
    expect(finalText).toBe('完成');
  });

  it('纯提问：模型直接回答，不触发写入', async () => {
    callChatCompletion.mockResolvedValueOnce({ content: '这是答案', tool_calls: [] });

    const host = makeHost();
    const { finalText } = await runAgent({ userInput: '这文档讲啥？', config: {}, host });

    expect(host.writeActiveDoc).not.toHaveBeenCalled();
    expect(finalText).toBe('这是答案');
  });
});
