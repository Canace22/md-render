import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/core/agent/aiClient.js', () => ({
  callChatCompletion: vi.fn(),
}));

import { callChatCompletion } from '../renderer/src/core/agent/aiClient.js';
import { runAgent } from '../renderer/src/core/agent/agentEngine.js';
import {
  TOOL_DEFINITIONS,
  filterToolDefinitions,
  isToolAllowed,
} from '../renderer/src/core/agent/toolRegistry.js';

const toolCall = (id, name, args = {}) => ({ id, function: { name, arguments: JSON.stringify(args) } });

const makeHost = () => ({
  readActiveDoc: vi.fn(async () => ({ title: 't', content: '原文' })),
  writeActiveDoc: vi.fn(async () => '改动已应用到当前文档。'),
});

beforeEach(() => {
  callChatCompletion.mockReset();
});

describe('工具白名单（纯函数）', () => {
  it('null 表示不限制，数组只保留声明过的工具', () => {
    expect(filterToolDefinitions(TOOL_DEFINITIONS, null)).toBe(TOOL_DEFINITIONS);
    const names = filterToolDefinitions(TOOL_DEFINITIONS, ['read_active_doc']).map((t) => t.function.name);
    expect(names).toEqual(['read_active_doc']);
    expect(filterToolDefinitions(TOOL_DEFINITIONS, [])).toEqual([]);
  });

  it('isToolAllowed', () => {
    expect(isToolAllowed('write_active_doc', null)).toBe(true);
    expect(isToolAllowed('write_active_doc', ['read_active_doc'])).toBe(false);
  });
});

describe('runAgent 按 skill 白名单执行', () => {
  it('发给模型的工具只有白名单里的', async () => {
    callChatCompletion.mockResolvedValueOnce({ content: '好的', tool_calls: [] });
    await runAgent({ userInput: '标题', config: {}, host: makeHost(), allowedTools: ['read_active_doc'] });
    const { tools } = callChatCompletion.mock.calls[0][0];
    expect(tools.map((t) => t.function.name)).toEqual(['read_active_doc']);
  });

  it('白名单为空时不带 tools 字段', async () => {
    callChatCompletion.mockResolvedValueOnce({ content: '好的', tool_calls: [] });
    await runAgent({ userInput: '聊聊', config: {}, host: makeHost(), allowedTools: [] });
    expect(callChatCompletion.mock.calls[0][0].tools).toBeUndefined();
  });

  it('模型调用未声明的工具会被拒绝，拒绝结果回填给模型，host 不被调用', async () => {
    callChatCompletion
      .mockResolvedValueOnce({ content: '', tool_calls: [toolCall('1', 'write_active_doc', { content: 'x' })] })
      .mockResolvedValueOnce({ content: '完成', tool_calls: [] });
    const host = makeHost();
    const { history } = await runAgent({ userInput: '标题', config: {}, host, allowedTools: ['read_active_doc'] });
    expect(host.writeActiveDoc).not.toHaveBeenCalled();
    const toolMessage = history.find((m) => m.role === 'tool');
    expect(toolMessage.content).toMatch(/^拒绝：当前技能没有声明工具「write_active_doc」/);
  });

  it('普通对话（不传白名单）照常执行所有工具', async () => {
    callChatCompletion
      .mockResolvedValueOnce({ content: '', tool_calls: [toolCall('1', 'write_active_doc', { content: 'x' })] })
      .mockResolvedValueOnce({ content: '完成', tool_calls: [] });
    const host = makeHost();
    await runAgent({ userInput: '改一下', config: {}, host });
    expect(host.writeActiveDoc).toHaveBeenCalledWith('x');
  });
});
