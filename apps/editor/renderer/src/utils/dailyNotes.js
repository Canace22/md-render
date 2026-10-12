/**
 * 速记笔记汇总（纯函数）：把每天「💡 笔记」分区的顶层条目拎出来，按周（周一开头）分组，
 * 给右侧汇总面板查看和整理用。「已整理」就是条目行尾的 #已整理 标签（见 dailyBlocks.js）。
 */
import {
  blockPlainText,
  getSectionItems,
  isBlockEmpty,
  isBlockOrganized,
  stripOrganizedTag,
} from '@shared/daily/dailyBlocks.js';
import { getTodayDateKey, getWeekEndDateKey, getWeekStartDateKey, shiftDateKey } from './dailyWorkspace.js';

const NOTE_SECTION_KEY = 'note';
const IMAGE_PLACEHOLDER = '[图片]';
const DETAIL_SEPARATOR = ' · ';
const DAYS_PER_WEEK = 7;

export const NOTE_FILTERS = Object.freeze({ ALL: 'all', PENDING: 'pending', ORGANIZED: 'organized' });

const childTexts = (blocks, result = []) => {
  (blocks ?? []).forEach((item) => {
    const text = item.type === 'image' ? IMAGE_PLACEHOLDER : stripOrganizedTag(blockPlainText(item));
    if (text) result.push(text);
    childTexts(item.children, result);
  });
  return result;
};

const toNote = (date, item) => ({
  key: `${date}:${item.id}`,
  date,
  blockId: item.id,
  title: item.type === 'image' ? IMAGE_PLACEHOLDER : stripOrganizedTag(blockPlainText(item)),
  detail: childTexts(item.children).join(DETAIL_SEPARATOR),
  organized: isBlockOrganized(item),
  canOrganize: Array.isArray(item.content),
});

/** 所有日子的笔记，按日期从新到旧 */
export const collectDailyNotes = (dailyWorkspace) => {
  const entries = dailyWorkspace?.entries ?? {};
  return Object.keys(entries).sort().reverse().flatMap((date) => (
    getSectionItems(entries[date]?.blocks, NOTE_SECTION_KEY)
      .filter((item) => !isBlockEmpty(item))
      .map((item) => toNote(date, item))
  ));
};

export const filterNotes = (notes, filter) => {
  if (filter === NOTE_FILTERS.PENDING) return notes.filter((note) => !note.organized);
  if (filter === NOTE_FILTERS.ORGANIZED) return notes.filter((note) => note.organized);
  return notes;
};

const parseDateKey = (dateKey) => dateKey.split('-').map(Number);

const formatMonthDay = (dateKey) => {
  const [, month, day] = parseDateKey(dateKey);
  return `${month}月${day}日`;
};

/** 10月6日 – 10月12日（不是今年的加上年份） */
export const formatWeekRange = (weekStart, today = getTodayDateKey()) => {
  const [year] = parseDateKey(weekStart);
  const prefix = year === parseDateKey(today)[0] ? '' : `${year}年`;
  return `${prefix}${formatMonthDay(weekStart)} – ${formatMonthDay(getWeekEndDateKey(weekStart))}`;
};

const getWeekTag = (weekStart, today) => {
  const thisWeek = getWeekStartDateKey(today);
  if (weekStart === thisWeek) return '本周';
  if (weekStart === shiftDateKey(thisWeek, -DAYS_PER_WEEK)) return '上周';
  return '';
};

/** 10月9日 周四 */
export const formatNoteDate = (dateKey) => {
  const [year, month, day] = parseDateKey(dateKey);
  const weekday = new Date(year, month - 1, day).toLocaleDateString('zh-CN', { weekday: 'short' });
  return `${formatMonthDay(dateKey)} ${weekday}`;
};

/**
 * 按周分组（新的周在前），保持传入顺序。
 * @returns {Array<{ weekStart, label, tag, notes, organizedCount }>}
 */
export const groupNotesByWeek = (notes, today = getTodayDateKey()) => {
  const groups = new Map();
  notes.forEach((note) => {
    const weekStart = getWeekStartDateKey(note.date);
    if (!groups.has(weekStart)) groups.set(weekStart, []);
    groups.get(weekStart).push(note);
  });
  return [...groups.keys()].sort().reverse().map((weekStart) => {
    const weekNotes = groups.get(weekStart);
    return {
      weekStart,
      label: formatWeekRange(weekStart, today),
      tag: getWeekTag(weekStart, today),
      notes: weekNotes,
      organizedCount: weekNotes.filter((note) => note.organized).length,
    };
  });
};
