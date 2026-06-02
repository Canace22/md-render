import { describe, it, expect } from 'vitest';
import { blocksToMarkdown } from './notionConverter.js';

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
