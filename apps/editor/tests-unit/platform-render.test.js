import { describe, expect, it, vi } from 'vitest';

// convertToWeChatHTML 依赖 DOM；这里只验证渲染链路的输入输出
vi.mock('../renderer/src/utils/wechatCopy.js', () => ({
  convertToWeChatHTML: vi.fn((html, templateId) => `<section data-template="${templateId}">${html}</section>`),
}));

import { MAX_PLATFORM_HTML_CHARS, renderPlatformHtml } from '../renderer/src/utils/platformRender.js';

describe('renderPlatformHtml', () => {
  it('去掉 frontmatter，Markdown 渲染后交给公众号排版', () => {
    const result = renderPlatformHtml('---\ntitle: 测试\n---\n\n# 标题\n\n正文', 'infoq');
    expect(result.ok).toBe(true);
    expect(result.html).toContain('data-template="infoq"');
    expect(result.html).toContain('标题');
    expect(result.html).not.toContain('title: 测试');
  });

  it('模板不存在、正文为空时报错', () => {
    expect(renderPlatformHtml('# a', 'nope')).toMatchObject({ ok: false });
    expect(renderPlatformHtml('---\ntitle: x\n---\n', 'default')).toMatchObject({ ok: false, error: '文档正文为空。' });
  });

  it('超长结果截断并标记', () => {
    const result = renderPlatformHtml(`# 长文\n\n${'字'.repeat(MAX_PLATFORM_HTML_CHARS)}`);
    expect(result.truncated).toBe(true);
    expect(result.html.length).toBe(MAX_PLATFORM_HTML_CHARS);
  });
});
