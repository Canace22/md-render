import { describe, expect, it, vi } from 'vitest';
import { Schema, type Node } from '@tiptap/pm/model';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import {
  createWikilinkPlugin,
  findWikilinks,
  WIKILINK_EDITING_CLASS,
  WIKILINK_NAME_ATTR,
  WIKILINK_SYNTAX_CLASS,
} from './wikilink.js';

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { group: 'block', content: 'inline*' },
    code: { group: 'block', content: 'text*', code: true },
    hard_break: { group: 'inline', inline: true },
    text: { group: 'inline' },
  },
});

const paragraphDoc = (text: string) => schema.node('doc', null, [schema.node('paragraph', null, [schema.text(text)])]);

/** 返回 { 文本: class } 列表，便于断言哪些片段被隐藏 */
const decorationsOf = (doc: Node, cursor?: number) => {
  const plugin = createWikilinkPlugin(() => {});
  let state = EditorState.create({ doc, plugins: [plugin] });
  if (cursor !== undefined) state = state.apply(state.tr.setSelection(TextSelection.create(doc, cursor)));
  const set = plugin.props.decorations!.call(plugin, state) as unknown as { find: () => { from: number; to: number; type: { attrs: { class: string } } }[] };
  return set.find().map((d) => ({ text: doc.textBetween(d.from, d.to), cls: d.type.attrs.class }));
};

const syntaxParts = (decos: ReturnType<typeof decorationsOf>) => decos
  .filter((d) => d.cls.includes(WIKILINK_SYNTAX_CLASS)).map((d) => d.text).sort();

describe('findWikilinks', () => {
  it('[[名称]]：显示名称', () => {
    const [m] = findWikilinks('a [[x]] b');
    expect(m).toMatchObject({ start: 2, end: 7, name: 'x' });
    expect('a [[x]] b'.slice(m.labelStart, m.labelEnd)).toBe('x');
  });

  it('[[名称|别名]]：显示别名，跳转用名称', () => {
    const text = '[[剧本大纲|大纲]]';
    const [m] = findWikilinks(text);
    expect(m.name).toBe('剧本大纲');
    expect(text.slice(m.labelStart, m.labelEnd)).toBe('大纲');
  });
});

describe('createWikilinkPlugin', () => {
  it('方括号被标成语法片段（默认隐藏），只露出文档名', () => {
    const decos = decorationsOf(paragraphDoc('见 [[灰溪镇]] 吧'));
    expect(syntaxParts(decos)).toEqual(['[[', ']]']);
    expect(decos.some((d) => d.text === '[[灰溪镇]]' && d.cls.includes('bn-wikilink'))).toBe(true);
    expect(decos.some((d) => d.cls.includes(WIKILINK_EDITING_CLASS))).toBe(false);
  });

  it('别名形式把「[[名称|」整段隐藏', () => {
    expect(syntaxParts(decorationsOf(paragraphDoc('[[剧本大纲|大纲]]')))).toEqual(['[[剧本大纲|', ']]']);
  });

  it('光标在链接里时显示方括号，方便编辑', () => {
    const doc = paragraphDoc('见 [[灰溪镇]] 吧');
    const inside = 1 + '见 [[灰'.length;
    const decos = decorationsOf(doc, inside);
    expect(decos.filter((d) => d.cls.includes(WIKILINK_EDITING_CLASS))).toHaveLength(2);
  });

  it('换行等行内节点不打乱位置；代码块里不处理', () => {
    const withBreak = schema.node('doc', null, [
      schema.node('paragraph', null, [schema.text('a'), schema.node('hard_break'), schema.text('[[b]]')]),
    ]);
    expect(decorationsOf(withBreak).map((d) => d.text)).toContain('[[b]]');
    const code = schema.node('doc', null, [schema.node('code', null, [schema.text('[[x]]')])]);
    expect(decorationsOf(code)).toEqual([]);
  });

  it('左键按下双链时回调名称，右键不处理', () => {
    const onOpen = vi.fn();
    const plugin = createWikilinkPlugin(onOpen);
    const mousedown = plugin.props.handleDOMEvents!.mousedown!;
    const el = { closest: () => ({ getAttribute: (k: string) => (k === WIKILINK_NAME_ATTR ? '灰溪镇' : null) }) };
    const event = (button: number) => ({ button, target: el, preventDefault: vi.fn() }) as unknown as MouseEvent;
    expect(mousedown.call(plugin, {} as EditorView, event(2))).toBe(false);
    expect(mousedown.call(plugin, {} as EditorView, event(0))).toBe(true);
    expect(onOpen).toHaveBeenCalledWith('灰溪镇');
  });
});
