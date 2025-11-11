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
      <div className="panel-header">
        <h2>目录</h2>
      </div>
      <div className="workspace-actions">
        <button type="button" onClick={onAddFile}>
          新建文件
        </button>
        <button type="button" onClick={onAddFolder}>
          新建文件夹
        </button>
        <button type="button" onClick={onRename} disabled={isRootSelected}>
          重命名
        </button>
        <button type="button" onClick={onDelete} disabled={isRootSelected}>
          删除
        </button>
      </div>
      <div className="workspace-tree">{renderTree(workspace, selectedId, onSelect)}</div>
    </div>
  );
};

export default WorkspaceSidebar;


