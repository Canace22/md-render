/**
 * Daily ↔ Markdown 文件（Daily/YYYY-MM-DD.md）。
 *
 * 新格式：一天一篇大纲 Markdown（标题分区 + 嵌套列表 + 勾选任务 + 图片），任何 AI / Obsidian 都能直接读。
 * Markdown 表达不了的东西（颜色、块 id……）放在文件末尾 HTML 注释里的 block JSON；
 * 读回时只有正文没被外部改过（hash 对得上）才用 JSON，改过就按 Markdown 重新解析。
 *
 * 旧格式（一条条记录 + Dataview 字段 + Todo.md 待办池）只读不写，读出来交给 renderer 转成大纲。
 *
 * 硬性要求：parse(serialize(x)) 和 x 完全相等（见单测）。纯函数，不依赖 DOM。
 */
import { blocksToMarkdown, markdownToBlocks } from '../daily/dailyMarkdown.js';
import { isDailyBlocksEmpty, legacyItemsToBlocks } from '../daily/dailyBlocks.js';

const DATA_BLOCK_START = '<!-- md-render:data';
const DATA_BLOCK_END = '-->';
const DATA_VERSION = 2;
const DEFAULT_PRIORITY = 'medium';
const CONTINUATION_INDENT = '  ';
const FIELD_RE = /\s\[([a-zA-Z]+)::\s*([^\]]*)\]/g;
const FIELD_TAIL_RE = /(\s\[[a-zA-Z]+::[^\]]*\])+\s*$/;
const LIST_ITEM_RE = /^- (?:\[( |x|X)\] )?(.*)$/;
const DAILY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n?/;
const LEGACY_FIELD_RE = /\[type::\s*(task|event|note)\]/;
const HASH_SEED = 5381;
const HASH_SHIFT = 5;
const HASH_RADIX = 36;
const TODO_TITLE = '# 待办池';
const TODO_MERGED_NOTICE = '> 待办池已并入今日速记：未完成任务会自动带到当天的「今日任务」。';
const UNSAFE_PLACEHOLDER = '（见数据块）';

export const TODO_FILE_NAME = 'Todo.md';
export const DAILY_DIR_NAME = 'Daily';

export const dailyFileName = (dateKey) => `${dateKey}.md`;
export const parseDailyFileName = (fileName) => String(fileName ?? '').match(DAILY_FILE_RE)?.[1] || '';

const toIso = (ms) => new Date(ms).toISOString();
const fromIso = (value) => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Date.now();
};

const formatFields = (fields) => fields
  .filter(([, value]) => value !== '' && value != null)
  .map(([key, value]) => ` [${key}:: ${value}]`)
  .join('');

/** 第一行如果本身就像字段，或者为空，就没法安全写进列表项，改存进数据块 */
const isUnsafeFirstLine = (line) => !line || FIELD_TAIL_RE.test(` ${line}`) || /^\[( |x|X)\] /.test(line);

/** 一条记录 → 列表项文本；返回 { lines, override } */
const serializeItem = ({ checkbox, text, fields, richText }) => {
  const [firstLine, ...rest] = String(text).split('\n');
  const unsafe = isUnsafeFirstLine(firstLine);
  const head = checkbox == null ? '- ' : `- [${checkbox ? 'x' : ' '}] `;
  const shownFirst = unsafe ? UNSAFE_PLACEHOLDER : firstLine;
  const lines = [`${head}${shownFirst}${formatFields(fields)}`];
  if (!unsafe) rest.forEach((line) => lines.push(`${CONTINUATION_INDENT}${line}`));

  const override = {};
  if (unsafe) override.text = text;
  if (richText?.length) Object.assign(override, { text, richText });
  return { lines, override: Object.keys(override).length ? override : null };
};

const serializeDataBlock = (data) => ['', DATA_BLOCK_START, JSON.stringify(data), DATA_BLOCK_END];

const serializeLegacyDataBlock = (overrides) => (Object.keys(overrides).length ? serializeDataBlock({ items: overrides }) : []);

/* ── 解析 ─────────────────────────────────────────────────── */

const splitDataBlock = (markdown) => {
  const text = String(markdown ?? '').replace(/\r\n/g, '\n');
  const start = text.lastIndexOf(DATA_BLOCK_START);
  if (start < 0) return { body: text, data: null };
  const end = text.indexOf(DATA_BLOCK_END, start);
  if (end < 0) return { body: text, data: null };
  // 数据块后面也可能有人手动追加内容，一并算进正文
  const body = `${text.slice(0, start)}\n${text.slice(end + DATA_BLOCK_END.length)}`;
  try {
    return { body, data: JSON.parse(text.slice(start + DATA_BLOCK_START.length, end).trim()) };
  } catch {
    return { body, data: null };
  }
};

/** 旧格式：数据块里按 id 存的原文 / 富文本 */
const splitLegacyDataBlock = (markdown) => {
  const { body, data } = splitDataBlock(markdown);
  return { body, overrides: data?.items ?? {} };
};

const readFields = (line) => {
  const fields = {};
  const tail = line.match(FIELD_TAIL_RE)?.[0] ?? '';
  for (const match of tail.matchAll(FIELD_RE)) fields[match[1]] = match[2].trim();
  return { text: tail ? line.slice(0, line.length - tail.length) : line, fields };
};

/** 把正文按列表项切开；缩进两格的行属于上一项，空行后面跟缩进行时算项内空行 */
const collectListItems = (body) => {
  const lines = body.split('\n');
  const items = [];
  lines.forEach((line, index) => {
    const match = line.match(LIST_ITEM_RE);
    if (match) {
      const { text, fields } = readFields(match[2]);
      items.push({ checkbox: match[1] == null ? null : match[1].toLowerCase() === 'x', lines: [text], fields });
      return;
    }
    const current = items[items.length - 1];
    if (!current) return;
    if (line.startsWith(CONTINUATION_INDENT)) {
      current.lines.push(line.slice(CONTINUATION_INDENT.length));
    } else if (line.trim() === '' && lines[index + 1]?.startsWith(CONTINUATION_INDENT)) {
      current.lines.push('');
    }
  });
  return items;
};

/** 套用数据块：列表项里的文字没被外部改过，才用数据块里的原文和富文本 */
const applyOverride = (item, override) => {
  if (!override?.text) return item;
  const untouched = item.text === UNSAFE_PLACEHOLDER || item.text === override.text;
  if (!untouched) return item;
  const next = { ...item, text: override.text };
  if (override.richText) next.richText = override.richText;
  return next;
};

/* ── Daily（大纲） ─────────────────────────────────────────── */

/** djb2：只用来判断正文有没有被外部改过 */
const hashText = (text) => {
  let hash = HASH_SEED;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << HASH_SHIFT) + hash + text.charCodeAt(index)) | 0;
  }
  return (hash >>> 0).toString(HASH_RADIX);
};

const stripFrontmatter = (text) => text.replace(FRONTMATTER_RE, '').trim();

/** 一天 → Markdown */
export const serializeDailyEntry = (entry) => {
  const blocks = Array.isArray(entry?.blocks) ? entry.blocks : [];
  const body = blocksToMarkdown(blocks);
  const lines = ['---', `date: ${entry.date}`, '---', ''];
  if (body) lines.push(body);
  if (blocks.length) lines.push(...serializeDataBlock({ version: DATA_VERSION, hash: hashText(body), blocks }));
  return `${lines.join('\n')}\n`;
};

const isLegacyDaily = (body, data) => Boolean(data?.items) || LEGACY_FIELD_RE.test(body);

/** Markdown → 一天（日期以文件名为准） */
export const parseDailyEntry = (markdown, dateKey) => {
  const { body, data } = splitDataBlock(markdown);
  if (isLegacyDaily(body, data)) {
    return { date: dateKey, blocks: legacyItemsToBlocks(parseLegacyDailyItems(markdown, dateKey), dateKey) };
  }
  const text = stripFrontmatter(body);
  if (Array.isArray(data?.blocks) && data.hash === hashText(text)) return { date: dateKey, blocks: data.blocks };
  return { date: dateKey, blocks: markdownToBlocks(text) };
};

/** 一天 → 给 AI 看的 Markdown（不带 frontmatter 和数据块） */
export const dailyEntryToMarkdown = (entry) => blocksToMarkdown(entry?.blocks ?? []);

/* ── 旧版 Daily（一条条记录 + Dataview 字段），只读 ──────────── */

/** 旧格式 Markdown → 一条条记录 */
const parseLegacyDailyItems = (markdown, dateKey) => {
  const { body, overrides } = splitLegacyDataBlock(markdown);
  const items = collectListItems(body).map((raw) => {
    const type = ['task', 'event', 'note'].includes(raw.fields.type) ? raw.fields.type : (raw.checkbox == null ? 'note' : 'task');
    const item = {
      id: raw.fields.id || `${dateKey}-${type}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      priority: raw.fields.priority || DEFAULT_PRIORITY,
      done: type === 'task' ? Boolean(raw.checkbox) : false,
      createdAt: fromIso(raw.fields.created),
      updatedAt: fromIso(raw.fields.updated || raw.fields.created),
      text: raw.lines.join('\n'),
    };
    if (raw.fields.category) item.category = raw.fields.category;
    return applyOverride(item, overrides[item.id]);
  }).filter((item) => item.text);
  return items;
};

/* ── 旧版待办池（Todo.md） ─────────────────────────────────── */

const todoFields = (item) => [
  ['source', item.sourceDate || ''],
  ['category', item.category || ''],
  ['id', item.id],
  ['created', toIso(item.createdAt)],
  ['updated', toIso(item.updatedAt)],
];

export const serializeTodoPool = (todoPool = []) => {
  const overrides = {};
  const lines = [TODO_TITLE, ''];
  todoPool.forEach((item) => {
    const serialized = serializeItem({ checkbox: null, text: item.text, fields: todoFields(item), richText: item.richText });
    lines.push(...serialized.lines);
    if (serialized.override) overrides[item.id] = serialized.override;
  });
  return `${[...lines, ...serializeLegacyDataBlock(overrides)].join('\n')}\n`;
};

export const parseTodoPool = (markdown) => {
  const { body, overrides } = splitLegacyDataBlock(markdown);
  return collectListItems(body).map((raw) => {
    const item = {
      id: raw.fields.id || `todo-${Math.random().toString(36).slice(2, 8)}`,
      sourceDate: raw.fields.source || '',
      createdAt: fromIso(raw.fields.created),
      updatedAt: fromIso(raw.fields.updated || raw.fields.created),
      text: raw.lines.join('\n'),
    };
    if (raw.fields.category) item.category = raw.fields.category;
    return applyOverride(item, overrides[item.id]);
  }).filter((item) => item.text);
};

/* ── 整个 Daily 工作区 ────────────────────────────────────── */

const hasBlocks = (entry) => Array.isArray(entry?.blocks) && entry.blocks.length > 0;

/**
 * 整个 dailyWorkspace → 文件列表（相对内容库根目录）。没内容的日子不写文件。
 * Todo.md 只写一句「已并入」说明：旧待办读出来后由 renderer 并到今天。
 * @returns {Array<{ relativePath: string, content: string }>}
 */
export const serializeDailyWorkspace = (dailyWorkspace) => [
  ...Object.values(dailyWorkspace?.entries ?? {})
    .filter(hasBlocks)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({ relativePath: `${DAILY_DIR_NAME}/${dailyFileName(entry.date)}`, content: serializeDailyEntry(entry) })),
  { relativePath: TODO_FILE_NAME, content: `${TODO_TITLE}\n\n${TODO_MERGED_NOTICE}\n` },
];

/**
 * 文件 → dailyWorkspace（currentDate 由调用方决定）。
 * todoPool 只会来自旧的 Todo.md，renderer normalize 时并进今天。
 * @param {{ dailyFiles: Array<{ fileName: string, content: string }>, todoContent?: string }} files
 */
export const parseDailyWorkspace = ({ dailyFiles = [], todoContent = '' }, currentDate) => {
  const entries = {};
  dailyFiles.forEach(({ fileName, content }) => {
    const dateKey = parseDailyFileName(fileName);
    if (!dateKey) return;
    const entry = parseDailyEntry(content, dateKey);
    if (!isDailyBlocksEmpty(entry.blocks)) entries[dateKey] = entry;
  });
  return { currentDate, entries, todoPool: todoContent ? parseTodoPool(todoContent) : [] };
};

/** 往返校验：列出转换前后不一致的日期（迁移时不为空就不切换） */
export const findDailyRoundTripMismatches = (dailyWorkspace) => {
  const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  return Object.values(dailyWorkspace?.entries ?? {})
    .filter(hasBlocks)
    .filter((entry) => !same(entry.blocks, parseDailyEntry(serializeDailyEntry(entry), entry.date).blocks))
    .map((entry) => ({ date: entry.date, id: '(大纲)' }));
};

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}
