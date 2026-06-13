import { describe, it, expect } from 'vitest';
import { blocksToMarkdown, markdownToNotionPayload } from '../renderer/src/utils/notionConverter.js';

// 辅助函数：构造 Notion 块
const mkBlock = (type, data, children) => ({
  type,
  ...data,
  has_children: Boolean(children?.length),
  _children: children ?? [],
});

const mkRichText = (text) => [{ plain_text: text, annotations: {} }];

describe('blocksToMarkdown - 新增块类型', () => {
  // Case 1: child_page 基本转换
  it('应正确转换 child_page 块', () => {
    const blocks = [mkBlock('child_page', { child_page: { title: 'AI 助理' } })];
    expect(blocksToMarkdown(blocks)).toBe('- 📄 AI 助理');
  });

  // Case 2: 多个 child_page
  it('应正确转换多个 child_page 块', () => {
    const blocks = [
      mkBlock('child_page', { child_page: { title: '缺陷巡检' } }),
      mkBlock('child_page', { child_page: { title: '困境说' } }),
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('- 📄 缺陷巡检');
    expect(md).toContain('- 📄 困境说');
  });

  // Case 3: child_page 无标题
  it('child_page 无标题时使用默认值', () => {
    const blocks = [mkBlock('child_page', { child_page: {} })];
    expect(blocksToMarkdown(blocks)).toBe('- 📄 无标题');
  });

  // Case 4: child_database
  it('应正确转换 child_database 块', () => {
    const blocks = [mkBlock('child_database', { child_database: { title: '任务库' } })];
    expect(blocksToMarkdown(blocks)).toBe('- 📊 任务库');
  });

  // Case 5: equation 块
  it('应正确转换 equation 块', () => {
    const blocks = [mkBlock('equation', { equation: { expression: 'E = mc^2' } })];
    expect(blocksToMarkdown(blocks)).toBe('$$E = mc^2$$');
  });

  // Case 6: embed 块
  it('应正确转换 embed 块', () => {
    const blocks = [mkBlock('embed', { embed: { url: 'https://example.com' } })];
    expect(blocksToMarkdown(blocks)).toBe('[嵌入](https://example.com)');
  });

  // Case 7: synced_block 渲染子内容
  it('synced_block 应渲染其子内容', () => {
    const child = mkBlock('paragraph', { paragraph: { rich_text: mkRichText('同步内容') } });
    const blocks = [mkBlock('synced_block', {}, [child])];
    expect(blocksToMarkdown(blocks)).toContain('同步内容');
  });

  // Case 8: file 块
  it('应正确转换 file 块', () => {
    const blocks = [
      mkBlock('file', { file: { file: { url: 'https://s3.example.com/doc.pdf' }, caption: [] } }),
    ];
    expect(blocksToMarkdown(blocks)).toBe('[文件](https://s3.example.com/doc.pdf)');
  });

  // Case 9: pdf 块
  it('应正确转换 pdf 块', () => {
    const blocks = [
      mkBlock('pdf', { pdf: { external: { url: 'https://example.com/report.pdf' } } }),
    ];
    expect(blocksToMarkdown(blocks)).toBe('[PDF](https://example.com/report.pdf)');
  });

  // Case 10: 混合块类型（paragraph + child_page + heading）
  it('混合块类型应正确转换', () => {
    const blocks = [
      mkBlock('heading_1', { heading_1: { rich_text: mkRichText('笔记本') } }),
      mkBlock('child_page', { child_page: { title: 'AI 助理' } }),
      mkBlock('child_page', { child_page: { title: '缺陷巡检' } }),
      mkBlock('paragraph', { paragraph: { rich_text: mkRichText('这是普通段落') } }),
    ];
    const md = blocksToMarkdown(blocks);
    expect(md).toContain('# 笔记本');
    expect(md).toContain('- 📄 AI 助理');
    expect(md).toContain('- 📄 缺陷巡检');
    expect(md).toContain('这是普通段落');
  });
});

describe('markdownToNotionPayload - 目录 + 元数据', () => {
  const SAMPLE = [
    '---',
    'title: 我的文章',
    'author: 张三',
    'published: 2026-06-13',
    'tags:',
    '  - 技术',
    '  - Notion',
    'source: https://example.com/post',
    'description: 一段摘要',
    '---',
    '# 正文标题',
    '正文内容。',
  ].join('\n');

  // Case 1: 默认在最前面插入 TOC 块
  it('默认应插入目录块作为首个块', () => {
    const { blocks } = markdownToNotionPayload(SAMPLE);
    expect(blocks[0].type).toBe('table_of_contents');
  });

  // Case 2: withToc=false 时不插入目录块
  it('withToc=false 时不应有目录块', () => {
    const { blocks } = markdownToNotionPayload(SAMPLE, { withToc: false });
    expect(blocks.some((b) => b.type === 'table_of_contents')).toBe(false);
  });

  // Case 3: 元数据 callout 含各字段
  it('应生成含元数据的 callout 块', () => {
    const { blocks } = markdownToNotionPayload(SAMPLE);
    const callout = blocks.find((b) => b.type === 'callout');
    expect(callout).toBeTruthy();
    const text = callout.callout.rich_text[0].text.content;
    expect(text).toContain('作者：张三');
    expect(text).toContain('标签：技术、Notion');
    expect(text).toContain('来源：https://example.com/post');
  });

  // Case 4: properties 映射类型正确
  it('应把 frontmatter 映射为 properties', () => {
    const { properties, title } = markdownToNotionPayload(SAMPLE);
    expect(title).toBe('我的文章');
    expect(properties.Tags.multi_select.map((t) => t.name)).toEqual(['技术', 'Notion']);
    expect(properties.Source.url).toBe('https://example.com/post');
    expect(properties.Published.date.start).toBe('2026-06-13');
    expect(properties.Author.rich_text[0].text.content).toBe('张三');
  });

  // Case 5: 正文块在元数据之后，且 frontmatter 已剥离
  it('正文块应跟在元数据后，且不含 frontmatter', () => {
    const { blocks } = markdownToNotionPayload(SAMPLE);
    const heading = blocks.find((b) => b.type === 'heading_1');
    expect(heading.heading_1.rich_text[0].text.content).toBe('正文标题');
    const dividerIdx = blocks.findIndex((b) => b.type === 'divider');
    expect(dividerIdx).toBe(-1);
  });

  // Case 6: 无 frontmatter 时仅 TOC + 正文，无 callout、无 properties
  it('无 frontmatter 时不生成 callout 和 properties', () => {
    const { blocks, properties, title } = markdownToNotionPayload('# 只有正文\n内容');
    expect(blocks.some((b) => b.type === 'callout')).toBe(false);
    expect(Object.keys(properties)).toHaveLength(0);
    expect(title).toBeNull();
  });

  // Case 7: 空输入安全返回
  it('空输入应返回只含目录块的负载', () => {
    const { blocks, properties } = markdownToNotionPayload('');
    expect(blocks).toEqual([{ type: 'table_of_contents', table_of_contents: {} }]);
    expect(properties).toEqual({});
  });
});
