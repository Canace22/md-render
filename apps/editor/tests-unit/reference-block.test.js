import { describe, expect, it } from 'vitest';
import { appendReferenceToContent } from '../renderer/src/core/agent/referenceBlock.js';
import { parseBlockNoteContent, serializeBlockNoteContent } from '../renderer/src/utils/markdownUtils.js';

describe('appendReferenceToContent', () => {
  it('Markdown 正文：末尾追加引用块', () => {
    expect(appendReferenceToContent('正文\n\n', { title: '旧文', snippet: '第一行\n第二行' }))
      .toBe('正文\n\n> 参考：旧文\n>\n> 第一行\n> 第二行\n');
  });

  it('空正文 / 没摘要 / 没标题', () => {
    expect(appendReferenceToContent('', { title: '旧文' })).toBe('> 参考：旧文\n');
    expect(appendReferenceToContent(null, {})).toBe('> 参考：未命名\n');
  });

  it('BlockNote 正文：追加 quote 块，仍是合法 BlockNote 内容', () => {
    const content = serializeBlockNoteContent([{ type: 'paragraph', content: '正文' }]);
    const blocks = parseBlockNoteContent(appendReferenceToContent(content, { title: '旧文', snippet: '摘要' }));
    expect(blocks).toHaveLength(2);
    expect(blocks[1]).toEqual({ type: 'quote', content: '参考：旧文\n摘要' });
  });
});
