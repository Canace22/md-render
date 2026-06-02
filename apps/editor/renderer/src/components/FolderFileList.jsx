import { FileText, Folder, FolderOpen } from 'lucide-react';
import { buildFolderChildSummary } from '../store/workspaceUtils.js';

export default function FolderFileList({ folder, children, onSelectItem }) {
  const items = Array.isArray(children) ? children : [];
  const countText = buildFolderChildSummary(items);

  return (
    <div className="folder-stage" data-testid="folder-file-list">
      <div className="folder-surface">
        <div className="folder-header">
          <div className="folder-title-row">
            <FolderOpen size={30} strokeWidth={1.6} aria-hidden />
            <h1 className="folder-title">{folder.name}</h1>
          </div>
          <p className="folder-summary">{countText}</p>
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
