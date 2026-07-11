import { useState, useEffect, useRef, useCallback } from 'react';
import { Dropdown, Popover, Select } from 'antd';
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
  Pin,
  PinOff,
  RefreshCw,
  ChevronDown,
  CalendarDays,
  SlidersHorizontal,
  Braces,
} from 'lucide-react';
import {
  filterWorkspace,
  collectRecentFiles,
  filterWorkspaceByMeta,
  collectMetaFilterCounts,
  findNodeById,
  getFolderChannelLabel,
  resolveTargetFolderId,
  KNOWLEDGE_NODE_TYPE_OPTIONS,
  META_FILTER_STATUS_NONE,
  META_FILTER_STATUS_NONE_LABEL,
  getNodeSortTime,
  isHiddenWorkspaceNode,
} from '../store/workspaceUtils.js';
import { CREATION_STATUS_OPTIONS } from '../store/creationUtils.js';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import { PUBLISHING_PLATFORM_OPTIONS } from '../utils/publishingPlatforms.js';
import { getPlatform } from '../services/electronBridge.js';

const GITHUB_URL = 'https://github.com/Canace22/md-render';
const DEFAULT_SIDEBAR_WIDTH = 320;
const SIDEBAR_RAIL_WIDTH = 48;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const SIDEBAR_KEYBOARD_RESIZE_STEP = 16;
const DEFAULT_EXPANDED_FOLDER_DEPTH = 1;
const FILE_MANAGER_LABEL = getPlatform() === 'darwin'
  ? '访达'
  : '文件管理器';

const EMPTY_META_FILTERS = { status: null, platform: null, nodeType: null, tag: null };
const META_FILTER_ALL = '__all__';

const hasActiveMetaFilters = (filters) =>
  Boolean(filters?.status || filters?.platform || filters?.nodeType || filters?.tag);

const buildMetaFilterEmptyMessage = (filters, labelMaps) => {
  const parts = [];
  if (filters.status) {
    const statusLabel = filters.status === META_FILTER_STATUS_NONE
      ? META_FILTER_STATUS_NONE_LABEL
      : (labelMaps.status.get(filters.status) ?? filters.status);
    parts.push(`状态「${statusLabel}」`);
  }
  if (filters.platform) {
    parts.push(`平台「${labelMaps.platform.get(filters.platform) ?? filters.platform}」`);
  }
  if (filters.nodeType) {
    parts.push(`类型「${labelMaps.nodeType.get(filters.nodeType) ?? filters.nodeType}」`);
  }
  if (filters.tag) {
    parts.push(`标签「${filters.tag}」`);
  }
  return parts.length > 0 ? `没有匹配${parts.join('、')}的笔记` : '没有匹配的笔记';
};

const clampSidebarWidth = (width) => {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
};

const buildFilterSelectOptions = (items) =>
  items.map(({ value, label, count }) => ({
    value,
    label: `${label} (${count})`,
  }));

const buildMetaFilterSelectOptions = (items) => [
  { value: META_FILTER_ALL, label: '全部' },
  ...buildFilterSelectOptions(items),
];

const resolveMetaFilterChange = (value) => {
  if (value === META_FILTER_ALL || value == null) return null;
  return value;
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

const getRenameDraftValue = (node, fallbackName = '') => {
  const name = String(node?.name ?? fallbackName ?? '');
  if (node?.type !== 'file') return name;
  const next = name.replace(/(\.[^./\\]+)$/u, '');
  return next || name;
};

/**
 * 置顶节点优先，同组内按 updatedAt（最近活跃，缺失时用 createdAt）降序。
 * .agent 等隐藏元数据节点（点开头命名 / agentMetaFolder 标记）不进目录树。
 */
const sortTreeChildren = (childrenRaw) => {
  const children = (Array.isArray(childrenRaw) ? childrenRaw : [])
    .filter((child) => !isHiddenWorkspaceNode(child));
  if (children.length <= 1) return children;
  const indexed = children.map((child, index) => ({ child, index }));
  const byActivityDesc = (a, b) => {
    const diff = getNodeSortTime(b.child) - getNodeSortTime(a.child);
    if (diff !== 0) return diff;
    return a.index - b.index;
  };
  const pinned = indexed.filter(({ child }) => child.pinned).sort(byActivityDesc);
  const unpinned = indexed.filter(({ child }) => !child.pinned).sort(byActivityDesc);
  return [...pinned, ...unpinned].map(({ child }) => child);
};

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
  const showCreateActions = allowStructureActions && isFolder;
  const showNodeActions = allowStructureActions && !isRoot && !isLocalProjectRoot;
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
  const isMenuTarget = contextMenu?.kind === 'node' && contextMenu.nodeId === node.id;

  const indentPx = depth * 12 + 8;
  const indentStyle = { paddingLeft: `${indentPx}px`, '--indent-guide-left': `${(depth - 1) * 12 + 8 + 4}px` };
  const displayName = isFolder ? node.name : stripFileExtension(node.name);
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
    if (!showCreateActions && !showNodeActions && !showRemoveProject && !showManualSyncProject && !showRevealInFileManager) return;
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

  const sharedProps = allowStructureActions && !isRoot && !node.projectRootPath ? {
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
            <span className="tree-node-text">{displayName}</span>
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
              {(showCreateActions || showNodeActions || showManualSyncProject || showRemoveProject) && <div className="tree-context-menu-divider" />}
            </>
          )}
          {showCreateActions && (
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
          {showNodeActions && (
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
          {sortTreeChildren(node.children).map((child) => (
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
  const sorted = sortTreeChildren(children);
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
  onOpenDaily,
  onOpenOverview,
  onOpenCanvas,
  onOpenSearch,
  onOpenGraph,
  onOpenJsonTool,
  onOpenCurrentContent,
  searchQuery,
  onSearchQueryChange,
  onOpenSettings,
  onOpenSync,
  settingsActive,
  syncActive,
  platformOptions = PUBLISHING_PLATFORM_OPTIONS,
}) => {
  const [metaFilters, setMetaFilters] = useState(EMPTY_META_FILTERS);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [renamingNodeId, setRenamingNodeId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { kind, nodeId, x, y }
  // undefined = 不强制（用户自由展开/收起），true = 全部展开，false = 全部收起
  const [forceOpen, setForceOpen] = useState(undefined);
  const isCommittingRenameRef = useRef(false);

  const handleToggleAllFolders = useCallback(() => {
    setForceOpen((prev) => (prev === false ? true : false));
  }, []);
  const resizeStartRef = useRef({ pointerX: 0, width: DEFAULT_SIDEBAR_WIDTH });
  const searchKeyword = searchQuery ?? '';
  const isSearching = Boolean(searchKeyword.trim());
  const isMetaFiltering = hasActiveMetaFilters(metaFilters);
  const allowStructureActions = true;
  const showWorkspaceTree = surface === 'paper' || surface === 'folder';

  const handleStartRename = (nodeId, currentName) => {
    const node = findNodeById(workspace, nodeId);
    setRenamingNodeId(nodeId);
    setRenameDraft(getRenameDraftValue(node, currentName));
  };

  const handleCancelRename = () => {
    setRenamingNodeId(null);
    setRenameDraft('');
  };

  const handleCommitRename = async () => {
    if (!renamingNodeId) return;
    if (isCommittingRenameRef.current) return;
    isCommittingRenameRef.current = true;
    try {
      const trimmed = renameDraft.trim();
      if (!trimmed) {
        handleCancelRename();
        return;
      }
      const ok = await onRename(renamingNodeId, trimmed);
      if (ok) {
        handleCancelRename();
      }
    } finally {
      isCommittingRenameRef.current = false;
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

  // 视图优先级：搜索 > 元数据筛选 > 正常
  const filteredWorkspace = isSearching
    ? filterWorkspace(workspace, searchKeyword)
    : isMetaFiltering
      ? filterWorkspaceByMeta(workspace, metaFilters)
      : workspace;

  // 搜索或筛选时隐藏「最近」区，专注结果
  const recentFiles = isSearching || isMetaFiltering ? [] : collectRecentFiles(workspace, 5);
  const metaFilterCounts = collectMetaFilterCounts(workspace, {
    statusOptions: CREATION_STATUS_OPTIONS,
    platformOptions,
    nodeTypeOptions: KNOWLEDGE_NODE_TYPE_OPTIONS,
  });
  const statusLabelMap = new Map([
    ...CREATION_STATUS_OPTIONS.map((item) => [item.value, item.label]),
    [META_FILTER_STATUS_NONE, META_FILTER_STATUS_NONE_LABEL],
  ]);
  const platformLabelMap = new Map(platformOptions.map((item) => [item.value, item.label]));
  const nodeTypeLabelMap = new Map(KNOWLEDGE_NODE_TYPE_OPTIONS.map((item) => [item.value, item.label]));
  const hasMetaFilterSection = !isSearching
    && (metaFilterCounts.statuses.length > 0
      || metaFilterCounts.platforms.length > 0
      || metaFilterCounts.nodeTypes.length > 0
      || metaFilterCounts.tags.length > 0);
  const selectedNode = findNodeById(workspace, selectedId);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  useEffect(() => {
    if (!contextMenu) return;
    const handlePointerDown = (event) => {
      if (event.target.closest('.tree-node-context-menu')) return;
      closeContextMenu();
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [closeContextMenu, contextMenu]);

  const handleCreateFromSidebar = useCallback(async (kind, contextNodeId) => {
    const create = kind === 'folder' ? onAddFolder : onAddFile;
    const result = await create?.(contextNodeId);
    if (result?.ok && result.nodeId) {
      handleStartRename(result.nodeId, result.name);
      closeContextMenu();
    }
  }, [closeContextMenu, onAddFile, onAddFolder, workspace]);

  const handleTreeBackgroundContextMenu = useCallback((event) => {
    if (event.target.closest('.tree-node-row') || event.target.closest('.tree-node-context-menu')) {
      return;
    }
    event.preventDefault();
    const targetNodeId = resolveTargetFolderId(workspace, selectedId);
    setContextMenu({
      kind: 'workspace',
      nodeId: targetNodeId ?? workspace?.id ?? 'root',
      x: event.clientX,
      y: event.clientY,
    });
  }, [selectedId, workspace]);

  const handleTreeKeyDown = useCallback((event) => {
    if (renamingNodeId) return;
    if (!selectedNode || selectedNode.id === 'root') return;

    if (selectedNode.localProjectRoot) {
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        onRemoveLocalProject?.(selectedNode.id);
      }
      return;
    }

    if (event.key === 'F2') {
      event.preventDefault();
      handleStartRename(selectedNode.id, selectedNode.name);
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      onDelete?.(selectedNode.id);
    }
  }, [onDelete, onRemoveLocalProject, renamingNodeId, selectedNode, workspace]);

  const handleSearchChange = (value) => {
    onSearchQueryChange?.(value);
    if (value.trim()) setMetaFilters(EMPTY_META_FILTERS);
  };

  const toggleMetaFilter = (key, value) => {
    setMetaFilters((prev) => ({
      ...prev,
      [key]: resolveMetaFilterChange(value),
    }));
    onSearchQueryChange?.('');
  };

  const clearMetaFilters = () => {
    setMetaFilters(EMPTY_META_FILTERS);
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
      style={collapsed
        ? undefined
        : { width: `${showWorkspaceTree ? sidebarWidth : SIDEBAR_RAIL_WIDTH}px` }}
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
              className={`sidebar-rail-btn ${surface === 'daily' ? 'active' : ''}`}
              onClick={onOpenDaily}
              title="今日速记"
              aria-label="今日速记"
            >
              <CalendarDays size={18} strokeWidth={1.6} />
            </button>
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
              className={`sidebar-rail-btn ${surface === 'paper' || surface === 'folder' ? 'active' : ''}`}
              onClick={onOpenCurrentContent}
              title="当前内容"
              aria-label="当前内容"
            >
              <FileText size={18} strokeWidth={1.6} />
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
              className={`sidebar-rail-btn ${surface === 'graph' ? 'active' : ''}`}
              onClick={onOpenGraph}
              title="图谱视图"
              aria-label="图谱视图"
            >
              <Network size={18} strokeWidth={1.6} />
            </button>
            <button
              type="button"
              className={`sidebar-rail-btn ${surface === 'json-tool' ? 'active' : ''}`}
              onClick={onOpenJsonTool}
              title="JSON 解析器"
              aria-label="JSON 解析器"
            >
              <Braces size={18} strokeWidth={1.6} />
            </button>
          </nav>
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

          {onOpenSync && (
            <button
              type="button"
              className="sidebar-rail-btn"
              data-testid="open-sync"
              data-active={syncActive ? 'true' : 'false'}
              onClick={onOpenSync}
              title="渠道同步"
              aria-label="渠道同步"
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

          {showWorkspaceTree && !collapsed && (
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
      {!collapsed && showWorkspaceTree && (
        <div className="sidebar-main">
          {/* 搜索框 + 筛选 */}
          <div className="notebook-search-wrap">
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
              {hasMetaFilterSection && (
                <Popover
                  trigger="click"
                  placement="bottomRight"
                  arrow={false}
                  overlayClassName="notebook-filter-popover"
                  content={
                    <div
                      className="notebook-filter-dropdown"
                      data-testid="meta-filters-section"
                    >
                      {metaFilterCounts.statuses.length > 0 && (
                        <label className="notebook-filter-field">
                          <span className="notebook-filter-field-label">状态</span>
                          <Select
                            size="small"
                            className="notebook-filter-select"
                            popupClassName="notebook-filter-select-popup"
                            value={metaFilters.status ?? META_FILTER_ALL}
                            onChange={(value) => toggleMetaFilter('status', value)}
                            options={buildMetaFilterSelectOptions(metaFilterCounts.statuses)}
                            data-testid="status-filter-select"
                          />
                        </label>
                      )}
                      {metaFilterCounts.platforms.length > 0 && (
                        <label className="notebook-filter-field">
                          <span className="notebook-filter-field-label">平台</span>
                          <Select
                            size="small"
                            className="notebook-filter-select"
                            popupClassName="notebook-filter-select-popup"
                            value={metaFilters.platform ?? META_FILTER_ALL}
                            onChange={(value) => toggleMetaFilter('platform', value)}
                            options={buildMetaFilterSelectOptions(metaFilterCounts.platforms)}
                            data-testid="platform-filter-select"
                          />
                        </label>
                      )}
                      {metaFilterCounts.nodeTypes.length > 0 && (
                        <label className="notebook-filter-field">
                          <span className="notebook-filter-field-label">文档类型</span>
                          <Select
                            size="small"
                            className="notebook-filter-select"
                            popupClassName="notebook-filter-select-popup"
                            value={metaFilters.nodeType ?? META_FILTER_ALL}
                            onChange={(value) => toggleMetaFilter('nodeType', value)}
                            options={buildMetaFilterSelectOptions(metaFilterCounts.nodeTypes)}
                            data-testid="node-type-filter-select"
                          />
                        </label>
                      )}
                      {metaFilterCounts.tags.length > 0 && (
                        <label className="notebook-filter-field">
                          <span className="notebook-filter-field-label">标签</span>
                          <Select
                            size="small"
                            className="notebook-filter-select"
                            popupClassName="notebook-filter-select-popup"
                            value={metaFilters.tag ?? META_FILTER_ALL}
                            onChange={(value) => toggleMetaFilter('tag', value)}
                            options={buildMetaFilterSelectOptions(metaFilterCounts.tags)}
                            data-testid="tag-filter-select"
                          />
                        </label>
                      )}
                      {isMetaFiltering && (
                        <button
                          type="button"
                          className="notebook-filter-clear"
                          onClick={clearMetaFilters}
                          data-testid="meta-filters-clear"
                        >
                          清除筛选
                        </button>
                      )}
                    </div>
                  }
                >
                  <button
                    type="button"
                    className={`notebook-search-filter-btn${isMetaFiltering ? ' active' : ''}`}
                    title="按状态、平台、文档类型、标签筛选"
                    aria-label="筛选"
                    data-testid="meta-filters-trigger"
                  >
                    <SlidersHorizontal size={15} strokeWidth={1.5} />
                  </button>
                </Popover>
              )}
            </div>
          </div>

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
                  onClick={() => handleCreateFromSidebar('file')}
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
                  onClick={() => handleCreateFromSidebar('folder')}
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
          <div
            className="workspace-tree"
            tabIndex={0}
            onKeyDown={handleTreeKeyDown}
            onContextMenu={handleTreeBackgroundContextMenu}
          >
            {filteredWorkspace
              ? renderTree(filteredWorkspace, selectedId, onSelect, {
                  onAddFile: (nodeId) => handleCreateFromSidebar('file', nodeId),
                  onAddFolder: (nodeId) => handleCreateFromSidebar('folder', nodeId),
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
                (nodeId, x, y) => setContextMenu({ kind: 'node', nodeId, x, y }),
                closeContextMenu,
                forceOpen,
              )
              : (
                <div className="workspace-tree-empty" data-testid="search-empty">
                  {isSearching
                    ? `没有匹配「${searchKeyword.trim()}」的笔记`
                    : buildMetaFilterEmptyMessage(metaFilters, {
                        status: statusLabelMap,
                        platform: platformLabelMap,
                        nodeType: nodeTypeLabelMap,
                      })}
                </div>
              )}

            {contextMenu?.kind === 'workspace' && (
              <div
                className="tree-node-context-menu"
                style={{ left: contextMenu.x, top: contextMenu.y }}
                data-testid="tree-workspace-context-menu"
              >
                <button type="button" onClick={() => handleCreateFromSidebar('file', contextMenu.nodeId)}>
                  <File size={14} strokeWidth={1.5} /> 新建文件
                </button>
                <button type="button" onClick={() => handleCreateFromSidebar('folder', contextMenu.nodeId)}>
                  <Folder size={14} strokeWidth={1.5} /> 新建文件夹
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {!collapsed && showWorkspaceTree && (
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
