import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * 文档标题编辑状态与逻辑
 * @param {{ id: string, name: string } | null} selectedFile
 * @param {(id: string, name: string) => boolean} applyRename
 */
export function useTitleEditing(selectedFile, applyRename) {
  const titleInputRef = useRef(null);
  const titleMeasureRef = useRef(null);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleInputWidth, setTitleInputWidth] = useState(160);

  const startTitleEditing = useCallback(() => {
    if (!selectedFile) return;
    setTitleDraft(selectedFile.name);
    setIsTitleEditing(true);
  }, [selectedFile]);

  const commitTitleEditing = useCallback(async () => {
    if (!selectedFile) {
      setIsTitleEditing(false);
      setTitleDraft('');
      return;
    }
    const nextName = titleDraft.trim();
    if (!nextName) {
      setTitleDraft(selectedFile.name);
      setIsTitleEditing(false);
      return;
    }
    const result = applyRename(selectedFile.id, nextName);
    const ok = result && typeof result.then === 'function' ? await result : result;
    if (!ok) {
      alert('名称已存在，请换一个。');
      setTitleDraft(selectedFile.name);
    }
    setIsTitleEditing(false);
  }, [selectedFile, titleDraft, applyRename]);

  const cancelTitleEditing = useCallback(() => {
    setTitleDraft(selectedFile?.name ?? '');
    setIsTitleEditing(false);
  }, [selectedFile]);

  useEffect(() => {
    if (!isTitleEditing || !titleInputRef.current) return;
    titleInputRef.current.focus();
    titleInputRef.current.select();
  }, [isTitleEditing]);

  useEffect(() => {
    if (!isTitleEditing || !titleMeasureRef.current) return;
    const measuredWidth = Math.ceil(titleMeasureRef.current.getBoundingClientRect().width) + 8;
    setTitleInputWidth(Math.max(120, measuredWidth));
  }, [isTitleEditing, titleDraft]);

  useEffect(() => {
    if (!selectedFile) return;
    if (!isTitleEditing) setTitleDraft(selectedFile.name);
  }, [selectedFile, isTitleEditing]);

  return {
    isTitleEditing,
    titleDraft,
    titleInputWidth,
    titleInputRef,
    titleMeasureRef,
    startTitleEditing,
    commitTitleEditing,
    cancelTitleEditing,
    setTitleDraft,
  };
}
