import { useCallback, useEffect, useMemo, useRef } from 'react';
import { message } from 'antd';
import { createWikilinkPlugin } from '@narrative/blocknote-core';
import { useEditorStore } from '../store/useEditorStore.js';
import { findDocByWikiName, listWorkspaceDocs } from '../utils/docMentionItems.js';

const EXTENSION_KEY = 'wikilinkNavigation';

/** 按 [[名称]] 打开工作区文档；找不到时提示。编辑器和思维导图共用 */
export function useOpenWikilink(workspace) {
  const selectNode = useEditorStore((state) => state.selectNode);
  const entries = useMemo(() => listWorkspaceDocs(workspace), [workspace]);

  return useCallback((name) => {
    const file = findDocByWikiName(entries, name);
    if (file) selectNode(file.id);
    else message.warning(`找不到文档「${name}」`);
  }, [entries, selectNode]);
}

/**
 * 给编辑器挂上 [[双链]] 链接样式 + 点击跳转。
 * onOpen 用 ref 保存，避免 workspace 变化时反复注册插件。
 */
export function useWikilinkNavigation(editor, onOpen) {
  const onOpenRef = useRef(onOpen);
  onOpenRef.current = onOpen;

  useEffect(() => {
    editor.registerExtension({
      key: EXTENSION_KEY,
      prosemirrorPlugins: [createWikilinkPlugin((name) => onOpenRef.current?.(name))],
    });
    return () => editor.unregisterExtension(EXTENSION_KEY);
  }, [editor]);
}
