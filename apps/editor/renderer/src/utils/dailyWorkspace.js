/**
 * 今日速记工作区（纯函数，无副作用）：一天 = 一篇大纲（BlockNote 块数组）。
 *
 * 形状：{ currentDate, entries: { 'YYYY-MM-DD': { date, blocks } } }
 * 块级操作在 shared/daily/dailyBlocks.js，这里只管「哪一天」和跨天结转。
 */
import {
  createDailyTemplate,
  dedupeTasks,
  extractUndoneTasks,
  findSectionDef,
  insertIntoSection,
  isDailyBlocksEmpty,
  legacyItemToBlock,
  legacyItemsToBlocks,
  setBlockOrganized,
  setTaskChecked,
  toSectionItems,
  updateBlockById,
} from '@shared/daily/dailyBlocks.js';
import { blocksToMarkdown, markdownToBlocks } from '@shared/daily/dailyMarkdown.js';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAYS_PER_WEEK = 7;
const SUNDAY = 0;

const padNumber = (value) => String(value).padStart(2, '0');

const formatDateKey = (date) => `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;

const toDateAtNoon = (dateKey) => {
  const [year, month, day] = normalizeDateKey(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

export const getTodayDateKey = (baseDate = new Date()) => formatDateKey(baseDate);

export function normalizeDateKey(value, fallback = getTodayDateKey()) {
  if (typeof value === 'string' && DATE_KEY_RE.test(value.trim())) return value.trim();
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isFinite(parsed.getTime()) ? formatDateKey(parsed) : fallback;
}

export const shiftDateKey = (dateKey, offsetDays) => {
  const date = toDateAtNoon(dateKey);
  date.setDate(date.getDate() + Number(offsetDays || 0));
  return formatDateKey(date);
};

/** 这一周的周一（周一开头，周日算上一周） */
export const getWeekStartDateKey = (dateKey) => {
  const weekday = toDateAtNoon(dateKey).getDay();
  return shiftDateKey(dateKey, weekday === SUNDAY ? 1 - DAYS_PER_WEEK : 1 - weekday);
};

export const getWeekEndDateKey = (dateKey) => shiftDateKey(getWeekStartDateKey(dateKey), DAYS_PER_WEEK - 1);

/** 10月9日，星期五 */
export const formatDailyHeading = (dateKey) => toDateAtNoon(dateKey).toLocaleDateString('zh-CN', {
  month: 'long',
  day: 'numeric',
  weekday: 'long',
});

export const createEmptyDailyWorkspace = (baseDate) => ({ currentDate: normalizeDateKey(baseDate), entries: {} });

export const createEmptyDailyEntry = (dateKey) => ({ date: normalizeDateKey(dateKey), blocks: [] });

/* ── 归一化（含旧数据转换） ───────────────────────────────── */

const normalizeEntry = (entry, dateKey) => {
  if (Array.isArray(entry?.blocks)) return entry.date === dateKey ? entry : { ...entry, date: dateKey };
  // 旧数据：一条条记录（task/event/note）
  return { date: dateKey, blocks: legacyItemsToBlocks(Array.isArray(entry?.items) ? entry.items : [], dateKey) };
};

/** 旧待办池并进某天的「今日任务」（按文本去重，重复执行不会多出来） */
const foldLegacyTodoPool = (entries, todoPool, dateKey) => {
  const tasks = todoPool.filter((item) => String(item?.text ?? '').trim() || item?.richText?.length)
    .map((item) => legacyItemToBlock(item, { checked: false }));
  if (!tasks.length) return entries;
  const blocks = entries[dateKey]?.blocks?.length ? entries[dateKey].blocks : createDailyTemplate();
  return { ...entries, [dateKey]: { date: dateKey, blocks: insertIntoSection(blocks, 'task', dedupeTasks(blocks, tasks)) } };
};

export const normalizeDailyWorkspace = (raw, baseDate) => {
  const currentDate = normalizeDateKey(raw?.currentDate, normalizeDateKey(baseDate));
  const rawEntries = raw?.entries && typeof raw.entries === 'object' ? raw.entries : {};
  let entries = {};
  Object.entries(rawEntries).forEach(([key, entry]) => {
    const dateKey = normalizeDateKey(key, '');
    if (!dateKey) return;
    const normalized = normalizeEntry(entry, dateKey);
    if (!isDailyBlocksEmpty(normalized.blocks)) entries[dateKey] = normalized;
  });
  if (Array.isArray(raw?.todoPool) && raw.todoPool.length) {
    // 并到「当前日期」（不晚于今天）；之后进入今天时结转会把没做完的带过去
    const today = getTodayDateKey();
    entries = foldLegacyTodoPool(entries, raw.todoPool, currentDate < today ? currentDate : today);
  }
  return { currentDate, entries };
};

export const getDailyEntry = (dailyWorkspace, dateKey) => {
  const key = normalizeDateKey(dateKey, dailyWorkspace?.currentDate);
  const entry = dailyWorkspace?.entries?.[key];
  return Array.isArray(entry?.blocks) ? entry : createEmptyDailyEntry(key);
};

/** 编辑器初始内容：有内容用内容，没有给模板 */
export const getDailyBlocksForEditor = (dailyWorkspace, dateKey) => {
  const { blocks } = getDailyEntry(dailyWorkspace, dateKey);
  return blocks.length ? blocks : createDailyTemplate();
};

/** 以 preferred 为准，fallback 只补 preferred 没有的日期 */
export const mergeDailyWorkspaces = (preferred, fallback, baseDate) => {
  const primary = normalizeDailyWorkspace(preferred, baseDate);
  const secondary = normalizeDailyWorkspace(fallback, primary.currentDate);
  return { currentDate: primary.currentDate, entries: { ...secondary.entries, ...primary.entries } };
};

/* ── 修改 ─────────────────────────────────────────────────── */

const withEntryBlocks = (dailyWorkspace, dateKey, blocks) => {
  const entries = { ...(dailyWorkspace?.entries ?? {}) };
  if (isDailyBlocksEmpty(blocks)) delete entries[dateKey];
  else entries[dateKey] = { date: dateKey, blocks };
  return { ...dailyWorkspace, entries };
};

/** 纯视图切换：只改 currentDate，不搬运任何内容 */
export const setDailyCurrentDate = (dailyWorkspace, dateKey) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace, dateKey);
  return { ...normalized, currentDate: normalizeDateKey(dateKey, normalized.currentDate) };
};

/** 编辑器写回一整天 */
export const setDailyEntryBlocks = (dailyWorkspace, dateKey, blocks) => (
  withEntryBlocks(normalizeDailyWorkspace(dailyWorkspace, dateKey), normalizeDateKey(dateKey), Array.isArray(blocks) ? blocks : [])
);

/**
 * 跨天结转（破坏性，只在真正进入今天时跑）：过去所有日子里没勾掉的任务（连同子级）
 * 搬到今天「今日任务」末尾；今天已有同名未完成任务的不重复加。幂等。
 */
export const carryOverIncompleteTasks = (dailyWorkspace, targetDateKey) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace, targetDateKey);
  const today = normalizeDateKey(targetDateKey, normalized.currentDate);
  let next = { ...normalized, currentDate: today };
  const carried = [];
  Object.keys(normalized.entries).filter((key) => key < today).sort().forEach((key) => {
    const { blocks, tasks } = extractUndoneTasks(normalized.entries[key].blocks);
    if (!tasks.length) return;
    carried.push(...tasks);
    next = withEntryBlocks(next, key, blocks);
  });
  if (!carried.length) return next;
  const todayBlocks = getDailyBlocksForEditor(next, today);
  return withEntryBlocks(next, today, insertIntoSection(todayBlocks, 'task', dedupeTasks(todayBlocks, carried)));
};

/**
 * 往某天某个分区追加一段大纲 Markdown（AI / 外部工具写入用）。
 * 任务分区里的普通行自动变成待勾选任务。
 */
export const appendDailyMarkdown = (dailyWorkspace, dateKey, sectionKey, markdown) => {
  const key = normalizeDateKey(dateKey);
  const section = findSectionDef(sectionKey).key;
  const added = toSectionItems(markdownToBlocks(markdown), section);
  if (!added.length) return normalizeDailyWorkspace(dailyWorkspace, key);
  const normalized = normalizeDailyWorkspace(dailyWorkspace, key);
  return withEntryBlocks(normalized, key, insertIntoSection(getDailyBlocksForEditor(normalized, key), section, added));
};

/** 勾选 / 取消勾选某天的任务；返回 { dailyWorkspace, found, text } */
export const setDailyTaskDone = (dailyWorkspace, dateKey, text, done = true) => {
  const key = normalizeDateKey(dateKey);
  const normalized = normalizeDailyWorkspace(dailyWorkspace, key);
  const result = setTaskChecked(getDailyEntry(normalized, key).blocks, text, done);
  if (!result.found) return { dailyWorkspace: normalized, found: false };
  return { dailyWorkspace: withEntryBlocks(normalized, key, result.blocks), found: true, text: result.text };
};

/** 某天的大纲 Markdown（复制给 AI、Agent 读取用） */
export const getDailyMarkdown = (dailyWorkspace, dateKey) => blocksToMarkdown(getDailyEntry(dailyWorkspace, dateKey).blocks);

/** 把某天的一条笔记标成「已整理」/ 取消；返回 { dailyWorkspace, found } */
export const setDailyNoteOrganized = (dailyWorkspace, dateKey, blockId, organized = true) => {
  const key = normalizeDateKey(dateKey);
  const normalized = normalizeDailyWorkspace(dailyWorkspace, key);
  const result = updateBlockById(getDailyEntry(normalized, key).blocks, blockId, (item) => setBlockOrganized(item, organized));
  if (!result.found) return { dailyWorkspace: normalized, found: false };
  return { dailyWorkspace: withEntryBlocks(normalized, key, result.blocks), found: true };
};
