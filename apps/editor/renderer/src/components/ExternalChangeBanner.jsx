import { useMemo, useState } from 'react';
import { Modal } from 'antd';
import { useEditorStore } from '../store/useEditorStore.js';
import { countDiff, diffLines } from '../core/agent/lineDiff.js';

/**
 * 外部修改提示（U6）：当前文档刚在 app 外被改了，已载入最新内容。
 * 可以对比改动，或恢复成改动前的版本（恢复会作为一次正常编辑保存回磁盘）。
 */
export default function ExternalChangeBanner() {
  const notice = useEditorStore((s) => s.externalChangeNotice);
  const selectedId = useEditorStore((s) => s.selectedId);
  const clearNotice = useEditorStore((s) => s.clearExternalChangeNotice);
  const updateSelectedFileContent = useEditorStore((s) => s.updateSelectedFileContent);
  const [diffOpen, setDiffOpen] = useState(false);

  const rows = useMemo(
    () => (notice ? diffLines(notice.previousContent, notice.diskContent) : []),
    [notice],
  );
  if (!notice || notice.fileId !== selectedId) return null;
  const stat = countDiff(rows);

  const handleRestore = () => {
    updateSelectedFileContent(notice.previousContent);
    clearNotice();
  };

  return (
    <div className="external-change-banner" role="status">
      <span>「{notice.fileName}」刚在 app 外被修改，已显示最新内容（+{stat.added} −{stat.removed}）。</span>
      <span className="external-change-banner__actions">
        <button type="button" onClick={() => setDiffOpen(true)}>对比</button>
        <button type="button" onClick={handleRestore}>恢复为修改前</button>
        <button type="button" onClick={clearNotice}>知道了</button>
      </span>
      <Modal open={diffOpen} title="外部改动（修改前 → 现在）" footer={null} onCancel={() => setDiffOpen(false)} width={720}>
        <div className="diff-overlay__body proposal-inbox__diff">
          {rows.map((row, i) => (
            <div key={i} className={`diff-overlay__line diff-overlay__line--${row.type}`}>
              <span className="diff-overlay__sign">{row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}</span>
              <span className="diff-overlay__text">{row.text || ' '}</span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  );
}
