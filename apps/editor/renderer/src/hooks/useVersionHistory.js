import { useCallback, useEffect, useRef, useState } from 'react';
import {
  dbGetVersionContent,
  dbGetVersions,
  dbSaveVersionSnapshot,
} from '../services/electronBridge.js';

/**
 * 版本历史弹窗的数据层：拉列表、按需取某个版本正文（带缓存）、恢复前存当前快照。
 * 组件只管展示，IPC 都在这里。
 */
export default function useVersionHistory({ open, docId }) {
  const [versions, setVersions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);
  const contentCacheRef = useRef(new Map());

  // 打开或换文档时重新拉列表，默认选中最新一份
  useEffect(() => {
    if (!open || !docId) return undefined;
    let cancelled = false;
    contentCacheRef.current = new Map();
    setLoading(true);
    setSelectedContent(null);
    Promise.resolve(dbGetVersions(docId))
      .then((result) => {
        if (cancelled) return;
        const list = result?.ok ? result.versions : [];
        setVersions(list);
        setSelectedVersionId(list[0]?.id ?? null);
      })
      .catch(() => !cancelled && setVersions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [open, docId]);

  // 选中项变化时取正文，取过的直接读缓存
  useEffect(() => {
    if (!open || selectedVersionId == null) return undefined;
    const cached = contentCacheRef.current.get(selectedVersionId);
    if (cached != null) {
      setSelectedContent(cached);
      return undefined;
    }
    let cancelled = false;
    setSelectedContent(null);
    Promise.resolve(dbGetVersionContent(selectedVersionId)).then((result) => {
      if (cancelled) return;
      const content = result?.ok ? (result.version?.content ?? '') : '';
      contentCacheRef.current.set(selectedVersionId, content);
      setSelectedContent(content);
    });
    return () => { cancelled = true; };
  }, [open, selectedVersionId]);

  /** 恢复前把当前正文存成一份快照，保证恢复可反悔；返回是否可以继续恢复 */
  const snapshotCurrent = useCallback(async (currentContent) => {
    if (!String(currentContent ?? '').trim()) return true;
    const result = await dbSaveVersionSnapshot(docId, currentContent);
    return Boolean(result?.ok);
  }, [docId]);

  return {
    versions,
    loading,
    selectedVersionId,
    selectVersion: setSelectedVersionId,
    selectedContent,
    snapshotCurrent,
  };
}
