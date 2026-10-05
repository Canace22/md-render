import { describe, expect, it } from 'vitest';
import {
  appendInspirationEntry,
  buildInspirationEntry,
} from '../renderer/src/core/agent/inspirationNote.js';
import {
  parseBlockNoteContent,
  serializeBlockNoteContent,
} from '../renderer/src/utils/markdownUtils.js';

describe('inspiration note', () => {
  it('拒绝空内容', () => {
    expect(() => buildInspirationEntry({ text: '  ' })).toThrow('没有可记录');
  });

  it('去重来源并生成标题', () => {
    expect(buildInspirationEntry({
      text: '点子',
      title: '会话',
      dateKey: '2026-10-05',
      sources: ['文档 A', '文档 A', '链接 B'],
    })).toMatchObject({
      heading: '2026-10-05 · 会话',
      sourceLine: '来源：文档 A / 链接 B',
    });
  });

  it('空文档生成固定的灵感笔记', () => {
    const content = appendInspirationEntry('', {
      text: '第一个点子', title: '新会话', dateKey: '2026-10-05',
    });
    expect(content).toContain('# 灵感');
    expect(content).toContain('## 2026-10-05 · 新会话');
    expect(content).toContain('> 第一个点子');
  });

  it('能追加到 BlockNote 内容且保留原 block', () => {
    const before = serializeBlockNoteContent([{ id: 'old', type: 'paragraph', content: '旧内容' }]);
    const after = appendInspirationEntry(before, {
      text: '新点子', title: '会话', dateKey: '2026-10-05',
    });
    const blocks = parseBlockNoteContent(after);
    expect(blocks[0].id).toBe('old');
    expect(blocks.slice(-3).map((block) => block.type)).toEqual(['heading', 'quote', 'paragraph']);
  });
});
