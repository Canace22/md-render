/**
 * Daily / 待办池 ↔ Markdown 文件（Daily/YYYY-MM-DD.md、Todo.md）。
 *
 * 格式：一条记录一个列表项，属性用 Dataview 行内字段 `[key:: value]`，Obsidian 能直接看、能勾选。
 * Markdown 表达不了的富文本（颜色、下划线、背景色……）放在文件末尾的 HTML 注释里，
 * 读回时只有正文没被外部改过才套用，改过就以文件里的文字为准。
 *
 * 硬性要求：parse(serialize(x)) 和 x 完全相等（见单测）。纯函数，不依赖 DOM。
 */

const DATA_BLOCK_START = '<!-- md-render:data';
const DATA_BLOCK_END = '-->';
const DEFAULT_PRIORITY = 'medium';
const CONTINUATION_INDENT = '  ';
const FIELD_RE = /\s\[([a-zA-Z]+)::\s*([^\]]*)\]/g;
const FIELD_TAIL_RE = /(\s\[[a-zA-Z]+::[^\]]*\])+\s*$/;
const LIST_ITEM_RE = /^- (?:\[( |x|X)\] )?(.*)$/;
const DAILY_FILE_RE = /^(\d{4}-\d{2}-\d{2})\.md$/;
const TODO_TITLE = '# 待办池';
const DAILY_HEADING = '## 记录';
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

const serializeDataBlock = (overrides) => {
  if (!Object.keys(overrides).length) return [];
  return ['', DATA_BLOCK_START, JSON.stringify({ items: overrides }), DATA_BLOCK_END];
};

/* ── 解析 ─────────────────────────────────────────────────── */

const splitDataBlock = (markdown) => {
  const text = String(markdown ?? '').replace(/\r\n/g, '\n');
  const start = text.lastIndexOf(DATA_BLOCK_START);
  if (start < 0) return { body: text, overrides: {} };
  const end = text.indexOf(DATA_BLOCK_END, start);
  if (end < 0) return { body: text, overrides: {} };
  // 数据块后面也可能有人手动追加条目，一并算进正文
  const body = `${text.slice(0, start)}\n${text.slice(end + DATA_BLOCK_END.length)}`;
  try {
    const data = JSON.parse(text.slice(start + DATA_BLOCK_START.length, end).trim());
    return { body, overrides: data?.items ?? {} };
  } catch {
    return { body, overrides: {} };
  }
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

/* ── Daily ────────────────────────────────────────────────── */

const dailyItemFields = (item) => [
  ['type', item.type],
  ['priority', item.priority === DEFAULT_PRIORITY ? '' : item.priority],
  ['category', item.category || ''],
  ['id', item.id],
  ['created', toIso(item.createdAt)],
  ['updated', toIso(item.updatedAt)],
];

/** 一天 → Markdown */
export const serializeDailyEntry = (entry) => {
  const overrides = {};
  const lines = ['---', `date: ${entry.date}`, '---', '', DAILY_HEADING, ''];
  entry.items.forEach((item) => {
    const serialized = serializeItem({
      checkbox: item.type === 'task' ? Boolean(item.done) : null,
      text: item.text,
      fields: dailyItemFields(item),
      richText: item.richText,
    });
    lines.push(...serialized.lines);
    if (serialized.override) overrides[item.id] = serialized.override;
  });
  return `${[...lines, ...serializeDataBlock(overrides)].join('\n')}\n`;
};

/** Markdown → 一天（日期以文件名为准） */
export const parseDailyEntry = (markdown, dateKey) => {
  const { body, overrides } = splitDataBlock(markdown);
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
  return { date: dateKey, items };
};

/* ── 待办池 ───────────────────────────────────────────────── */

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
  return `${[...lines, ...serializeDataBlock(overrides)].join('\n')}\n`;
};

export const parseTodoPool = (markdown) => {
  const { body, overrides } = splitDataBlock(markdown);
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

/**
 * 整个 dailyWorkspace → 文件列表（相对内容库根目录）。没有条目的日子不写文件。
 * @returns {Array<{ relativePath: string, content: string }>}
 */
export const serializeDailyWorkspace = (dailyWorkspace) => [
  ...Object.values(dailyWorkspace?.entries ?? {})
    .filter((entry) => entry.items.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((entry) => ({ relativePath: `${DAILY_DIR_NAME}/${dailyFileName(entry.date)}`, content: serializeDailyEntry(entry) })),
  { relativePath: TODO_FILE_NAME, content: serializeTodoPool(dailyWorkspace?.todoPool ?? []) },
];

/**
 * 文件 → dailyWorkspace（currentDate 由调用方决定）
 * @param {{ dailyFiles: Array<{ fileName: string, content: string }>, todoContent?: string }} files
 */
export const parseDailyWorkspace = ({ dailyFiles = [], todoContent = '' }, currentDate) => {
  const entries = {};
  dailyFiles.forEach(({ fileName, content }) => {
    const dateKey = parseDailyFileName(fileName);
    if (dateKey) entries[dateKey] = parseDailyEntry(content, dateKey);
  });
  return { currentDate, entries, todoPool: todoContent ? parseTodoPool(todoContent) : [] };
};

/**
 * 往返校验：列出转换前后不一致的条目 id（迁移时不为空就不切换）
 */
export const findDailyRoundTripMismatches = (dailyWorkspace) => {
  const mismatches = [];
  const same = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  Object.values(dailyWorkspace?.entries ?? {}).forEach((entry) => {
    const back = parseDailyEntry(serializeDailyEntry(entry), entry.date);
    entry.items.forEach((item, index) => {
      if (!same(item, back.items[index])) mismatches.push({ date: entry.date, id: item.id });
    });
    if (back.items.length !== entry.items.length) mismatches.push({ date: entry.date, id: '(数量不一致)' });
  });
  const todoBack = parseTodoPool(serializeTodoPool(dailyWorkspace?.todoPool ?? []));
  (dailyWorkspace?.todoPool ?? []).forEach((item, index) => {
    if (!same(item, todoBack[index])) mismatches.push({ date: 'todo', id: item.id });
  });
  return mismatches;
};

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortKeys(value[key])]));
}
