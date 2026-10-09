import { describe, expect, it, vi } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import { handleLeadingEmptyBlockBackspace } from '../renderer/src/utils/leadingEmptyBlock.js';

const para = (text = '') => ({ type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [] });
const heading = (text) => ({ type: 'heading', props: { level: 2 }, content: [{ type: 'text', text, styles: {} }] });

const setup = (blocks, cursorIndex = 0) => {
  const editor = BlockNoteEditor.create({ initialContent: blocks });
  editor.setTextCursorPosition(editor.document[cursorIndex], 'start');
  return editor;
};
const backspace = (extra = {}) => ({ key: 'Backspace', preventDefault: vi.fn(), ...extra });

describe('首行空块 Backspace', () => {
  it('首行空段落 + 后面有标题：删除空行，光标到标题开头', () => {
    const editor = setup([para(), heading('故事内核四格'), para('正文')]);
    const event = backspace();
    expect(handleLeadingEmptyBlockBackspace(editor, event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(editor.document[0].type).toBe('heading');
    expect(editor.getTextCursorPosition().block.id).toBe(editor.document[0].id);
  });

  it('首行有文字：不处理', () => {
    const editor = setup([para('abc'), para('x')]);
    expect(handleLeadingEmptyBlockBackspace(editor, backspace())).toBe(false);
    expect(editor.document).toHaveLength(2);
  });

  it('文档只剩一个空块：不处理（保留空文档）', () => {
    const editor = setup([para()]);
    expect(handleLeadingEmptyBlockBackspace(editor, backspace())).toBe(false);
  });

  it('非首行空块：交给 BlockNote 默认逻辑', () => {
    const editor = setup([para('a'), para(), para('b')], 1);
    expect(handleLeadingEmptyBlockBackspace(editor, backspace())).toBe(false);
  });

  it('输入法组字中 / 带修饰键：不处理', () => {
    const editor = setup([para(), para('b')]);
    expect(handleLeadingEmptyBlockBackspace(editor, backspace({ isComposing: true }))).toBe(false);
    expect(handleLeadingEmptyBlockBackspace(editor, backspace({ metaKey: true }))).toBe(false);
    expect(editor.document).toHaveLength(2);
  });
});
