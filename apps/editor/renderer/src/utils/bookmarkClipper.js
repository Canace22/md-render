import { htmlToMarkdown } from './fileConverters.js';
import { normalizeMarkdown } from './markdownUtils.js';

const CONTENT_SELECTORS = [
  'article',
  'main article',
  'main',
  '[role="main"]',
  '.article-content',
  '.post-content',
  '.entry-content',
  '.markdown-body',
  '.content',
  '#content',
];

const DROP_SELECTORS = [
  'script',
  'style',
  'noscript',
  'svg',
  'canvas',
  'form',
  'button',
  'input',
  'textarea',
  'select',
  'nav',
  'header',
  'footer',
  'aside',
];

const MAX_SUMMARY_LENGTH = 140;
const MAX_FILENAME_LENGTH = 80;

const collapseWhitespace = (value = '') => {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
};

const truncateText = (value = '', maxLength = MAX_SUMMARY_LENGTH) => {
  const text = collapseWhitespace(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
};

const dedupeStrings = (values) => {
  return Array.from(new Set((values ?? []).map((item) => collapseWhitespace(item)).filter(Boolean)));
};

const getMetaContent = (doc, selectors = []) => {
  for (const selector of selectors) {
    const value = collapseWhitespace(doc.querySelector(selector)?.getAttribute('content') ?? '');
    if (value) return value;
  }
  return '';
};

const removeNoiseNodes = (doc) => {
  DROP_SELECTORS.forEach((selector) => {
    doc.querySelectorAll(selector).forEach((node) => node.remove());
  });
};

const pickContentRoot = (doc) => {
  for (const selector of CONTENT_SELECTORS) {
    const node = doc.querySelector(selector);
    if (collapseWhitespace(node?.textContent).length > 40) {
      return node;
    }
  }
  return doc.body ?? doc.documentElement;
};

const extractSummaryFromMarkdown = (markdown = '') => {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]+`/g, ' ')
    .replace(/^>\s?/gm, '')
    .replace(/[#*_~-]/g, ' ');
  return truncateText(text);
};

export const sanitizeBookmarkFileStem = (value, fallback = '未命名书签') => {
  const cleaned = collapseWhitespace(value)
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\.+$/g, '')
    .trim();
  return (cleaned || fallback).slice(0, MAX_FILENAME_LENGTH).trim() || fallback;
};

export const buildBookmarkClipMarkdown = ({
  title,
  sourceUrl,
  author = '',
  publishedAt = '',
  description = '',
  bodyMarkdown = '',
  error = '',
}) => {
  const lines = [`# ${collapseWhitespace(title) || '未命名书签'}`, ''];

  if (sourceUrl) lines.push(`> 来源：[${sourceUrl}](${sourceUrl})`);
  if (author) lines.push(`> 作者：${author}`);
  if (publishedAt) lines.push(`> 发布时间：${publishedAt}`);
  if (description) lines.push(`> 摘要：${description}`);
  if (error) lines.push(`> 备注：${error}`);

  lines.push('');
  lines.push(bodyMarkdown || '> 未抓取到可预览正文，已保留原链接。');

  return normalizeMarkdown(lines.join('\n')).replace(/\n{3,}/g, '\n\n').trim();
};

export const buildFallbackBookmarkClip = (item = {}, error = '') => {
  const sourceUrl = collapseWhitespace(item.url);
  const title = collapseWhitespace(item.title) || sourceUrl || '未命名书签';
  const description = collapseWhitespace(item.summary);
  const markdown = buildBookmarkClipMarkdown({
    title,
    sourceUrl,
    description,
    error: error || '正文抓取失败，已保留原链接。',
  });

  return {
    title,
    url: sourceUrl,
    summary: description,
    tags: dedupeStrings(item.tags),
    markdown,
  };
};

export async function buildBookmarkClipDocument(item = {}, snapshot = {}) {
  if (typeof DOMParser === 'undefined') {
    return buildFallbackBookmarkClip(item, '当前环境不支持网页正文解析。');
  }

  const sourceUrl = collapseWhitespace(snapshot.url || item.url);
  const html = String(snapshot.html ?? '').trim();
  const contentType = String(snapshot.contentType ?? '').toLowerCase();

  if (!html || (contentType && !contentType.includes('html'))) {
    return buildFallbackBookmarkClip(item, '目标页面不是可解析的 HTML 内容。');
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  removeNoiseNodes(doc);

  const metaTitle = collapseWhitespace(
    getMetaContent(doc, ['meta[property="og:title"]', 'meta[name="twitter:title"]']) || doc.title,
  );
  const author = getMetaContent(doc, [
    'meta[name="author"]',
    'meta[property="article:author"]',
    'meta[name="byline"]',
  ]);
  const publishedAt = getMetaContent(doc, [
    'meta[property="article:published_time"]',
    'meta[name="pubdate"]',
    'meta[name="publishdate"]',
  ]);
  const description = getMetaContent(doc, [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]);

  const root = pickContentRoot(doc);
  const rawHtml = String(root?.innerHTML ?? '').trim();
  const bodyMarkdown = rawHtml
    ? normalizeMarkdown(await htmlToMarkdown(rawHtml)).replace(/\n{3,}/g, '\n\n').trim()
    : '';

  const title = collapseWhitespace(item.title) || metaTitle || sourceUrl || '未命名书签';
  const summary = truncateText(description || extractSummaryFromMarkdown(bodyMarkdown));
  const markdown = buildBookmarkClipMarkdown({
    title,
    sourceUrl,
    author,
    publishedAt,
    description: summary,
    bodyMarkdown,
  });

  return {
    title,
    url: sourceUrl,
    summary,
    tags: dedupeStrings(item.tags),
    markdown,
  };
}
