/**
 * 今日速记大纲：BlockNote block 数组 ↔ Markdown（纯函数，不依赖 DOM / BlockNote）。
 *
 * 只覆盖速记会用到的子集：标题、段落、三种列表（含勾选）、图片、引用、代码块、分割线。
 * 颜色、下划线这类 Markdown 表达不了的样式会丢——磁盘文件另存一份 block JSON 兜底（见 dailyFormat.js）。
 *
 * 图片：编辑器里是 local-media://<编码后的绝对路径>，Markdown 里写成本地绝对路径，
 * 这样 Claude Code 这类本地 AI 拿到文件就能直接打开图片。
 */

const LOCAL_MEDIA_PREFIX = 'local-media://';
const LIST_INDENT = '  ';
const MAX_HEADING_LEVEL = 3;
const ID_RADIX = 36;
const ID_RANDOM_LENGTH = 8;

const LIST_ITEM_RE = /^([-*+]|\d+[.)])\s+(?:\[( |x|X)\]\s+)?(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const IMAGE_LINE_RE = /^!\[([^\]]*)\]\(\s*(<[^>\n]+>|[^\s)]+)(?:\s+"[^"]*")?\s*\)$/;
const DIVIDER_RE = /^(?:-{3,}|\*{3,}|_{3,})$/;
const FENCE_RE = /^```(.*)$/;
const INLINE_RE = /(`[^`]+`)|(\*\*[^*]+?\*\*)|(~~[^~]+?~~)|(\*[^*\s][^*]*?\*)|(\[[^\]]+\]\([^)\s]+\))/;

let idCounter = 0;
export const createBlockId = () => {
  idCounter += 1;
  return `daily-${Date.now().toString(ID_RADIX)}-${idCounter.toString(ID_RADIX)}-${Math.random().toString(ID_RADIX).slice(2, 2 + ID_RANDOM_LENGTH)}`;
};

/* ── 行内 ─────────────────────────────────────────────────── */

const textNode = (text, styles = {}) => ({ type: 'text', text, styles: { ...styles } });

const sameStyles = (a, b) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {});

const mergeAdjacentText = (nodes) => nodes.reduce((result, node) => {
  const last = result[result.length - 1];
  if (node.type === 'text' && last?.type === 'text' && sameStyles(last.styles, node.styles)) {
    result[result.length - 1] = { ...last, text: last.text + node.text };
  } else if (node.type !== 'text' || node.text) {
    result.push(node);
  }
  return result;
}, []);

const parseInlineToken = (token, styles) => {
  if (token.startsWith('`')) return [textNode(token.slice(1, -1), { ...styles, code: true })];
  if (token.startsWith('**')) return parseInline(token.slice(2, -2), { ...styles, bold: true });
  if (token.startsWith('~~')) return parseInline(token.slice(2, -2), { ...styles, strike: true });
  if (token.startsWith('*')) return parseInline(token.slice(1, -1), { ...styles, italic: true });
  const link = token.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
  return [{ type: 'link', href: link[2], content: parseInline(link[1], styles) }];
};

/** Markdown 行内文本 → BlockNote 行内内容 */
export function parseInline(text, styles = {}) {
  const nodes = [];
  let rest = String(text ?? '');
  while (rest) {
    const match = rest.match(INLINE_RE);
    if (!match) {
      nodes.push(textNode(rest, styles));
      break;
    }
    if (match.index > 0) nodes.push(textNode(rest.slice(0, match.index), styles));
    nodes.push(...parseInlineToken(match[0], styles));
    rest = rest.slice(match.index + match[0].length);
  }
  return mergeAdjacentText(nodes);
}

const wrapStyles = (text, styles = {}) => {
  if (!text) return '';
  if (styles.code) return `\`${text}\``;
  let result = text;
  if (styles.italic) result = `*${result}*`;
  if (styles.bold) result = `**${result}**`;
  if (styles.strike) result = `~~${result}~~`;
  return result;
};

/** BlockNote 行内内容 → Markdown 文本 */
export const inlineToMarkdown = (content) => {
  if (typeof content === 'string') return content;
  return (Array.isArray(content) ? content : []).map((node) => {
    if (node?.type === 'link') return `[${inlineToMarkdown(node.content)}](${node.href ?? ''})`;
    return wrapStyles(String(node?.text ?? ''), node?.styles);
  }).join('');
};

/** 行内内容 → 纯文本（去重、搜索、比对用） */
export const inlineToPlainText = (content) => {
  if (typeof content === 'string') return content;
  return (Array.isArray(content) ? content : []).map((node) => (
    node?.type === 'link' ? inlineToPlainText(node.content) : String(node?.text ?? '')
  )).join('');
};

/* ── 图片地址 ─────────────────────────────────────────────── */

const safeDecode = (segment) => {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
};

const isAbsolutePath = (value) => value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);

/** 编辑器地址 → Markdown 里的地址（local-media → 本地绝对路径） */
export const imageUrlToMarkdown = (url = '') => {
  const text = String(url);
  if (!text.toLowerCase().startsWith(LOCAL_MEDIA_PREFIX)) return text;
  const decoded = text.slice(LOCAL_MEDIA_PREFIX.length).split('/').map(safeDecode).join('/');
  return /^[A-Za-z]:/.test(decoded) || decoded.startsWith('/') ? decoded : `/${decoded}`;
};

/** Markdown 里的地址 → 编辑器地址（本地绝对路径 → local-media） */
export const imageUrlFromMarkdown = (url = '') => {
  const text = String(url).replace(/^<|>$/g, '');
  if (!isAbsolutePath(text)) return text;
  const encoded = text.replace(/\\/g, '/').split('/').map((segment) => encodeURIComponent(segment)).join('/');
  return `${LOCAL_MEDIA_PREFIX}${encoded}`;
};

const formatImageTarget = (url) => (/[\s()]/.test(url) ? `<${url}>` : url);

/* ── 块 → Markdown ────────────────────────────────────────── */

const LIST_MARKERS = {
  bulletListItem: () => '- ',
  toggleListItem: () => '- ',
  numberedListItem: () => '1. ',
  checkListItem: (block) => (block.props?.checked ? '- [x] ' : '- [ ] '),
};

const blockLines = (block, indent) => {
  const text = inlineToMarkdown(block.content);
  const [first = '', ...rest] = text.split('\n');
  const continuation = rest.map((line) => `${indent}${LIST_INDENT}${line}`);
  switch (block.type) {
    case 'heading': {
      const level = Math.min(Number(block.props?.level) || 1, MAX_HEADING_LEVEL);
      return { lines: [`${'#'.repeat(level)} ${text.replace(/\n/g, ' ')}`], spaced: true };
    }
    case 'image': {
      const url = imageUrlToMarkdown(block.props?.url);
      return { lines: [`${indent}![${block.props?.name ?? ''}](${formatImageTarget(url)})`], spaced: !indent };
    }
    case 'quote':
      return { lines: text.split('\n').map((line) => `${indent}> ${line}`), spaced: !indent };
    case 'codeBlock':
      return { lines: [`${indent}\`\`\`${block.props?.language ?? ''}`, ...text.split('\n').map((line) => `${indent}${line}`), `${indent}\`\`\``], spaced: !indent };
    case 'divider':
      return { lines: [`${indent}---`], spaced: !indent };
    case 'table':
      return { lines: [`${indent}（表格）`], spaced: !indent };
    default: {
      const marker = LIST_MARKERS[block.type]?.(block);
      if (marker) return { lines: [`${indent}${marker}${first}`, ...continuation], spaced: false };
      return { lines: [`${indent}${first}`, ...continuation], spaced: !indent };
    }
  }
};

const appendBlock = (output, block, indent) => {
  const { lines, spaced } = blockLines(block, indent);
  if (spaced && output.length && output[output.length - 1] !== '') output.push('');
  output.push(...lines);
  // 标题的子块：Markdown 里标题没有「子级」，按同级平铺
  const childIndent = block.type === 'heading' ? indent : `${indent}${LIST_INDENT}`;
  if (block.type === 'heading' && block.children?.length) output.push('');
  (block.children ?? []).forEach((child) => appendBlock(output, child, childIndent));
  if (spaced) output.push('');
};

/** 块数组 → Markdown（末尾不带多余空行） */
export const blocksToMarkdown = (blocks) => {
  const output = [];
  (Array.isArray(blocks) ? blocks : []).forEach((block) => appendBlock(output, block, ''));
  return output.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/* ── Markdown → 块 ────────────────────────────────────────── */

const makeBlock = (type, props, content, idFactory) => ({
  id: idFactory(),
  type,
  props,
  ...(content === undefined ? {} : { content }),
  children: [],
});

const listBlock = (match, idFactory) => {
  const [, marker, check, rest] = match;
  const image = rest.match(IMAGE_LINE_RE);
  if (image && check == null) return imageBlock(image, idFactory);
  if (check != null) return makeBlock('checkListItem', { checked: check.toLowerCase() === 'x' }, parseInline(rest), idFactory);
  const type = /^\d/.test(marker) ? 'numberedListItem' : 'bulletListItem';
  return makeBlock(type, {}, parseInline(rest), idFactory);
};

function imageBlock(match, idFactory) {
  return makeBlock('image', { url: imageUrlFromMarkdown(match[2]), name: match[1], caption: '' }, undefined, idFactory);
}

const lineToBlock = (text, idFactory) => {
  const list = text.match(LIST_ITEM_RE);
  if (list) return listBlock(list, idFactory);
  const image = text.match(IMAGE_LINE_RE);
  if (image) return imageBlock(image, idFactory);
  if (DIVIDER_RE.test(text)) return makeBlock('divider', {}, undefined, idFactory);
  if (text.startsWith('> ')) return makeBlock('quote', {}, parseInline(text.slice(2)), idFactory);
  return makeBlock('paragraph', {}, parseInline(text), idFactory);
};

const measureIndent = (line) => line.match(/^[ \t]*/)[0].replace(/\t/g, '    ').length;

/** 读 ``` 代码块，返回 { block, nextIndex } */
const readFence = (lines, start, language, idFactory) => {
  const body = [];
  let index = start + 1;
  while (index < lines.length && !FENCE_RE.test(lines[index].trim())) {
    body.push(lines[index]);
    index += 1;
  }
  const block = makeBlock('codeBlock', { language: language.trim() }, [textNode(body.join('\n'))], idFactory);
  return { block, nextIndex: index + 1 };
};

/**
 * Markdown → 块数组。缩进决定层级：比上一个块缩进更深就挂到它下面。
 * @param {string} markdown
 * @param {{ idFactory?: () => string }} [options]
 */
export const markdownToBlocks = (markdown, { idFactory = createBlockId } = {}) => {
  const lines = String(markdown ?? '').replace(/\r\n?/g, '\n').split('\n');
  const root = [];
  let stack = [];
  const attach = (block, indent) => {
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const parent = stack[stack.length - 1]?.block;
    (parent ? parent.children : root).push(block);
    stack.push({ indent, block });
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const text = line.trim();
    if (!text) continue;
    const indent = measureIndent(line);
    const fence = text.match(FENCE_RE);
    if (fence) {
      const { block, nextIndex } = readFence(lines, index, fence[1], idFactory);
      attach(block, indent);
      index = nextIndex - 1;
      continue;
    }
    const heading = indent === 0 ? text.match(HEADING_RE) : null;
    if (heading) {
      const level = Math.min(heading[1].length, MAX_HEADING_LEVEL);
      root.push(makeBlock('heading', { level }, parseInline(heading[2]), idFactory));
      stack = [];
      continue;
    }
    attach(lineToBlock(text, idFactory), indent);
  }
  return root;
};
