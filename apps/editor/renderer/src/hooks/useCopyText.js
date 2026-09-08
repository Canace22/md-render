import { useCallback, useState } from 'react';

const COPY_FEEDBACK_MS = 1500;

/**
 * 复制文本并给出短暂的「已复制」反馈。
 * @returns {{ copiedId: string | null, copy: (id: string, text: string) => void }}
 */
export function useCopyText() {
  const [copiedId, setCopiedId] = useState(null);

  const copy = useCallback((id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
    });
  }, []);

  return { copiedId, copy };
}

export default useCopyText;
