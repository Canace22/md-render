import { AlertTriangle } from 'lucide-react';

export default function LocalProjectConflictModal({
  open,
  conflicts = [],
  onKeepLocal,
  onUseDisk,
  onDismiss,
}) {
  if (!open || conflicts.length === 0) return null;

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onDismiss?.();
  };

  return (
    <div
      className="local-project-conflict-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="local-project-conflict-title"
    >
      <div className="local-project-conflict-modal">
        <div className="local-project-conflict-header">
          <AlertTriangle size={20} className="local-project-conflict-icon" aria-hidden />
          <h2 id="local-project-conflict-title" className="local-project-conflict-title">
            检测到外部文件修改
          </h2>
        </div>

        <p className="local-project-conflict-desc">
          以下文件在应用外被修改，而你仍有未保存到磁盘的编辑。请选择如何处理：
        </p>

        <ul className="local-project-conflict-list">
          {conflicts.map((item) => (
            <li key={item.fileId} className="local-project-conflict-item">
              <span className="local-project-conflict-filename">{item.fileName}</span>
              {item.deletedOnDisk ? (
                <span className="local-project-conflict-hint">已在外部删除</span>
              ) : (
                <span className="local-project-conflict-hint">内容与当前编辑不一致</span>
              )}
            </li>
          ))}
        </ul>

        <div className="local-project-conflict-actions">
          <button
            type="button"
            className="local-project-conflict-btn secondary"
            onClick={onDismiss}
          >
            稍后处理
          </button>
          <button
            type="button"
            className="local-project-conflict-btn primary"
            onClick={onKeepLocal}
          >
            保留我的编辑
          </button>
          <button
            type="button"
            className="local-project-conflict-btn danger"
            onClick={onUseDisk}
          >
            使用磁盘版本
          </button>
        </div>
      </div>
    </div>
  );
}
