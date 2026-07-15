import { useCallback, useEffect, useRef } from 'react';
import {
  isSelectAllShortcut,
  selectAllEditorContent,
  selectCurrentTextBlockContent,
  shouldPromoteBlockSelectionToFullSelection,
} from '@narrative/blocknote-core';
import { onMenuSelectAll } from '../services/electronBridge.js';

const SELECT_ALL_MODIFIER_KEYS = new Set(['alt', 'control', 'meta', 'shift']);
const TEXT_EDITING_TARGET_SELECTOR = [
  'input',
  'textarea',
  'select',
  '[contenteditable]:not([contenteditable="false"])',
].join(',');

const getTextEditingTarget = (target) => target?.closest?.(TEXT_EDITING_TARGET_SELECTOR) ?? null;
const isTextEditingTarget = (target) => Boolean(getTextEditingTarget(target));

const selectTextEditingTargetContent = (target) => {
  const editingTarget = getTextEditingTarget(target);
  if (!editingTarget) return false;

  if (typeof editingTarget.select === 'function') {
    try {
      editingTarget.select();
      return true;
    } catch {
      return false;
    }
  }
  if (!editingTarget.isContentEditable) return false;

  const selection = window.getSelection();
  if (!selection) return false;
  const range = document.createRange();
  range.selectNodeContents(editingTarget);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
};

const selectDocumentContent = () => {
  try {
    if (typeof document.execCommand === 'function' && document.execCommand('selectAll')) {
      return true;
    }
  } catch {
    // 降级为 Range 全页选区。
  }

  const selection = window.getSelection();
  if (!selection || !document.body) return false;
  const range = document.createRange();
  range.selectNodeContents(document.body);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
};

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

  const selectFullEditorContent = useCallback(() => {
    selectAllEditorContent(editor);
    selectAllStateRef.current = {
      pendingBlockId: null,
      fullSelectionActive: true,
    };
  }, [editor]);

  const selectEditorContent = useCallback(() => {
    const selectAllState = selectAllStateRef.current;

    // 已提升为全文后继续保持，避免长按 repeat 在“当前行 / 全文”之间反复切换。
    if (selectAllState.fullSelectionActive) {
      selectFullEditorContent();
      return;
    }

    const currentBlock = editor.getTextCursorPosition()?.block;
    if (!currentBlock) {
      selectFullEditorContent();
      return;
    }

    const selectedBlockIds = editor.getSelection()?.blocks.map((block) => block.id) ?? [];
    const shouldSelectFullDocument = shouldPromoteBlockSelectionToFullSelection(
      currentBlock.id,
      selectedBlockIds,
      selectAllState.pendingBlockId,
    );

    if (shouldSelectFullDocument) {
      selectFullEditorContent();
      return;
    }

    if (!selectCurrentTextBlockContent(editor)) {
      // 图片/文件等非文本块没有“当前行”，首次直接选中全文。
      selectFullEditorContent();
      return;
    }

    selectAllState.pendingBlockId = currentBlock.id;
    selectAllState.fullSelectionActive = false;
  }, [editor, selectFullEditorContent]);

  const handleSelectAllKeyDownCapture = useCallback((event) => {
    if (!editor.domElement?.contains(event.target)) return;

    if (!isSelectAllShortcut(event)) {
      if (SELECT_ALL_MODIFIER_KEYS.has(event.key.toLowerCase())) return;
      resetSelectAllState();
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    startShortcutRelease(event);
    selectEditorContent();
  }, [editor, resetSelectAllState, selectEditorContent, startShortcutRelease]);

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
      selectFullEditorContent();
    };

    document.addEventListener('keydown', handleDocumentSelectAll, true);
    return () => document.removeEventListener('keydown', handleDocumentSelectAll, true);
  }, [editor, selectFullEditorContent, startShortcutRelease]);

  useEffect(() => onMenuSelectAll(({ modifierKey, repeat = false, triggeredByAccelerator } = {}) => {
    const editorDom = editor.domElement;
    const activeTarget = document.activeElement;

    if (!editorDom?.isConnected) {
      if (isTextEditingTarget(activeTarget)) {
        selectTextEditingTargetContent(activeTarget);
      } else {
        selectDocumentContent();
      }
      return;
    }

    if (!editorDom.contains(activeTarget) && isTextEditingTarget(activeTarget)) {
      resetSelectAllState();
      selectTextEditingTargetContent(activeTarget);
      return;
    }

    if (triggeredByAccelerator) {
      startShortcutRelease({
        metaKey: modifierKey === 'meta',
        repeat,
      });
      if (editorDom.contains(activeTarget)) {
        selectEditorContent();
      } else {
        selectFullEditorContent();
      }
      return;
    }

    // 菜单中明确点“全选”遵循原生语义，不走两段式首次当前行。
    selectFullEditorContent();
  }), [
    editor,
    resetSelectAllState,
    selectEditorContent,
    selectFullEditorContent,
    startShortcutRelease,
  ]);

  return {
    handleSelectAllBlurCapture,
    handleSelectAllKeyDownCapture,
    handleSelectAllKeyUpCapture,
    resetSelectAllState,
    shouldSuppressSelectAllKeyUp,
  };
}
