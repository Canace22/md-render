import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../main/aiRequest.js', () => ({
  requestChatCompletion: vi.fn(),
  requestChatCompletionStream: vi.fn(),
  requestAttachmentText: vi.fn(),
  requestKnowledgeSearch: vi.fn(),
  requestProviders: vi.fn(),
  requestToolExec: vi.fn(),
  requestToolSchema: vi.fn(),
  requestUrlRead: vi.fn(),
}));

import { requestAttachmentText, requestUrlRead } from '../main/aiRequest.js';
import { registerAiHandlers } from '../main/ipc/aiHandlers.js';

const registerHandlers = () => {
  const handlers = new Map();
  const ipcMain = {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
  const resolveAiProxyBase = vi.fn(() => 'https://proxy.example');
  registerAiHandlers({ ipcMain, resolveAiProxyBase });
  return { handlers, resolveAiProxyBase };
};

beforeEach(() => {
  vi.clearAllMocks();
  requestUrlRead.mockReset();
  requestAttachmentText.mockReset();
});

describe('ai:extractAttachmentText IPC', () => {
  it('解析代理地址后转发 PDF 内容', async () => {
    requestAttachmentText.mockResolvedValue({ ok: true, content: 'PDF 正文' });
    const { handlers } = registerHandlers();

    await expect(handlers.get('ai:extractAttachmentText')(null, { base64: 'JVBERi0=' }))
      .resolves.toEqual({ ok: true, content: 'PDF 正文' });
    expect(requestAttachmentText).toHaveBeenCalledWith({
      base64: 'JVBERi0=',
      aiProxyBase: 'https://proxy.example',
    });
  });
});

describe('ai:readUrl IPC', () => {
  it('解析代理地址后转发给 ai-proxy request', async () => {
    requestUrlRead.mockResolvedValue({
      ok: true,
      title: '标题',
      url: 'https://example.com/article',
      content: '正文',
    });
    const { handlers, resolveAiProxyBase } = registerHandlers();

    const result = await handlers.get('ai:readUrl')(null, {
      url: 'https://example.com/article',
      aiProxyBase: 'http://renderer-setting',
    });

    expect(resolveAiProxyBase).toHaveBeenCalledWith('http://renderer-setting');
    expect(requestUrlRead).toHaveBeenCalledWith({
      url: 'https://example.com/article',
      aiProxyBase: 'https://proxy.example',
    });
    expect(result).toMatchObject({ ok: true, title: '标题' });
  });

  it('代理失败时返回结构化错误', async () => {
    requestUrlRead.mockRejectedValue(new Error('公开网页读取失败'));
    const { handlers } = registerHandlers();

    await expect(handlers.get('ai:readUrl')(null, { url: 'https://example.com' }))
      .resolves.toEqual({ ok: false, error: '公开网页读取失败' });
  });
});
