import { createId } from '../store/workspaceUtils.js';

/**
 * 文档评论（参照 Claude Cowork 的选区评论）的纯函数。
 *
 * 评论不写进正文：线程按 fileId 存在 store 里，用「块 id + 引文 + 块内偏移」锚定原文。
 * 原文被改掉后引文找不到，线程仍保留，只是不再高亮。
 *
 * 数据形状：
 *   { [fileId]: Thread[] }
 *   Thread = { id, anchor: { blockId, quote, offset }, comments: Comment[], resolved, createdAt, updatedAt }
 *   Comment = { id, body, createdAt }
 */

/** 引文最长保留字数：只用于定位和卡片展示，过长没有意义 */
export const COMMENT_QUOTE_MAX_LENGTH = 500;

const cleanText = (value) => String(value ?? '').trim();

const normalizeAnchor = (anchor) => {
  const blockId = cleanText(anchor?.blockId);
  const quote = String(anchor?.quote ?? '').slice(0, COMMENT_QUOTE_MAX_LENGTH);
  if (!blockId || !quote.trim()) return null;
  const offset = Number.isFinite(anchor?.offset) && anchor.offset >= 0 ? anchor.offset : 0;
  return { blockId, quote, offset };
};

const normalizeComment = (comment) => {
  const body = cleanText(comment?.body);
  if (!body) return null;
  return {
    id: cleanText(comment.id) || createId('comment'),
    body,
    createdAt: comment.createdAt || new Date().toISOString(),
  };
};

const normalizeThread = (thread) => {
  const anchor = normalizeAnchor(thread?.anchor);
  const comments = (Array.isArray(thread?.comments) ? thread.comments : [])
    .map(normalizeComment)
    .filter(Boolean);
  if (!anchor || comments.length === 0) return null;
  return {
    id: cleanText(thread.id) || createId('thread'),
    anchor,
    comments,
    resolved: Boolean(thread.resolved),
    createdAt: thread.createdAt || comments[0].createdAt,
    updatedAt: thread.updatedAt || comments[comments.length - 1].createdAt,
  };
};

/** 持久化读回时的清洗：丢掉缺锚点、没内容的脏数据 */
export const normalizeCommentThreads = (raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = {};
  for (const [fileId, threads] of Object.entries(raw)) {
    if (!fileId || !Array.isArray(threads)) continue;
    const cleaned = threads.map(normalizeThread).filter(Boolean);
    if (cleaned.length > 0) result[fileId] = cleaned;
  }
  return result;
};

/** 新建线程；锚点或正文为空时返回 null */
export const createCommentThread = (anchor, body, now = new Date().toISOString()) => {
  const normalizedAnchor = normalizeAnchor(anchor);
  const text = cleanText(body);
  if (!normalizedAnchor || !text) return null;
  return {
    id: createId('thread'),
    anchor: normalizedAnchor,
    comments: [{ id: createId('comment'), body: text, createdAt: now }],
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };
};

export const getFileThreads = (threadsByFile, fileId) => threadsByFile?.[fileId] ?? [];

export const addThread = (threadsByFile, fileId, thread) => ({
  ...threadsByFile,
  [fileId]: [...getFileThreads(threadsByFile, fileId), thread],
});

/** 改某条线程；updater 返回 null 表示删除 */
export const updateThread = (threadsByFile, fileId, threadId, updater) => {
  const threads = getFileThreads(threadsByFile, fileId);
  const next = threads
    .map((thread) => (thread.id === threadId ? updater(thread) : thread))
    .filter(Boolean);
  const { [fileId]: _removed, ...rest } = threadsByFile ?? {};
  return next.length > 0 ? { ...rest, [fileId]: next } : rest;
};

/** 给线程追加一条回复；正文为空时原样返回 */
export const appendReply = (thread, body, now = new Date().toISOString()) => {
  const text = cleanText(body);
  if (!text) return thread;
  return {
    ...thread,
    comments: [...thread.comments, { id: createId('comment'), body: text, createdAt: now }],
    updatedAt: now,
  };
};

/**
 * 在块文本里找引文的位置。原文前面插了字会让偏移失效，
 * 所以取离记录偏移最近的那一处，同一段里有重复短语也不会跳到别处。
 * 找不到返回 -1。
 */
export const findQuoteOffset = (text, quote, hintOffset = 0) => {
  if (!text || !quote) return -1;
  let best = -1;
  let index = text.indexOf(quote);
  while (index !== -1) {
    if (best === -1 || Math.abs(index - hintOffset) < Math.abs(best - hintOffset)) best = index;
    index = text.indexOf(quote, index + 1);
  }
  return best;
};

/** 某文档未解决的评论数（顶栏评论按钮上的数字） */
export const countOpenThreads = (threadsByFile, fileId) => (
  getFileThreads(threadsByFile, fileId).filter((thread) => !thread.resolved).length
);
