import { COMMENT_QUOTE_MAX_LENGTH, findQuoteOffset } from './commentThreads.js';

/**
 * 评论锚点的 DOM 侧：从编辑器选区取锚点、把锚点还原成 Range、用 CSS Highlight API 高亮。
 * 高亮不改 ProseMirror 文档，所以不会污染正文、撤销栈和落盘内容。
 */

export const COMMENT_HIGHLIGHT = 'md-comment';
export const COMMENT_ACTIVE_HIGHLIGHT = 'md-comment-active';

const findBlockContent = (root, blockId) => {
  if (!root || !blockId) return null;
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(blockId) : blockId;
  return root.querySelector(`.bn-block[data-id="${escaped}"] > .bn-block-content`);
};

/** 某个 DOM 点在 container 文本里的字符偏移 */
const textOffsetOf = (container, node, offset) => {
  const range = document.createRange();
  range.setStart(container, 0);
  range.setEnd(node, offset);
  return range.toString().length;
};

/** 把 container 文本里的 [start, end) 字符区间还原成 DOM Range */
const rangeFromTextOffsets = (container, start, end) => {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let seen = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent.length;
    if (!started && start <= seen + length) {
      range.setStart(node, start - seen);
      started = true;
    }
    if (started && end <= seen + length) {
      range.setEnd(node, end - seen);
      return range;
    }
    seen += length;
  }
  return null;
};

/**
 * 从当前编辑器选区取评论锚点。跨块选区只锚定第一个块里选中的部分。
 * 选区为空或选中的是图片等无文本块时返回 null。
 */
export const captureCommentAnchor = (editor) => {
  const selection = editor?.prosemirrorState?.selection;
  const view = editor?.prosemirrorView;
  if (!selection || selection.empty || !view) return null;

  const blockId = editor.getSelection()?.blocks?.[0]?.id;
  const container = findBlockContent(editor.domElement, blockId);
  if (!container) return null;

  const from = view.domAtPos(selection.from);
  const to = view.domAtPos(selection.to);
  const range = document.createRange();
  range.setStart(from.node, from.offset);
  range.setEnd(to.node, to.offset);
  if (!container.contains(range.startContainer)) range.setStart(container, 0);
  if (!container.contains(range.endContainer)) range.setEnd(container, container.childNodes.length);

  const quote = range.toString().slice(0, COMMENT_QUOTE_MAX_LENGTH);
  if (!quote.trim()) return null;
  return {
    blockId,
    quote,
    offset: textOffsetOf(container, range.startContainer, range.startOffset),
  };
};

/** 把线程锚点还原成 Range：返回 Map<threadId, Range>，找不到原文的线程不在里面 */
export const resolveCommentRanges = (root, threads) => {
  const ranges = new Map();
  for (const thread of threads) {
    const { blockId, quote, offset } = thread.anchor;
    const container = findBlockContent(root, blockId);
    if (!container) continue;
    const start = findQuoteOffset(container.textContent, quote, offset);
    if (start < 0) continue;
    const range = rangeFromTextOffsets(container, start, start + quote.length);
    if (range) ranges.set(thread.id, range);
  }
  return ranges;
};

const supportsHighlights = () => typeof CSS !== 'undefined'
  && Boolean(CSS.highlights)
  && typeof Highlight !== 'undefined';

/** 刷新高亮：普通评论一层，当前激活的评论再叠一层更深的 */
export const paintCommentHighlights = (ranges, activeId) => {
  if (!supportsHighlights()) return;
  const normal = [...ranges.entries()].filter(([id]) => id !== activeId).map(([, range]) => range);
  CSS.highlights.set(COMMENT_HIGHLIGHT, new Highlight(...normal));
  const active = ranges.get(activeId);
  if (active) CSS.highlights.set(COMMENT_ACTIVE_HIGHLIGHT, new Highlight(active));
  else CSS.highlights.delete(COMMENT_ACTIVE_HIGHLIGHT);
};

export const clearCommentHighlights = () => {
  if (!supportsHighlights()) return;
  CSS.highlights.delete(COMMENT_HIGHLIGHT);
  CSS.highlights.delete(COMMENT_ACTIVE_HIGHLIGHT);
};

/** 光标（折叠选区）落在哪条评论的高亮里，返回线程 id */
export const findThreadAtPoint = (ranges, node, offset) => {
  for (const [id, range] of ranges) {
    try {
      if (range.isPointInRange(node, offset)) return id;
    } catch {
      // 节点已不在同一文档树里（编辑器刚重建），忽略
    }
  }
  return null;
};
