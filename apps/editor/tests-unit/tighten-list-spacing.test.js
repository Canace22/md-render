import { describe, expect, it } from 'vitest';
import { tightenListSpacing } from '../renderer/src/utils/markdownUtils.js';

describe('tightenListSpacing（复制 Markdown 时列表变紧凑）', () => {
  it('列表项之间的空行去掉，嵌套缩进保留', () => {
    expect(tightenListSpacing('* a\n\n  * a1\n\n* b\n\n1. one\n\n2. two'))
      .toBe('* a\n  * a1\n* b\n1. one\n2. two');
  });

  it('列表和标题 / 段落之间的空行保留', () => {
    const md = '# 标题\n\n* a\n\n* b\n\n结尾段落';
    expect(tightenListSpacing(md)).toBe('# 标题\n\n* a\n* b\n\n结尾段落');
  });

  it('多段落列表项不动', () => {
    const md = '* a\n\n  补充说明\n\n* b';
    expect(tightenListSpacing(md)).toBe(md);
  });

  it('代码块里的空行不动', () => {
    const md = '```\n- x\n\n- y\n```';
    expect(tightenListSpacing(md)).toBe(md);
  });
});
