import { useCallback, useEffect, useMemo, useState } from 'react';
import { analyzeBeats } from '@shared/script/scriptBeats.js';
import { sceneNumberAt } from '@shared/script/screenplay.js';
import { addBeat, toggleBeatScene } from '../utils/scriptEditing.js';

const readCursorBlockId = (editor) => {
  try {
    return editor.getTextCursorPosition()?.block?.id ?? null;
  } catch {
    return null;
  }
};

/** 光标所在块 id，跟着编辑器选区变 */
const useCursorBlockId = (editor, enabled) => {
  const [blockId, setBlockId] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const update = () => setBlockId(readCursorBlockId(editor));
    update();
    return editor.onSelectionChange(update);
  }, [editor, enabled]);
  return blockId;
};

/**
 * 剧本页的节拍：解析节拍区 + 「当前场次」。
 * 当前场次 = 光标所在那场；光标跑到节拍区 / 开头时保留上一次的场次，
 * 这样点侧栏、改节拍时「本场」不会突然变空。
 */
export function useScriptBeats(editor, { isScript, fileId, content, scenes }) {
  const cursorBlockId = useCursorBlockId(editor, isScript);
  const [sticky, setSticky] = useState({ fileId: null, scene: null });

  const beats = useMemo(
    () => (isScript ? analyzeBeats(editor.document) : null),
    [isScript, editor, content], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const cursorScene = useMemo(
    () => (isScript ? sceneNumberAt(editor.document, cursorBlockId) : null),
    [isScript, editor, cursorBlockId, content], // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (cursorScene) setSticky({ fileId, scene: cursorScene });
  }, [cursorScene, fileId]);

  const fallbackScene = sticky.fileId === fileId ? sticky.scene : null;
  const sceneNumber = cursorScene ?? fallbackScene;
  const currentScene = (scenes ?? []).find((scene) => scene.number === sceneNumber) ?? null;

  const handleAddBeat = useCallback((title, toCurrentScene) => (
    addBeat(editor, title, toCurrentScene ? currentScene?.number : null)
  ), [editor, currentScene]);

  const handleToggleBeatScene = useCallback((beatId) => {
    toggleBeatScene(editor, beatId, currentScene?.number);
  }, [editor, currentScene]);

  return { beats, currentScene, onAddBeat: handleAddBeat, onToggleBeatScene: handleToggleBeatScene };
}
