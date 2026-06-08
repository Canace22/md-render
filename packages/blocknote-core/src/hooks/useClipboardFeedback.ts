/**
 * 编辑器剪贴板操作完成提示（快捷键、右键菜单、原生 copy/cut/paste 事件）。
 *
 * 通用机制，无业务语义。监听编辑器容器内的剪贴板事件并给出反馈。
 */

import { useEffect } from 'react';
import { showClipboardActionMessage } from '../utils/clipboardFeedback.js';

interface IEditorSelectionLike {
  getSelection: () => { blocks: Array<{ id: string }> } | undefined;
}

function isNodeInsideContainer(container: HTMLElement, node: Node | null): boolean {
  if (!node) return false;
  return container.contains(node);
}

function isEditorClipboardFocus(container: HTMLElement, eventTarget: EventTarget | null): boolean {
  const active = document.activeElement;
  if (active instanceof Node && container.contains(active)) {
    return true;
  }
  return eventTarget instanceof Node && container.contains(eventTarget);
}

function hasCopyableEditorSelection(
  container: HTMLElement,
  editor: IEditorSelectionLike | null,
): boolean {
  const blockSelection = editor?.getSelection();
  if (blockSelection && blockSelection.blocks.length > 0) {
    return true;
  }

  const selection = window.getSelection();
  if (!selection || selection.isCollapsed) {
    return false;
  }

  const anchorInside = isNodeInsideContainer(container, selection.anchorNode);
  const focusInside = isNodeInsideContainer(container, selection.focusNode);
  if (!anchorInside && !focusInside) {
    return false;
  }

  return selection.toString().length > 0;
}

function clipboardEventHasPastePayload(event: ClipboardEvent): boolean {
  const data = event.clipboardData;
  if (!data) return false;
  return Boolean(
    data.getData('text/plain')
    || data.getData('text/html')
    || data.files.length > 0,
  );
}

export function useClipboardFeedback(
  editorContainerRef: React.RefObject<HTMLElement | null>,
  editor: IEditorSelectionLike | null,
): void {
  useEffect(() => {
    const container = editorContainerRef.current;
    if (!container) return;

    const handleCopy = (event: ClipboardEvent) => {
      if (!isEditorClipboardFocus(container, event.target)) return;
      if (!hasCopyableEditorSelection(container, editor)) return;
      showClipboardActionMessage('copy');
    };

    const handleCut = (event: ClipboardEvent) => {
      if (!isEditorClipboardFocus(container, event.target)) return;
      if (!hasCopyableEditorSelection(container, editor)) return;
      showClipboardActionMessage('cut');
    };

    const handlePaste = (event: ClipboardEvent) => {
      if (!isEditorClipboardFocus(container, event.target)) return;
      if (!clipboardEventHasPastePayload(event)) return;
      showClipboardActionMessage('paste');
    };

    container.addEventListener('copy', handleCopy, true);
    container.addEventListener('cut', handleCut, true);
    container.addEventListener('paste', handlePaste, true);

    return () => {
      container.removeEventListener('copy', handleCopy, true);
      container.removeEventListener('cut', handleCut, true);
      container.removeEventListener('paste', handlePaste, true);
    };
  }, [editor, editorContainerRef]);
}
