import { useCallback, useEffect, useRef, useState } from 'react';
import { stripFileExtension } from '../utils/fileDisplayName.js';

/**
 * 文档标题编辑状态与逻辑
 * @param {{ id: string, name: string } | null} selectedFile
 * @param {(id: string, name: string) => boolean} applyRename
 */
export function useTitleEditing(selectedFile, applyRename) {
  const titleInputRef = useRef(null);
  const titleMeasureRef = useRef(null);
  const isCommittingRef = useRef(false);
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleInputWidth, setTitleInputWidth] = useState(160);
  const selectedFileDisplayName = stripFileExtension(selectedFile?.name, '');

  const startTitleEditing = useCallback(() => {
    if (!selectedFile) return;
    setTitleDraft(selectedFileDisplayName);
    setIsTitleEditing(true);
  }, [selectedFile, selectedFileDisplayName]);

  const commitTitleEditing = useCallback(async () => {
    if (isCommittingRef.current) return;
    isCommittingRef.current = true;
    try {
      if (!selectedFile) {
        setIsTitleEditing(false);
        setTitleDraft('');
        return;
      }
      const nextName = titleDraft.trim();
      if (!nextName) {
        setTitleDraft(selectedFileDisplayName);
        setIsTitleEditing(false);
        return;
      }
      const result = applyRename(selectedFile.id, nextName);
      const ok = result && typeof result.then === 'function' ? await result : result;
      if (!ok) {
        alert('名称已存在，请换一个。');
        setTitleDraft(selectedFileDisplayName);
      }
      setIsTitleEditing(false);
    } finally {
      isCommittingRef.current = false;
    }
  }, [selectedFile, selectedFileDisplayName, titleDraft, applyRename]);

  const cancelTitleEditing = useCallback(() => {
    setTitleDraft(selectedFileDisplayName);
    setIsTitleEditing(false);
  }, [selectedFileDisplayName]);

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
    if (!isTitleEditing) setTitleDraft(selectedFileDisplayName);
  }, [selectedFile, selectedFileDisplayName, isTitleEditing]);

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
