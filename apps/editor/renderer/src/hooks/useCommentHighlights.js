import { useCallback, useEffect, useRef, useState } from 'react';
import {
  clearCommentHighlights,
  findThreadAtPoint,
  paintCommentHighlights,
  resolveCommentRanges,
} from '../utils/commentAnchors.js';

const EMPTY_SET = new Set();

const sameIds = (a, b) => a.size === b.size && [...a].every((id) => b.has(id));

/**
 * 把未解决的评论线程高亮到正文上，并处理「点高亮文字 → 激活对应评论」。
 *
 * 编辑器每次变化后（等 DOM 更新完的下一帧）重新定位，原文被改掉的线程记进 missingIds。
 * 返回 scrollToThread，供评论卡片点击时把正文滚到引文处。
 */
export default function useCommentHighlights(editor, threads, activeId, onActivate) {
  const rangesRef = useRef(new Map());
  const [missingIds, setMissingIds] = useState(EMPTY_SET);
  const latestRef = useRef({ threads, activeId, onActivate });
  latestRef.current = { threads, activeId, onActivate };

  const refresh = useCallback(() => {
    const root = editor?.domElement;
    if (!root) return;
    const openThreads = latestRef.current.threads.filter((thread) => !thread.resolved);
    const ranges = resolveCommentRanges(root, openThreads);
    rangesRef.current = ranges;
    paintCommentHighlights(ranges, latestRef.current.activeId);
    const missing = new Set(openThreads.filter((t) => !ranges.has(t.id)).map((t) => t.id));
    setMissingIds((prev) => (sameIds(prev, missing) ? prev : missing));
  }, [editor]);

  // 线程或激活项变了：重新定位 + 重画
  useEffect(() => {
    const frame = window.requestAnimationFrame(refresh);
    return () => window.cancelAnimationFrame(frame);
  }, [refresh, threads, activeId]);

  // 正文变了：等 DOM 更新完再定位
  useEffect(() => {
    if (!editor) return undefined;
    let frame = 0;
    const unsubscribe = editor.onChange(() => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(refresh);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      unsubscribe?.();
      clearCommentHighlights();
    };
  }, [editor, refresh]);

  // 点到高亮文字上 → 激活对应评论（只认点击，打字时光标路过不打扰）
  // 挂在 document 上：编辑器 DOM 可能晚于本组件挂载
  useEffect(() => {
    if (!editor) return undefined;
    const handleClick = (event) => {
      if (!editor.domElement?.contains(event.target)) return;
      const selection = window.getSelection();
      if (!selection?.isCollapsed || !selection.anchorNode) return;
      const id = findThreadAtPoint(rangesRef.current, selection.anchorNode, selection.anchorOffset);
      if (id) latestRef.current.onActivate?.(id);
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [editor]);

  const scrollToThread = useCallback((threadId) => {
    const range = rangesRef.current.get(threadId);
    const target = range?.startContainer?.parentElement;
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  return { missingIds, scrollToThread };
}
