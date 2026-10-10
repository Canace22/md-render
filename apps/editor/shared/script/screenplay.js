/**
 * 剧本页面的纯函数（不依赖 DOM / BlockNote 实例，只吃块数组）。
 *
 * 剧本就是普通 .md + frontmatter `layout: script`，正文用中文剧本格式，Obsidian / 其他 AI 照常能读：
 *   ## 1. 日 内 咖啡馆        ← 场景标题：标题块，以场次号开头
 *   人物：林夏、老人           ← 本场人物（可选）
 *   △林夏推门进来。           ← 动作：△ 开头
 *   林夏：（低声）你来了。     ← 对白：角色名 + 冒号
 */
import { PAGE_LAYOUT_KEY, PAGE_LAYOUT_SCRIPT } from '../outline/outlineTree.js';
import { SCENE_NUMBER_RE, blockText, flattenBlocks } from './scriptBlocks.js';
import { findBeatSection } from './scriptBeats.js';

export const ACTION_MARK = '△';
export const DIALOGUE_COLON = '：';
export const CHARACTER_CARD_PREFIX = '角色-';
export const LOCATION_CARD_PREFIX = '地点-';
export const DEFAULT_SCENE_TIME = '日';
export const DEFAULT_SCENE_SPACE = '内';

const CAST_KEY = '人物';
/** 长得像「X：」但不是角色在说话 */
const NON_SPEAKER_KEYS = new Set([CAST_KEY, '时间', '地点', '场景', '备注', '注', '字幕', '道具', '服装', '景别']);
const TIME_WORDS = new Set([
  '日', '夜', '晨', '昏', '早', '晚', '白天', '清晨', '早晨', '上午', '中午', '下午',
  '傍晚', '黄昏', '夜晚', '深夜', '凌晨', '日景', '夜景',
]);
const SPACE_WORDS = new Set(['内', '外', '内外', '内景', '外景', '内/外']);
const SCENE_SEPARATOR_RE = /^[-—–·|/]+$/;
const MAX_NAME_LENGTH = 12;
const DIALOGUE_RE = new RegExp(
  `^([^\\s：:，,。！？!?、${ACTION_MARK}▲（()）]{1,${MAX_NAME_LENGTH}})\\s*(?:[（(][^）)]*[）)])?\\s*[：:]`,
);
const CAST_SPLIT_RE = /[、，,；;\s]+/;

export const isScriptPage = (file) => file?.frontmatter?.[PAGE_LAYOUT_KEY] === PAGE_LAYOUT_SCRIPT;

/** 场景标题文字 → { number, time, space, location }；不以场次号开头的标题（幕名等）返回 null */
export const parseSceneHeading = (text) => {
  const source = String(text ?? '').trim();
  const match = source.match(SCENE_NUMBER_RE);
  if (!match) return null;
  const scene = { number: Number(match[1]), time: '', space: '', location: '' };
  const rest = [];
  source.slice(match[0].length).split(/\s+/).filter(Boolean).forEach((token) => {
    if (!scene.time && TIME_WORDS.has(token)) scene.time = token;
    else if (!scene.space && SPACE_WORDS.has(token)) scene.space = token;
    else if (!SCENE_SEPARATOR_RE.test(token)) rest.push(token);
  });
  scene.location = rest.join(' ');
  return scene;
};

/** 一行正文 → { kind: 'cast' | 'dialogue' | 'action' | 'text', names? } */
export const parseScriptLine = (text) => {
  const source = String(text ?? '').trim();
  if (source.startsWith(ACTION_MARK) || source.startsWith('▲')) return { kind: 'action' };
  const match = source.match(DIALOGUE_RE);
  if (!match) return { kind: 'text' };
  const name = match[1];
  if (name === CAST_KEY) {
    const names = source.slice(match[0].length).split(CAST_SPLIT_RE).filter(Boolean);
    return { kind: 'cast', names };
  }
  if (NON_SPEAKER_KEYS.has(name) || /^\d/.test(name)) return { kind: 'text' };
  return { kind: 'dialogue', names: [name] };
};

/** 正文块（摊平、去掉节拍区）：场次 / 角色 / 地点只从这里统计 */
export const scriptBodyBlocks = (blocks) => {
  const skipped = findBeatSection(blocks)?.ids;
  const flat = flattenBlocks(blocks);
  return skipped ? flat.filter((block) => !skipped.has(block?.id)) : flat;
};

const ensureEntry = (map, name, blockId) => {
  if (!map.has(name)) map.set(name, { name, dialogueCount: 0, sceneNumbers: [], firstBlockId: blockId });
  return map.get(name);
};

const addUnique = (list, value) => {
  if (value !== null && value !== undefined && !list.includes(value)) list.push(value);
};

/**
 * 整篇块 → 场次 / 角色 / 地点。
 * - scenes 按正文顺序；characters 按对白数降序（同数按首次出场）；locations 按首次出现
 */
export const analyzeScript = (blocks) => {
  const scenes = [];
  const characters = new Map();
  const locations = new Map();
  let scene = null;

  const touchCharacter = (name, blockId, isDialogue) => {
    const entry = ensureEntry(characters, name, blockId);
    if (isDialogue) entry.dialogueCount += 1;
    if (scene) {
      addUnique(entry.sceneNumbers, scene.number);
      addUnique(scene.characters, name);
    }
  };

  scriptBodyBlocks(blocks).forEach((block) => {
    const text = blockText(block);
    if (block?.type === 'heading') {
      const heading = parseSceneHeading(text);
      if (!heading) return;
      scene = { ...heading, id: block.id, heading: text, characters: [], dialogueCount: 0 };
      scenes.push(scene);
      if (heading.location) {
        const place = ensureEntry(locations, heading.location, block.id);
        addUnique(place.sceneNumbers, heading.number);
      }
      return;
    }
    const line = parseScriptLine(text);
    if (line.kind === 'cast') line.names.forEach((name) => touchCharacter(name, block.id, false));
    if (line.kind === 'dialogue') {
      touchCharacter(line.names[0], block.id, true);
      if (scene) scene.dialogueCount += 1;
    }
  });

  const characterList = [...characters.values()]
    .map((entry, order) => ({ ...entry, order }))
    .sort((a, b) => b.dialogueCount - a.dialogueCount || a.order - b.order)
    .map(({ order, ...entry }) => entry); // eslint-disable-line no-unused-vars

  return { scenes, characters: characterList, locations: [...locations.values()] };
};

export const nextSceneNumber = (analysis) => (analysis?.scenes ?? [])
  .reduce((max, scene) => Math.max(max, scene.number), 0) + 1;

export const buildSceneHeadingText = (number, location = '') => (
  `${number}. ${DEFAULT_SCENE_TIME} ${DEFAULT_SCENE_SPACE} ${location}`
);

export const buildDialoguePrefix = (name) => `${name}${DIALOGUE_COLON}`;

/** 正文里的场景标题按顺序编新号：[{ id, oldNumber, newNumber, rest }] */
const collectSceneHeadings = (blocks) => scriptBodyBlocks(blocks)
  .filter((block) => block?.type === 'heading')
  .map((block) => ({ id: block.id, text: blockText(block) }))
  .filter(({ text }) => SCENE_NUMBER_RE.test(text))
  .map(({ id, text }, index) => {
    const match = text.match(SCENE_NUMBER_RE);
    return { id, oldNumber: Number(match[1]), newNumber: index + 1, rest: text.slice(match[0].length) };
  });

/** 场次号按正文顺序重排：返回需要改字的 [{ id, text }]，号码没变的不返回 */
export const buildSceneRenumbering = (blocks) => collectSceneHeadings(blocks)
  .filter((scene) => scene.oldNumber !== scene.newNumber)
  .map((scene) => ({ id: scene.id, text: `${scene.newNumber}. ${scene.rest}`.trimEnd() }));

/** 旧场次号 → 新场次号（重号时按先出现的算），给节拍引用同步用 */
export const buildSceneNumberMap = (blocks) => {
  const map = new Map();
  collectSceneHeadings(blocks).forEach((scene) => {
    if (!map.has(scene.oldNumber)) map.set(scene.oldNumber, scene.newNumber);
  });
  return map;
};

/** 光标所在块属于第几场（往前找最近的场景标题）；在节拍区或第一场之前返回 null */
export const sceneNumberAt = (blocks, blockId) => {
  let current = null;
  for (const block of scriptBodyBlocks(blocks)) {
    if (block?.type === 'heading') {
      const heading = parseSceneHeading(blockText(block));
      if (heading) current = heading.number;
    }
    if (block?.id === blockId) return current;
  }
  return null;
};

/**
 * Tab 补全时的角色顺序：本场最近说话的两人对调（对话一般是轮流说），其余按戏份。
 * 只有一个人说过话时，他排最后（下一句多半是别人）。
 */
export const suggestSpeakers = (blocks, blockId, analysis = analyzeScript(blocks)) => {
  const flat = scriptBodyBlocks(blocks);
  const cursorIndex = flat.findIndex((block) => block?.id === blockId);
  const before = cursorIndex < 0 ? flat : flat.slice(0, cursorIndex);
  const recent = [];
  for (let i = before.length - 1; i >= 0; i -= 1) {
    const block = before[i];
    if (block?.type === 'heading' && parseSceneHeading(blockText(block))) break;
    const line = parseScriptLine(blockText(block));
    if (line.kind === 'dialogue') addUnique(recent, line.names[0]);
  }
  const primary = recent.length > 1 ? [recent[1], recent[0], ...recent.slice(2)] : [];
  const tail = recent.length === 1 ? recent : [];
  const ordered = [...primary, ...analysis.characters.map((c) => c.name).filter((n) => !tail.includes(n)), ...tail];
  return [...new Set(ordered)];
};

/**
 * Tab 在空行 / 元素前缀间轮换：空 → △ → 角色A： → 角色B： → … → 空。
 * 当前行写了正经内容时返回 null（不拦 Tab）。
 */
export const cycleElementText = (currentText, speakers) => {
  const text = String(currentText ?? '').trim();
  const cycle = ['', ACTION_MARK, ...speakers.map(buildDialoguePrefix)];
  const index = cycle.indexOf(text);
  if (index < 0) return null;
  return cycle[(index + 1) % cycle.length];
};

const formatSceneList = (numbers) => (numbers.length ? `第 ${numbers.join('、')} 场` : '未出场');

const characterCardContent = (entry, scriptTitle) => [
  `- 所属剧本：[[${scriptTitle}]]`,
  `- 出场：${formatSceneList(entry.sceneNumbers)}`,
  `- 对白：${entry.dialogueCount} 句`,
  '',
  '## 人物小传',
  '',
  '## 动机 / 目标',
  '',
  '## 性格与特征',
  '',
  '## 外形与服装',
  '',
  '## 人物关系',
  '',
].join('\n');

const locationCardContent = (entry, scriptTitle) => [
  `- 所属剧本：[[${scriptTitle}]]`,
  `- 出现：${formatSceneList(entry.sceneNumbers)}`,
  '',
  '## 环境描述',
  '',
  '## 关键道具',
  '',
  '## 参考图',
  '',
].join('\n');

export const characterCardName = (name) => `${CHARACTER_CARD_PREFIX}${name}`;
export const locationCardName = (name) => `${LOCATION_CARD_PREFIX}${name}`;

/** 还没有设定卡的角色 / 地点 → 待新建文档 [{ name, content, tags }]；已有同名文档的跳过 */
export const buildResourceCards = (analysis, scriptTitle, existingNames = new Set()) => {
  const characterCards = (analysis?.characters ?? []).map((entry) => ({
    name: characterCardName(entry.name), content: characterCardContent(entry, scriptTitle), tags: ['角色'],
  }));
  const locationCards = (analysis?.locations ?? []).map((entry) => ({
    name: locationCardName(entry.name), content: locationCardContent(entry, scriptTitle), tags: ['地点'],
  }));
  return [...characterCards, ...locationCards].filter((card) => !existingNames.has(card.name));
};
