/**
 * 往返式 frontmatter 读写。
 *
 * 原理：把 frontmatter 按「顶层 key」切成一个个 block，每个 block 保留原始行。
 * 改属性时只重写涉及的那个 block，其余行（注释、空行、嵌套结构、块标量、
 * 我们不认识的写法）原样搬运回去。这样在 Obsidian 里手写的内容不会被吃掉。
 */

const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n)?/;
const KEY_LINE_RE = /^([^\s#:][^:]*):(?:[ \t]+(.*))?$/;
const LIST_ITEM_RE = /^[ \t]*-[ \t]+(.*)$/;
const BLOCK_SCALAR_RE = /^[|>][-+]?\d*$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const SAFE_BARE_RE = /^[\p{L}\p{N}_@./:-]+$/u;

/* ── 标量解析 ─────────────────────────────────────────────── */

const unquote = (text) => {
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) {
    try { return JSON.parse(text); } catch { return text.slice(1, -1); }
  }
  if (text.startsWith('\'') && text.endsWith('\'') && text.length >= 2) {
    return text.slice(1, -1).replace(/''/g, '\'');
  }
  return text;
};

const parseInlineList = (text) => {
  const inner = text.slice(1, -1).trim();
  if (!inner) return [];
  return inner.split(',').map((item) => unquote(item.trim())).filter((item) => item !== '');
};

export const parseScalar = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return '';
  if (text.startsWith('[') && text.endsWith(']')) return parseInlineList(text);
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
  return unquote(text);
};

/* ── 标量序列化 ───────────────────────────────────────────── */

const serializeScalar = (value) => {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);

  const text = String(value ?? '').trim();
  if (!text) return '""';
  if (DATE_RE.test(text) || DATETIME_RE.test(text)) return text;
  if (['true', 'false', 'null', '~', 'yes', 'no', 'on', 'off'].includes(text)) return JSON.stringify(text);
  if (/^-?\d+(\.\d+)?$/.test(text)) return JSON.stringify(text);
  return SAFE_BARE_RE.test(text) && !text.startsWith('-') ? text : JSON.stringify(text);
};

/**
 * 把一个键值对渲染成 frontmatter 行（不含首尾 --- ）。
 */
export const serializeEntryLines = (key, value) => {
  if (Array.isArray(value)) {
    const items = value.map((item) => String(item ?? '').trim()).filter(Boolean);
    if (items.length === 0) return [];
    return [`${key}:`, ...items.map((item) => `  - ${serializeScalar(item)}`)];
  }

  if (typeof value === 'string' && value.includes('\n')) {
    const lines = value.replace(/\r\n/g, '\n').split('\n');
    return [`${key}: |-`, ...lines.map((line) => `  ${line}`)];
  }

  return [`${key}: ${serializeScalar(value)}`];
};

/* ── 解析 ─────────────────────────────────────────────────── */

const isBlank = (line) => line.trim() === '';
const isComment = (line) => line.trimStart().startsWith('#');

const readEntryValue = (inlineRaw, restLines) => {
  const inline = String(inlineRaw ?? '').trim();

  if (BLOCK_SCALAR_RE.test(inline)) {
    const text = restLines.map((line) => line.replace(/^ {1,4}|\t/, '')).join('\n').trim();
    return { kind: 'block', value: text };
  }

  if (inline) {
    return { kind: 'scalar', value: parseScalar(inline) };
  }

  const listItems = restLines.filter((line) => !isBlank(line));
  if (listItems.length > 0 && listItems.every((line) => LIST_ITEM_RE.test(line))) {
    return {
      kind: 'list',
      value: listItems
        .map((line) => parseScalar(line.match(LIST_ITEM_RE)[1]))
        .filter((item) => item !== '' && item !== null),
    };
  }

  if (listItems.length > 0) {
    // 嵌套对象等我们不改写的结构：原样保留，值只用于只读展示
    return { kind: 'nested', value: listItems.join('\n') };
  }

  return { kind: 'scalar', value: '' };
};

/**
 * 解析出 blocks（有序、保留原始行）+ 扁平 frontmatter 对象 + 正文。
 */
export const parseFrontmatterDocument = (rawContent = '') => {
  const text = String(rawContent ?? '').replace(/\r\n/g, '\n');
  const match = text.match(FRONTMATTER_RE);

  if (!match) {
    return { hasFrontmatter: false, blocks: [], frontmatter: {}, content: text, gap: '' };
  }

  const lines = match[1].split('\n');
  const blocks = [];
  let current = null;

  const closeCurrent = () => {
    if (!current) return;
    const [, , inline] = current.lines[0].match(KEY_LINE_RE);
    const { kind, value } = readEntryValue(inline, current.lines.slice(1));
    blocks.push({ ...current, kind, value });
    current = null;
  };

  lines.forEach((line) => {
    const keyMatch = !line.startsWith(' ') && !line.startsWith('\t') ? line.match(KEY_LINE_RE) : null;

    if (keyMatch) {
      closeCurrent();
      current = { type: 'entry', key: keyMatch[1].trim(), lines: [line] };
      return;
    }

    if (current && !isBlank(line) && !isComment(line)) {
      current.lines.push(line);
      return;
    }

    closeCurrent();
    const last = blocks[blocks.length - 1];
    if (last?.type === 'raw') last.lines.push(line);
    else blocks.push({ type: 'raw', lines: [line] });
  });
  closeCurrent();

  const frontmatter = {};
  blocks.forEach((block) => {
    if (block.type === 'entry') frontmatter[block.key] = block.value;
  });

  const rest = text.slice(match[0].length);
  const gapMatch = rest.match(/^\n*/);

  return {
    hasFrontmatter: blocks.some((block) => block.type === 'entry'),
    blocks,
    frontmatter,
    content: rest.slice(gapMatch[0].length),
    // 正则已吃掉 close 行后的一个换行，补回来才是真实间距
    gap: `\n${gapMatch[0]}`,
  };
};

/* ── 更新 ─────────────────────────────────────────────────── */

const isEmptyValue = (value) => {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'string') return value.trim() === '';
  return false;
};

const renderDocument = (blocks, content, gap) => {
  const bodyLines = blocks.flatMap((block) => block.lines);
  while (bodyLines.length > 0 && isBlank(bodyLines[bodyLines.length - 1])) bodyLines.pop();

  const body = String(content ?? '');
  if (bodyLines.length === 0) return body;

  const separator = body ? (gap || '\n\n') : '\n';
  return `---\n${bodyLines.join('\n')}\n---${separator}${body}`;
};

/**
 * 只改写 patch 涉及的 key，其余内容原样保留。
 * 值为空（''/[]/null/undefined）默认表示删除该属性；
 * preserveEmptyKeys 可为模板文档保留明确的空属性槽。
 */
export const updateFrontmatterInMarkdown = (
  rawContent = '',
  patch = {},
  { preserveEmptyKeys = [] } = {},
) => {
  const doc = parseFrontmatterDocument(rawContent);
  const entries = Object.entries(patch ?? {});
  if (entries.length === 0) return String(rawContent ?? '').replace(/\r\n/g, '\n');

  const blocks = doc.blocks.map((block) => ({ ...block, lines: [...block.lines] }));
  const preservedEmptyKeys = new Set(preserveEmptyKeys);

  entries.forEach(([key, value]) => {
    const index = blocks.findIndex((block) => block.type === 'entry' && block.key === key);

    if (isEmptyValue(value) && !preservedEmptyKeys.has(key)) {
      if (index >= 0) blocks.splice(index, 1);
      return;
    }

    const nextLines = serializeEntryLines(key, value);
    if (index >= 0) {
      blocks[index] = { ...blocks[index], lines: nextLines, value };
      return;
    }
    blocks.push({ type: 'entry', key, lines: nextLines, value, kind: Array.isArray(value) ? 'list' : 'scalar' });
  });

  const gap = doc.hasFrontmatter ? doc.gap : '\n\n';
  return renderDocument(blocks, doc.content, gap);
};

/**
 * 只替换正文，frontmatter 原样保留。
 */
export const replaceMarkdownBody = (rawContent = '', nextBody = '') => {
  const doc = parseFrontmatterDocument(rawContent);
  if (!doc.hasFrontmatter) return String(nextBody ?? '');
  return renderDocument(doc.blocks, String(nextBody ?? '').replace(/^\n+/, ''), doc.gap);
};
