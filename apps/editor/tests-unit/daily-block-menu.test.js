import { describe, expect, it } from 'vitest';
import {
  BLOCK_TYPE_OPTIONS,
  getBlockIcon,
  getBlockTypeUpdate,
  getTodoToggleUpdate,
  hasStyleOnAll,
  isBlockTypeActive,
  setLeadingIcon,
  toggleStyleOnContent,
} from '../renderer/src/utils/dailyBlockMenu.js';

const text = (value, styles = {}) => ({ type: 'text', text: value, styles });
const [H1, , , TEXT] = BLOCK_TYPE_OPTIONS;

describe('速记块菜单', () => {
  it('待办 ↔ 普通条目', () => {
    expect(getTodoToggleUpdate({ type: 'bulletListItem' })).toEqual({ type: 'checkListItem', props: { checked: false } });
    expect(getTodoToggleUpdate({ type: 'checkListItem', props: { checked: true } })).toEqual({ type: 'bulletListItem' });
  });

  it('标题/正文：待办算正文，点正文不会冲掉待办', () => {
    const todo = { type: 'checkListItem', props: {} };
    expect(isBlockTypeActive(todo, TEXT)).toBe(true);
    expect(getBlockTypeUpdate(todo, TEXT)).toBeNull();
    expect(getBlockTypeUpdate(todo, H1)).toEqual({ type: 'heading', props: { level: 1 } });
    expect(getBlockTypeUpdate({ type: 'heading', props: { level: 1 } }, H1)).toBeNull();
    expect(getBlockTypeUpdate({ type: 'heading', props: { level: 2 } }, TEXT)).toEqual({ type: 'bulletListItem' });
  });

  it('整行加粗：部分有→全加；全有→全去；链接里的文字也算', () => {
    const content = [text('a', { bold: true }), { type: 'link', href: 'x', content: [text('b')] }];
    const bolded = toggleStyleOnContent(content, 'bold');
    expect(hasStyleOnAll(bolded, 'bold')).toBe(true);
    expect(bolded[1].content[0].styles).toEqual({ bold: true });
    const cleared = toggleStyleOnContent(bolded, 'bold');
    expect(hasStyleOnAll(cleared, 'bold')).toBe(false);
    expect(cleared[0].styles).toEqual({});
    expect(hasStyleOnAll([], 'bold')).toBe(false);
  });

  it('行首图标：添加、替换、去掉', () => {
    const added = setLeadingIcon([text('写周报')], '📌');
    expect(added[0].text).toBe('📌 写周报');
    expect(getBlockIcon(added)).toBe('📌');
    const replaced = setLeadingIcon(added, '🔥');
    expect(replaced[0].text).toBe('🔥 写周报');
    expect(setLeadingIcon(replaced, '')[0].text).toBe('写周报');
  });

  it('行首图标：空行 / 开头是链接时插一段文字', () => {
    expect(setLeadingIcon([], '⭐')).toEqual([text('⭐ ')]);
    const link = { type: 'link', href: 'x', content: [text('b')] };
    expect(setLeadingIcon([link], '⭐')).toEqual([text('⭐ '), link]);
    expect(setLeadingIcon([text('⭐ ')], '')).toEqual([]);
  });
});
