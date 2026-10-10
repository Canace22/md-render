import { useCallback, useEffect, useMemo, useState } from 'react';
import { message } from 'antd';
import { useEditorStore } from '../store/useEditorStore.js';
import { findNodeById, findParentId } from '../store/workspaceUtils.js';
import {
  analyzeScript,
  buildResourceCards,
  characterCardName,
  isScriptPage,
  locationCardName,
} from '../../../shared/script/screenplay.js';
import {
  cycleCurrentElement,
  insertAction,
  insertDialogue,
  insertScene,
  renumberScenes,
  sceneHeadingBlock,
} from '../utils/scriptEditing.js';
import { focusOutlineBlock } from '../components/outline/focusOutlineBlock.js';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import { isBlankDocument } from './useOutlinePage.js';
import { useScriptBeats } from './useScriptBeats.js';

const FIRST_SCENE_NUMBER = 1;

/** 剧本同目录下已有的文档：文件名（去扩展名）→ id，用来判断设定卡是否已建 */
const collectSiblingFiles = (workspace, fileId) => {
  const parent = findNodeById(workspace, findParentId(workspace, fileId));
  const files = (parent?.children ?? []).filter((node) => node.type === 'file');
  return new Map(files.map((node) => [stripFileExtension(node.name), node.id]));
};

/** 空行按 Tab 轮换 △ / 角色名；只拦当前编辑器里、没带修饰键的 Tab */
const useScriptTabCycle = (editor, enabled) => {
  useEffect(() => {
    if (!enabled) return undefined;
    const handleKeyDown = (event) => {
      if (event.key !== 'Tab' || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.isComposing || !editor.domElement?.contains(event.target)) return;
      if (!cycleCurrentElement(editor)) return;
      event.preventDefault();
      event.stopPropagation();
    };
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [editor, enabled]);
};

/**
 * 剧本页面（frontmatter `layout: script`）在主编辑器里的状态：
 * - 从正文实时解析出场次 / 角色 / 地点；节拍区解析成节拍，并跟踪光标所在场次
 * - 快捷插入场景、动作、对白，空行 Tab 轮换
 * - 一键给角色、地点生成设定卡（同目录新文档，来源记到剧本）
 */
export function useScriptPage(editor, selectedFile) {
  const isScript = isScriptPage(selectedFile);
  const fileId = selectedFile?.id ?? null;
  const readOnly = Boolean(selectedFile?.readOnly);
  const content = selectedFile?.content;
  const workspace = useEditorStore((s) => s.workspace);
  const createGeneratedFile = useEditorStore((s) => s.createGeneratedFile);
  const selectNode = useEditorStore((s) => s.selectNode);
  const [generating, setGenerating] = useState(false);

  const analysis = useMemo(
    () => (isScript ? analyzeScript(editor.document) : null),
    [isScript, editor, content], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const siblingFiles = useMemo(
    () => (isScript && fileId ? collectSiblingFiles(workspace, fileId) : new Map()),
    [isScript, workspace, fileId],
  );

  const cardIds = useMemo(() => ({
    character: (name) => siblingFiles.get(characterCardName(name)) ?? null,
    location: (name) => siblingFiles.get(locationCardName(name)) ?? null,
  }), [siblingFiles]);

  useScriptTabCycle(editor, isScript && !readOnly);
  const beatState = useScriptBeats(editor, { isScript, fileId, content, scenes: analysis?.scenes });

  // 空的剧本页直接给出第 1 场的场景标题，接着写地点就行
  useEffect(() => {
    if (!isScript || readOnly || !isBlankDocument(editor.document)) return;
    editor.updateBlock(editor.document[0], sceneHeadingBlock(FIRST_SCENE_NUMBER));
  }, [editor, isScript, readOnly]);

  const handleJump = useCallback((blockId) => focusOutlineBlock(editor, blockId), [editor]);
  const handleInsertScene = useCallback(() => insertScene(editor), [editor]);
  const handleInsertAction = useCallback(() => insertAction(editor), [editor]);
  const handleInsertDialogue = useCallback((name) => insertDialogue(editor, name), [editor]);

  const handleRenumber = useCallback(() => {
    const count = renumberScenes(editor);
    message.info(count ? `已重排 ${count} 场的场次号` : '场次号已经是连续的');
  }, [editor]);

  const handleGenerateCards = useCallback(async () => {
    const title = stripFileExtension(selectedFile?.name);
    const cards = buildResourceCards(analyzeScript(editor.document), title, new Set(siblingFiles.keys()));
    if (!cards.length) {
      message.info('还没有新的角色或地点需要建卡');
      return;
    }
    setGenerating(true);
    let created = 0;
    try {
      for (const card of cards) {
        // 顺序建：每次都要基于上一次之后的 workspace 算唯一文件名
        // eslint-disable-next-line no-await-in-loop
        const result = await createGeneratedFile({
          name: card.name, content: card.content, contextNodeId: fileId, meta: { tags: card.tags }, select: false,
        });
        if (!result?.ok) throw new Error(result?.error || `「${card.name}」生成失败`);
        created += 1;
      }
      message.success(`已生成 ${created} 张设定卡，放在剧本同目录`);
    } catch (error) {
      message.error(`${error.message}（已生成 ${created} 张）`);
    } finally {
      setGenerating(false);
    }
  }, [editor, selectedFile?.name, siblingFiles, createGeneratedFile, fileId]);

  return {
    ...beatState,
    isScript,
    readOnly,
    analysis,
    cardIds,
    generating,
    onJump: handleJump,
    onOpenCard: selectNode,
    onInsertScene: handleInsertScene,
    onInsertAction: handleInsertAction,
    onInsertDialogue: handleInsertDialogue,
    onRenumber: handleRenumber,
    onGenerateCards: handleGenerateCards,
  };
}
