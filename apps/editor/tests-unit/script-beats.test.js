import { describe, expect, it } from 'vitest';
import {
  analyzeBeats,
  beatsOfScene,
  buildBeatRenumbering,
  findBeatSection,
  formatBeatText,
  parseBeatText,
  toggleBeatSceneText,
  unplacedBeats,
} from '@shared/script/scriptBeats.js';
import { analyzeScript, buildSceneNumberMap, sceneNumberAt } from '@shared/script/screenplay.js';

const text = (value) => [{ type: 'text', text: value, styles: {} }];
const heading = (id, value, level = 2) => ({ id, type: 'heading', props: { level }, content: text(value), children: [] });
const para = (id, value) => ({ id, type: 'paragraph', props: {}, content: text(value), children: [] });
const bullet = (id, value) => ({ id, type: 'bulletListItem', props: {}, content: text(value), children: [] });

const DOC = [
  heading('s1', '1. 日 内 咖啡馆'),
  para('d1', '林夏：你来了。'),
  heading('s2', '2. 夜 外 天台'),
  para('a2', '△风很大。'),
  heading('beat', '节拍', 1),
  bullet('b0', '开场钩子（第 1 场）'),
  heading('act1', '第一幕', 2),
  bullet('b1', '老人：留下录音机（第 1、2 场）'),
  bullet('b2', '雨夜天台对峙'),
  heading('act2', '第二幕', 2),
  bullet('b3', '真相揭开（第 2-3 场）'),
];

describe('scriptBeats', () => {
  it('解析 / 生成节拍文字', () => {
    expect(parseBeatText('老人留下录音机（第 3、4 场）')).toEqual({ title: '老人留下录音机', scenes: [3, 4] });
    expect(parseBeatText('对峙 (第5,3场)')).toEqual({ title: '对峙', scenes: [3, 5] });
    expect(parseBeatText('真相（第 2-4 场）').scenes).toEqual([2, 3, 4]);
    expect(parseBeatText('只是灵感')).toEqual({ title: '只是灵感', scenes: [] });
    expect(formatBeatText('A', [4, 3, 3])).toBe('A（第 3、4 场）');
    expect(formatBeatText('A', [])).toBe('A');
  });

  it('挂上 / 取下场次', () => {
    expect(toggleBeatSceneText('A', 2)).toBe('A（第 2 场）');
    expect(toggleBeatSceneText('A（第 2、5 场）', 2)).toBe('A（第 5 场）');
    expect(toggleBeatSceneText('A（第 5 场）', 5)).toBe('A');
  });

  it('节拍区到下一个同级标题为止；按幕分组', () => {
    const doc = [...DOC, heading('after', '附录', 1), bullet('x', '不算节拍')];
    const section = findBeatSection(doc);
    expect(section.lastBlockId).toBe('b3');
    const result = analyzeBeats(doc);
    expect(result.acts.map((a) => [a.title, a.beats.map((b) => b.id)])).toEqual([
      ['', ['b0']], ['第一幕', ['b1', 'b2']], ['第二幕', ['b3']],
    ]);
    expect(beatsOfScene(result.beats, 2).map((b) => b.id)).toEqual(['b1', 'b3']);
    expect(unplacedBeats(result.beats).map((b) => b.id)).toEqual(['b2']);
  });

  it('节拍区放在开头时，遇到第一个场景标题就结束', () => {
    const doc = [heading('beat', '节拍', 1), bullet('b', 'X（第 1 场）'), heading('s1', '1. 日 内 A'), para('d', '林夏：嗯')];
    expect(findBeatSection(doc).lastBlockId).toBe('b');
    expect(analyzeScript(doc).characters.map((c) => c.name)).toEqual(['林夏']);
    expect(sceneNumberAt(doc, 'd')).toBe(1);
  });

  it('没有节拍区', () => {
    expect(analyzeBeats([para('p', 'x')])).toEqual({ exists: false, acts: [], beats: [] });
    expect(findBeatSection([])).toBeNull();
  });

  it('节拍区里的冒号不算对白，标题不算场次', () => {
    const result = analyzeScript(DOC);
    expect(result.characters.map((c) => c.name)).toEqual(['林夏']);
    expect(result.scenes).toHaveLength(2);
  });

  it('光标所在场次', () => {
    expect(sceneNumberAt(DOC, 'd1')).toBe(1);
    expect(sceneNumberAt(DOC, 'a2')).toBe(2);
    expect(sceneNumberAt(DOC, 'b1')).toBeNull();
  });

  it('场次重排时节拍引用跟着换', () => {
    const doc = [heading('s5', '5. 日 内 A'), heading('s9', '9. 夜 外 B'), heading('beat', '节拍', 1), bullet('b', 'X（第 9 场）'), bullet('c', 'Y（第 1 场）')];
    const map = buildSceneNumberMap(doc);
    expect([...map.entries()]).toEqual([[5, 1], [9, 2]]);
    expect(buildBeatRenumbering(doc, map)).toEqual([{ id: 'b', text: 'X（第 2 场）' }]);
  });
});
