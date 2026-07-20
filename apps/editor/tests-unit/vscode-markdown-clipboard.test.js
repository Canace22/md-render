import { describe, it, expect } from 'vitest';
import {
  isVsCodeMarkdownClipboard,
  normalizeFrontmatterForPaste,
} from '../renderer/src/utils/markdownUtils.js';

const clipboard = (data) => ({ getData: (type) => data[type] ?? '' });

describe('isVsCodeMarkdownClipboard', () => {
  it('识别 VS Code 的 markdown 源码复制', () => {
    const cd = clipboard({
      'vscode-editor-data': JSON.stringify({ version: 1, mode: 'markdown' }),
      'text/plain': '# 标题\n\n正文',
    });
    expect(isVsCodeMarkdownClipboard(cd)).toBe(true);
  });

  it('mdx 同样按 markdown 处理', () => {
    const cd = clipboard({ 'vscode-editor-data': '{"mode":"mdx"}' });
    expect(isVsCodeMarkdownClipboard(cd)).toBe(true);
  });

  it('非 markdown 语言（如 js）不按 markdown 解析', () => {
    const cd = clipboard({ 'vscode-editor-data': '{"mode":"javascript"}' });
    expect(isVsCodeMarkdownClipboard(cd)).toBe(false);
  });

  it('没有 vscode-editor-data 时返回 false', () => {
    expect(isVsCodeMarkdownClipboard(clipboard({ 'text/plain': '# 标题' }))).toBe(false);
    expect(isVsCodeMarkdownClipboard(null)).toBe(false);
  });

  it('vscode-editor-data 不是合法 JSON 时不抛错', () => {
    const cd = clipboard({ 'vscode-editor-data': 'not-json' });
    expect(isVsCodeMarkdownClipboard(cd)).toBe(false);
  });
});

describe('normalizeFrontmatterForPaste', () => {
  it('title 变 H1，其余字段合并成引用块', () => {
    const md = [
      '---',
      'title: 我的文章',
      'author: Canace',
      'categories: AI工程化',
      'tags: AI编程',
      '---',
      '',
      '最近在一个技术群里。',
      '',
      '## 小标题',
    ].join('\n');
    expect(normalizeFrontmatterForPaste(md)).toBe([
      '# 我的文章',
      '',
      '> 作者：Canace  ',
      '> 分类：AI工程化  ',
      '> 标签：AI编程',
      '',
      '最近在一个技术群里。',
      '',
      '## 小标题',
    ].join('\n'));
  });

  it('comments / toc 这类站点配置字段不进正文', () => {
    const md = '---\ntitle: A\ncomments: true\ntoc: true\n---\n\n正文';
    expect(normalizeFrontmatterForPaste(md)).toBe('# A\n\n正文');
  });

  it('没有 frontmatter 时原样返回', () => {
    expect(normalizeFrontmatterForPaste('# 标题\n\n正文')).toBe('# 标题\n\n正文');
  });

  it('正文中间的 --- 分隔线不受影响', () => {
    const md = '# 标题\n\n上半段\n\n---\n\n下半段';
    expect(normalizeFrontmatterForPaste(md)).toBe(md);
  });

  it('只处理第一段 frontmatter，正文里的 --- 保留', () => {
    const md = '---\ntitle: A\n---\n\n正文\n\n---\n\n尾巴';
    expect(normalizeFrontmatterForPaste(md)).toBe('# A\n\n正文\n\n---\n\n尾巴');
  });

  it('空输入不抛错', () => {
    expect(normalizeFrontmatterForPaste('')).toBe('');
    expect(normalizeFrontmatterForPaste(null)).toBe('');
  });
});
