import { useState, useEffect, useRef } from 'react';
import {
  MoreVertical,
  File,
  Folder,
  FolderOpen,
  Pencil,
  Trash2,
  Github,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  FileText,
  Settings,
  Cloud,
  Upload,
  Download,
  Search,
  Tag,
} from 'lucide-react';
import {
  filterWorkspace,
  collectRecentFiles,
  collectTags,
  filterWorkspaceByTag,
} from '../store/workspaceUtils.js';

const GITHUB_URL = 'https://github.com/Canace22/md-render';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const SIDEBAR_KEYBOARD_RESIZE_STEP = 16;

const clampSidebarWidth = (width) => {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
};

const TreeNode = ({
  node,
  selectedId,
  onSelect,
  depth,
  allowStructureActions,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
}) => {
  const isFolder = node.type === 'folder';
  const isActive = node.id === selectedId;
  const isRoot = node.id === 'root';
  const [menuOpen, setMenuOpen] = useState(false);
  const [folderOpen, setFolderOpen] = useState(true);
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
          onClick={() => {
            onSelect(node.id);
            if (isFolder) setFolderOpen((v) => !v);
          }}
        >
          <span className="tree-node-icon">
            {isFolder
              ? (folderOpen
                  ? <FolderOpen size={16} strokeWidth={1.5} />
                  : <Folder size={16} strokeWidth={1.5} />)
              : <File size={16} strokeWidth={1.5} />}
          </span>
          <span className="tree-node-text">{node.name}</span>
          {isFolder && (
            <ChevronDown
              size={12}
              strokeWidth={1.5}
              className={`tree-node-chevron ${folderOpen ? 'open' : ''}`}
            />
          )}
        </button>
        {allowStructureActions && (
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
        )}
      </div>
      {isFolder && folderOpen && Array.isArray(node.children) && node.children.length > 0 && (
        <div className="tree-node-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
              allowStructureActions={allowStructureActions}
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

const WorkspaceSidebar = ({
  workspace,
  selectedId,
  onSelect,
  onOpenLocalProject,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onImportMarkdown,
  onExportMarkdown,
  collapsed,
  onToggleCollapse,
  onOpenSettings,
  onOpenNotion,
  settingsActive,
  notionActive,
  localProjectSupported = false,
  projectMode = false,
}) => {
  const [searchKeyword, setSearchKeyword] = useState('');
  const [activeTag, setActiveTag] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [resizing, setResizing] = useState(false);
  const resizeStartRef = useRef({ pointerX: 0, width: DEFAULT_SIDEBAR_WIDTH });
  const isSearching = Boolean(searchKeyword.trim());
  const allowStructureActions = !projectMode;

  // 视图优先级：搜索 > 标签筛选 > 正常
  const filteredWorkspace = isSearching
    ? filterWorkspace(workspace, searchKeyword)
    : activeTag
      ? filterWorkspaceByTag(workspace, activeTag)
      : workspace;

  // 搜索或筛标签时隐藏「最近」区，专注结果
  const recentFiles = isSearching || activeTag ? [] : collectRecentFiles(workspace, 5);
  const allTags = collectTags(workspace);

  const handleSearchChange = (value) => {
    setSearchKeyword(value);
    if (value.trim()) setActiveTag(null); // 搜索时清除标签筛选
  };

  const toggleTag = (tag) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
    setSearchKeyword(''); // 选标签时清除搜索
  };

  useEffect(() => {
    if (!resizing) return;

    const handlePointerMove = (event) => {
      const delta = event.clientX - resizeStartRef.current.pointerX;
      setSidebarWidth(clampSidebarWidth(resizeStartRef.current.width + delta));
    };

    const handlePointerUp = () => {
      setResizing(false);
    };

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [resizing]);

  const handleResizePointerDown = (event) => {
    event.preventDefault();
    resizeStartRef.current = {
      pointerX: event.clientX,
      width: sidebarWidth,
    };
    setResizing(true);
  };

  const handleResizeKeyDown = (event) => {
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setSidebarWidth((width) => clampSidebarWidth(width - SIDEBAR_KEYBOARD_RESIZE_STEP));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      setSidebarWidth((width) => clampSidebarWidth(width + SIDEBAR_KEYBOARD_RESIZE_STEP));
    } else if (event.key === 'Home') {
      event.preventDefault();
      setSidebarWidth(MIN_SIDEBAR_WIDTH);
    } else if (event.key === 'End') {
      event.preventDefault();
      setSidebarWidth(MAX_SIDEBAR_WIDTH);
    }
  };

  return (
    <div
      className={`workspace-panel ${collapsed ? 'collapsed' : ''}${resizing ? ' resizing' : ''}`}
      style={collapsed ? undefined : { width: `${sidebarWidth}px` }}
    >
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
            <span className="sidebar-header-title">简记</span>
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
          {/* 搜索框：按文件名/正文过滤 */}
          <div className="notebook-search">
            <Search size={15} strokeWidth={1.5} className="notebook-search-icon" aria-hidden />
            <input
              type="text"
              className="notebook-search-input"
              placeholder="搜索笔记…"
              value={searchKeyword}
              onChange={(e) => handleSearchChange(e.target.value)}
              data-testid="sidebar-search-input"
              aria-label="搜索笔记"
            />
          </div>

          <button
            type="button"
            className="sidebar-project-entry"
            onClick={onOpenLocalProject}
            disabled={!localProjectSupported}
            title={localProjectSupported ? '打开本地项目文件夹' : '仅桌面版应用支持'}
            data-testid="sidebar-open-local-project"
          >
            <Upload size={16} strokeWidth={1.5} />
            <span>{projectMode ? '重新打开本地项目' : '打开本地项目'}</span>
          </button>

          {/* 最近编辑 */}
          {recentFiles.length > 0 && (
            <div className="notebook-recent" data-testid="recent-section">
              <span className="sidebar-section-title notebook-recent-title">最近</span>
              <div className="notebook-recent-list">
                {recentFiles.map((file) => (
                  <button
                    key={file.id}
                    type="button"
                    className="notebook-recent-item"
                    onClick={() => onSelect(file.id)}
                    title={file.name}
                  >
                    <FileText size={14} strokeWidth={1.5} className="notebook-recent-icon" aria-hidden />
                    <span className="notebook-recent-name">{file.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 标签筛选 */}
          {!isSearching && allTags.length > 0 && (
            <div className="notebook-tags" data-testid="tags-section">
              <span className="sidebar-section-title notebook-tags-title">
                <Tag size={13} strokeWidth={1.5} aria-hidden /> 标签
              </span>
              <div className="notebook-tags-list">
                {allTags.map(({ tag, count }) => (
                  <button
                    key={tag}
                    type="button"
                    className={`notebook-tag-chip ${activeTag === tag ? 'active' : ''}`}
                    onClick={() => toggleTag(tag)}
                    data-testid="tag-filter-chip"
                  >
                    {tag}
                    <span className="notebook-tag-count">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 笔记 + 新建文件/文件夹 */}
          <div className="sidebar-docs-header">
            <span className="sidebar-section-title">笔记</span>
            <div className="sidebar-add-icons">
              {allowStructureActions && (
                <button
                  type="button"
                  className="sidebar-add-icon"
                  onClick={onAddFile}
                  title="新建文件"
                  aria-label="新建文件"
                >
                  <File size={18} strokeWidth={1.5} />
                </button>
              )}
              {allowStructureActions && (
                <button
                  type="button"
                  className="sidebar-add-icon"
                  onClick={onAddFolder}
                  title="新建文件夹"
                  aria-label="新建文件夹"
                >
                  <Folder size={18} strokeWidth={1.5} />
                </button>
              )}
              {allowStructureActions && onImportMarkdown && (
                <button
                  type="button"
                  className="sidebar-add-icon"
                  onClick={onImportMarkdown}
                  title="导入为新建 Markdown 文档"
                  aria-label="导入为新建 Markdown 文档"
                  data-testid="sidebar-import-markdown"
                >
                  <Upload size={18} strokeWidth={1.5} />
                </button>
              )}
              {onExportMarkdown && (
                <button
                  type="button"
                  className="sidebar-add-icon"
                  onClick={onExportMarkdown}
                  title="导出当前文档为 .md"
                  aria-label="导出 Markdown"
                  data-testid="sidebar-export-markdown"
                >
                  <Download size={18} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          {/* 文件树（搜索时渲染过滤后的结果） */}
          <div className="workspace-tree">
            {filteredWorkspace
              ? renderTree(filteredWorkspace, selectedId, onSelect, {
                  onAddFile,
                  onAddFolder,
                  onRename,
                  onDelete,
                  allowStructureActions,
                })
              : (
                <div className="workspace-tree-empty" data-testid="search-empty">
                  {isSearching
                    ? `没有匹配「${searchKeyword.trim()}」的笔记`
                    : `没有带「${activeTag}」标签的笔记`}
                </div>
              )}
          </div>

          {/* 底部操作栏：设置、主题、GitHub，均匀分布 */}
          <div className="sidebar-footer">
            <button
              type="button"
              className="sidebar-footer-icon"
              data-testid="open-settings"
              data-active={settingsActive ? 'true' : 'false'}
              onClick={onOpenSettings}
              title="设置"
              aria-label="设置"
            >
              <Settings size={18} strokeWidth={1.5} />
            </button>

            {onOpenNotion && (
              <button
                type="button"
                className="sidebar-footer-icon"
                data-testid="open-notion"
                data-active={notionActive ? 'true' : 'false'}
                onClick={onOpenNotion}
                title="Notion 同步"
                aria-label="Notion 同步"
              >
                <Cloud size={18} strokeWidth={1.5} />
              </button>
            )}

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
      {!collapsed && (
        <div
          className="workspace-resize-handle"
          role="separator"
          tabIndex={0}
          aria-label="调整侧边栏宽度"
          aria-orientation="vertical"
          aria-valuemin={MIN_SIDEBAR_WIDTH}
          aria-valuemax={MAX_SIDEBAR_WIDTH}
          aria-valuenow={sidebarWidth}
          title="拖拽调整侧边栏宽度"
          onPointerDown={handleResizePointerDown}
          onKeyDown={handleResizeKeyDown}
        />
      )}
    </div>
  );
};

export default WorkspaceSidebar;
