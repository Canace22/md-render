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
  it('uses obsidian clipping frontmatter and keeps the body markdown', () => {
    const markdown = buildBookmarkClipMarkdown({
      title: 'MD Render',
      sourceUrl: 'https://example.com/post',
      author: 'Canace',
      publishedAt: '2026-06-07',
      createdAt: '2026-06-07',
      description: '一段摘要',
      tags: ['frontend'],
      bodyMarkdown: '## 正文\n\n内容段落',
    });

    expect(markdown).toContain('---');
    expect(markdown).toContain('title: "MD Render"');
    expect(markdown).toContain('source: https://example.com/post');
    expect(markdown).toContain('author: Canace');
    expect(markdown).toContain('published: 2026-06-07');
    expect(markdown).toContain('created: 2026-06-07');
    expect(markdown).toContain('tags:');
    expect(markdown).toContain('  - clippings');
    expect(markdown).toContain('  - frontend');
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
    expect(clip.tags).toEqual(['clippings', 'frontend']);
    expect(clip.markdown).toContain('正文抓取失败');
  });
});
