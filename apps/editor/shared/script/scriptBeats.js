/**
 * 剧本节拍（Beat Sheet）的纯函数。
 *
 * 节拍就写在剧本同一篇 .md 里，一个标题叫「节拍」的区块（默认放在开头，先搭骨架再写正文）：
 *   # 节拍
 *   - 林夏收到录音机（第 1 场）        ← 列表项 = 一个节拍，括号里是它落在哪几场
 *   ## 第一幕                          ← 区块里更低一级的标题 = 幕
 *   - 老人留下录音机（第 3、4 场）
 *   - 雨夜天台对峙                     ← 没写场次 = 还没归位的灵感
 * 区块到下一个同级或更高级标题、或第一个场景标题为止；里面的内容不参与正文的场次 / 角色统计。
 */
import { blockText, flattenBlocks, headingLevel, isSceneHeadingBlock } from './scriptBlocks.js';

export const BEAT_SECTION_TITLE = '节拍';
const BEAT_BLOCK_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem']);
const BEAT_SCENES_RE = /\s*[（(]\s*第\s*([\d\s、，,\-–~～]+?)\s*场\s*[）)]\s*$/;
const RANGE_RE = /^(\d+)\s*[-–~～]\s*(\d+)$/;
const MAX_RANGE_SIZE = 100;

const isBeatSectionHeading = (block) => block?.type === 'heading' && blockText(block) === BEAT_SECTION_TITLE;

/** 找节拍区：{ headingId, level, members（区块内的顶层块，不含标题）, lastBlockId, ids（含子块） }；没有返回 null */
export const findBeatSection = (blocks) => {
  const list = Array.isArray(blocks) ? blocks : [];
  const start = list.findIndex(isBeatSectionHeading);
  if (start < 0) return null;
  const level = headingLevel(list[start]);
  let end = start + 1;
  const endsSection = (block) => block?.type === 'heading' && (headingLevel(block) <= level || isSceneHeadingBlock(block));
  while (end < list.length && !endsSection(list[end])) end += 1;
  const section = list.slice(start, end);
  return {
    headingId: list[start].id,
    level,
    members: section.slice(1),
    lastBlockId: section[section.length - 1].id,
    ids: new Set(flattenBlocks(section).map((block) => block.id)),
  };
};

const parseNumberList = (source) => {
  const numbers = new Set();
  String(source ?? '').split(/[、，,\s]+/).filter(Boolean).forEach((token) => {
    const range = token.match(RANGE_RE);
    if (!range) {
      if (/^\d+$/.test(token)) numbers.add(Number(token));
      return;
    }
    const [from, to] = [Number(range[1]), Number(range[2])].sort((a, b) => a - b);
    for (let n = from; n <= Math.min(to, from + MAX_RANGE_SIZE); n += 1) numbers.add(n);
  });
  return [...numbers].sort((a, b) => a - b);
};

/** 「老人留下录音机（第 3、4 场）」→ { title, scenes: [3, 4] } */
export const parseBeatText = (text) => {
  const source = String(text ?? '').trim();
  const match = source.match(BEAT_SCENES_RE);
  if (!match) return { title: source, scenes: [] };
  return { title: source.slice(0, match.index).trim(), scenes: parseNumberList(match[1]) };
};

export const formatBeatText = (title, scenes = []) => {
  const sorted = [...new Set(scenes)].sort((a, b) => a - b);
  const head = String(title ?? '').trim();
  return sorted.length ? `${head}（第 ${sorted.join('、')} 场）` : head;
};

/** 挂上 / 取下某一场 */
export const toggleBeatSceneText = (text, sceneNumber) => {
  const { title, scenes } = parseBeatText(text);
  const next = scenes.includes(sceneNumber)
    ? scenes.filter((n) => n !== sceneNumber)
    : [...scenes, sceneNumber];
  return formatBeatText(title, next);
};

/** 整篇块 → { exists, acts: [{ id, title, beats }], beats }；幕之前的节拍归在 title 为空的组里 */
export const analyzeBeats = (blocks) => {
  const section = findBeatSection(blocks);
  if (!section) return { exists: false, acts: [], beats: [] };
  const acts = [{ id: null, title: '', beats: [] }];
  const beats = [];
  section.members.forEach((block) => {
    if (block?.type === 'heading') {
      acts.push({ id: block.id, title: blockText(block), beats: [] });
      return;
    }
    if (!BEAT_BLOCK_TYPES.has(block?.type)) return;
    const text = blockText(block);
    if (!text) return;
    const act = acts[acts.length - 1];
    const beat = { id: block.id, ...parseBeatText(text), actTitle: act.title };
    act.beats.push(beat);
    beats.push(beat);
  });
  return { exists: true, acts: acts.filter((act) => act.id || act.beats.length), beats };
};

export const beatsOfScene = (beats, sceneNumber) => (
  sceneNumber ? beats.filter((beat) => beat.scenes.includes(sceneNumber)) : []
);

export const unplacedBeats = (beats) => beats.filter((beat) => beat.scenes.length === 0);

/** 场次重排后，节拍里引用的场次号跟着换；numberMap: 旧号 → 新号 */
export const buildBeatRenumbering = (blocks, numberMap) => analyzeBeats(blocks).beats
  .map((beat) => {
    const scenes = beat.scenes.map((n) => numberMap.get(n) ?? n);
    const changed = scenes.some((n, i) => n !== beat.scenes[i]);
    return changed ? { id: beat.id, text: formatBeatText(beat.title, scenes) } : null;
  })
  .filter(Boolean);
