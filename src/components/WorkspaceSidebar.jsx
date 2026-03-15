import { useState, useEffect, useRef } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  MoreVertical,
  File,
  Folder,
  Pencil,
  Trash2,
  Github,
  ChevronLeft,
  ChevronRight,
  FileText,
  Settings,
} from 'lucide-react';

const GITHUB_URL = 'https://github.com/Canace22/md-render';

const TreeNode = ({
  node,
  selectedId,
  onSelect,
  depth,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
}) => {
  const isFolder = node.type === 'folder';
  const isActive = node.id === selectedId;
  const isRoot = node.id === 'root';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  const indentStyle = { paddingLeft: `${depth * 16 + 8}px` };
  const nodeClass = `tree-node ${isFolder ? 'folder' : 'file'}${isActive ? ' active' : ''}`;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const handleMenuClick = (e) => {
    e.stopPropagation();
    onSelect(node.id);
    setMenuOpen((v) => !v);
  };

  const runAndClose = (fn) => {
    return () => {
      fn();
      setMenuOpen(false);
    };
  };

  return (
    <div key={node.id} className={nodeClass}>
      <div className="tree-node-row" style={indentStyle}>
        <button
          type="button"
          className="tree-node-button"
          onClick={() => onSelect(node.id)}
        >
          <span className="tree-node-icon">
            {isFolder ? <Folder size={16} strokeWidth={1.5} /> : <File size={16} strokeWidth={1.5} />}
          </span>
          <span className="tree-node-text">{node.name}</span>
        </button>
        <div className="tree-node-actions" ref={menuRef}>
          <button
            type="button"
            className="tree-node-action-icon"
            onClick={(e) => { e.stopPropagation(); onRename(node.id); }}
            disabled={isRoot}
            title="重命名"
            aria-label="重命名"
          >
            <Pencil size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="tree-node-action-icon danger"
            onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
            disabled={isRoot}
            title="删除"
            aria-label="删除"
          >
            <Trash2 size={16} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            className="tree-node-more-btn"
            onClick={handleMenuClick}
            title="更多操作"
            aria-label="更多操作"
          >
            <MoreVertical size={16} strokeWidth={1.5} />
          </button>
          {menuOpen && (
            <div className="tree-node-menu">
              <button type="button" onClick={runAndClose(() => onAddFile(node.id))}>
                <File size={14} strokeWidth={1.5} /> 新建文件
              </button>
              <button type="button" onClick={runAndClose(() => onAddFolder(node.id))}>
                <Folder size={14} strokeWidth={1.5} /> 新建文件夹
              </button>
            </div>
          )}
        </div>
      </div>
      {isFolder && Array.isArray(node.children) && node.children.length > 0 && (
        <div className="tree-node-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
              onAddFile={onAddFile}
              onAddFolder={onAddFolder}
              onRename={onRename}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** 不显示根节点「工作区」，直接渲染其子节点 */
const renderTree = (workspace, selectedId, onSelect, handlers) => {
  const children = workspace?.type === 'folder' && Array.isArray(workspace.children)
    ? workspace.children
    : [];
  return children.map((child) => (
    <TreeNode
      key={child.id}
      node={child}
      selectedId={selectedId}
      onSelect={onSelect}
      depth={0}
      {...handlers}
    />
  ));
};

const THEME_ICONS = { system: Monitor, light: Sun, dark: Moon };
const THEME_TITLES = { system: '跟随系统', light: '浅色', dark: '深色' };

/** 用户只能选浅色/深色，点击在两者间切换；system 为初始默认，首次点击切到 light */
const getNextTheme = (current) => (current === 'dark' ? 'light' : 'dark');

const WorkspaceSidebar = ({
  workspace,
  selectedId,
  onSelect,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  theme,
  onThemeChange,
  collapsed,
  onToggleCollapse,
}) => {
  return (
    <div className={`workspace-panel ${collapsed ? 'collapsed' : ''}`}>
      {/* 收起时只显示展开按钮 */}
      {collapsed && (
        <button
            type="button"
            className="sidebar-expand-btn"
            onClick={onToggleCollapse}
            title="展开侧边栏"
            aria-label="展开侧边栏"
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </button>
      )}

      {/* ProEditor 顶部标题 */}
      {!collapsed && (
        <div className="sidebar-header">
          <div className="sidebar-header-brand">
            <span className="sidebar-header-logo" aria-hidden>
              <FileText size={18} strokeWidth={1.5} />
            </span>
            <span className="sidebar-header-title">Canace's Editor</span>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn"
            onClick={onToggleCollapse}
            title="收起侧边栏"
            aria-label="收起侧边栏"
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {!collapsed && (
        <>
          {/* 我的文档 + 新建文件/文件夹图标 */}
          <div className="sidebar-docs-header">
            <span className="sidebar-section-title">我的文档</span>
            <div className="sidebar-add-icons">
              <button
                type="button"
                className="sidebar-add-icon"
                onClick={onAddFile}
                title="新建文件"
                aria-label="新建文件"
              >
                <File size={18} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="sidebar-add-icon"
                onClick={onAddFolder}
                title="新建文件夹"
                aria-label="新建文件夹"
              >
                <Folder size={18} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* 文件树 */}
          <div className="workspace-tree">
            {renderTree(workspace, selectedId, onSelect, {
              onAddFile,
              onAddFolder,
              onRename,
              onDelete,
            })}
          </div>

          {/* 底部操作栏：设置、主题、GitHub，均匀分布 */}
          <div className="sidebar-footer">
            <button
              type="button"
              className="sidebar-footer-icon"
              title="设置"
              aria-label="设置"
            >
              <Settings size={18} strokeWidth={1.5} />
            </button>

            <button
              type="button"
              className="sidebar-footer-icon"
              data-testid="theme-select"
              data-theme={theme}
              onClick={() => onThemeChange(theme === 'system' ? 'light' : getNextTheme(theme))}
              title={THEME_TITLES[theme]}
              aria-label={`主题：${THEME_TITLES[theme]}，点击切换`}
            >
              {(() => {
                const Icon = THEME_ICONS[theme] ?? Monitor;
                return <Icon size={18} strokeWidth={1.5} />;
              })()}
            </button>

            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="sidebar-footer-icon"
              title="GitHub 项目地址"
              aria-label="在 GitHub 打开项目"
            >
              <Github size={18} strokeWidth={1.5} />
            </a>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkspaceSidebar;
