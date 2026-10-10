import { describe, expect, it } from 'vitest';
import {
  analyzeScript,
  buildResourceCards,
  buildSceneRenumbering,
  cycleElementText,
  isScriptPage,
  nextSceneNumber,
  parseSceneHeading,
  parseScriptLine,
  suggestSpeakers,
} from '../shared/script/screenplay.js';

const text = (value) => [{ type: 'text', text: value, styles: {} }];
const heading = (id, value) => ({ id, type: 'heading', props: { level: 2 }, content: text(value), children: [] });
const para = (id, value) => ({ id, type: 'paragraph', props: {}, content: text(value), children: [] });

const SAMPLE = [
  heading('h0', '第一幕'),
  heading('s1', '1. 日 内 咖啡馆'),
  para('c1', '人物：林夏、老人'),
  para('a1', '△林夏推门进来。'),
  para('d1', '林夏：（低声）你来了。'),
  para('d2', '老人：坐。'),
  para('d3', '林夏（画外音）：他没说实话。'),
  heading('s2', '2. 夜 外 天台'),
  para('d4', '阿杰：走吧。'),
  para('t1', '时间：三年后'),
];

describe('screenplay', () => {
  it('识别剧本页面', () => {
    expect(isScriptPage({ frontmatter: { layout: 'script' } })).toBe(true);
    expect(isScriptPage({ frontmatter: { layout: 'outline' } })).toBe(false);
    expect(isScriptPage(null)).toBe(false);
  });

  it('解析场景标题：场次 / 时间 / 内外 / 地点，幕名不算场景', () => {
    expect(parseSceneHeading('1. 日 内 咖啡馆')).toEqual({ number: 1, time: '日', space: '内', location: '咖啡馆' });
    expect(parseSceneHeading('第12场 外景 老街 - 黄昏')).toEqual({ number: 12, time: '黄昏', space: '外景', location: '老街' });
    expect(parseSceneHeading('第一幕')).toBeNull();
  });

  it('解析正文行：动作 / 对白 / 人物行 / 非角色键', () => {
    expect(parseScriptLine('△他走了')).toEqual({ kind: 'action' });
    expect(parseScriptLine('林夏：你好')).toEqual({ kind: 'dialogue', names: ['林夏'] });
    expect(parseScriptLine('林夏（OS）: 你好')).toEqual({ kind: 'dialogue', names: ['林夏'] });
    expect(parseScriptLine('人物：林夏、老人')).toEqual({ kind: 'cast', names: ['林夏', '老人'] });
    expect(parseScriptLine('时间：三年后')).toEqual({ kind: 'text' });
    expect(parseScriptLine('这是一句很长很长的普通描述，里面有冒号：对')).toEqual({ kind: 'text' });
  });

  it('汇总场次、角色、地点', () => {
    const result = analyzeScript(SAMPLE);
    expect(result.scenes.map((s) => [s.number, s.location, s.characters, s.dialogueCount])).toEqual([
      [1, '咖啡馆', ['林夏', '老人'], 3],
      [2, '天台', ['阿杰'], 1],
    ]);
    expect(result.characters.map((c) => [c.name, c.dialogueCount, c.sceneNumbers])).toEqual([
      ['林夏', 2, [1]], ['老人', 1, [1]], ['阿杰', 1, [2]],
    ]);
    expect(result.locations.map((l) => l.name)).toEqual(['咖啡馆', '天台']);
    expect(nextSceneNumber(result)).toBe(3);
  });

  it('空文档也能分析', () => {
    expect(analyzeScript([])).toEqual({ scenes: [], characters: [], locations: [] });
    expect(nextSceneNumber(analyzeScript([]))).toBe(1);
  });

  it('Tab 轮换：空 → △ → 角色 → 回到空；写了内容不拦截', () => {
    expect(cycleElementText('', ['林夏'])).toBe('△');
    expect(cycleElementText('△', ['林夏', '老人'])).toBe('林夏：');
    expect(cycleElementText('林夏：', ['林夏', '老人'])).toBe('老人：');
    expect(cycleElementText('老人：', ['林夏', '老人'])).toBe('');
    expect(cycleElementText('林夏：你好', ['林夏'])).toBeNull();
  });

  it('角色建议：本场最近两人轮流说', () => {
    const blocks = [...SAMPLE.slice(0, 6), para('cur', '')];
    expect(suggestSpeakers(blocks, 'cur').slice(0, 2)).toEqual(['林夏', '老人']);
    const afterOne = [...SAMPLE.slice(0, 5), para('cur', '')];
    expect(suggestSpeakers(afterOne, 'cur').at(-1)).toBe('林夏');
  });

  it('重新编号只改号码不对的场景', () => {
    const blocks = [heading('a', '1. 日 内 A'), heading('b', '5. 夜 外 B'), heading('c', '3. 日 内 C')];
    expect(buildSceneRenumbering(blocks)).toEqual([{ id: 'b', text: '2. 夜 外 B' }]);
  });

  it('生成设定卡：跳过已存在的，带回链', () => {
    const cards = buildResourceCards(analyzeScript(SAMPLE), '雨夜', new Set(['角色-林夏']));
    expect(cards.map((c) => c.name)).toEqual(['角色-老人', '角色-阿杰', '地点-咖啡馆', '地点-天台']);
    expect(cards[0].content).toContain('[[雨夜]]');
    expect(cards[0].tags).toEqual(['角色']);
  });
});
