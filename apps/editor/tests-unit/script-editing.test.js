import { describe, expect, it } from 'vitest';
import { BlockNoteEditor } from '@blocknote/core';
import {
  addBeat,
  cycleCurrentElement,
  toggleBeatScene,
  insertAction,
  insertDialogue,
  insertScene,
  renumberScenes,
} from '../renderer/src/utils/scriptEditing.js';
import { inlineToPlainText } from '../shared/daily/dailyMarkdown.js';

const para = (text = '') => ({ type: 'paragraph', content: text ? [{ type: 'text', text, styles: {} }] : [] });
const heading = (text) => ({ type: 'heading', props: { level: 2 }, content: [{ type: 'text', text, styles: {} }] });

const setup = (blocks, cursorIndex = 0) => {
  const editor = BlockNoteEditor.create({ initialContent: blocks });
  editor.setTextCursorPosition(editor.document[cursorIndex], 'end');
  return editor;
};
const texts = (editor) => editor.document.map((b) => inlineToPlainText(b.content));

describe('剧本编辑操作', () => {
  it('插入场景：自动用下一个场次号，插在光标行后面', () => {
    const editor = setup([heading('1. 日 内 咖啡馆'), para('△有人进来。')], 1);
    insertScene(editor);
    expect(editor.document[2].type).toBe('heading');
    expect(texts(editor)[2]).toBe('2. 日 内 ');
  });

  it('空段落上插入动作 / 对白：原地改，不多出空行', () => {
    const editor = setup([heading('1. 日 内 A'), para('')], 1);
    insertAction(editor);
    expect(texts(editor)).toEqual(['1. 日 内 A', '△']);
    const editor2 = setup([heading('1. 日 内 A'), para('')], 1);
    insertDialogue(editor2, '林夏');
    expect(texts(editor2)).toEqual(['1. 日 内 A', '林夏：']);
  });

  it('Tab 轮换：空行 → △ → 对白（轮到另一个人）', () => {
    const editor = setup([heading('1. 日 内 A'), para('林夏：你好'), para('老人：坐'), para('')], 3);
    expect(cycleCurrentElement(editor)).toBe(true);
    expect(texts(editor)[3]).toBe('△');
    cycleCurrentElement(editor);
    expect(texts(editor)[3]).toBe('林夏：');
  });

  it('Tab 在写了内容的行上不拦截', () => {
    const editor = setup([para('林夏：你好')], 0);
    expect(cycleCurrentElement(editor)).toBe(false);
    expect(texts(editor)).toEqual(['林夏：你好']);
  });

  it('重新编号', () => {
    const editor = setup([heading('1. 日 内 A'), heading('3. 夜 外 B'), heading('第一幕')], 0);
    expect(renumberScenes(editor)).toBe(1);
    expect(texts(editor)).toEqual(['1. 日 内 A', '2. 夜 外 B', '第一幕']);
  });

  it('加节拍：没有节拍区时在开头建，再加就追加到区块末尾，光标不动', () => {
    const editor = setup([heading('1. 日 内 A'), para('林夏：嗯')], 1);
    addBeat(editor, '开场钩子', 1);
    addBeat(editor, '雨夜对峙');
    expect(texts(editor)).toEqual(['节拍', '开场钩子（第 1 场）', '雨夜对峙', '1. 日 内 A', '林夏：嗯']);
    expect(editor.document[0].props.level).toBe(1);
    expect(texts(editor)[editor.document.findIndex((b) => b.id === editor.getTextCursorPosition().block.id)]).toBe('林夏：嗯');
  });

  it('节拍挂到某场 / 取下；重排场次时节拍跟着换号', () => {
    const editor = setup([heading('3. 日 内 A'), heading('7. 夜 外 B')], 0);
    const id = addBeat(editor, '对峙', 7);
    toggleBeatScene(editor, id, 3);
    expect(texts(editor)[1]).toBe('对峙（第 3、7 场）');
    renumberScenes(editor);
    expect(texts(editor)).toEqual(['节拍', '对峙（第 1、2 场）', '1. 日 内 A', '2. 夜 外 B']);
  });
});
