import { getTextFromElements } from '@excalidraw/excalidraw';

const MAX_SUMMARY_LENGTH = 140;
const HTTP_URL_RE = /https?:\/\/[^\s<>"'`|]+/gi;

const trimText = (value) => String(value ?? '').trim();

const collapseWhitespace = (value) => trimText(value).replace(/\s+/g, ' ');

const truncateText = (value, maxLength = MAX_SUMMARY_LENGTH) => {
  const text = collapseWhitespace(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
};

const normalizeUrl = (value) => {
  const text = trimText(value).replace(/^<+|>+$/g, '');
  return text.replace(/[),.;!?]+$/g, '');
};

const collectUrlsFromText = (text = '') => {
  const matches = String(text ?? '').match(HTTP_URL_RE) ?? [];
  return matches.map(normalizeUrl).filter(Boolean);
};

const collectUrlsFromElements = (elements = []) => {
  return elements
    .map((element) => normalizeUrl(element?.link))
    .filter(Boolean);
};

const dedupeUrls = (values = []) => {
  return Array.from(new Set(values.map(normalizeUrl).filter(Boolean)));
};

const pickTitle = (text, fallbackUrl) => {
  const lines = String(text ?? '')
    .split(/\r?\n/)
    .map((line) => trimText(line))
    .filter(Boolean);

  for (const line of lines) {
    const cleaned = collapseWhitespace(line.replace(HTTP_URL_RE, ' '));
    if (cleaned) return cleaned;
  }

  return fallbackUrl || '未命名书签';
};

export const extractCanvasBookmarkCandidate = (libraryItem = {}) => {
  const elements = Array.isArray(libraryItem?.elements)
    ? libraryItem.elements.filter((element) => element && !element.isDeleted)
    : [];
  if (!elements.length) return null;

  const text = trimText(getTextFromElements(elements));
  const urls = dedupeUrls([
    ...collectUrlsFromElements(elements),
    ...collectUrlsFromText(text),
  ]);
  const primaryUrl = urls[0] ?? '';
  if (!primaryUrl) return null;

  const title = pickTitle(text, primaryUrl);

  return {
    title,
    url: primaryUrl,
    summary: truncateText(text || title),
    content: text,
    tags: [],
  };
};
