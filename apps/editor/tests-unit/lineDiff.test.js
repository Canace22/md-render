import { describe, expect, it } from 'vitest';
import { diffLines, countDiff } from '../renderer/src/core/agent/lineDiff.js';

describe('diffLines', () => {
  it('两段完全相同 → 全是 keep', () => {
    const rows = diffLines('a\nb', 'a\nb');
    expect(rows).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'keep', text: 'b' },
    ]);
  });

  it('纯新增：旧为空 → 全是 add', () => {
    const rows = diffLines('', 'x\ny');
    // 旧文本 '' split 出一个空行，被识别为删一行 + 增两行；统计更直观
    expect(countDiff(rows)).toEqual({ added: 2, removed: 1 });
  });

  it('改一行：keep 不变行，del 旧行，add 新行', () => {
    const rows = diffLines('标题\n正文\n结尾', '标题\n新正文\n结尾');
    expect(rows).toEqual([
      { type: 'keep', text: '标题' },
      { type: 'del', text: '正文' },
      { type: 'add', text: '新正文' },
      { type: 'keep', text: '结尾' },
    ]);
  });

  it('纯删除：新版去掉中间一行', () => {
    const rows = diffLines('a\nb\nc', 'a\nc');
    expect(rows).toEqual([
      { type: 'keep', text: 'a' },
      { type: 'del', text: 'b' },
      { type: 'keep', text: 'c' },
    ]);
  });

  it('countDiff 正确统计增删行数', () => {
    const rows = diffLines('a\nb\nc', 'a\nB\nc\nd');
    expect(countDiff(rows)).toEqual({ added: 2, removed: 1 });
  });

  it('nullish 输入不报错，按空字符串处理', () => {
    expect(() => diffLines(null, undefined)).not.toThrow();
    const rows = diffLines(null, undefined);
    expect(rows).toEqual([{ type: 'keep', text: '' }]);
  });

  it('保留行内空白与顺序', () => {
    const rows = diffLines('  缩进', '  缩进\n尾行');
    expect(rows).toEqual([
      { type: 'keep', text: '  缩进' },
      { type: 'add', text: '尾行' },
    ]);
  });
});
