import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import ScriptBeatTab from '../renderer/src/components/script/ScriptBeatTab.jsx';
import ScriptResourceTab from '../renderer/src/components/script/ScriptResourceTab.jsx';
import ScriptPanel from '../renderer/src/components/script/ScriptPanel.jsx';
import { analyzeScript } from '../shared/script/screenplay.js';
import { analyzeBeats } from '../shared/script/scriptBeats.js';

const text = (value) => [{ type: 'text', text: value, styles: {} }];
const heading = (id, value, level = 2) => ({ id, type: 'heading', props: { level }, content: text(value), children: [] });
const para = (id, value) => ({ id, type: 'paragraph', props: {}, content: text(value), children: [] });
const bullet = (id, value) => ({ id, type: 'bulletListItem', props: {}, content: text(value), children: [] });

const DOC = [
  heading('beat', '节拍', 1),
  heading('act1', '第一幕'),
  bullet('b1', '留下录音机（第 1 场）'),
  bullet('b2', '天台对峙'),
  heading('s1', '1. 日 内 咖啡馆'),
  para('d1', '林夏：你来了。'),
];

const noop = () => {};
const makeScript = (overrides = {}) => {
  const analysis = analyzeScript(DOC);
  return {
    analysis,
    beats: analyzeBeats(DOC),
    currentScene: analysis.scenes[0],
    cardIds: { character: () => null, location: () => null },
    readOnly: false,
    generating: false,
    onJump: noop, onToggleBeatScene: noop, onAddBeat: noop, onInsertDialogue: noop, onOpenCard: noop,
    onInsertScene: noop, onInsertAction: noop, onRenumber: noop, onGenerateCards: noop,
    ...overrides,
  };
};

describe('剧本栏', () => {
  it('默认显示节拍页：本场节拍、按幕的全部节拍、灵感', () => {
    const html = renderToStaticMarkup(<ScriptPanel script={makeScript()} />);
    expect(html).toContain('本场 · 第 1 场 咖啡馆');
    expect(html).toContain('留下录音机');
    expect(html).toContain('第一幕');
    expect(html).toContain('天台对峙');
  });

  it('光标不在任何一场时给提示，不显示本场输入框', () => {
    const html = renderToStaticMarkup(<ScriptBeatTab script={makeScript({ currentScene: null })} />);
    expect(html).toContain('把光标放进某一场');
    expect(html).not.toContain('给本场加节拍');
  });

  it('资源页列出角色、场次、地点', () => {
    const html = renderToStaticMarkup(<ScriptResourceTab script={makeScript()} />);
    expect(html).toContain('林夏');
    expect(html).toContain('咖啡馆');
    expect(html).not.toContain('留下录音机');
  });
});
