/**
 * 今日速记大纲的块操作（纯函数）：模板分区、往分区追加、结转未完成任务、勾选任务、旧数据转换。
 *
 * 一天 = 一个 BlockNote 块数组。分区就是顶层标题：标题之后、下一个标题之前的块都属于它；
 * 如果用户把内容缩进到标题下面（标题有 children），就按 children 算。
 */
import { createBlockId, inlineToPlainText, markdownToBlocks, parseInline } from './dailyMarkdown.js';

export const DAILY_SECTIONS = Object.freeze([
  { key: 'task', title: '📝 今日任务', match: '今日任务', itemType: 'checkListItem' },
  { key: 'event', title: '📅 事件', match: '事件', itemType: 'bulletListItem' },
  { key: 'note', title: '💡 笔记', match: '笔记', itemType: 'bulletListItem' },
]);

const SECTION_HEADING_LEVEL = 2;
const CONTENTLESS_BLOCK_TYPES = new Set(['image', 'divider', 'table', 'video', 'audio', 'file']);

export const findSectionDef = (key) => DAILY_SECTIONS.find((section) => section.key === key) ?? DAILY_SECTIONS[0];

const block = (type, props, content, id = createBlockId()) => ({ id, type, props, content, children: [] });

/** 新的一天：三个分区标题，每个下面一个空行等着写 */
export const createDailyTemplate = () => DAILY_SECTIONS.flatMap((section) => [
  block('heading', { level: SECTION_HEADING_LEVEL }, parseInline(section.title)),
  block(section.itemType, section.itemType === 'checkListItem' ? { checked: false } : {}, []),
]);

export const blockPlainText = (target) => inlineToPlainText(target?.content).trim();

/** 块本身和子孙都没有内容（图片、分割线算有内容） */
export const isBlockEmpty = (target) => {
  if (CONTENTLESS_BLOCK_TYPES.has(target?.type)) return false;
  if (blockPlainText(target)) return false;
  return (target?.children ?? []).every(isBlockEmpty);
};

/** 整天没写任何东西（只剩标题和空行）就当空 */
export const isDailyBlocksEmpty = (blocks) => (Array.isArray(blocks) ? blocks : []).every((item) => (
  item.type === 'heading' ? (item.children ?? []).every(isBlockEmpty) : isBlockEmpty(item)
));

const isSectionHeading = (item, section) => item?.type === 'heading' && blockPlainText(item).includes(section.match);

/** 分区范围：[标题下标, 下一个标题下标) ；没找到返回 null */
export const findSectionRange = (blocks, key) => {
  const section = findSectionDef(key);
  const start = blocks.findIndex((item) => isSectionHeading(item, section));
  if (start < 0) return null;
  const next = blocks.findIndex((item, index) => index > start && item.type === 'heading');
  return { start, end: next < 0 ? blocks.length : next };
};

const withoutEmpty = (list) => list.filter((item) => !isBlockEmpty(item));

/**
 * 把块追加到某个分区末尾（分区里只有空占位行时替换掉它）。分区不存在就在末尾新建。
 * 返回新数组，不改入参。
 */
export const insertIntoSection = (blocks, key, newBlocks) => {
  if (!newBlocks?.length) return blocks;
  const source = Array.isArray(blocks) ? blocks : [];
  const range = findSectionRange(source, key);
  if (!range) {
    const heading = block('heading', { level: SECTION_HEADING_LEVEL }, parseInline(findSectionDef(key).title));
    return [...source, heading, ...newBlocks];
  }
  const heading = source[range.start];
  if (heading.children?.length) {
    const nextHeading = { ...heading, children: [...withoutEmpty(heading.children), ...newBlocks] };
    return source.map((item, index) => (index === range.start ? nextHeading : item));
  }
  const body = withoutEmpty(source.slice(range.start + 1, range.end));
  return [...source.slice(0, range.start + 1), ...body, ...newBlocks, ...source.slice(range.end)];
};

const isUndoneTask = (item) => item?.type === 'checkListItem' && !item.props?.checked && !isBlockEmpty(item);

/**
 * 拿走所有未勾选的任务（连同子级），其余原样保留。
 * @returns {{ blocks: Array, tasks: Array }}
 */
export const extractUndoneTasks = (blocks) => {
  const tasks = [];
  const walk = (list) => list.reduce((kept, item) => {
    if (isUndoneTask(item)) {
      tasks.push(item);
      return kept;
    }
    kept.push(item.children?.length ? { ...item, children: walk(item.children) } : item);
    return kept;
  }, []);
  return { blocks: walk(Array.isArray(blocks) ? blocks : []), tasks };
};

const collectTaskTexts = (blocks, result = new Set()) => {
  (blocks ?? []).forEach((item) => {
    if (isUndoneTask(item)) result.add(blockPlainText(item));
    collectTaskTexts(item.children, result);
  });
  return result;
};

/** 所有未完成任务的文字（给 AI 看的清单） */
export const listUndoneTaskTexts = (blocks) => [...collectTaskTexts(blocks)];

/** 去掉目标里已经有的同名未完成任务（结转幂等） */
export const dedupeTasks = (targetBlocks, tasks) => {
  const existing = collectTaskTexts(targetBlocks);
  return tasks.filter((task) => {
    const text = blockPlainText(task);
    if (existing.has(text)) return false;
    existing.add(text);
    return true;
  });
};

const matchesTask = (item, text) => {
  const plain = blockPlainText(item);
  return plain === text || plain.includes(text);
};

/**
 * 勾选 / 取消勾选第一个匹配的任务（先找完全相同，再找包含）。
 * @returns {{ blocks: Array, found: boolean, text?: string }}
 */
export const setTaskChecked = (blocks, text, checked = true) => {
  const target = String(text ?? '').trim();
  if (!target) return { blocks, found: false };
  const exact = (item) => blockPlainText(item) === target;
  for (const predicate of [exact, (item) => matchesTask(item, target)]) {
    let found = null;
    const walk = (list) => list.map((item) => {
      if (!found && item.type === 'checkListItem' && predicate(item)) {
        found = blockPlainText(item);
        return { ...item, props: { ...item.props, checked } };
      }
      return item.children?.length ? { ...item, children: walk(item.children) } : item;
    });
    const next = walk(blocks ?? []);
    if (found) return { blocks: next, found: true, text: found };
  }
  return { blocks, found: false };
};

/** 外部写进来的大纲：任务分区里顶层的普通行转成待勾选任务 */
export const toSectionItems = (blocks, key) => {
  if (key !== 'task') return blocks;
  return blocks.map((item) => (
    ['paragraph', 'bulletListItem', 'numberedListItem'].includes(item.type)
      ? { ...item, type: 'checkListItem', props: { ...item.props, checked: false } }
      : item
  ));
};

/* ── 旧数据（一条条记录 + 待办池）→ 大纲 ─────────────────── */

const LEGACY_SECTION_BY_TYPE = { task: 'task', event: 'event', note: 'note' };

/** 一条旧记录 → 一个列表块：第一段做正文，其余做子级 */
export const legacyItemToBlock = (item, { checked } = {}) => {
  const source = Array.isArray(item?.richText) && item.richText.length
    ? item.richText
    : markdownToBlocks(item?.text ?? '');
  const [first, ...rest] = source;
  const isTask = checked !== undefined;
  return {
    id: item?.id || createBlockId(),
    type: isTask ? 'checkListItem' : 'bulletListItem',
    props: isTask ? { checked: Boolean(checked) } : {},
    content: first?.content ?? [],
    children: [...(first?.children ?? []), ...rest],
  };
};

/** 旧的一天 → 大纲块；分区标题用固定 id，迁移合并时不会重复 */
export const legacyItemsToBlocks = (items, dateKey) => {
  const grouped = { task: [], event: [], note: [] };
  (items ?? []).forEach((item) => {
    const key = LEGACY_SECTION_BY_TYPE[item?.type] ?? 'note';
    grouped[key].push(legacyItemToBlock(item, key === 'task' ? { checked: item.done } : {}));
  });
  return DAILY_SECTIONS.flatMap((section) => (grouped[section.key].length ? [
    block('heading', { level: SECTION_HEADING_LEVEL }, parseInline(section.title), `${dateKey}-section-${section.key}`),
    ...grouped[section.key],
  ] : []));
};
