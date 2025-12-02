const renderTree = (node, selectedId, onSelect, depth = 0) => {
  if (!node) return null;
  const isFolder = node.type === 'folder';
  const isActive = node.id === selectedId;
  const indentStyle = { paddingLeft: `${depth * 16 + 8}px` };
  const nodeClass = `tree-node ${isFolder ? 'folder' : 'file'}${isActive ? ' active' : ''}`;

  return (
    <div key={node.id} className={nodeClass}>
      <button
        type="button"
        className={`tree-node-button ${isFolder ? 'folder' : 'file'}`}
        style={indentStyle}
        onClick={() => onSelect(node.id)}
      >
        <span className="tree-node-icon">{isFolder ? '📁' : '📄'}</span>
        <span className="tree-node-text">{node.name}</span>
      </button>
      {isFolder && Array.isArray(node.children) && node.children.length > 0 && (
        <div className="tree-node-children">
          {node.children.map((child) => renderTree(child, selectedId, onSelect, depth + 1))}
        </div>
      )}
    </div>
  );
};

const WorkspaceSidebar = ({
  workspace,
  selectedId,
  onSelect,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
}) => {
  const isRootSelected = selectedId === 'root';

  return (
    <div className="workspace-panel">

      <div className="sidebar-search-row">
        <div className="sidebar-search">
          <span className="sidebar-search-icon">🔍</span>
          <input
            type="text"
            placeholder="搜索  ⌘+F"
            aria-label="搜索文档"
          />
        </div>
        <button
          type="button"
          className="sidebar-add-entry"
          onClick={onAddFile}
          title="新建文档"
        >
          ＋
        </button>
      </div>

      <div className="sidebar-section-header">
        <span className="sidebar-section-title">我的文档</span>
      </div>

      <div className="workspace-actions workspace-actions-compact">
        <button
          type="button"
          className="workspace-action-btn"
          onClick={onAddFile}
          title="新建文件"
        >
          📄
        </button>
        <button
          type="button"
          className="workspace-action-btn"
          onClick={onAddFolder}
          title="新建文件夹"
        >
          📁
        </button>
        <button
          type="button"
          className="workspace-action-btn"
          onClick={onRename}
          disabled={isRootSelected}
          title={isRootSelected ? '根目录不能重命名' : '重命名'}
        >
          ✏️
        </button>
        <button
          type="button"
          className="workspace-action-btn danger"
          onClick={onDelete}
          disabled={isRootSelected}
          title={isRootSelected ? '根目录不能删除' : '删除'}
        >
          🗑️
        </button>
      </div>
      <div className="workspace-tree">{renderTree(workspace, selectedId, onSelect)}</div>
    </div>
  );
};

export default WorkspaceSidebar;


