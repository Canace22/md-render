import { useCallback, useEffect, useRef } from 'react';
import {
  isSelectAllShortcut,
  selectAllEditorContent,
  selectCurrentTextBlockContent,
  shouldPromoteBlockSelectionToFullSelection,
} from '@narrative/blocknote-core';

const SELECT_ALL_MODIFIER_KEYS = new Set(['alt', 'control', 'meta', 'shift']);
const TEXT_EDITING_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

const isTextEditingTarget = (target) => Boolean(target?.closest?.(TEXT_EDITING_TARGET_SELECTOR));

const createSelectAllState = () => ({
  pendingBlockId: null,
  fullSelectionActive: false,
});

const createShortcutReleaseState = () => ({
  active: false,
  characterReleased: false,
  modifierKey: null,
  modifierReleased: false,
});

export function useTwoStageSelectAll(editor) {
  const selectAllStateRef = useRef(createSelectAllState());
  const shortcutReleaseStateRef = useRef(createShortcutReleaseState());

  const resetSelectAllState = useCallback(() => {
    selectAllStateRef.current = createSelectAllState();
  }, []);

  const startShortcutRelease = useCallback((event) => {
    if (event.repeat) return;
    shortcutReleaseStateRef.current = {
      active: true,
      characterReleased: false,
      modifierKey: event.metaKey ? 'meta' : 'control',
      modifierReleased: false,
    };
  }, []);

  const handleSelectAllKeyDownCapture = useCallback((event) => {
    if (!editor.domElement?.contains(event.target)) return;

    if (!isSelectAllShortcut(event)) {
      if (SELECT_ALL_MODIFIER_KEYS.has(event.key.toLowerCase())) return;
      resetSelectAllState();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const selectAllState = selectAllStateRef.current;
    startShortcutRelease(event);

    // 已提升为全文后继续保持，避免长按 repeat 在“当前行 / 全文”之间反复切换。
    if (selectAllState.fullSelectionActive) {
      selectAllEditorContent(editor);
      return;
    }

    const currentBlock = editor.getTextCursorPosition()?.block;
    if (!currentBlock) return;

    const selectedBlockIds = editor.getSelection()?.blocks.map((block) => block.id) ?? [];
    const shouldSelectFullDocument = shouldPromoteBlockSelectionToFullSelection(
      currentBlock.id,
      selectedBlockIds,
      selectAllState.pendingBlockId,
    );

    if (shouldSelectFullDocument) {
      selectAllEditorContent(editor);
      selectAllState.pendingBlockId = null;
      selectAllState.fullSelectionActive = true;
      return;
    }

    if (!selectCurrentTextBlockContent(editor)) return;

    selectAllState.pendingBlockId = currentBlock.id;
    selectAllState.fullSelectionActive = false;
  }, [editor, resetSelectAllState, startShortcutRelease]);

  const shouldSuppressSelectAllKeyUp = useCallback((event) => {
    const key = event.key.toLowerCase();
    const shortcutReleaseState = shortcutReleaseStateRef.current;
    if (!shortcutReleaseState.active) return false;

    if (key === 'a') {
      shortcutReleaseState.characterReleased = true;
    } else if (key === shortcutReleaseState.modifierKey) {
      shortcutReleaseState.modifierReleased = true;
    } else {
      return false;
    }

    if (shortcutReleaseState.characterReleased && shortcutReleaseState.modifierReleased) {
      shortcutReleaseStateRef.current = createShortcutReleaseState();
    }
    return true;
  }, []);

  const handleSelectAllKeyUpCapture = useCallback((event) => {
    if (!shouldSuppressSelectAllKeyUp(event)) return;

    // 阻止 document 级“选中即引用”监听在快捷键释放时更新 Zustand，避免选区失焦。
    event.preventDefault();
    event.stopPropagation();
  }, [shouldSuppressSelectAllKeyUp]);

  const handleSelectAllBlurCapture = useCallback((event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) resetSelectAllState();
  }, [resetSelectAllState]);

  useEffect(() => {
    resetSelectAllState();
  }, [editor, resetSelectAllState]);

  useEffect(() => {
    const handleDocumentSelectAll = (event) => {
      const editorDom = editor.domElement;
      if (!isSelectAllShortcut(event)
        || !editorDom?.isConnected
        || editorDom.contains(event.target)
        || isTextEditingTarget(event.target)) return;

      event.preventDefault();
      event.stopPropagation();
      startShortcutRelease(event);
      selectAllEditorContent(editor);
      selectAllStateRef.current = {
        pendingBlockId: null,
        fullSelectionActive: true,
      };
    };

    document.addEventListener('keydown', handleDocumentSelectAll, true);
    return () => document.removeEventListener('keydown', handleDocumentSelectAll, true);
  }, [editor, startShortcutRelease]);

  return {
    handleSelectAllBlurCapture,
    handleSelectAllKeyDownCapture,
    handleSelectAllKeyUpCapture,
    resetSelectAllState,
    shouldSuppressSelectAllKeyUp,
  };
}
