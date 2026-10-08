import { useEffect, useMemo, useState } from 'react';
import { Button, Empty, Modal, Segmented, Spin, message } from 'antd';
import { Copy, History, RotateCcw } from 'lucide-react';
import useVersionHistory from '../hooks/useVersionHistory.js';
import { countDiff, diffLines } from '../core/agent/lineDiff.js';
import { countWords } from '../utils/wordCount.js';
import { formatVersionTime } from '../utils/versionHistory.js';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import {
  VERSION_RETENTION_DAYS,
  VERSION_SNAPSHOT_INTERVAL_MINUTES,
} from '../../../shared/versionHistory.js';

const MODAL_WIDTH = 960;
const VIEW_PREVIEW = 'preview';
const VIEW_DIFF = 'diff';
const VIEW_OPTIONS = [
  { label: '预览', value: VIEW_PREVIEW },
  { label: '与当前对比', value: VIEW_DIFF },
];
const HINT_TEXT = `编辑时每 ${VERSION_SNAPSHOT_INTERVAL_MINUTES} 分钟最多自动存一份，保留 ${VERSION_RETENTION_DAYS} 天。`;

const DiffRows = ({ rows }) => rows.map((row, i) => (
  <div key={i} className={`diff-overlay__line diff-overlay__line--${row.type}`}>
    <span className="diff-overlay__sign">{row.type === 'add' ? '+' : row.type === 'del' ? '−' : ' '}</span>
    <span className="diff-overlay__text">{row.text || ' '}</span>
  </div>
));

/**
 * 文档版本历史（参照 Obsidian「文件恢复」）：左边快照时间列表，右边预览 / 与当前对比，
 * 可复制或恢复。恢复前会把当前内容也存一份快照，恢复后还能在这里找回。
 *
 * @param {(content: string) => string} toMarkdown 存储正文（可能是 BlockNote JSON）→ Markdown
 * @param {(content: string) => void} onRestore 把选中版本的原始正文写回编辑器
 */
export default function VersionHistoryModal({
  open, onClose, file, currentContent, toMarkdown, onRestore, readOnly,
}) {
  const {
    versions, loading, selectedVersionId, selectVersion, selectedContent, snapshotCurrent,
  } = useVersionHistory({ open, docId: file?.id });
  const [view, setView] = useState(VIEW_PREVIEW);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (open) setView(VIEW_PREVIEW);
  }, [open]);

  const selectedText = useMemo(
    () => (selectedContent == null ? '' : toMarkdown(selectedContent)),
    [selectedContent, toMarkdown],
  );
  const currentText = useMemo(
    () => (open && view === VIEW_DIFF ? toMarkdown(currentContent ?? '') : ''),
    [open, view, currentContent, toMarkdown],
  );
  // 方向：此版本 → 当前。「−」是恢复后会找回的，「+」是恢复后会去掉的
  const rows = useMemo(
    () => (view === VIEW_DIFF && selectedContent != null ? diffLines(selectedText, currentText) : []),
    [view, selectedContent, selectedText, currentText],
  );
  const stat = useMemo(() => countDiff(rows), [rows]);

  const selectedVersion = versions.find((item) => item.id === selectedVersionId) ?? null;
  const selectedLabel = selectedVersion ? formatVersionTime(selectedVersion.created_at) : '';
  const sameAsCurrent = selectedContent != null && selectedContent === currentContent;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selectedText);
      message.success('已复制这个版本的内容');
    } catch {
      message.error('复制失败');
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      if (!(await snapshotCurrent(currentContent))) {
        message.error('保存当前内容失败，已取消恢复');
        return;
      }
      onRestore(selectedContent);
      message.success(`已恢复到「${selectedLabel}」的版本，恢复前的内容也存进了版本历史`);
      onClose();
    } catch (error) {
      message.error(error?.message || '恢复失败');
    } finally {
      setRestoring(false);
    }
  };

  const renderBody = () => {
    if (selectedContent == null) return <div className="version-history__loading"><Spin /></div>;
    if (view === VIEW_DIFF) {
      return stat.added || stat.removed
        ? <div className="diff-overlay__body"><DiffRows rows={rows} /></div>
        : <div className="version-history__same">和当前内容一致</div>;
    }
    return <pre className="version-history__preview">{selectedText || '（空文档）'}</pre>;
  };

  const renderDetail = () => (
    <div className="version-history__detail">
      <div className="version-history__toolbar">
        <Segmented size="small" options={VIEW_OPTIONS} value={view} onChange={setView} />
        <span className="version-history__meta">
          {view === VIEW_DIFF ? (
            <>
              <span className="diff-overlay__del">−{stat.removed}</span>
              <span className="diff-overlay__add">+{stat.added}</span>
              <span>（此版本 → 当前）</span>
            </>
          ) : `${countWords(selectedText).toLocaleString()} 字`}
        </span>
        <Button size="small" icon={<Copy size={13} />} onClick={handleCopy} disabled={selectedContent == null}>
          复制
        </Button>
        <Button
          size="small"
          type="primary"
          icon={<RotateCcw size={13} />}
          loading={restoring}
          disabled={readOnly || selectedContent == null || sameAsCurrent}
          title={sameAsCurrent ? '和当前内容一致，无需恢复' : undefined}
          onClick={handleRestore}
        >
          恢复此版本
        </Button>
      </div>
      <div className="version-history__content">{renderBody()}</div>
    </div>
  );

  const renderMain = () => {
    if (loading) return <div className="version-history__loading"><Spin /></div>;
    if (!versions.length) {
      return <Empty className="version-history__empty" description={`还没有历史版本。${HINT_TEXT}`} />;
    }
    return (
      <div className="version-history">
        <ul className="version-history__list" aria-label="历史版本">
          {versions.map((item, index) => (
            <li key={item.id}>
              <button
                type="button"
                className={`version-history__item${item.id === selectedVersionId ? ' is-active' : ''}`}
                onClick={() => selectVersion(item.id)}
              >
                {formatVersionTime(item.created_at)}
                {index === 0 && <span className="version-history__badge">最近</span>}
              </button>
            </li>
          ))}
        </ul>
        {renderDetail()}
      </div>
    );
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={MODAL_WIDTH}
      destroyOnClose
      title={(
        <span className="version-history__title">
          <History size={16} />
          版本历史 · {stripFileExtension(file?.name ?? '')}
        </span>
      )}
    >
      {renderMain()}
      {versions.length > 0 && <div className="version-history__hint">{HINT_TEXT}</div>}
    </Modal>
  );
}
