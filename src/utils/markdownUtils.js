/**
 * Markdown 文本处理工具
 */

export const normalizeMarkdown = (value = '') => {
  return value.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trimEnd();
};

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
 * BlockNote 空文档结构
 */
export const createEmptyDocument = () => [{ type: 'paragraph', content: '' }];
