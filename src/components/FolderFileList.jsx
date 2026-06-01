import { FileText, FolderOpen } from 'lucide-react';

export default function FolderFileList({ folder, files, onOpenFile }) {
  const countText = `${files.length} 个文档`;

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

        {files.length > 0 ? (
          <div className="folder-file-grid">
            {files.map((file) => (
              <button
                key={file.id}
                type="button"
                className="folder-file-card"
                data-testid="folder-file-card"
                onClick={() => onOpenFile(file.id)}
                title={file.name}
              >
                <span className="folder-file-icon" aria-hidden>
                  <FileText size={30} strokeWidth={1.5} />
                </span>
                <span className="folder-file-name">{file.name}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="folder-empty" data-testid="folder-empty">
            这个目录还没有文档
          </div>
        )}
      </div>
    </div>
  );
}
