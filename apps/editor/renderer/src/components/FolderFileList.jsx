import { FileText, Folder, FolderInput, FolderOpen, RefreshCw } from 'lucide-react';
import { buildFolderChildSummary } from '../store/workspaceUtils.js';

export default function FolderFileList({
  folder,
  children,
  onSelectItem,
  needsReauthorization = false,
  onReauthorize,
  showSyncButton = false,
  syncLoading = false,
  onSyncFromDisk,
}) {
  const items = Array.isArray(children) ? children : [];
  const countText = buildFolderChildSummary(items);

  return (
    <div className="folder-stage" data-testid="folder-file-list">
      <div className="folder-surface">
        <div className="folder-header">
          <div className="folder-header-main">
            <div className="folder-title-row">
              <FolderOpen size={30} strokeWidth={1.6} aria-hidden />
              <h1 className="folder-title">{folder.name}</h1>
            </div>
            {(needsReauthorization || showSyncButton) && (
              <div className="folder-header-actions">
                {needsReauthorization ? (
                  <button
                    type="button"
                    className="doc-meta-toggle"
                    onClick={() => onReauthorize?.()}
                    title="重新选择原目录并授予读写权限"
                  >
                    <FolderInput size={13} strokeWidth={2} className="doc-meta-toggle-icon" />
                    <span>重新授权并编辑</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`doc-meta-toggle${syncLoading ? ' is-loading' : ''}`}
                    onClick={() => onSyncFromDisk?.()}
                    disabled={syncLoading}
                    title="从磁盘重新读取当前本地项目"
                  >
                    <RefreshCw size={13} strokeWidth={2} className="doc-meta-toggle-icon" />
                    <span>{syncLoading ? '同步中...' : '手动同步'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="folder-summary">{countText}</p>
          {needsReauthorization && (
            <p className="folder-summary">
              这是从 Electron 版导入的本地目录快照。Tauri 需要重新选择原目录后才能新建或修改文件。
            </p>
          )}
        </div>

        {items.length > 0 ? (
          <div className="folder-file-grid">
            {items.map((item) => {
              const isFolder = item.type === 'folder';
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`folder-file-card${isFolder ? ' folder-file-card--folder' : ''}`}
                  data-testid={isFolder ? 'folder-subfolder-card' : 'folder-file-card'}
                  onClick={() => onSelectItem(item.id)}
                  title={item.name}
                >
                  <span className="folder-file-icon" aria-hidden>
                    {isFolder ? (
                      <Folder size={30} strokeWidth={1.5} />
                    ) : (
                      <FileText size={30} strokeWidth={1.5} />
                    )}
                  </span>
                  <span className="folder-file-name">{item.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="folder-empty" data-testid="folder-empty">
            这个目录还是空的
          </div>
        )}
      </div>
    </div>
  );
}
