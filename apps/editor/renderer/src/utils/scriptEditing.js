/**
 * 剧本页对 BlockNote 编辑器的写操作（插入元素行、Tab 轮换、重新编号）。
 * 规则判断都在 shared/script/screenplay.js，这里只负责落到编辑器上。
 */
import {
  ACTION_MARK,
  analyzeScript,
  buildDialoguePrefix,
  buildSceneHeadingText,
  buildSceneNumberMap,
  buildSceneRenumbering,
  cycleElementText,
  nextSceneNumber,
  suggestSpeakers,
} from '../../../shared/script/screenplay.js';
import {
  BEAT_SECTION_TITLE,
  buildBeatRenumbering,
  findBeatSection,
  formatBeatText,
  toggleBeatSceneText,
} from '../../../shared/script/scriptBeats.js';
import { inlineToPlainText } from '../../../shared/daily/dailyMarkdown.js';

const SCENE_HEADING_LEVEL = 2;
const BEAT_SECTION_LEVEL = 1;

const plainText = (block) => inlineToPlainText(block?.content);

const isEmptyParagraph = (block) => block?.type === 'paragraph'
  && !plainText(block).trim()
  && (block.children ?? []).length === 0;

const placeCursorAtEnd = (editor, blockId) => {
  try {
    editor.setTextCursorPosition(blockId, 'end');
    editor.focus();
  } catch {
    // 块刚被删掉之类的边界情况，放弃聚焦即可
  }
};

const getCursorBlock = (editor) => {
  try {
    return editor.getTextCursorPosition()?.block ?? null;
  } catch {
    return null;
  }
};

/** 在光标处放一行：当前是空段落就原地改，否则插到后面；光标落到行尾方便接着写 */
export const insertScriptLine = (editor, partialBlock) => {
  const current = getCursorBlock(editor) ?? editor.document.at(-1);
  if (!current) return;
  if (isEmptyParagraph(current)) {
    editor.updateBlock(current, partialBlock);
    placeCursorAtEnd(editor, current.id);
    return;
  }
  const [inserted] = editor.insertBlocks([partialBlock], current, 'after');
  if (inserted) placeCursorAtEnd(editor, inserted.id);
};

export const sceneHeadingBlock = (number, location = '') => ({
  type: 'heading',
  props: { level: SCENE_HEADING_LEVEL },
  content: buildSceneHeadingText(number, location),
});

export const insertScene = (editor) => {
  const number = nextSceneNumber(analyzeScript(editor.document));
  insertScriptLine(editor, sceneHeadingBlock(number));
};

export const insertAction = (editor) => insertScriptLine(editor, { type: 'paragraph', content: ACTION_MARK });

export const insertDialogue = (editor, name) => insertScriptLine(editor, {
  type: 'paragraph',
  content: buildDialoguePrefix(name),
});

/** Tab：光标在空行 / 只有元素前缀的段落时，轮换 △ 和角色名；返回是否处理了 */
export const cycleCurrentElement = (editor) => {
  const block = getCursorBlock(editor);
  if (block?.type !== 'paragraph') return false;
  const next = cycleElementText(plainText(block), suggestSpeakers(editor.document, block.id));
  if (next === null) return false;
  editor.updateBlock(block, { content: next });
  placeCursorAtEnd(editor, block.id);
  return true;
};

/** 按正文顺序重排场次号，节拍里引用的场次号同步换；返回改了几场 */
export const renumberScenes = (editor) => {
  const blocks = editor.document;
  const updates = buildSceneRenumbering(blocks);
  const beatUpdates = buildBeatRenumbering(blocks, buildSceneNumberMap(blocks));
  [...updates, ...beatUpdates].forEach(({ id, text }) => editor.updateBlock(id, { content: text }));
  return updates.length;
};

/**
 * 加一个节拍（列表项），可直接挂到某一场。
 * 已有节拍区就追加到区块末尾；没有就在文档开头建「# 节拍」区块。不动光标，正文接着写。
 */
export const addBeat = (editor, title, sceneNumber = null) => {
  const text = formatBeatText(title, sceneNumber ? [sceneNumber] : []);
  if (!text) return null;
  const beat = { type: 'bulletListItem', content: text };
  const section = findBeatSection(editor.document);
  if (section) return editor.insertBlocks([beat], section.lastBlockId, 'after')[0]?.id ?? null;
  const sectionHeading = { type: 'heading', props: { level: BEAT_SECTION_LEVEL }, content: BEAT_SECTION_TITLE };
  return editor.insertBlocks([sectionHeading, beat], editor.document[0], 'before')[1]?.id ?? null;
};

/** 节拍挂上 / 取下某一场 */
export const toggleBeatScene = (editor, beatId, sceneNumber) => {
  const block = editor.getBlock(beatId);
  if (!block || !sceneNumber) return;
  editor.updateBlock(block, { content: toggleBeatSceneText(plainText(block), sceneNumber) });
};
