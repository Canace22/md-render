import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import DocMetaPanel from '../renderer/src/components/DocMetaPanel.jsx';

const renderPanel = (frontmatter) => renderToStaticMarkup(
  <DocMetaPanel selectedFile={{ id: 'file:a.md', name: 'a.md', frontmatter, tags: [] }} />,
);
const pick = (html, attr) => [...html.matchAll(new RegExp(`${attr}="(\\w+)"`, 'g'))].map((m) => m[1]);

describe('DocMetaPanel 分组', () => {
  it('空文档只显示常驻字段', () => {
    const html = renderPanel({});
    expect(pick(html, 'data-property')).toEqual(['status', 'tags']);
    expect(pick(html, 'data-group')).toEqual(['basic']);
  });

  it('有值的字段按组显示，非常驻字段可移除', () => {
    const html = renderPanel({ author: 'A', platforms: ['wechat'], rating: 5 });
    expect(pick(html, 'data-group')).toEqual(['basic', 'source', 'publish', 'other']);
    expect(pick(html, 'data-property')).toEqual(['status', 'tags', 'author', 'platforms', 'rating']);
    expect(html.match(/移除/g)).toHaveLength(3);
  });
});
