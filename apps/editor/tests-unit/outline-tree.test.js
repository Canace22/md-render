import { describe, expect, it } from 'vitest';
import {
  blocksToMindTree,
  countDescendants,
  isOutlinePage,
  withTitleHeading,
} from '../shared/outline/outlineTree.js';
import { createDailyTemplate } from '../shared/daily/dailyBlocks.js';

const text = (value) => [{ type: 'text', text: value, styles: {} }];
const block = (id, type, value, extra = {}) => ({
  id, type, props: extra.props ?? {}, content: value == null ? undefined : text(value), children: extra.children ?? [],
});

const shape = (node) => ({ text: node.text, children: node.children.map(shape) });

describe('outlineTree', () => {
  it('嵌套列表按 children 组成子树，根是页面标题', () => {
    const tree = blocksToMindTree([
      block('a', 'bulletListItem', 'A', { children: [block('a1', 'bulletListItem', 'A1')] }),
      block('b', 'bulletListItem', 'B'),
    ], '我的大纲');
    expect(shape(tree)).toEqual({
      text: '我的大纲',
      children: [{ text: 'A', children: [{ text: 'A1', children: [] }] }, { text: 'B', children: [] }],
    });
  });

  it('标题收下后面的平级块，遇到同级标题结束（今日速记的分区）', () => {
    const tree = blocksToMindTree([
      block('h1', 'heading', '今日任务', { props: { level: 2 } }),
      block('t1', 'checkListItem', '修 bug', { props: { checked: true } }),
      block('h2', 'heading', '笔记', { props: { level: 2 } }),
      block('h3', 'heading', '小节', { props: { level: 3 } }),
      block('n1', 'bulletListItem', '内容'),
    ], '10 月 9 日');
    expect(shape(tree).children).toEqual([
      { text: '今日任务', children: [{ text: '修 bug', children: [] }] },
      { text: '笔记', children: [{ text: '小节', children: [{ text: '内容', children: [] }] }] },
    ]);
    expect(tree.children[0].children[0]).toMatchObject({ kind: 'task', checked: true });
  });

  it('空行和分割线跳过，图片保留地址', () => {
    const tree = blocksToMindTree([
      block('e', 'paragraph', ''),
      block('d', 'divider', null),
      block('img', 'image', null, { props: { url: 'local-media://a.png' } }),
    ], '');
    expect(tree.text).toBe('未命名');
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ kind: 'image', imageUrl: 'local-media://a.png' });
  });

  it('速记空模板：只剩三个分区标题', () => {
    const tree = blocksToMindTree(createDailyTemplate(), '今天');
    expect(tree.children.map((n) => n.children.length)).toEqual([0, 0, 0]);
  });

  it('countDescendants 统计所有子孙', () => {
    const tree = blocksToMindTree([
      block('a', 'bulletListItem', 'A', { children: [block('a1', 'bulletListItem', 'A1', { children: [block('x', 'paragraph', 'x')] })] }),
    ], 'r');
    expect(countDescendants(tree)).toBe(3);
  });

  it('isOutlinePage 只认 frontmatter layout: outline', () => {
    expect(isOutlinePage({ frontmatter: { layout: 'outline' } })).toBe(true);
    expect(isOutlinePage({ frontmatter: { layout: 'document' } })).toBe(false);
    expect(isOutlinePage({})).toBe(false);
  });

  it('withTitleHeading：标题放第一行，正文首尾空白收掉', () => {
    expect(withTitleHeading('周会', '\n* 议题\n  * 细节\n\n')).toBe('# 周会\n\n* 议题\n  * 细节\n');
  });

  it('withTitleHeading：没标题只给正文，没正文返回空串', () => {
    expect(withTitleHeading('', '* a')).toBe('* a\n');
    expect(withTitleHeading('周会', '  \n')).toBe('');
  });

  it('withTitleHeading：正文已有一级标题时不重复加', () => {
    expect(withTitleHeading('周会', '# 周会纪要\n\n正文')).toBe('# 周会纪要\n\n正文\n');
  });
});
