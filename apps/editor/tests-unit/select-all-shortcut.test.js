import { describe, expect, it } from 'vitest';
import { isOtherBlockNoteTarget, shouldSelectFullDocument } from '../renderer/src/hooks/useTwoStageSelectAll.js';

const idle = { fullSelectionActive: false };
const full = { fullSelectionActive: true };

describe('Cmd/Ctrl+A：单按选当前块，长按才全选', () => {
  it('单按（非重复）：只选当前块', () => {
    expect(shouldSelectFullDocument(idle, false)).toBe(false);
  });

  it('连续单按多次：每次都只选当前块，不会升级为全文', () => {
    // 单按不会写入 fullSelectionActive，状态始终为 idle
    expect(shouldSelectFullDocument(idle, false)).toBe(false);
    expect(shouldSelectFullDocument(idle, false)).toBe(false);
  });

  it('长按（系统按键重复）：升级为全文', () => {
    expect(shouldSelectFullDocument(idle, true)).toBe(true);
  });

  it('已是全文选区：松手后再单按保持全文', () => {
    expect(shouldSelectFullDocument(full, false)).toBe(true);
  });
});

// 只用到 closest / contains，不依赖 DOM 环境
const makeTarget = (inBlockNote) => ({ closest: () => (inBlockNote ? {} : null) });
const makeEditorDom = (...children) => ({ contains: (node) => children.includes(node) });

describe('多个 BlockNote 编辑器共存（主编辑器 + 今日速记）', () => {
  it('焦点在别的编辑器里：交给那个编辑器处理', () => {
    const dailyTarget = makeTarget(true);
    expect(isOtherBlockNoteTarget(dailyTarget, makeEditorDom())).toBe(true);
  });

  it('本编辑器已卸载（domElement 为空）：同样不插手', () => {
    expect(isOtherBlockNoteTarget(makeTarget(true), undefined)).toBe(true);
  });

  it('焦点就在本编辑器里：自己处理', () => {
    const target = makeTarget(true);
    expect(isOtherBlockNoteTarget(target, makeEditorDom(target))).toBe(false);
  });

  it('焦点在普通输入框：不算别的编辑器', () => {
    expect(isOtherBlockNoteTarget(makeTarget(false), makeEditorDom())).toBe(false);
  });
});
