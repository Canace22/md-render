/**
 * 今日速记的富文本内容工具（纯函数，无副作用、不依赖 DOM）。
 *
 * 存储格式直接沿用 BlockNote 的 block 数组，好处是：
 * - 编辑器可以无损往返（颜色、加粗这类 Markdown 表达不了的样式不会丢）；
 * - 只读展示走结构化渲染，不需要 dangerouslySetInnerHTML，也不需要 HTML 消毒；
 * - 纯 JSON，能直接存进 daily-workspace.json 备份。
 *
 * 每个条目同时保留一份 `text` 纯文本投影（见 richTextToPlainText），
 * 供去重、结转、Agent 工具、搜索与导出使用。
 */

const MAX_BLOCKS = 200;
const MAX_DEPTH = 3;
const INDENT = '  ';

// 与 BlockNote 默认 block 类型对齐；不在表内的块（表格、图片等）统一降级成段落，
// 避免出现存得下、渲染不出来的内容。
const SUPPORTED_BLOCK_TYPES = new Set([
  'paragraph',
  'bulletListItem',
  'numberedListItem',
  'checkListItem',
]);

const LIST_BLOCK_TYPES = new Set(['bulletListItem', 'numberedListItem', 'checkListItem']);

const SUPPORTED_STYLE_FLAGS = ['bold', 'italic', 'underline', 'strike', 'code'];
const TEXT_ALIGNMENTS = new Set(['left', 'center', 'right', 'justify']);

// BlockNote 默认调色板；具体色值放在 styles.css 的 CSS 变量里，便于跟随亮/暗主题
export const DAILY_RICH_TEXT_COLORS = Object.freeze([
  'gray', 'brown', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink',
]);

const COLOR_NAMES = new Set(DAILY_RICH_TEXT_COLORS);

const normalizeColor = (value) => (COLOR_NAMES.has(value) ? value : '');

/** 颜色名 → CSS 变量引用；default / 未知颜色返回空字符串表示「不设色」 */
export const resolveRichTextColorVar = (value, kind = 'text') => {
  const color = normalizeColor(value);
  if (!color) return '';
  return `var(--daily-rich-${kind}-${color})`;
};

export const isRichTextBlockList = (value) => Array.isArray(value);

const normalizeStyles = (raw) => {
  if (!raw || typeof raw !== 'object') return {};
  const styles = {};
  for (const flag of SUPPORTED_STYLE_FLAGS) {
    if (raw[flag] === true) styles[flag] = true;
  }
  const textColor = normalizeColor(raw.textColor);
  if (textColor) styles.textColor = textColor;
  const backgroundColor = normalizeColor(raw.backgroundColor);
  if (backgroundColor) styles.backgroundColor = backgroundColor;
  return styles;
};

const normalizeInlineText = (value) => String(value ?? '').replace(/\r\n?/g, '\n');

const normalizeInlineContent = (raw, depth = 0) => {
  if (typeof raw === 'string') {
    const text = normalizeInlineText(raw);
    return text ? [{ type: 'text', text, styles: {} }] : [];
  }
  if (!Array.isArray(raw)) return [];

  const result = [];
  for (const node of raw) {
    if (typeof node === 'string') {
      const text = normalizeInlineText(node);
      if (text) result.push({ type: 'text', text, styles: {} });
      continue;
    }
    if (!node || typeof node !== 'object') continue;

    if (node.type === 'link' && depth === 0) {
      const href = typeof node.href === 'string' ? node.href.trim() : '';
      const content = normalizeInlineContent(node.content, depth + 1);
      // 只保留安全协议的链接；协议不合法时降级成纯文本，不丢内容
      if (href && /^(https?:|mailto:|#|\/)/i.test(href) && content.length > 0) {
        result.push({ type: 'link', href, content });
      } else {
        result.push(...content);
      }
      continue;
    }

    const text = normalizeInlineText(node.text);
    if (!text) continue;
    result.push({ type: 'text', text, styles: normalizeStyles(node.styles) });
  }
  return result;
};

const normalizeBlockProps = (raw, type) => {
  const props = {};
  if (raw && typeof raw === 'object') {
    if (TEXT_ALIGNMENTS.has(raw.textAlignment) && raw.textAlignment !== 'left') {
      props.textAlignment = raw.textAlignment;
    }
    const textColor = normalizeColor(raw.textColor);
    if (textColor) props.textColor = textColor;
    const backgroundColor = normalizeColor(raw.backgroundColor);
    if (backgroundColor) props.backgroundColor = backgroundColor;
  }
  if (type === 'checkListItem') {
    props.checked = Boolean(raw?.checked);
  }
  return props;
};

const normalizeBlock = (raw, depth, counter) => {
  if (!raw || typeof raw !== 'object') return null;
  if (counter.count >= MAX_BLOCKS) return null;

  const type = SUPPORTED_BLOCK_TYPES.has(raw.type) ? raw.type : 'paragraph';
  const content = normalizeInlineContent(raw.content);
  const children = depth < MAX_DEPTH ? normalizeBlockArray(raw.children, depth + 1, counter) : [];

  // 既没有文字也没有子块的空段落只在中间位置有意义（空行），这里先保留，
  // 由 normalizeRichText 统一裁掉首尾空块。
  counter.count += 1;

  const block = { type, content };
  const props = normalizeBlockProps(raw.props, type);
  if (Object.keys(props).length > 0) block.props = props;
  if (children.length > 0) block.children = children;
  return block;
};

function normalizeBlockArray(raw, depth, counter) {
  if (!Array.isArray(raw)) return [];
  const blocks = [];
  for (const item of raw) {
    const block = normalizeBlock(item, depth, counter);
    if (block) blocks.push(block);
  }
  return blocks;
}

const isEmptyBlock = (block) =>
  block.type === 'paragraph'
  && block.content.length === 0
  && (block.children?.length ?? 0) === 0;

const trimEmptyEdges = (blocks) => {
  let start = 0;
  let end = blocks.length;
  while (start < end && isEmptyBlock(blocks[start])) start += 1;
  while (end > start && isEmptyBlock(blocks[end - 1])) end -= 1;
  return blocks.slice(start, end);
};

/**
 * 规整任意来源（编辑器输出 / JSON 备份 / 手改文件）的富文本内容。
 * 返回干净的 block 数组；内容为空时返回 []。
 */
export const normalizeRichText = (value) => {
  let source = value;
  if (typeof source === 'string') {
    const trimmed = source.trim();
    if (!trimmed.startsWith('[')) return [];
    try {
      source = JSON.parse(trimmed);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(source)) return [];
  const blocks = trimEmptyEdges(normalizeBlockArray(source, 0, { count: 0 }));
  return blocks.length > 0 ? blocks : [];
};

const inlineContentToText = (content) => {
  if (!Array.isArray(content)) return '';
  return content
    .map((node) => {
      if (node?.type === 'link') return inlineContentToText(node.content);
      return node?.text ?? '';
    })
    .join('');
};

const buildBlockPrefix = (block, numberedIndex) => {
  if (block.type === 'bulletListItem') return '- ';
  if (block.type === 'numberedListItem') return `${numberedIndex}. `;
  if (block.type === 'checkListItem') return block.props?.checked ? '- [x] ' : '- [ ] ';
  return '';
};

const collectPlainLines = (blocks, depth, lines) => {
  let numberedIndex = 0;
  for (const block of blocks) {
    if (block.type === 'numberedListItem') numberedIndex += 1;
    else numberedIndex = 0;

    const text = inlineContentToText(block.content);
    const prefix = buildBlockPrefix(block, numberedIndex);
    if (text || prefix) {
      lines.push(`${INDENT.repeat(depth)}${prefix}${text}`);
    } else if (lines.length > 0) {
      lines.push('');
    }
    if (block.children?.length) collectPlainLines(block.children, depth + 1, lines);
  }
};

/**
 * 富文本 → 纯文本投影。列表用 Markdown 前缀（`- ` / `1. ` / `- [ ] `），
 * 这样投影本身也是合法 Markdown，导出和 Agent 侧读起来不别扭。
 */
export const richTextToPlainText = (blocks) => {
  const normalized = Array.isArray(blocks) ? blocks : normalizeRichText(blocks);
  const lines = [];
  collectPlainLines(normalized, 0, lines);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

/** 纯文本 → 富文本（旧数据进编辑器时用）：按行拆成段落，识别常见列表前缀 */
export const plainTextToRichText = (text) => {
  const raw = String(text ?? '').replace(/\r\n?/g, '\n');
  if (!raw.trim()) return [];
  return raw.split('\n').map((line) => {
    const checked = /^\s*-\s\[[xX]\]\s+/.test(line);
    const unchecked = /^\s*-\s\[\s?\]\s+/.test(line);
    if (checked || unchecked) {
      return {
        type: 'checkListItem',
        props: { checked },
        content: normalizeInlineContent(line.replace(/^\s*-\s\[[xX\s]?\]\s+/, '')),
      };
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      return { type: 'bulletListItem', content: normalizeInlineContent(line.replace(/^\s*[-*+]\s+/, '')) };
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      return { type: 'numberedListItem', content: normalizeInlineContent(line.replace(/^\s*\d+[.)]\s+/, '')) };
    }
    return { type: 'paragraph', content: normalizeInlineContent(line.trim()) };
  });
};

export const isRichTextEmpty = (blocks) => richTextToPlainText(blocks).length === 0;

/** 富文本是否带有纯文本表达不了的信息（样式、列表、多块）——只有这时才值得存 richText */
export const hasRichFormatting = (blocks) => {
  const normalized = Array.isArray(blocks) ? blocks : normalizeRichText(blocks);
  if (normalized.length === 0) return false;
  if (normalized.length > 1) return true;
  const [block] = normalized;
  if (block.type !== 'paragraph') return true;
  if (block.children?.length) return true;
  if (block.props && Object.keys(block.props).length > 0) return true;
  return block.content.some(
    (node) => node.type === 'link' || Object.keys(node.styles ?? {}).length > 0,
  );
};
