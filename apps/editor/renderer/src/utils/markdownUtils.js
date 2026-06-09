/**
 * Markdown 文本处理工具
 */

export const normalizeMarkdown = (value) => {
  const str = value ?? '';
  return str.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trimEnd();
};

const CODE_FENCE_OPEN_REGEX = /^```([\w-]+)?\s*$/;

const MARKDOWN_PASTE_PATTERNS = [
  /(^|\n) {0,3}#{1,6}\s+\S+/,
  /(^|\n) {0,3}>\s+\S+/,
  /(^|\n) {0,3}[-*+]\s+\S+/,
  /(^|\n) {0,3}\d+\.\s+\S+/,
  /(^|\n)```[\s\S]*?```/,
  /(^|\n)\|.+\|\n\|[\s:|-]+\|/,
];

/**
 * 判断剪贴板文本是否像 Markdown（用于粘贴时优先按 Markdown 解析）
 */
export const looksLikeMarkdownClipboardText = (value = '') => {
  const text = normalizeMarkdown(value);
  if (!text) return false;
  return MARKDOWN_PASTE_PATTERNS.some((pattern) => pattern.test(text));
};

/**
 * 判断剪贴板文本是否是 fenced code markdown
 */
export const looksLikeMarkdownCodeFenceClipboardText = (value = '') => {
  const text = normalizeMarkdown(value);
  if (!text) return false;
  return /(^|\n) {0,3}```[\s\S]*?```(?:\n|$)/.test(text);
};

/**
 * 判断剪贴板 HTML 是否包含代码块，避免将复制来的代码误判为 Markdown 列表/标题
 */
export const looksLikeCodeBlockClipboardHtml = (value = '') => {
  const html = value.trim();
  if (!html) return false;
  return /<pre[\s>]/i.test(html);
};

/**
 * 判断剪贴板 HTML 是否只是纯文本 + <br> 结构（无富文本标签）。
 * 用于避免 <br><br> 被 BlockNote 默认粘贴器转成多余的空段落 block。
 */
export const looksLikePlainTextHtml = (value = '') => {
  const html = value.trim();
  if (!html) return false;
  return !/<(?:a|b|strong|i|em|u|s|del|sup|sub|mark|img|table|t[hdr]|ul|ol|li|h[1-6]|pre|code|blockquote|figure)\b/i.test(html);
};

/**
 * 从剪贴板 HTML 中提取代码块内容
 */
export const extractCodeBlockFromClipboardHtml = (value = '') => {
  const html = value.trim();
  if (!html || typeof window === 'undefined') return null;

  const container = window.document.createElement('div');
  container.innerHTML = html;

  const pre = container.querySelector('pre');
  const code = pre?.querySelector('code');
  if (!pre || !code) return null;

  const classLanguage = Array.from(code.classList)
    .find((name) => name.startsWith('language-'))
    ?.replace('language-', '');

  return {
    content: code.textContent ?? '',
    language: code.getAttribute('data-language') || classLanguage || 'text',
  };
};

export const getBlockTextContent = (content = []) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    if (typeof content?.text === 'string') return content.text;
    if (content?.content) return getBlockTextContent(content.content);
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item?.text === 'string') return item.text;
      if (item?.content) return getBlockTextContent(item.content);
      return '';
    })
    .join('');
};

export const getMarkdownCodeFenceLanguage = (value = '') => {
  const text = normalizeMarkdown(value).trim();
  const match = text.match(CODE_FENCE_OPEN_REGEX);
  if (!match) return null;
  return match[1] || 'text';
};

/**
 * BlockNote 空文档结构
 */
export const createEmptyDocument = () => [{ type: 'paragraph', content: '' }];

/** BlockNote JSON 内容的前缀标识 */
const BN_PREFIX = '__bn:';

/**
 * 判断 content 字段是否是 BlockNote JSON 格式（以 __bn: 开头）
 */
export const isBlockNoteContent = (value) => {
  return typeof value === 'string' && value.startsWith(BN_PREFIX);
};

/**
 * 将 BlockNote blocks 数组序列化为带前缀的字符串，用于存入 content 字段
 */
export const serializeBlockNoteContent = (blocks) => {
  return BN_PREFIX + JSON.stringify(blocks);
};

/**
 * 解析 __bn: 前缀的 content 字符串，返回 blocks 数组；失败返回 null
 */
export const parseBlockNoteContent = (value) => {
  if (!isBlockNoteContent(value)) return null;
  try {
    const parsed = JSON.parse(value.slice(BN_PREFIX.length));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * 从 content 字段提取纯 Markdown 字符串（供导出/预览使用）。
 * 若是 BlockNote JSON 格式，需由调用方先用 editor 转换；
 * 此函数仅处理普通 Markdown 字符串（原样返回）。
 */
export const extractMarkdownFromContent = (value) => {
  if (!isBlockNoteContent(value)) return normalizeMarkdown(value);
  return ''; // BlockNote JSON 需通过 editor.blocksToMarkdownLossy 转换
};
