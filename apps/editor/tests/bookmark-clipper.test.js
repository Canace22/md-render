import { describe, expect, it } from 'vitest';
import {
  buildBookmarkClipMarkdown,
  buildFallbackBookmarkClip,
  sanitizeBookmarkFileStem,
} from '../renderer/src/utils/bookmarkClipper.js';

describe('sanitizeBookmarkFileStem', () => {
  it('strips filesystem-invalid characters and trailing dots', () => {
    expect(sanitizeBookmarkFileStem('  React: Hooks / 入门...  ')).toBe('React_ Hooks _ 入门');
  });

  it('falls back when input is empty', () => {
    expect(sanitizeBookmarkFileStem('')).toBe('未命名书签');
  });
});

describe('buildBookmarkClipMarkdown', () => {
  it('includes source metadata and body markdown', () => {
    const markdown = buildBookmarkClipMarkdown({
      title: 'MD Render',
      sourceUrl: 'https://example.com/post',
      author: 'Canace',
      publishedAt: '2026-06-07',
      description: '一段摘要',
      bodyMarkdown: '## 正文\n\n内容段落',
    });

    expect(markdown).toContain('# MD Render');
    expect(markdown).toContain('> 来源：[https://example.com/post](https://example.com/post)');
    expect(markdown).toContain('> 作者：Canace');
    expect(markdown).toContain('## 正文');
  });
});

describe('buildFallbackBookmarkClip', () => {
  it('keeps source url and fallback note when clipping fails', () => {
    const clip = buildFallbackBookmarkClip({
      title: 'React',
      url: 'https://react.dev',
      tags: ['frontend', 'frontend'],
    }, '正文抓取失败');

    expect(clip.url).toBe('https://react.dev');
    expect(clip.tags).toEqual(['frontend']);
    expect(clip.markdown).toContain('正文抓取失败');
  });
});
