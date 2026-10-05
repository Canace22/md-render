import { describe, expect, it, vi } from 'vitest';
import {
  createAttachmentId,
  extractAgentAttachment,
  isSupportedAgentAttachment,
} from '../renderer/src/core/agent/agentAttachments.js';
import {
  createUrlAttachment,
  extractPublicUrls,
  resolveUrlAttachment,
} from '../renderer/src/core/agent/urlAttachments.js';

const file = (name, content = '内容', type = 'text/plain') => ({
  name,
  type,
  size: content.length,
  lastModified: 1,
  text: vi.fn().mockResolvedValue(content),
  arrayBuffer: vi.fn().mockResolvedValue(new TextEncoder().encode(content).buffer),
});

describe('agent attachments', () => {
  it('识别支持与不支持的扩展名', () => {
    expect(isSupportedAgentAttachment(file('a.pdf'))).toBe(true);
    expect(isSupportedAgentAttachment(file('a.exe'))).toBe(false);
  });

  it('文本附件直接读取，id 稳定', async () => {
    const input = file('a.md', '# 标题');
    const result = await extractAgentAttachment(input);
    expect(result.content).toBe('# 标题');
    expect(result.id).toBe(createAttachmentId(input));
  });

  it('PDF 交给注入的提取器', async () => {
    const extractPdfText = vi.fn().mockResolvedValue('PDF 正文');
    const result = await extractAgentAttachment(file('a.pdf', 'pdf', 'application/pdf'), { extractPdfText });
    expect(extractPdfText).toHaveBeenCalledOnce();
    expect(result.content).toBe('PDF 正文');
  });

  it('图片附件明确标记不可猜测', async () => {
    const result = await extractAgentAttachment(file('a.png', 'png', 'image/png'));
    expect(result.imageUnavailable).toBe(true);
    expect(result.content).toContain('请不要猜测');
  });
});

describe('url attachments', () => {
  it('去重、去结尾标点并限制数量', () => {
    const urls = extractPublicUrls('https://a.com/x。 https://a.com/x https://b.com/y');
    expect(urls).toEqual(['https://a.com/x', 'https://b.com/y']);
  });

  it('保留 URL 内成对括号，去掉 Markdown 包裹括号', () => {
    expect(extractPublicUrls('(https://example.com/wiki/Foo_(bar))')).toEqual([
      'https://example.com/wiki/Foo_(bar)',
    ]);
  });

  it('成功结果包含标题、链接和正文', () => {
    const pending = createUrlAttachment('https://a.com');
    const ready = resolveUrlAttachment(pending, {
      ok: true,
      title: '文章',
      url: 'https://a.com/final',
      content: '正文',
    });
    expect(ready).toMatchObject({ status: 'ready', name: '文章', url: 'https://a.com/final' });
    expect(ready.content).toContain('正文');
  });

  it('失败结果保留链接并标红所需状态', () => {
    const failed = resolveUrlAttachment(createUrlAttachment('https://a.com'), { ok: false, error: '404' });
    expect(failed).toMatchObject({ status: 'error', error: '404' });
  });
});
