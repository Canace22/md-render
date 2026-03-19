import {
  LOCATION_SUFFIXES,
  SCENE_HINTS,
  TASK_VERBS,
  countOccurrences,
  createNovelId,
  sanitizeEntityName,
  stripMarkdown,
  toPlainSentences,
} from './shared.js';

const SCENE_BREAK_PATTERN = new RegExp(`^(#{1,6}\\s+.+|[-*_]{3,}|(?:${SCENE_HINTS.join('|')}).*)$`);
const CONFLICT_PATTERN = /(却|但是|然而|不料|追杀|埋伏|阻止|争夺|背叛|威胁|失控|受伤|危险)/;
const OPEN_THREAD_PATTERN = /(尚未|还没|不知|下落|真相|谜团|能否|是否|来得及|必须)/;
const TASK_PATTERN = new RegExp(`((?:${TASK_VERBS.join('|')})[^，。！？\\n]{1,18})`);
const LOCATION_CONTEXT_PATTERN = new RegExp(
  `(?:来到|回到|进入|离开|潜入|前往)([\\u4e00-\\u9fa5]{1,4}(?:${LOCATION_SUFFIXES.join('|')}))`,
);

function splitSceneBlocks(markdown = '') {
  const blocks = markdown
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);

  const scenes = [];
  let current = [];

  blocks.forEach((block) => {
    if (SCENE_BREAK_PATTERN.test(block) && current.length > 0) {
      scenes.push(current.join('\n\n'));
      current = [block];
      return;
    }
    current.push(block);
  });

  if (current.length > 0) {
    scenes.push(current.join('\n\n'));
  }

  return scenes;
}

function extractSceneTitle(block = '', index = 0) {
  const headingMatch = block.match(/^#{1,6}\s+(.+)$/m);
  if (headingMatch) return sanitizeEntityName(headingMatch[1]) || `场景 ${index + 1}`;

  const firstLine = stripMarkdown(block).split('\n').map((item) => item.trim()).find(Boolean) ?? '';
  return firstLine.length > 18 ? `${firstLine.slice(0, 18)}…` : firstLine || `场景 ${index + 1}`;
}

function pickFirstMatchedSentence(sentences, pattern) {
  return sentences.find((sentence) => pattern.test(sentence)) ?? '';
}

export function extractScenes(markdown, options = {}) {
  const { fileId = '', entities = [] } = options;
  const sceneBlocks = splitSceneBlocks(markdown);

  if (sceneBlocks.length === 0) {
    return {
      scenes: [],
      currentSceneId: null,
    };
  }

  const scenes = sceneBlocks.map((block, index) => {
    const plainBlock = stripMarkdown(block);
    const sentences = toPlainSentences(block);
    const timeHint = SCENE_HINTS.find((hint) => plainBlock.includes(hint)) ?? '';
    const contextLocation = plainBlock.match(LOCATION_CONTEXT_PATTERN)?.[1] ?? '';
    const locationEntity = entities.find(
      (entity) => entity.type === 'location' && countOccurrences(plainBlock, entity.name) > 0,
    );
    const participants = entities
      .filter(
        (entity) => entity.type === 'character' && countOccurrences(plainBlock, entity.name) > 0,
      )
      .sort((left, right) => right.mentionCount - left.mentionCount)
      .slice(0, 4)
      .map((entity) => entity.name);
    const missionEntity = entities.find(
      (entity) => entity.type === 'mission' && countOccurrences(plainBlock, entity.name) > 0,
    );
    const goal = missionEntity?.name ?? (plainBlock.match(TASK_PATTERN)?.[1] ?? '');
    const conflict = pickFirstMatchedSentence(sentences, CONFLICT_PATTERN);
    const openThreads = sentences.filter((sentence) => OPEN_THREAD_PATTERN.test(sentence)).slice(0, 3);
    const anchorText = plainBlock.length > 36 ? `${plainBlock.slice(0, 36)}…` : plainBlock;

    return {
      id: createNovelId('scene', `${fileId}:${index}:${anchorText}`),
      title: extractSceneTitle(block, index),
      sourceFileId: fileId,
      anchorText,
      participants,
      location: contextLocation || locationEntity?.name || '',
      goal,
      conflict,
      timeHint,
      openThreads,
    };
  });

  return {
    scenes,
    currentSceneId: scenes.at(-1)?.id ?? null,
  };
}
