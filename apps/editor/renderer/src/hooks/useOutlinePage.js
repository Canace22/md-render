import { useCallback, useEffect, useMemo, useState } from 'react';
import { blocksToMindTree, isOutlinePage } from '../../../shared/outline/outlineTree.js';
import { MINDMAP_VIEW, OUTLINE_VIEW } from '../components/outline/OutlineViewSwitch.jsx';
import { focusOutlineBlock } from '../components/outline/focusOutlineBlock.js';
import { stripFileExtension } from '../utils/fileDisplayName.js';

/** 空文档 = 只有一个没字的段落 */
export const isBlankDocument = (blocks) => blocks.length === 1
  && blocks[0].type === 'paragraph'
  && (blocks[0].content ?? []).length === 0
  && (blocks[0].children ?? []).length === 0;

/**
 * 大纲页面（frontmatter `layout: outline`）在主编辑器里的状态：
 * - 大纲 / 导图视图切换，按文件记，换文件回到大纲
 * - 导图树从编辑器当前文档生成，正文变了跟着变
 * - 空的大纲页第一行直接是圆点，像幕布那样开写
 */
export function useOutlinePage(editor, selectedFile) {
  const isOutline = isOutlinePage(selectedFile);
  const fileId = selectedFile?.id ?? null;
  const readOnly = Boolean(selectedFile?.readOnly);
  const [viewState, setViewState] = useState({ fileId: null, view: OUTLINE_VIEW });
  const view = isOutline && viewState.fileId === fileId ? viewState.view : OUTLINE_VIEW;
  const showMindMap = view === MINDMAP_VIEW;

  const setView = useCallback((next) => setViewState({ fileId, view: next }), [fileId]);

  const title = stripFileExtension(selectedFile?.name);
  const content = selectedFile?.content;
  const mindTree = useMemo(
    () => (showMindMap ? blocksToMindTree(editor.document, title) : null),
    [showMindMap, editor, title, content], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const handleSelectNode = useCallback((blockId) => {
    setView(OUTLINE_VIEW);
    focusOutlineBlock(editor, blockId);
  }, [editor, setView]);

  useEffect(() => {
    if (!isOutline || readOnly || !isBlankDocument(editor.document)) return;
    editor.updateBlock(editor.document[0], { type: 'bulletListItem' });
  }, [editor, isOutline, readOnly]);

  return { isOutline, view, setView, showMindMap, mindTree, handleSelectNode };
}
