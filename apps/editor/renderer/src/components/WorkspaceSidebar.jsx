import { useState, useEffect, useRef, useCallback } from 'react';
import { Dropdown } from 'antd';
import logoUrl from '../assets/logo.png';
import {
  File,
  Folder,
  FolderOpen,
  LayoutGrid,
  Network,
  Pencil,
  Trash2,
  Github,
  ChevronLeft,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileType,
  Image,
  Video,
  Music,
  Settings,
  Cloud,
  Upload,
  FileOutput,
  Search,
  Tag,
  Pin,
  PinOff,
  RefreshCw,
  ChevronDown,
} from 'lucide-react';
import {
  filterWorkspace,
  collectRecentFiles,
  collectTags,
  filterWorkspaceByTag,
  getFolderChannelLabel,
} from '../store/workspaceUtils.js';

const GITHUB_URL = 'https://github.com/Canace22/md-render';
const DEFAULT_SIDEBAR_WIDTH = 320;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const SIDEBAR_KEYBOARD_RESIZE_STEP = 16;
const DEFAULT_EXPANDED_FOLDER_DEPTH = 1;
const FILE_MANAGER_LABEL = typeof window !== 'undefined' && window.electronAPI?.platform === 'darwin'
  ? '访达'
  : '文件管理器';

const clampSidebarWidth = (width) => {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
};

/** 根据文件扩展名返回对应图标组件 */
const getFileIcon = (filename) => {
  const ext = String(filename ?? '').match(/\.[^.]+$/)?.[0]?.toLowerCase() || '';
  switch (ext) {
    case '.html': case '.htm': case '.json': case '.rst': case '.org':
      return FileCode;
    case '.csv':
      return FileSpreadsheet;
    case '.docx':
      return FileType;
    case '.png': case '.jpg': case '.jpeg': case '.gif':
    case '.svg': case '.webp': case '.bmp': case '.ico':
      return Image;
    case '.mp4': case '.webm': case '.ogg': case '.mov':
      return Video;
    case '.mp3': case '.wav': case '.flac': case '.aac':
      return Music;
    default:
      return File;
  }
};

const EXPORT_OPTIONS = [
  { key: 'md', label: 'Markdown (.md)' },
  { key: 'html', label: 'HTML (.html)' },
  { key: 'pdf', label: 'PDF (.pdf)' },
  { key: 'docx', label: 'Word (.docx)' },
];

const TreeNode = ({
  node,
  selectedId,
  onSelect,
  depth,
  allowStructureActions,
  onRemoveLocalProject,
  onManualSyncLocalProject,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onMoveNode,
  onPinNode,
  renamingNodeId,
  renameDraft,
  onRenameDraftChange,
  onStartRename,
  onCommitRename,
  onCancelRename,
  contextMenu,
  onContextMenu,
  onCloseContextMenu,
  onRevealLocalProjectEntry,
  forceOpen,
}) => {
  const isFolder = node.type === 'folder';
  const isActive = node.id === selectedId;
  const isRoot = node.id === 'root';
  const isLocalProjectRoot = Boolean(node.localProjectRoot);
  const channelLabel = getFolderChannelLabel(node);
  const showStructureActions = allowStructureActions && !isLocalProjectRoot;
  const showRemoveProject = isLocalProjectRoot && onRemoveLocalProject;
  const showManualSyncProject = Boolean(isFolder && node.projectRootPath && onManualSyncLocalProject);
  const showRevealInFileManager = Boolean(node.projectRootPath && onRevealLocalProjectEntry);
  const [folderOpen, setFolderOpen] = useState(() => {
    return isFolder && depth < DEFAULT_EXPANDED_FOLDER_DEPTH;
  });

  // 外部全量展开/收起时同步本地状态
  useEffect(() => {
    if (isFolder && forceOpen !== undefined) {
      setFolderOpen(forceOpen);
    }
  }, [forceOpen, isFolder]);
  const [dragOver, setDragOver] = useState(false);
  const menuRef = useRef(null);
  const renameInputRef = useRef(null);
  const isRenaming = renamingNodeId === node.id;
  const isMenuTarget = contextMenu?.nodeId === node.id;

  const indentPx = depth * 12 + 8;
  const indentStyle = { paddingLeft: `${indentPx}px`, '--indent-guide-left': `${(depth - 1) * 12 + 8 + 4}px` };
  const nodeClass = [
    'tree-node',
    isFolder ? 'folder' : 'file',
    isActive ? 'active' : '',
    dragOver ? 'drag-over' : '',
  ].filter(Boolean).join(' ');

  useEffect(() => {
    if (!isMenuTarget) return;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        onCloseContextMenu();
      }
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [isMenuTarget, onCloseContextMenu]);

  // 菜单边界检测：避免超出视口被截断
  useEffect(() => {
    if (!isMenuTarget || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (rect.bottom > vh) {
      menuRef.current.style.top = `${Math.max(0, vh - rect.height - 4)}px`;
    }
    if (rect.right > vw) {
      menuRef.current.style.left = `${Math.max(0, vw - rect.width - 4)}px`;
    }
  }, [isMenuTarget]);

  useEffect(() => {
    if (!isRenaming || !renameInputRef.current) return;
    renameInputRef.current.focus();
    renameInputRef.current.select();
  }, [isRenaming]);

  const handleContextMenu = (e) => {
    if (!showStructureActions && !showRemoveProject && !showManualSyncProject && !showRevealInFileManager) return;
    e.preventDefault();
    e.stopPropagation();
    onSelect(node.id);
    onContextMenu(node.id, e.clientX, e.clientY);
  };

  const runAndClose = (fn) => () => {
    fn();
    onCloseContextMenu();
  };

  // 拖拽排序
  const handleDragStart = (e) => {
    e.stopPropagation();
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', node.id);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = (e) => {
    e.stopPropagation();
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const fromId = e.dataTransfer.getData('text/plain');
    if (fromId && fromId !== node.id) {
      onMoveNode?.(fromId, node.id);
    }
  };

  const sharedProps = allowStructureActions && !isRoot ? {
    draggable: true,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,
  } : {};

  return (
    <div key={node.id} className={nodeClass} {...sharedProps}>
      <div
        className="tree-node-row"
        style={indentStyle}
        onContextMenu={handleContextMenu}
      >
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
              : (() => { const Icon = getFileIcon(node.name); return <Icon size={16} strokeWidth={1.5} />; })()}
          </span>
          {isRenaming ? (
            <input
              ref={renameInputRef}
              type="text"
              className="tree-node-rename-input"
              value={renameDraft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onRenameDraftChange(e.target.value)}
              onBlur={() => onCommitRename()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  onCommitRename();
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  onCancelRename();
                }
              }}
              aria-label="重命名"
            />
          ) : (
            <span className="tree-node-text">{node.name}</span>
          )}
          {node.pinned && (
            <span className="tree-node-pin-icon" title="已置顶">
              <Pin size={11} strokeWidth={2} />
            </span>
          )}
          {channelLabel && (
            <span className="tree-node-channel-tag" title={`来源：${channelLabel}`}>
              {channelLabel}
            </span>
          )}
        </button>
      </div>

      {/* 右键上下文菜单 */}
      {isMenuTarget && (
        <div
          ref={menuRef}
          className="tree-node-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          data-testid="tree-context-menu"
        >
          {showRevealInFileManager && (
            <>
              <button type="button" onClick={runAndClose(() => onRevealLocalProjectEntry(node.id))}>
                <FolderOpen size={14} strokeWidth={1.5} /> 在{FILE_MANAGER_LABEL}中查看
              </button>
              {(showStructureActions || showManualSyncProject || showRemoveProject) && <div className="tree-context-menu-divider" />}
            </>
          )}
          {showStructureActions && isFolder && (
            <>
              <button type="button" onClick={runAndClose(() => onAddFile(node.id))}>
                <File size={14} strokeWidth={1.5} /> 新建文件
              </button>
              <button type="button" onClick={runAndClose(() => onAddFolder(node.id))}>
                <Folder size={14} strokeWidth={1.5} /> 新建文件夹
              </button>
              <div className="tree-context-menu-divider" />
            </>
          )}
          {showStructureActions && !isRoot && (
            <>
              <button type="button" onClick={runAndClose(() => onPinNode?.(node.id))}>
                {node.pinned
                  ? <><PinOff size={14} strokeWidth={1.5} /> 取消置顶</>
                  : <><Pin size={14} strokeWidth={1.5} /> 置顶</>}
              </button>
              <div className="tree-context-menu-divider" />
              <button type="button" onClick={runAndClose(() => onStartRename(node.id, node.name))}>
                <Pencil size={14} strokeWidth={1.5} /> 重命名
              </button>
              <button type="button" className="danger" onClick={runAndClose(() => onDelete(node.id))}>
                <Trash2 size={14} strokeWidth={1.5} /> 删除
              </button>
            </>
          )}
          {showManualSyncProject && (
            <>
              <button type="button" onClick={runAndClose(() => onManualSyncLocalProject(node.projectRootPath))}>
                <RefreshCw size={14} strokeWidth={1.5} /> 手动同步
              </button>
              {showRemoveProject && <div className="tree-context-menu-divider" />}
            </>
          )}
          {showRemoveProject && (
            <button type="button" className="danger" onClick={runAndClose(() => onRemoveLocalProject(node.id))}>
              <Trash2 size={14} strokeWidth={1.5} /> 移除项目
            </button>
          )}
        </div>
      )}

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
              onRemoveLocalProject={onRemoveLocalProject}
              onManualSyncLocalProject={onManualSyncLocalProject}
              onAddFile={onAddFile}
              onAddFolder={onAddFolder}
              onRename={onRename}
              onDelete={onDelete}
              onMoveNode={onMoveNode}
              onPinNode={onPinNode}
              renamingNodeId={renamingNodeId}
              renameDraft={renameDraft}
              onRenameDraftChange={onRenameDraftChange}
              onStartRename={onStartRename}
              onCommitRename={onCommitRename}
              onCancelRename={onCancelRename}
              contextMenu={contextMenu}
              onContextMenu={onContextMenu}
              onCloseContextMenu={onCloseContextMenu}
              onRevealLocalProjectEntry={onRevealLocalProjectEntry}
              forceOpen={forceOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** 隐藏工作区根节点，直接渲染一级目录和文档 */
const renderTree = (workspace, selectedId, onSelect, handlers, contextMenu, onContextMenu, onCloseContextMenu, forceOpen) => {
  const children = workspace?.type === 'folder' && Array.isArray(workspace.children)
    ? workspace.children
    : [];
  // 置顶节点排在最前（渲染层兜底，store 层已处理，这里保险起见）
  const sorted = [...children.filter((c) => c.pinned), ...children.filter((c) => !c.pinned)];
  return sorted.map((child) => (
    <TreeNode
      key={child.id}
      node={child}
      selectedId={selectedId}
      onSelect={onSelect}
      depth={0}
      {...handlers}
      contextMenu={contextMenu}
      onContextMenu={onContextMenu}
      onCloseContextMenu={onCloseContextMenu}
      forceOpen={forceOpen}
    />
  ));
};

const WorkspaceSidebar = ({
  workspace,
  selectedId,
  onSelect,
  onOpenLocalProject,
  onRemoveLocalProject,
  onManualSyncLocalProject,
  onAddFile,
  onAddFolder,
  onRename,
  onDelete,
  onMoveNode,
  onPinNode,
  onRevealLocalProjectEntry,
  onImportMarkdown,
  onExportMarkdown,
  onExportAs,
  collapsed,
  onToggleCollapse,
  surface,
  onOpenOverview,
  onOpenCanvas,
  onOpenSearch,
  onOpenGraph,
  onOpenCurrentContent,
  searchQuery,
  onSearchQueryChange,
  onOpenSettings,
  onOpenNotion,
  settingsActive,
  notionActive,
  localProjectSupported = false,
}) => {
  const [activeTag, setActiveTag] = useState(null);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [renamingNodeId, setRenamingNodeId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { nodeId, x, y }
  // undefined = 不强制（用户自由展开/收起），true = 全部展开，false = 全部收起
  const [forceOpen, setForceOpen] = useState(undefined);

  const handleToggleAllFolders = useCallback(() => {
    setForceOpen((prev) => (prev === false ? true : false));
  }, []);
  const resizeStartRef = useRef({ pointerX: 0, width: DEFAULT_SIDEBAR_WIDTH });
  const searchKeyword = searchQuery ?? '';
  const isSearching = Boolean(searchKeyword.trim());
  const allowStructureActions = true;

  const handleStartRename = (nodeId, currentName) => {
    setRenamingNodeId(nodeId);
    setRenameDraft(currentName);
  };

  const handleCancelRename = () => {
    setRenamingNodeId(null);
    setRenameDraft('');
  };

  const handleCommitRename = async () => {
    if (!renamingNodeId) return;
    const trimmed = renameDraft.trim();
    if (!trimmed) {
      handleCancelRename();
      return;
    }
    const ok = await onRename(renamingNodeId, trimmed);
    if (ok) {
      handleCancelRename();
    }
  };

  const renameHandlers = {
    renamingNodeId,
    renameDraft,
    onRenameDraftChange: setRenameDraft,
    onStartRename: handleStartRename,
    onCommitRename: handleCommitRename,
    onCancelRename: handleCancelRename,
  };

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
    onSearchQueryChange?.(value);
    if (value.trim()) setActiveTag(null); // 搜索时清除标签筛选
    if (value.trim()) {
      onOpenSearch?.();
    }
  };

  const toggleTag = (tag) => {
    setActiveTag((prev) => (prev === tag ? null : tag));
    onSearchQueryChange?.(''); // 选标签时清除搜索
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
      {/* ===== 左侧 icon rail：视图导航 + 底部工具 ===== */}
      <div className="sidebar-rail">
        <div className="sidebar-rail-top">
          {/* Logo / 展开收起 */}
          <button
            type="button"
            className="sidebar-rail-logo"
            onClick={collapsed ? onToggleCollapse : undefined}
            title={collapsed ? '展开侧边栏' : '知识库'}
            aria-label={collapsed ? '展开侧边栏' : '知识库'}
          >
            <img src={logoUrl} alt="" className="sidebar-rail-logo-img" />
          </button>

          {/* 视图导航 */}
          <nav className="sidebar-rail-nav" aria-label="创作与知识视图">
            <button
              type="button"
              className={`sidebar-rail-btn ${surface === 'overview' ? 'active' : ''}`}
              onClick={onOpenOverview}
              title="创作首页"
              aria-label="创作首页"
            >
              <LayoutGrid size={18} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              className={`sidebar-rail-btn ${surface === 'canvas' ? 'active' : ''}`}
              onClick={onOpenCanvas}
              title="画布工作台"
              aria-label="画布工作台"
            >
              <Pencil size={18} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              className={`sidebar-rail-btn ${surface === 'search' ? 'active' : ''}`}
              onClick={onOpenSearch}
              title="全局搜索"
              aria-label="全局搜索"
            >
              <Search size={18} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              className={`sidebar-rail-btn ${surface === 'graph' ? 'active' : ''}`}
              onClick={onOpenGraph}
              title="图谱视图"
              aria-label="图谱视图"
            >
              <Network size={18} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              className={`sidebar-rail-btn ${surface === 'paper' || surface === 'folder' ? 'active' : ''}`}
              onClick={onOpenCurrentContent}
              title="当前内容"
              aria-label="当前内容"
            >
              <FileText size={18} strokeWidth={1.6} />
            </button>
          </nav>

          {!collapsed && (
            <button
              type="button"
              className="sidebar-rail-btn"
              onClick={onOpenLocalProject}
              disabled={!localProjectSupported}
              title={localProjectSupported ? '导入本地知识目录' : '仅桌面版应用支持'}
              data-testid="sidebar-open-local-project"
            >
              <Upload size={18} strokeWidth={1.5} />
            </button>
          )}
        </div>

        <div className="sidebar-rail-bottom">
          <button
            type="button"
            className="sidebar-rail-btn"
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
              className="sidebar-rail-btn"
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
            className="sidebar-rail-btn"
            title="GitHub 项目地址"
            aria-label="在 GitHub 打开项目"
          >
            <Github size={18} strokeWidth={1.5} />
          </a>

          {!collapsed && (
            <button
              type="button"
              className="sidebar-rail-btn"
              onClick={onToggleCollapse}
              title="收起侧边栏"
              aria-label="收起侧边栏"
            >
              <ChevronLeft size={16} strokeWidth={1.5} />
            </button>
          )}
        </div>
      </div>

      {/* ===== 右侧主内容区 ===== */}
      {!collapsed && (
        <div className="sidebar-main">
          {/* 搜索框 */}
          <div className="notebook-search">
            <Search size={15} strokeWidth={1.5} className="notebook-search-icon" aria-hidden />
            <input
              type="text"
              className="notebook-search-input"
              placeholder="搜索知识库…"
              value={searchKeyword}
              onChange={(e) => handleSearchChange(e.target.value)}
              data-testid="sidebar-search-input"
              aria-label="搜索知识库"
            />
          </div>

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

          {/* 文档目录 + 新建 */}
          <div className="sidebar-docs-header">
            <span className="sidebar-section-title">文档目录</span>
            <div className="sidebar-add-icons">
              <button
                type="button"
                className="sidebar-add-icon"
                onClick={handleToggleAllFolders}
                title={forceOpen === false ? '展开全部文件夹' : '收起全部文件夹'}
                aria-label={forceOpen === false ? '展开全部文件夹' : '收起全部文件夹'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>
                </svg>
              </button>
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
              {onExportAs ? (
                <Dropdown
                  trigger={['click']}
                  menu={{
                    items: EXPORT_OPTIONS,
                    onClick: ({ key }) => onExportAs(key),
                  }}
                >
                  <button
                    type="button"
                    className="sidebar-add-icon with-caret"
                    title="导出当前文档"
                    aria-label="导出当前文档"
                    data-testid="sidebar-export-dropdown"
                  >
                    <FileOutput size={18} strokeWidth={1.5} />
                    <ChevronDown size={12} strokeWidth={1.8} />
                  </button>
                </Dropdown>
              ) : onExportMarkdown && (
                <button
                  type="button"
                  className="sidebar-add-icon"
                  onClick={onExportMarkdown}
                  title="导出当前文档为 .md"
                  aria-label="导出 Markdown"
                  data-testid="sidebar-export-markdown"
                >
                  <FileOutput size={18} strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>

          {/* 文件树 */}
          <div className="workspace-tree">
            {filteredWorkspace
              ? renderTree(filteredWorkspace, selectedId, onSelect, {
                  onAddFile,
                  onAddFolder,
                  onRename,
                  onDelete,
                  onMoveNode,
                  onPinNode,
                  onRevealLocalProjectEntry,
                  allowStructureActions,
                  onRemoveLocalProject,
                  onManualSyncLocalProject,
                  ...renameHandlers,
                },
                contextMenu,
                (nodeId, x, y) => setContextMenu({ nodeId, x, y }),
                () => setContextMenu(null),
                forceOpen,
              )
              : (
                <div className="workspace-tree-empty" data-testid="search-empty">
                  {isSearching
                    ? `没有匹配「${searchKeyword.trim()}」的笔记`
                    : `没有带「${activeTag}」标签的笔记`}
                </div>
              )}
          </div>
        </div>
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
