import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Popover, Select, message } from 'antd';
import { useEditorStore } from '../store/useEditorStore.js';
import logoUrl from '../assets/logo.png';
import DocActionMenuItems, { isEditableDocNode } from './DocActionMenuItems.jsx';
import MoveNodeModal from './MoveNodeModal.jsx';
import TreeSortMenu from './TreeSortMenu.jsx';
import { sortTreeNodes } from '../utils/treeSort.js';
import { buildLocalEntryPath } from '../utils/localEntryPath.js';
import {
  File,
  Folder,
  FolderOpen,
  FolderInput,
  Link2,
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
  Search,
  Pin,
  PinOff,
  RefreshCw,
  CalendarDays,
  SlidersHorizontal,
  TriangleAlert,
  ListTree,
  Clapperboard,
} from 'lucide-react';
import {
  filterWorkspace,
  collectRecentFiles,
  filterWorkspaceByMeta,
  collectMetaFilterCounts,
  findNodeById,
  getFolderChannelLabel,
  KNOWLEDGE_NODE_TYPE_OPTIONS,
  META_FILTER_STATUS_NONE,
  META_FILTER_STATUS_NONE_LABEL,
  isHiddenWorkspaceNode,
  collectVisibleFolderIds,
  SIDEBAR_FILE_KIND_ALL,
  SIDEBAR_FILE_KIND_OPTIONS,
} from '../store/workspaceUtils.js';
import { CREATION_STATUS_OPTIONS } from '../store/creationUtils.js';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import { PUBLISHING_PLATFORM_OPTIONS } from '../utils/publishingPlatforms.js';
import { getPlatform } from '../services/electronBridge.js';
import { openExternalUrl } from '../services/desktopShellBridge.js';

const GITHUB_URL = 'https://github.com/Canace22/md-render';
const DEFAULT_SIDEBAR_WIDTH = 320;
const SIDEBAR_RAIL_WIDTH = 48;
const MIN_SIDEBAR_WIDTH = 240;
const MAX_SIDEBAR_WIDTH = 520;
const SIDEBAR_KEYBOARD_RESIZE_STEP = 16;
const FILE_MANAGER_LABEL = getPlatform() === 'darwin'
  ? '访达'
  : '文件管理器';

const handleOpenGithub = (event) => {
  event.preventDefault();
  openExternalUrl(GITHUB_URL).catch((error) => {
    message.error(error?.message || '无法打开 GitHub');
  });
};

const copyAbsolutePath = async (absolutePath) => {
  try {
    await navigator.clipboard.writeText(absolutePath);
    message.success('已复制绝对路径');
  } catch {
    message.error('复制失败，请重试');
  }
};

const EMPTY_META_FILTERS = { status: null, platform: null, nodeType: null, tag: null };
const META_FILTER_ALL = '__all__';
const LOCAL_PROJECT_REAUTHORIZATION_REQUIRED = 'reauthorization-required';

const hasActiveMetaFilters = (filters) =>
  Boolean(filters?.status || filters?.platform || filters?.nodeType || filters?.tag || filters?.fileKind);

/** 搜索 / 状态等临时筛选才撑开目录；文档类型是常驻筛选，不能改展开记忆 */
const hasTransientRevealFilters = (filters) =>
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
  if (filters.fileKind) {
    parts.push(`类型「${labelMaps.fileKind.get(filters.fileKind) ?? filters.fileKind}」`);
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

const getRenameDraftValue = (node, fallbackName = '') => {
  const name = String(node?.name ?? fallbackName ?? '');
  if (node?.type !== 'file') return name;
  const next = name.replace(/(\.[^./\\]+)$/u, '');
  return next || name;
};

/**
 * 置顶节点优先，同组内按用户选的排序方式排（见 utils/treeSort.js）。
 * .agent 等隐藏元数据节点（点开头命名 / agentMetaFolder 标记）不进目录树。
 */
const sortTreeChildren = (childrenRaw, sortMode) => {
  const children = (Array.isArray(childrenRaw) ? childrenRaw : [])
    .filter((child) => !isHiddenWorkspaceNode(child));
  return sortTreeNodes(children, sortMode);
};

const TreeNode = ({
  node,
  selectedId,
  onSelect,
  depth,
  allowStructureActions,
  onRemoveLocalProject,
  onManualSyncLocalProject,
  onReauthorizeLocalProject,
  onAddFile,
  onAddOutline,
  onAddScript,
  onAddFolder,
  onRename,
  onDelete,
  onMoveNode,
  onStartMove,
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
  docActions,
  forceOpen,
  expandedFolderIdSet,
  onToggleFolder,
  sortMode,
}) => {
  const isFolder = node.type === 'folder';
  const isActive = node.id === selectedId;
  const isRoot = node.id === 'root';
  const isLocalProjectRoot = Boolean(node.localProjectRoot);
  const needsReauthorization = node.access === LOCAL_PROJECT_REAUTHORIZATION_REQUIRED;
  const canMutateNode = allowStructureActions && !node.readOnly;
  const channelLabel = getFolderChannelLabel(node);
  const showCreateActions = canMutateNode && isFolder;
  const showNodeActions = canMutateNode && !isRoot && !isLocalProjectRoot;
  // 置顶对挂载的本地项目根也开放（它们不能移动/重命名，但可以排到最前）
  const showPinAction = allowStructureActions && !isRoot;
  const showRemoveProject = isLocalProjectRoot && onRemoveLocalProject;
  const showReauthorizeProject = Boolean(
    isLocalProjectRoot && needsReauthorization && onReauthorizeLocalProject,
  );
  const showManualSyncProject = Boolean(
    !needsReauthorization && isFolder && node.projectRootPath && onManualSyncLocalProject,
  );
  const showRevealInFileManager = Boolean(
    !needsReauthorization && node.projectRootPath && onRevealLocalProjectEntry,
  );
  const absolutePath = node.readOnly || node.projectMountId ? '' : buildLocalEntryPath(node);
  const showCopyPath = Boolean(absolutePath);
  const showLocationActions = showRevealInFileManager || showCopyPath;
  const showDocActions = Boolean(docActions && isEditableDocNode(node));
  const folderOpen = Boolean(isFolder && (forceOpen || expandedFolderIdSet?.has(node.id)));
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
    if (!showCreateActions && !showPinAction && !showNodeActions && !showRemoveProject && !showReauthorizeProject && !showManualSyncProject && !showLocationActions && !showDocActions) return;
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

  // 拖拽源：普通节点和磁盘文件/文件夹都可拖，项目挂载根和工作区根不可拖
  const canDrag = canMutateNode && !isRoot && !isLocalProjectRoot;
  // 放置目标：文件夹（含项目根）可接收「移入」，文件可接收「同级排序」；是否合法由 onMoveNode 判定
  const canDrop = canMutateNode && (isFolder || !isRoot);
  const sharedProps = {
    ...(canDrag ? { draggable: true, onDragStart: handleDragStart } : {}),
    ...(canDrop ? {
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    } : {}),
  };

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
            if (isFolder && !forceOpen) onToggleFolder?.(node.id);
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
          {node.frontmatterError && (
            <span className="tree-node-warning-icon" title="元数据（frontmatter）格式有误，只按正文读取">
              <TriangleAlert size={11} strokeWidth={2} />
            </span>
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
          {showLocationActions && (
            <>
              {showRevealInFileManager && (
                <button type="button" onClick={runAndClose(() => onRevealLocalProjectEntry(node.id))}>
                  <FolderOpen size={14} strokeWidth={1.5} /> 在{FILE_MANAGER_LABEL}中查看
                </button>
              )}
              {showCopyPath && (
                <button type="button" onClick={runAndClose(() => copyAbsolutePath(absolutePath))}>
                  <Link2 size={14} strokeWidth={1.5} /> 复制绝对路径
                </button>
              )}
              {(showCreateActions || showPinAction || showNodeActions || showManualSyncProject || showRemoveProject) && <div className="tree-context-menu-divider" />}
            </>
          )}
          {showCreateActions && (
            <>
              <button type="button" onClick={runAndClose(() => onAddFile(node.id))}>
                <File size={14} strokeWidth={1.5} /> 新建文件
              </button>
              <button type="button" onClick={runAndClose(() => onAddOutline(node.id))}>
                <ListTree size={14} strokeWidth={1.5} /> 新建大纲
              </button>
              <button type="button" onClick={runAndClose(() => onAddScript(node.id))}>
                <Clapperboard size={14} strokeWidth={1.5} /> 新建剧本
              </button>
              <button type="button" onClick={runAndClose(() => onAddFolder(node.id))}>
                <Folder size={14} strokeWidth={1.5} /> 新建文件夹
              </button>
              <div className="tree-context-menu-divider" />
            </>
          )}
          {showPinAction && (
            <>
              <button type="button" onClick={runAndClose(() => onPinNode?.(node.id))}>
                {node.pinned
                  ? <><PinOff size={14} strokeWidth={1.5} /> 取消置顶</>
                  : <><Pin size={14} strokeWidth={1.5} /> 置顶</>}
              </button>
              {(showNodeActions || showManualSyncProject || showReauthorizeProject || showRemoveProject) && <div className="tree-context-menu-divider" />}
            </>
          )}
          {showNodeActions && (
            <>
              <button type="button" onClick={runAndClose(() => onStartMove?.(node.id))}>
                <FolderInput size={14} strokeWidth={1.5} /> 移动到…
              </button>
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
          {showReauthorizeProject && (
            <>
              <button type="button" onClick={runAndClose(() => onReauthorizeLocalProject(node.id, 'read-only'))}>
                <FolderInput size={14} strokeWidth={1.5} /> 重新授权目录（只读）
              </button>
              <button type="button" onClick={runAndClose(() => onReauthorizeLocalProject(node.id, 'read-write'))}>
                <FolderInput size={14} strokeWidth={1.5} /> 重新授权目录（可编辑）
              </button>
              {showRemoveProject && <div className="tree-context-menu-divider" />}
            </>
          )}
          {showRemoveProject && (
            <button type="button" className="danger" onClick={runAndClose(() => onRemoveLocalProject(node.id))}>
              <Trash2 size={14} strokeWidth={1.5} /> 移除项目
            </button>
          )}
          <DocActionMenuItems node={node} docActions={docActions} runAndClose={runAndClose} />
        </div>
      )}

      {isFolder && folderOpen && Array.isArray(node.children) && node.children.length > 0 && (
        <div className="tree-node-children">
          {sortTreeChildren(node.children, sortMode).map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              depth={depth + 1}
              allowStructureActions={allowStructureActions}
              onRemoveLocalProject={onRemoveLocalProject}
              onManualSyncLocalProject={onManualSyncLocalProject}
              onReauthorizeLocalProject={onReauthorizeLocalProject}
              onAddFile={onAddFile}
              onAddOutline={onAddOutline}
              onAddScript={onAddScript}
              onAddFolder={onAddFolder}
              onRename={onRename}
              onDelete={onDelete}
              onMoveNode={onMoveNode}
              onStartMove={onStartMove}
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
              docActions={docActions}
              forceOpen={forceOpen}
              expandedFolderIdSet={expandedFolderIdSet}
              onToggleFolder={onToggleFolder}
              sortMode={sortMode}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/** 隐藏工作区根节点，直接渲染一级目录和文档 */
const renderTree = (
  workspace,
  selectedId,
  onSelect,
  handlers,
  contextMenu,
  onContextMenu,
  onCloseContextMenu,
  forceOpen,
  expandedFolderIdSet,
  onToggleFolder,
) => {
  const children = workspace?.type === 'folder' && Array.isArray(workspace.children)
    ? workspace.children
    : [];
  const sorted = sortTreeChildren(children, handlers.sortMode);
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
      expandedFolderIdSet={expandedFolderIdSet}
      onToggleFolder={onToggleFolder}
    />
  ));
};

const WorkspaceSidebar = ({
  workspace,
  selectedId,
  onSelect,
  onRemoveLocalProject,
  onManualSyncLocalProject,
  onReauthorizeLocalProject,
  onAddFile,
  onAddOutline,
  onAddScript,
  onAddFolder,
  onRename,
  onDelete,
  onMoveNode,
  onPinNode,
  onRevealLocalProjectEntry,
  docActions,
  collapsed,
  onToggleCollapse,
  surface,
  onOpenDaily,
  onOpenSearch,
  onOpenGraph,
  onOpenCurrentContent,
  searchQuery,
  onSearchQueryChange,
  onOpenSettings,
  settingsActive,
  platformOptions = PUBLISHING_PLATFORM_OPTIONS,
}) => {
  const [metaFilters, setMetaFilters] = useState(EMPTY_META_FILTERS);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH);
  const [resizing, setResizing] = useState(false);
  const [renamingNodeId, setRenamingNodeId] = useState(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [contextMenu, setContextMenu] = useState(null); // { kind, nodeId, x, y }
  const [movingNodeId, setMovingNodeId] = useState(null);
  const isCommittingRenameRef = useRef(false);
  const sidebarFileKind = useEditorStore((s) => s.sidebarFileKind);
  const setSidebarFileKind = useEditorStore((s) => s.setSidebarFileKind);
  const sidebarSortMode = useEditorStore((s) => s.sidebarSortMode);
  const setSidebarSortMode = useEditorStore((s) => s.setSidebarSortMode);
  const expandedFolderIds = useEditorStore((s) => s.expandedFolderIds);
  const setExpandedFolderIds = useEditorStore((s) => s.setExpandedFolderIds);
  const toggleFolderExpanded = useEditorStore((s) => s.toggleFolderExpanded);
  const fileKindFilter = sidebarFileKind === SIDEBAR_FILE_KIND_ALL ? null : sidebarFileKind;
  const expandedFolderIdSet = useMemo(
    () => new Set(Array.isArray(expandedFolderIds) ? expandedFolderIds : []),
    [expandedFolderIds],
  );
  const resizeStartRef = useRef({ pointerX: 0, width: DEFAULT_SIDEBAR_WIDTH });
  const searchKeyword = searchQuery ?? '';
  const isSearching = Boolean(searchKeyword.trim());
  const effectiveMetaFilters = { ...metaFilters, fileKind: fileKindFilter };
  const isMetaFiltering = hasActiveMetaFilters(effectiveMetaFilters);
  const allowStructureActions = true;
  // 图谱是文件树的另一种看法，右侧换成图谱时左边的树要留着，
  // 否则进了图谱就找不到回去的入口，也看不出自己还在文档这条腿上。
  const showWorkspaceTree = surface === 'paper' || surface === 'folder' || surface === 'graph';

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

  // 搜索优先于状态/平台/标签；文档类型（图片/文档/视频）始终叠加在结果上
  const baseWorkspace = isSearching
    ? filterWorkspace(workspace, searchKeyword)
    : hasActiveMetaFilters(metaFilters)
      ? filterWorkspaceByMeta(workspace, metaFilters)
      : workspace;
  const filteredWorkspace = fileKindFilter
    ? filterWorkspaceByMeta(baseWorkspace, { fileKind: fileKindFilter })
    : baseWorkspace;
  const visibleFolderIds = useMemo(
    () => collectVisibleFolderIds(filteredWorkspace),
    [filteredWorkspace],
  );
  const allFoldersExpanded = visibleFolderIds.length > 0
    && visibleFolderIds.every((id) => expandedFolderIdSet.has(id));
  const handleToggleAllFolders = useCallback(() => {
    setExpandedFolderIds(allFoldersExpanded ? [] : visibleFolderIds);
  }, [allFoldersExpanded, visibleFolderIds, setExpandedFolderIds]);
  const forceOpenFolders = isSearching || hasTransientRevealFilters(metaFilters);

  // 搜索或筛选时隐藏「最近」区，专注结果
  const recentFiles = isSearching || isMetaFiltering ? [] : collectRecentFiles(workspace, 5);
  const metaFilterCounts = collectMetaFilterCounts(workspace, {
    statusOptions: CREATION_STATUS_OPTIONS,
    platformOptions,
    nodeTypeOptions: KNOWLEDGE_NODE_TYPE_OPTIONS,
    fileKindOptions: SIDEBAR_FILE_KIND_OPTIONS,
  });
  const statusLabelMap = new Map([
    ...CREATION_STATUS_OPTIONS.map((item) => [item.value, item.label]),
    [META_FILTER_STATUS_NONE, META_FILTER_STATUS_NONE_LABEL],
  ]);
  const platformLabelMap = new Map(platformOptions.map((item) => [item.value, item.label]));
  const nodeTypeLabelMap = new Map(KNOWLEDGE_NODE_TYPE_OPTIONS.map((item) => [item.value, item.label]));
  const fileKindLabelMap = new Map(SIDEBAR_FILE_KIND_OPTIONS.map((item) => [item.value, item.label]));
  const hasMetaFilterSection = !isSearching
    && (metaFilterCounts.statuses.length > 0
      || metaFilterCounts.platforms.length > 0
      || metaFilterCounts.fileKinds.length > 0
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
    const targetNode = findNodeById(workspace, contextNodeId ?? selectedId);
    if (targetNode?.readOnly) return;
    const creators = { folder: onAddFolder, outline: onAddOutline, script: onAddScript, file: onAddFile };
    const create = creators[kind] ?? onAddFile;
    const result = await create?.(contextNodeId);
    if (result?.ok && result.nodeId) {
      handleStartRename(result.nodeId, result.name);
      closeContextMenu();
    }
  }, [closeContextMenu, onAddFile, onAddFolder, onAddOutline, onAddScript, selectedId, workspace]);

  const handleTreeBackgroundContextMenu = useCallback((event) => {
    if (event.target.closest('.tree-node-row') || event.target.closest('.tree-node-context-menu')) {
      return;
    }
    event.preventDefault();
    // 空白处代表根目录（根节点本身不渲染）：新建落到根目录，而不是当前选中项所在的文件夹
    setContextMenu({
      kind: 'workspace',
      nodeId: workspace?.id ?? 'root',
      x: event.clientX,
      y: event.clientY,
    });
  }, [workspace]);

  // 拖到目录树空白处 = 移到根目录（根节点本身不渲染，没有别的落点）
  const handleTreeBackgroundDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const handleTreeBackgroundDrop = useCallback((event) => {
    event.preventDefault();
    const fromId = event.dataTransfer.getData('text/plain');
    if (fromId && workspace?.id) onMoveNode?.(fromId, workspace.id);
  }, [onMoveNode, workspace]);

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

    if (selectedNode.readOnly) return;

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
    const next = resolveMetaFilterChange(value);
    if (key === 'fileKind') {
      setSidebarFileKind(next ?? SIDEBAR_FILE_KIND_ALL);
      onSearchQueryChange?.('');
      return;
    }
    setMetaFilters((prev) => ({
      ...prev,
      [key]: next,
    }));
    onSearchQueryChange?.('');
  };

  const clearMetaFilters = () => {
    setMetaFilters(EMPTY_META_FILTERS);
    setSidebarFileKind(SIDEBAR_FILE_KIND_ALL);
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

          {/* 视图导航：只留两条腿 —— 每天开合一次的 Daily，进去待很久的文档。
              创作首页 / 画布 / 图谱 / JSON 已下沉，图谱移到文件树，其余走 Cmd+K 命令面板。 */}
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
              className={`sidebar-rail-btn ${showWorkspaceTree ? 'active' : ''}`}
              onClick={onOpenCurrentContent}
              title="文档"
              aria-label="文档"
            >
              <FileText size={18} strokeWidth={1.6} />
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

          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleOpenGithub}
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
                      {metaFilterCounts.fileKinds.length > 0 && (
                        <label className="notebook-filter-field">
                          <span className="notebook-filter-field-label">文档类型</span>
                          <Select
                            size="small"
                            className="notebook-filter-select"
                            popupClassName="notebook-filter-select-popup"
                            value={fileKindFilter ?? META_FILTER_ALL}
                            onChange={(value) => toggleMetaFilter('fileKind', value)}
                            options={buildMetaFilterSelectOptions(metaFilterCounts.fileKinds)}
                            data-testid="file-kind-filter-select"
                          />
                        </label>
                      )}
                      {metaFilterCounts.nodeTypes.some((item) => item.value !== 'document') && (
                        <label className="notebook-filter-field">
                          <span className="notebook-filter-field-label">知识类型</span>
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
              {/* 图谱是"这些文档之间的关系"，属于文件树而不是和文档平级的空间 */}
              <button
                type="button"
                className={`sidebar-add-icon${surface === 'graph' ? ' is-active' : ''}`}
                onClick={onOpenGraph}
                title="关系图谱"
                aria-label="关系图谱"
              >
                <Network size={16} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="sidebar-add-icon"
                onClick={handleToggleAllFolders}
                title={allFoldersExpanded ? '收起全部文件夹' : '展开全部文件夹'}
                aria-label={allFoldersExpanded ? '收起全部文件夹' : '展开全部文件夹'}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
                  <rect x="2" y="7.25" width="12" height="1.5" rx="0.75" fill="currentColor"/>
                </svg>
              </button>
              <TreeSortMenu value={sidebarSortMode} onChange={setSidebarSortMode} />
              {allowStructureActions && !selectedNode?.readOnly && (
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
              {allowStructureActions && !selectedNode?.readOnly && (
                <button
                  type="button"
                  className="sidebar-add-icon"
                  onClick={() => handleCreateFromSidebar('outline')}
                  title="新建大纲"
                  aria-label="新建大纲"
                >
                  <ListTree size={18} strokeWidth={1.5} />
                </button>
              )}
              {allowStructureActions && !selectedNode?.readOnly && (
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
            </div>
          </div>

          {/* 文件树 */}
          <div
            className="workspace-tree"
            tabIndex={0}
            onKeyDown={handleTreeKeyDown}
            onContextMenu={handleTreeBackgroundContextMenu}
            onDragOver={allowStructureActions ? handleTreeBackgroundDragOver : undefined}
            onDrop={allowStructureActions ? handleTreeBackgroundDrop : undefined}
          >
            {filteredWorkspace
              ? renderTree(filteredWorkspace, selectedId, onSelect, {
                  onAddFile: (nodeId) => handleCreateFromSidebar('file', nodeId),
                  onAddOutline: (nodeId) => handleCreateFromSidebar('outline', nodeId),
                  onAddScript: (nodeId) => handleCreateFromSidebar('script', nodeId),
                  onAddFolder: (nodeId) => handleCreateFromSidebar('folder', nodeId),
                  onRename,
                  onDelete,
                  onMoveNode,
                  onStartMove: setMovingNodeId,
                  onPinNode,
                  onRevealLocalProjectEntry,
                  docActions,
                  allowStructureActions,
                  onRemoveLocalProject,
                  onManualSyncLocalProject,
                  onReauthorizeLocalProject,
                  sortMode: sidebarSortMode,
                  ...renameHandlers,
                },
                contextMenu,
                (nodeId, x, y) => setContextMenu({ kind: 'node', nodeId, x, y }),
                closeContextMenu,
                forceOpenFolders,
                expandedFolderIdSet,
                toggleFolderExpanded,
              )
              : (
                <div className="workspace-tree-empty" data-testid="search-empty">
                  {isSearching
                    ? `没有匹配「${searchKeyword.trim()}」的笔记`
                    : buildMetaFilterEmptyMessage(effectiveMetaFilters, {
                        status: statusLabelMap,
                        platform: platformLabelMap,
                        nodeType: nodeTypeLabelMap,
                        fileKind: fileKindLabelMap,
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
                <button type="button" onClick={() => handleCreateFromSidebar('outline', contextMenu.nodeId)}>
                  <ListTree size={14} strokeWidth={1.5} /> 新建大纲
                </button>
                <button type="button" onClick={() => handleCreateFromSidebar('script', contextMenu.nodeId)}>
                  <Clapperboard size={14} strokeWidth={1.5} /> 新建剧本
                </button>
                <button type="button" onClick={() => handleCreateFromSidebar('folder', contextMenu.nodeId)}>
                  <Folder size={14} strokeWidth={1.5} /> 新建文件夹
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <MoveNodeModal
        workspace={workspace}
        nodeId={movingNodeId}
        onMove={onMoveNode}
        onClose={() => setMovingNodeId(null)}
      />

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
