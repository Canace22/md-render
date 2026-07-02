import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteEditor, createCodeBlockSpec } from '@blocknote/core';
import { buildSchema } from '@narrative/blocknote-core';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import { Bot } from 'lucide-react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import DocHeader from './DocHeader.jsx';
import EditorQuickToolbar from './EditorQuickToolbar.jsx';
import FolderFileList from './FolderFileList.jsx';
import CreationDashboard from './CreationDashboard.jsx';
import CreationBoardPanel from './CreationBoardPanel.jsx';
import CanvasSurface from './CanvasSurface.jsx';
import DailyNotebook from './DailyNotebook.jsx';
import KnowledgeBasePanel from './KnowledgeBasePanel.jsx';
import PublishingQueuePanel from './PublishingQueuePanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import SyncPanel from './SyncPanel.jsx';
import WechatPreviewModal from './WechatPreviewModal.jsx';
import BookmarkImportModal from './BookmarkImportModal.jsx';
import ImageLightbox from './ImageLightbox.jsx';
import BookmarkCard from './BookmarkCard.jsx';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import FilePreviewPanel from './FilePreviewPanel.jsx';
import TocPanel from './TocPanel.jsx';
import AgentPanel from './AgentPanel.jsx';
import DiffOverlay from './DiffOverlay.jsx';
import TabBar from './TabBar.jsx';
import ThemeToggleButton from './ThemeToggleButton.jsx';
import Breadcrumb from './Breadcrumb.jsx';
import StatusBar from './StatusBar.jsx';
import UpdateNotifier from './UpdateNotifier.jsx';
import {
  createEmptyDocument,
  extractCodeBlockFromClipboardHtml,
  getBlockTextContent,
  getMarkdownCodeFenceLanguage,
  isBlockNoteContent,
  parseBlockNoteContent,
  serializeBlockNoteContent,
  looksLikeCodeBlockClipboardHtml,
  looksLikeMarkdownCodeFenceClipboardText,
  looksLikeMarkdownClipboardText,
  looksLikePlainTextHtml,
  normalizeMarkdown,
} from '../utils/markdownUtils';
import { applyThemeToBody } from '../utils/themeUtils';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import { copyToWeChat, htmlToPlainText } from '../utils/wechatCopy';
import { getTemplateById } from '../utils/wechatTemplates';
import { blocksToMarkdown, markdownToNotionPayload } from '../utils/notionConverter.js';
import {
  cleanPageId,
  extractPageTitle,
  fetchBlocks,
  isNotionAvailable,
  queryDatabase,
  updatePageBlocks,
} from '../utils/notionService.js';
import { incrementalPull } from '../utils/notionIncrementalSync.js';
import { batchPull, batchPush } from '../utils/notionBatchSync.js';
import { MarkdownParser, MarkdownRenderer } from '../core';
import { useMacTitlebarInset } from '../hooks/useMacTitlebarInset.js';
import { useTitleEditing } from '../hooks/useTitleEditing.js';
import { useWorkspaceActions } from '../hooks/useWorkspaceActions.js';
import {
  buildActiveTopicSummary,
  collectPendingMaterials,
  collectPendingPublishDrafts,
  collectRecentDrafts,
  CREATION_STATUS_OPTIONS,
  getDocumentStatus,
} from '../store/creationUtils.js';
import { useEditorStore, useSelectedFile } from '../store/useEditorStore.js';
import {
  buildUniqueName,
  buildUniqueNameInFolder,
  buildUniqueRenameNameInFolder,
  collectFiles,
  collectLocalProjectRootPaths,
  createLocalProjectFileNode,
  createLocalProjectFolderNode,
  findNodeIdByRelativePath,
  findNodeById,
  findParentId,
  getFolderDirectChildren,
  replaceRelativePathBasename,
  ensureRenameFileName,
  resolveLocalProjectCreateTarget,
} from '../store/workspaceUtils.js';
import { downloadMarkdownFile, ensureMarkdownDownloadName } from '../utils/markdownIO.js';
import { convertToMarkdown, IMPORT_ACCEPT, needsConversion } from '../utils/fileConverters.js';
import {
  buildBookmarkClipMarkdown,
  buildBookmarkClipDocument,
  buildFallbackBookmarkClip,
  sanitizeBookmarkFileStem,
} from '../utils/bookmarkClipper.js';
import { extractCanvasBookmarkCandidate } from '../utils/canvasBookmark.js';
import {
  buildPublishingPlatformLabelMap,
  getDefaultTargetPlatforms,
} from '../utils/publishingPlatforms.js';
import { getTodayDateKey } from '../utils/dailyWorkspace.js';
import { exportDocument } from '../utils/exportService.js';
import {
  fetchCloudWorkspaceSnapshot,
  uploadCloudWorkspaceSnapshot,
} from '../utils/cloudSyncService.js';
import {
  createLocalProjectFileOnDisk,
  createLocalProjectFolderOnDisk,
  deleteLocalProjectEntryOnDisk,
  ensureMdRenderWorkspace,
  fetchBookmarkPageSnapshot,
  isLocalProjectSupported,
  openLocalProject,
  readLocalProjectDisk,
  readLocalProjectFileContent,
  revealLocalProjectEntry,
  renameLocalProjectEntryOnDisk,
  saveLocalProjectFile,
  saveLocalProjectMetadata,
} from '../utils/localProjectBridge.js';
import '../styles/styles.css';

const CODE_BLOCK_LANGUAGES = {
  text: { name: 'Plain Text', aliases: ['txt', 'plaintext'] },
  javascript: { name: 'JavaScript', aliases: ['js'] },
  typescript: { name: 'TypeScript', aliases: ['ts'] },
  jsx: { name: 'JSX' },
  tsx: { name: 'TSX' },
  json: { name: 'JSON' },
  html: { name: 'HTML' },
  css: { name: 'CSS' },
  markdown: { name: 'Markdown', aliases: ['md'] },
  bash: { name: 'Bash', aliases: ['sh', 'shell', 'zsh'] },
  yaml: { name: 'YAML', aliases: ['yml'] },
  sql: { name: 'SQL' },
  python: { name: 'Python', aliases: ['py'] },
  java: { name: 'Java' },
  go: { name: 'Go' },
  rust: { name: 'Rust', aliases: ['rs'] },
};

const createCodeBlockHighlighter = async () => {
  const { createHighlighter } = await import('shiki');

  return createHighlighter({
    themes: ['github-dark'],
    langs: Object.keys(CODE_BLOCK_LANGUAGES),
  });
};

const LOCAL_BOOKMARK_FOLDER_RELATIVE_PATH = 'Projects/书签';

// 用 blocknote-core 的 buildSchema 统一组装；本应用是 Markdown 编辑器，
// 必须保留 heading / quote（buildSchema 默认会排除它们），故传 excludeDefaultBlocks: []。
// buildSchema 内部已合并 defaultBlockSpecs，这里只需传自定义块。
const EDITOR_SCHEMA = buildSchema({
  blockSpecs: {
    codeBlock: createCodeBlockSpec({
      supportedLanguages: CODE_BLOCK_LANGUAGES,
      defaultLanguage: 'text',
      createHighlighter: createCodeBlockHighlighter,
    }),
  },
  excludeDefaultBlocks: [],
});

// 读取 File 为 data URL（含 data:image/png;base64, 前缀）
const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });

// 从 data URL 拆出 mime 子类型与纯 base64，如 'image/png;base64' → { mimeSubtype: 'png', base64 }
const parseDataUrl = (dataUrl = '') => {
  const match = /^data:image\/([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('不支持的图片数据');
  return { mimeSubtype: match[1], base64: match[2] };
};

// 从剪贴板里取第一张图片文件（截图/复制图片），没有则返回 null
const pickClipboardImageFile = (clipboardData) => {
  const items = clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && item.type?.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
};

// 把一张图片文件存盘并在光标处插入图片块；失败时提示，不抛错
const insertImageFromFile = async (editor, file, uploadFile) => {
  try {
    const url = await uploadFile(file);
    const currentBlock = editor.getTextCursorPosition()?.block;
    const imageBlock = { type: 'image', props: { url } };
    if (!currentBlock) {
      editor.insertBlocks([imageBlock], editor.document[0], 'after');
      return;
    }
    const isEmptyParagraph =
      currentBlock.type === 'paragraph' &&
      !currentBlock.content?.length &&
      !(currentBlock.children?.length > 0);
    if (isEmptyParagraph) {
      editor.updateBlock(currentBlock, imageBlock);
    } else {
      editor.insertBlocks([imageBlock], currentBlock, 'after');
    }
  } catch (error) {
    console.error('[asset] 粘贴图片失败:', error);
    message.error('图片粘贴失败');
  }
};

const BLOCKNOTE_OPTIONS = {
  dictionary: zh,
  defaultStyles: false,
  setIdAttribute: true,
  schema: EDITOR_SCHEMA,
  tables: {
    headers: true,
    splitCells: true,
    cellBackgroundColor: true,
    cellTextColor: true,
  },
};

const formatBatchFailures = (failed, fallbackName = '项目') => {
  const items = failed ?? [];
  if (!items.length) return '';
  const preview = items
    .slice(0, 3)
    .map((item) => item.fileName || item.title || fallbackName)
    .join('、');
  const suffix = items.length > 3 ? ' 等' : '';
  return `${items.length} 项失败：${preview}${suffix}`;
};

const hasLocalProjectNode = (node) => {
  if (!node) return false;
  if (node.localProjectRoot) return true;
  if (!Array.isArray(node.children)) return false;
  return node.children.some((child) => hasLocalProjectNode(child));
};

const STATUS_LABELS = new Map(CREATION_STATUS_OPTIONS.map((item) => [item.value, item.label]));
const BLANK_CANVAS_CARD_KIND = 'blank';
const BLANK_CANVAS_CARD_NODE_TYPE = 'blank-card';
const BLANK_CANVAS_CARD_TITLE = '空白卡片';
const BLANK_CANVAS_CARD_TYPE_LABEL = '卡片';
const BLANK_CANVAS_CARD_META = '自由记录';

const truncateInlineText = (value, maxLength = 96) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const getStatusLabel = (status) => STATUS_LABELS.get(status) ?? status ?? '待整理';
const getPrimaryPlatformLabel = (platforms = [], platformLabels = new Map()) => {
  const primary = Array.isArray(platforms) ? platforms[0] : '';
  return platformLabels.get(primary) ?? primary ?? '待选渠道';
};
const getParsedWordCount = (content = '') => {
  return String(content ?? '')
    .replace(/\s+/g, '')
    .trim()
    .length;
};

const getCanvasCardSummary = (file) => {
  return file?.summary || truncateInlineText(file?.content, 120) || '先补一句摘要，画布里扫节点会更快。';
};

const getCanvasCardTypeLabel = (file) => {
  const nodeType = String(file?.nodeType ?? '').trim();
  if (nodeType) return nodeType;
  const status = getDocumentStatus(file);
  return status || 'document';
};

const isBlankCanvasNode = (node) => {
  return String(node?.cardKind ?? '').trim() === BLANK_CANVAS_CARD_KIND
    || String(node?.nodeType ?? '').trim() === BLANK_CANVAS_CARD_NODE_TYPE;
};

const buildBlankCanvasItem = (node) => {
  const id = String(node?.sourceId ?? node?.id ?? '').trim();
  if (!id) return null;
  const content = String(node?.content ?? node?.summary ?? '');
  return {
    id,
    sourceId: id,
    title: String(node?.title ?? '').trim() || BLANK_CANVAS_CARD_TITLE,
    summary: content,
    content,
    nodeType: BLANK_CANVAS_CARD_NODE_TYPE,
    typeLabel: BLANK_CANVAS_CARD_TYPE_LABEL,
    metaLine: BLANK_CANVAS_CARD_META,
    cardKind: BLANK_CANVAS_CARD_KIND,
    position: node.position,
  };
};

const getSelectedEditorText = () => {
  if (typeof window === 'undefined' || typeof document === 'undefined') return '';
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return '';

  const text = String(selection.toString() ?? '').trim();
  if (!text) return '';

  const editorRoot = document.querySelector('.blocknote-editor');
  if (!editorRoot) return '';

  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer?.nodeType === Node.TEXT_NODE
    ? range.commonAncestorContainer.parentElement
    : range.commonAncestorContainer;

  if (!container || !editorRoot.contains(container)) return '';
  return text;
};

function MarkdownEditor() {
  const macWindowed = useMacTitlebarInset();
  const {
    workspace,
    selectedId,
    markdown,
    sidebarCollapsed,
    tocCollapsed,
    theme,
    copyStyle,
    storageMode,
    surface,
    dailyWorkspace,
    publishingPlatforms,
    notionToken,
    notionFilePages,
    notionDatabaseId,
    notionProxyBase,
    cloudSyncBaseUrl,
    cloudWorkspaceId,
    cloudLastSyncedRevision,
    cloudLastSyncedAt,
    setTheme,
    setCopyStyle,
    setPublishingPlatforms,
    setSurface,
    setDailyCurrentDate,
    addDailyItem,
    toggleDailyTaskDone,
    deleteDailyItem,
    updateDailyItem,
    updateDailyItemPriority,
    updateDailyItemCategory,
    moveDailyItem,
    moveDailyItems,
    moveDailyTaskToTodo,
    addTodoItem,
    promoteTodoToDaily,
    removeTodoItem,
    updateTodoItemCategory,
    hydrateDailyWorkspaceFromDisk,
    setWorkspaceCanvas,
    setNotionToken,
    setNotionDatabaseId,
    setNotionProxyBase,
    setFileNotionPageId,
    setCloudSyncBaseUrl,
    setCloudWorkspaceId,
    buildCloudSyncPayload,
    markCloudSyncSuccess,
    applyCloudWorkspacePayload,
    setFileTags,
    setFileKnowledgeMeta,
    mergeNotionFilePages,
    toggleSidebarCollapsed,
    toggleTocCollapsed,
    updateSelectedFileContent,
    selectNode,
    selectNodeKeepSurface,
    openLocalProjectWorkspace,
    addFile,
    addFolder,
    moveNode,
    pinNode,
    applyRename,
    deleteNode,
    replaceDiskBackedNode,
    removeDiskBackedNode,
    importWorkspace,
    importBookmarks,
    insertWorkspaceNode,
    insertLocalProjectNode,
    hydrateProjectsWorkspace,
    syncMarkdownFromSelectedFile,
    syncSelectedIdFromWorkspace,
    setDiskSavePending,
    diskSaveCancelSeq,
    diskSaveCancelFileIds,
    openTabs,
    editorMode,
    openTab,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    closeTabsToTheRight,
    updateTabTitle,
    setAiQuotedSelection,
  } = useEditorStore();
  const publishingPlatformLabelMap = useMemo(
    () => buildPublishingPlatformLabelMap(publishingPlatforms),
    [publishingPlatforms],
  );

  const selectedFile = useSelectedFile();
  const selectedReadOnly = Boolean(selectedFile?.readOnly);
  const selectedNode = useMemo(() => findNodeById(workspace, selectedId), [workspace, selectedId]);
  const selectedFolder = selectedNode?.type === 'folder' ? selectedNode : null;
  const selectedProjectRootPath = selectedFile?.projectRootPath ?? '';
  const manualSyncProjectRootPath = selectedFolder?.projectRootPath ?? '';
  const selectedInLocalProject = Boolean(selectedNode?.projectRootPath);
  const selectedUsesBookmarkCard = selectedFile?.nodeType === 'bookmark'
    && !String(selectedFile?.content ?? '').trim();
  const hasLocalProjectWorkspace = useMemo(() => hasLocalProjectNode(workspace), [workspace]);
  const folderChildren = useMemo(
    () => (selectedFolder ? getFolderDirectChildren(selectedFolder) : []),
    [selectedFolder],
  );
  const allFiles = useMemo(() => collectFiles(workspace), [workspace]);
  const displayTabs = useMemo(() => {
    return openTabs.map((tab) => {
      const node = findNodeById(workspace, tab.id);
      return {
        ...tab,
        nodeType: node?.type === 'file' ? node.nodeType : undefined,
        url: node?.type === 'file' ? String(node.url ?? '').trim() : '',
      };
    });
  }, [openTabs, workspace]);
  const recentDrafts = useMemo(() => {
    return collectRecentDrafts(allFiles, 4).map((file) => ({
      id: file.id,
      title: stripFileExtension(file.name),
      summary: file.summary,
      excerpt: truncateInlineText(file.content, 120),
      stage: getStatusLabel(getDocumentStatus(file) ?? 'drafting'),
      wordCount: String(file.content ?? '').trim().length,
      updatedAt: file.updatedAt,
    }));
  }, [allFiles]);
  const activeTopicSummary = useMemo(() => buildActiveTopicSummary(allFiles, 4), [allFiles]);
  const topicQueue = useMemo(() => {
    return activeTopicSummary.items.map((item) => ({
      id: item.id,
      title: stripFileExtension(item.name),
      summary: item.summary,
      angle: item.summary,
      status: getStatusLabel(item.status),
      dueAt: item.updatedAt,
      updatedAt: item.updatedAt,
      priority: item.status === 'idea' ? 'high' : 'medium',
      priorityLabel: item.status === 'idea' ? '待拆解' : '推进中',
    }));
  }, [activeTopicSummary]);
  const materialInbox = useMemo(() => {
    return collectPendingMaterials(allFiles, 4).map((file) => ({
      id: file.id,
      title: stripFileExtension(file.name),
      summary: file.summary,
      note: truncateInlineText(file.content, 110),
      source: file.nodeType === 'bookmark' ? '书签' : '素材',
      tags: file.tags ?? [],
      capturedAt: file.updatedAt ?? file.createdAt,
    }));
  }, [allFiles]);
  const publishingQueueItems = useMemo(() => {
    return collectPendingPublishDrafts(allFiles, allFiles.length).map((file) => {
      const resolvedStatus = getDocumentStatus(file) ?? 'ready';
      return {
        id: file.id,
        title: stripFileExtension(file.name),
        summary: file.summary,
        excerpt: truncateInlineText(file.content, 120),
        scheduledPublishAt: file.scheduledPublishAt,
        publishAt: file.scheduledPublishAt,
        targetPlatforms: file.targetPlatforms ?? [],
        draftStatus: resolvedStatus,
        draftStatusLabel: getStatusLabel(resolvedStatus),
        wordCount: getParsedWordCount(file.content),
        progress: file.scheduledPublishAt ? 80 : 48,
        checklist: [
          { label: '标题确认', done: Boolean(file.summary) },
          { label: '渠道确认', done: Boolean(file.targetPlatforms?.length) },
          { label: '发布时间确认', done: Boolean(file.scheduledPublishAt) },
        ],
      };
    });
  }, [allFiles]);
  const readyToPublish = useMemo(() => {
    return publishingQueueItems.slice(0, 4).map((item) => ({
      ...item,
      checklistNote: truncateInlineText(item.excerpt || item.summary, 100),
      channel: getPrimaryPlatformLabel(item.targetPlatforms, publishingPlatformLabelMap),
    }));
  }, [publishingPlatformLabelMap, publishingQueueItems]);
  const creationBoardItems = useMemo(() => {
    const byId = new Map(allFiles.map((file) => [file.id, file]));
    const candidateIds = new Set();
    collectRecentDrafts(allFiles, allFiles.length).forEach((file) => candidateIds.add(file.id));
    collectPendingPublishDrafts(allFiles, allFiles.length).forEach((file) => candidateIds.add(file.id));
    buildActiveTopicSummary(allFiles, allFiles.length).items.forEach((item) => candidateIds.add(item.id));
    allFiles.forEach((file) => {
      if (getDocumentStatus(file) === 'published') {
        candidateIds.add(file.id);
      }
    });
    return [...candidateIds]
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((file) => {
        const resolvedStatus = getDocumentStatus(file);
        return {
          id: file.id,
          title: stripFileExtension(file.name),
          summary: file.summary || truncateInlineText(file.content, 100),
          updatedAt: file.updatedAt,
          createdAt: file.createdAt,
          draftStatus: resolvedStatus ?? file.draftStatus,
          targetPlatforms: file.targetPlatforms ?? [],
          wordCount: getParsedWordCount(file.content),
        };
      });
  }, [allFiles]);
  const canvasItems = useMemo(() => {
    return allFiles.map((file) => ({
      id: file.id,
      title: stripFileExtension(file.name),
      summary: getCanvasCardSummary(file),
      nodeType: file.nodeType ?? 'document',
      typeLabel: getCanvasCardTypeLabel(file),
      tags: file.tags ?? [],
      url: file.url ?? '',
      updatedAt: file.updatedAt,
      draftStatus: getDocumentStatus(file) ?? file.draftStatus ?? '',
      targetPlatforms: file.targetPlatforms ?? [],
      scheduledPublishAt: file.scheduledPublishAt ?? '',
      sourceMaterialIds: file.sourceMaterialIds ?? [],
      wordCount: getParsedWordCount(file.content),
    }));
  }, [allFiles]);
  const canvasState = useMemo(() => {
    const raw = workspace?.canvasState;
    const viewport = raw?.viewport;
    const hasViewport = viewport
      && Number.isFinite(Number(viewport.x))
      && Number.isFinite(Number(viewport.y))
      && Number.isFinite(Number(viewport.zoom));
    return {
      engine: raw?.engine,
      nodes: Array.isArray(raw?.nodes) ? raw.nodes : [],
      edges: Array.isArray(raw?.edges) ? raw.edges : [],
      viewport: hasViewport ? viewport : null,
      excalidraw: raw?.excalidraw && typeof raw.excalidraw === 'object' ? raw.excalidraw : null,
    };
  }, [workspace]);
  const canvasSurfaceItems = useMemo(() => {
    const itemMap = new Map(
      canvasItems.map((item) => [String(item.id), item]),
    );

    return canvasState.nodes
      .map((node) => {
        const sourceId = String(node.sourceId ?? node.id);
        const item = itemMap.get(sourceId);
        if (!item && isBlankCanvasNode(node)) {
          return buildBlankCanvasItem(node);
        }
        if (!item) return null;

        return {
          ...item,
          sourceId,
          position: node.position,
        };
      })
      .filter(Boolean);
  }, [canvasItems, canvasState.nodes]);
  const linkedNotionPageId = selectedFile ? notionFilePages[selectedFile.id] ?? '' : '';
  const notionAvailable = isNotionAvailable();
  const importInputRef = useRef(null);
  const markdownImportInputRef = useRef(null);
  const projectSaveTimersRef = useRef(new Map());
  const lastContentSurfaceRef = useRef(surface);
  const previousSurfaceRef = useRef(null);
  const lastSyncedMarkdownRef = useRef(normalizeMarkdown(markdown));
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());
  const localProjectSupported = isLocalProjectSupported();
  // uploadFile 钩子在编辑器内是稳定闭包，用 ref 拿当前项目根，避免 stale
  const assetProjectRootRef = useRef('');
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('');
  const handleCanvasChange = useCallback((nextCanvasState, edges) => {
    if (
      nextCanvasState
      && typeof nextCanvasState === 'object'
      && !Array.isArray(nextCanvasState)
      && Object.prototype.hasOwnProperty.call(nextCanvasState, 'excalidraw')
    ) {
      setWorkspaceCanvas(nextCanvasState);
      return;
    }

    const nodes = Array.isArray(nextCanvasState) ? nextCanvasState : [];
    const currentState = useEditorStore.getState().workspace?.canvasState;
    setWorkspaceCanvas({
      nodes,
      edges,
      viewport: currentState?.viewport ?? null,
    });
  }, [setWorkspaceCanvas]);
  const handleCanvasViewportChange = useCallback((viewport) => {
    const currentState = useEditorStore.getState().workspace?.canvasState ?? {};
    setWorkspaceCanvas({
      nodes: Array.isArray(currentState.nodes) ? currentState.nodes : [],
      edges: Array.isArray(currentState.edges) ? currentState.edges : [],
      viewport,
    });
  }, [setWorkspaceCanvas]);
  const handleClearCanvas = useCallback(() => {
    setWorkspaceCanvas({
      nodes: [],
      edges: [],
      viewport: null,
      excalidraw: null,
    });
  }, [setWorkspaceCanvas]);
  const performRename = useCallback(async (targetId, rawName) => {
    const trimmed = String(rawName ?? '').trim();
    if (!trimmed) return false;

    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, targetId);
    if (!node) return false;
    const normalizedName = node.type === 'file'
      ? ensureRenameFileName(trimmed, node.name)
      : trimmed;

    if (node.projectRootPath && node.relativePath && localProjectSupported) {
      const parentId = findParentId(state.workspace, targetId) ?? state.workspace.id;
      const parent = findNodeById(state.workspace, parentId) ?? state.workspace;

      const diskName = buildUniqueRenameNameInFolder(parent, normalizedName, targetId);
      const newRelativePath = replaceRelativePathBasename(node.relativePath, diskName);

      try {
        const result = await renameLocalProjectEntryOnDisk({
          projectRootPath: node.projectRootPath,
          relativePath: node.relativePath,
          newRelativePath,
        });
        useEditorStore.getState().replaceDiskBackedNode(targetId, {
          name: diskName,
          relativePath: result.relativePath ?? newRelativePath,
          updatedAt: result.updatedAt,
        });
        return true;
      } catch (error) {
        console.error('重命名本地文件失败:', error);
        alert(error?.message || '重命名失败');
        return false;
      }
    }

    return useEditorStore.getState().applyRename(targetId, normalizedName);
  }, [localProjectSupported]);

  const titleEditing = useTitleEditing(selectedFile, performRename);
  const { handleExport, handleImport } = useWorkspaceActions({
    workspace,
    dailyWorkspace,
    selectedId,
    applyRename,
    deleteNode,
    importWorkspace,
  });

  const handleRename = useCallback(async (nodeId, providedName) => {
    const targetId = nodeId ?? selectedId;
    const node = findNodeById(workspace, targetId);
    if (!node) return false;

    let nextName = providedName;
    if (nextName == null) {
      const prompted = window.prompt('请输入新名称', node.name);
      if (prompted == null) return false;
      nextName = prompted;
    }

    const trimmed = String(nextName).trim();
    if (!trimmed) return false;

    const ok = await performRename(targetId, trimmed);
    if (!ok) {
      alert('名称已存在，请换一个。');
    }
    return ok;
  }, [workspace, selectedId, performRename]);

  const handleDelete = useCallback(async (nodeId) => {
    const targetId = nodeId ?? selectedId;
    if (targetId === 'root') {
      alert('根目录不能删除');
      return;
    }
    const node = findNodeById(workspace, targetId);
    if (!node) return;
    const isFolder = node.type === 'folder';
    const confirmed = window.confirm(
      `确定删除${isFolder ? '文件夹及其全部内容' : '文件'}「${node.name}」吗？`,
    );
    if (!confirmed) return;

    if (node.projectRootPath && node.relativePath && localProjectSupported) {
      try {
        await deleteLocalProjectEntryOnDisk({
          projectRootPath: node.projectRootPath,
          relativePath: node.relativePath,
        });
        removeDiskBackedNode(targetId);
        setContentResetKey((k) => k + 1);
      } catch (error) {
        console.error('删除本地文件失败:', error);
        alert(error?.message || '删除失败');
      }
      return;
    }

    deleteNode(targetId);
  }, [workspace, selectedId, localProjectSupported, deleteNode, removeDiskBackedNode]);
  const [syncChannel, setSyncChannel] = useState('notion');
  const [wechatPreviewOpen, setWechatPreviewOpen] = useState(false);
  const [bookmarkImportOpen, setBookmarkImportOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  const [contentResetKey, setContentResetKey] = useState(0);
  const editorReloadToken = useEditorStore((state) => state.editorReloadToken);
  const [notionMessage, setNotionMessage] = useState('');
  const [notionError, setNotionError] = useState('');
  const [notionPullLoading, setNotionPullLoading] = useState(false);
  const [notionPushLoading, setNotionPushLoading] = useState(false);
  const [batchPullLoading, setBatchPullLoading] = useState(false);
  const [batchPushLoading, setBatchPushLoading] = useState(false);
  const [incrementalPullLoading, setIncrementalPullLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [manualSyncLoading, setManualSyncLoading] = useState(false);
  const [cloudSyncLoading, setCloudSyncLoading] = useState(false);
  const [cloudSyncMessage, setCloudSyncMessage] = useState('');
  const [cloudSyncError, setCloudSyncError] = useState('');
  const [cloudSyncConflict, setCloudSyncConflict] = useState(null);
  const selectedNeedsConversion = Boolean(
    selectedFile?.needsConversion
      || (selectedFile?.projectRootPath && selectedFile?.name && needsConversion(selectedFile.name)),
  );

  const [previewData, setPreviewData] = useState({ rawContent: '', fileUrl: '', previewHtml: '', excelSheets: null });
  const [previewLoading, setPreviewLoading] = useState(false);
  // 图片放大查看器：lightbox.index < 0 表示关闭
  const [lightbox, setLightbox] = useState({ images: [], index: -1 });

  // 点击编辑器内图片：收集当前文档所有图片，打开 lightbox 并定位到被点的那张
  const handlePaperClick = useCallback((event) => {
    const img = event.target.closest?.('img.bn-visual-media');
    if (!img) return;
    const paper = event.currentTarget;
    const imgs = Array.from(paper.querySelectorAll('img.bn-visual-media'));
    const images = imgs.map((node) => node.currentSrc || node.src).filter(Boolean);
    const index = imgs.indexOf(img);
    if (index < 0 || !images.length) return;
    setLightbox({ images, index });
  }, []);

  const closeLightbox = useCallback(() => setLightbox((prev) => ({ ...prev, index: -1 })), []);
  const changeLightboxIndex = useCallback(
    (next) => setLightbox((prev) => ({ ...prev, index: next })),
    [],
  );
  const canSaveLocalProjectFile = localProjectSupported
    && Boolean(selectedProjectRootPath && selectedFile?.relativePath)
    && !selectedNeedsConversion;
  const canManualSyncLocalProject = localProjectSupported && Boolean(manualSyncProjectRootPath);
  // 同步页用：不论当前选中文件还是文件夹，只要工作区里有本地项目就能同步。
  // 取路径优先级：选中文件夹 → 选中文件 → 工作区第一个本地项目根。
  const currentWorkspaceProjectRoot = useMemo(() => (
    manualSyncProjectRootPath
      || selectedProjectRootPath
      || collectLocalProjectRootPaths(workspace)[0]
      || ''
  ), [manualSyncProjectRootPath, selectedProjectRootPath, workspace]);
  const canSyncWorkspaceFromDisk = localProjectSupported && Boolean(currentWorkspaceProjectRoot);
  const visibleStorageMode = hasLocalProjectWorkspace ? 'project' : storageMode;
  const visibleProjectRootPath = hasLocalProjectWorkspace ? '已导入本地目录' : '';

  const initialContent = useMemo(() => {
    // BlockNote JSON 格式：直接解析，无需经过 Markdown 转换
    if (isBlockNoteContent(markdown)) {
      const blocks = parseBlockNoteContent(markdown);
      if (blocks && blocks.length > 0) {
        // lastSyncedMarkdownRef 存原始 content 字符串，用于变更检测
        lastSyncedMarkdownRef.current = markdown;
        return blocks;
      }
    }

    const sourceMarkdown = normalizeMarkdown(markdown);
    lastSyncedMarkdownRef.current = sourceMarkdown;

    if (!sourceMarkdown) {
      return createEmptyDocument();
    }

    const parserEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
    const parsedBlocks = parserEditor.tryParseMarkdownToBlocks(sourceMarkdown);
    return parsedBlocks.length > 0 ? parsedBlocks : createEmptyDocument();
  }, [selectedId, contentResetKey, editorReloadToken]);

  // 同步当前项目根到 ref，供 uploadFile 闭包读取
  useEffect(() => {
    assetProjectRootRef.current = selectedProjectRootPath;
  }, [selectedProjectRootPath]);

  // 粘贴/拖入图片：存到工作区 素材/ 目录，返回 local-media URL；
  // 无项目根（如内置文档）或保存失败时降级为 data URL，保证图片仍可显示
  const uploadFile = useCallback(async (file) => {
    const dataUrl = await fileToDataUrl(file);
    const projectRootPath = assetProjectRootRef.current;
    if (!localProjectSupported || !projectRootPath) return dataUrl;

    try {
      const { base64, mimeSubtype } = parseDataUrl(dataUrl);
      const res = await window.electronAPI.saveBinaryAsset({
        projectRootPath,
        base64,
        mimeSubtype,
      });
      if (!res?.relativePath) throw new Error('保存素材失败');
      const absPath = `${projectRootPath}/${res.relativePath}`;
      return `local-media://${encodeURI(absPath)}`;
    } catch (error) {
      console.error('[asset] 保存截图失败，降级为内嵌:', error);
      message.warning('图片未能存入素材库，已内嵌到文档');
      return dataUrl;
    }
  }, [localProjectSupported]);

  const editor = useCreateBlockNote(
    {
      ...BLOCKNOTE_OPTIONS,
      initialContent,
      uploadFile,
      pasteHandler: ({ event, editor: pasteEditor, defaultPasteHandler }) => {
        // 优先处理剪贴板里的图片文件（截图、复制图片）：直接存盘并插入图片块，
        // 避免被下面的文本/HTML 分支拦截，或被默认处理器内嵌成 base64
        const imageFile = pickClipboardImageFile(event.clipboardData);
        if (imageFile) {
          insertImageFromFile(pasteEditor, imageFile, uploadFile);
          return true;
        }

        const plainText = event.clipboardData?.getData('text/plain') ?? '';
        const htmlText = event.clipboardData?.getData('text/html') ?? '';
        const hasHtmlCodeBlock = looksLikeCodeBlockClipboardHtml(htmlText);

        if (hasHtmlCodeBlock && looksLikeMarkdownCodeFenceClipboardText(plainText)) {
          pasteEditor.pasteMarkdown(plainText);
          return true;
        }

        if (hasHtmlCodeBlock) {
          const codeBlock = extractCodeBlockFromClipboardHtml(htmlText);
          const currentBlock = pasteEditor.getTextCursorPosition()?.block;

          if (codeBlock?.content && currentBlock) {
            const nextBlock = {
              type: 'codeBlock',
              props: { language: codeBlock.language || 'text' },
              content: codeBlock.content,
            };

            const isCurrentParagraph =
              currentBlock.type === 'paragraph' &&
              !currentBlock.content?.length &&
              !(currentBlock.children?.length > 0);

            if (isCurrentParagraph) {
              pasteEditor.updateBlock(currentBlock, nextBlock);
              pasteEditor.setTextCursorPosition(currentBlock, 'end');
            } else {
              const [insertedBlock] = pasteEditor.insertBlocks([nextBlock], currentBlock, 'after');
              if (insertedBlock) {
                pasteEditor.setTextCursorPosition(insertedBlock, 'end');
              }
            }

            pasteEditor.focus();
            return true;
          }
        }

        if (looksLikeMarkdownClipboardText(plainText)) {
          pasteEditor.pasteMarkdown(plainText);
          return true;
        }

        // HTML 只含 <br>/<p>/<div> 等结构标签、无富文本时，
        // 用纯文本走 pasteMarkdown 避免 <br><br> 被转成多余空段落
        if (plainText.trim() && looksLikePlainTextHtml(htmlText)) {
          const collapsed = plainText.replace(/\n{3,}/g, '\n\n');
          pasteEditor.pasteMarkdown(collapsed);
          return true;
        }

        return defaultPasteHandler({
          prioritizeMarkdownOverHTML: false,
          plainTextAsMarkdown: false,
        });
      },
    },
    [selectedId, contentResetKey, editorReloadToken],
  );

  // 供导出/预览/微信使用的纯 Markdown 文本：
  // content 存的是 BlockNote JSON，需通过 editor 转换；旧数据直接用
  const resolvedMarkdown = useMemo(() => {
    if (isBlockNoteContent(markdown)) {
      const blocks = parseBlockNoteContent(markdown);
      if (blocks) {
        // 用临时 editor 实例转换，避免依赖当前 editor 状态
        const tempEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
        return normalizeMarkdown(tempEditor.blocksToMarkdownLossy(blocks));
      }
      return '';
    }
    return normalizeMarkdown(markdown);
  }, [markdown]);

  const wechatSourceHtml = useMemo(() => {
    const tokens = parserRef.current.parse(resolvedMarkdown);
    return rendererRef.current.render(tokens);
  }, [resolvedMarkdown]);

  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  const selectedContentSurface = selectedFolder ? 'folder' : selectedFile ? 'paper' : 'overview';

  useEffect(() => {
    if (surface !== 'settings' && surface !== 'notion' && surface !== 'sync') {
      lastContentSurfaceRef.current = surface;
    }
  }, [surface]);

  useEffect(() => {
    if (surface !== 'daily') return;
    setDailyCurrentDate(getTodayDateKey());

    // 在凌晨 0 点精确跨天，避免轮询
    const scheduleMidnightUpdate = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const msUntilMidnight = tomorrow - now + 1000; // 多等 1 秒确保跨过去
      return setTimeout(() => {
        setDailyCurrentDate(getTodayDateKey());
        timerRef.current = scheduleMidnightUpdate();
      }, msUntilMidnight);
    };

    const timerRef = { current: scheduleMidnightUpdate() };
    return () => clearTimeout(timerRef.current);
  }, [setDailyCurrentDate, surface]);

  // 同步页打开时，点左侧目录只更新选中态、保留同步页；
  // 点「返回」后再切到选中目标。其它情况按正常逻辑直接打开。
  const handleSidebarSelect = useCallback((nodeId) => {
    if (surface === 'sync') {
      selectNodeKeepSurface(nodeId);
    } else {
      selectNode(nodeId);
    }
  }, [surface, selectNode, selectNodeKeepSurface]);

  const tryConvertTypedMarkdownCodeFence = useCallback(() => {
    const cursorPosition = editor.getTextCursorPosition();
    const currentBlock = cursorPosition?.block;
    const previousBlock = cursorPosition?.prevBlock;

    if (cursorPosition?.parentBlock) return false;
    if (currentBlock?.type !== 'paragraph' || previousBlock?.type !== 'paragraph') return false;
    if (getBlockTextContent(currentBlock.content).trim()) return false;

    const language = getMarkdownCodeFenceLanguage(getBlockTextContent(previousBlock.content));
    if (!language) return false;

    const { insertedBlocks } = editor.replaceBlocks([previousBlock.id, currentBlock.id], [
      {
        type: 'codeBlock',
        props: { language },
        content: '',
      },
    ]);

    const insertedCodeBlock = insertedBlocks?.[0];
    if (insertedCodeBlock) {
      editor.setTextCursorPosition(insertedCodeBlock, 'end');
    }
    editor.focus();
    return true;
  }, [editor]);

  const handleEditorChange = () => {
    if (selectedReadOnly) return;
    tryConvertTypedMarkdownCodeFence();

    // content 字段存 BlockNote JSON（保留颜色等富文本样式）
    const nextContent = serializeBlockNoteContent(editor.document);
    if (nextContent === lastSyncedMarkdownRef.current) return;
    lastSyncedMarkdownRef.current = nextContent;
    updateSelectedFileContent(nextContent);

    if (canSaveLocalProjectFile) {
      const existingTimer = projectSaveTimersRef.current.get(selectedFile.id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      setDiskSavePending(selectedFile.id, true);
      const timerId = window.setTimeout(async () => {
        try {
          // 磁盘 .md 文件仍写 Markdown（有损转换，但保持文件可读性）
          const diskMarkdown = normalizeMarkdown(editor.blocksToMarkdownLossy(editor.document));
          await saveLocalProjectFile({
            projectRootPath: selectedProjectRootPath,
            relativePath: selectedFile.relativePath,
            content: diskMarkdown,
          });
        } catch (error) {
          console.error('保存本地项目文件失败:', error);
          alert(error?.message || '保存本地项目文件失败');
        } finally {
          projectSaveTimersRef.current.delete(selectedFile.id);
          setDiskSavePending(selectedFile.id, false);
        }
      }, 400);
      projectSaveTimersRef.current.set(selectedFile.id, timerId);
    }
  };

  const handleCopyRichText = async () => {
    const html = wechatSourceHtml;
    if (!html.trim()) {
      message.warning('没有可复制的内容');
      return;
    }
    const plainText = htmlToPlainText(html);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html;charset=utf-8' }),
          'text/plain': new Blob([plainText], { type: 'text/plain;charset=utf-8' }),
        }),
      ]);
      message.success('已复制富文本');
    } catch {
      // 降级：execCommand
      const container = document.createElement('div');
      container.innerHTML = html;
      container.style.cssText = 'position:fixed;left:-9999px;top:0;';
      document.body.appendChild(container);
      const sel = window.getSelection();
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(container);
      sel.addRange(range);
      const ok = document.execCommand('copy');
      document.body.removeChild(container);
      sel.removeAllRanges();
      if (ok) message.success('已复制富文本');
      else message.error('复制失败，请重试');
    }
  };

  const handleCopyToWeChat = async () => {
    const html = wechatSourceHtml;
    if (!html.trim()) {
      message.warning('没有可复制的内容');
      return;
    }
    try {
      await copyToWeChat(html, { templateId: copyStyle });
      message.success('已复制，可直接粘贴到公众号编辑器');
    } catch {
      message.error('复制失败，请重试');
    }
  };

  const handleExportMarkdown = useCallback(() => {
    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, state.selectedId);
    if (node?.type !== 'file') {
      alert('请先选中一个文档后再导出 Markdown。');
      return;
    }
    const filename = ensureMarkdownDownloadName(node.name);
    // content 可能是 BlockNote JSON，需先转为纯 Markdown
    const rawContent = state.markdown;
    let md;
    if (isBlockNoteContent(rawContent)) {
      const blocks = parseBlockNoteContent(rawContent);
      const tempEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
      md = normalizeMarkdown(tempEditor.blocksToMarkdownLossy(blocks ?? []));
    } else {
      md = normalizeMarkdown(rawContent);
    }
    downloadMarkdownFile(md, filename);
  }, []);

  const handleExportAs = useCallback(async (format) => {
    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, state.selectedId);
    if (node?.type !== 'file') {
      message.warning('请先选中一个文档后再导出。');
      return;
    }
    // content 可能是 BlockNote JSON，需先转为纯 Markdown
    const rawContent = state.markdown;
    let md;
    if (isBlockNoteContent(rawContent)) {
      const blocks = parseBlockNoteContent(rawContent);
      const tempEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
      md = normalizeMarkdown(tempEditor.blocksToMarkdownLossy(blocks ?? []));
    } else {
      md = normalizeMarkdown(rawContent);
    }
    const title = node.name.replace(/\.[^.]+$/, '');
    const filename = title || '导出文档';
    const tokens = parserRef.current.parse(md);
    const html = rendererRef.current.render(tokens);
    const closeLoading = message.loading('正在导出…', 0);
    try {
      const result = await exportDocument(format, { markdown: md, html, title, filename });
      if (result?.canceled) return;
      message.success('导出成功');
    } catch (error) {
      console.error('导出失败:', error);
      message.error(error?.message || '导出失败');
    } finally {
      closeLoading();
    }
  }, []);

  const ensureLocalMdRenderWorkspace = useCallback(async () => {
    if (!localProjectSupported) return null;
    const state = useEditorStore.getState();
    if (state.projectRootPath) return state.projectRootPath;

    // 按需初始化本地目录，避免应用启动时直接触发 macOS Documents 权限弹窗。
    const result = await ensureMdRenderWorkspace();
    if (!result?.projectRootPath) return null;

    hydrateProjectsWorkspace(result);
    hydrateDailyWorkspaceFromDisk(result.projectRootPath);
    return result.projectRootPath;
  }, [localProjectSupported, hydrateProjectsWorkspace, hydrateDailyWorkspaceFromDisk]);

  const resolveLocalCreateTarget = useCallback(async (contextNodeId) => {
    const state = useEditorStore.getState();
    const targetNode = findNodeById(state.workspace, contextNodeId ?? state.selectedId);
    const projectRootPath = targetNode?.projectRootPath || await ensureLocalMdRenderWorkspace();
    if (!projectRootPath) return null;
    return resolveLocalProjectCreateTarget(
      state.workspace,
      contextNodeId ?? state.selectedId,
      projectRootPath,
    );
  }, [ensureLocalMdRenderWorkspace]);

  const handleImportMarkdown = useCallback((event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const isDocx = /\.docx$/i.test(file.name);
    const reader = new FileReader();

    reader.onload = async () => {
      const closeLoading = message.loading('正在导入文件…', 0);
      try {
        const raw = reader.result;
        const markdownText = normalizeMarkdown(await convertToMarkdown(file.name, raw));
        const stem = file.name.replace(/\.[^.]+$/, '').trim() || '导入';

        if (localProjectSupported) {
          const target = await resolveLocalCreateTarget();
          if (!target) {
            message.error('无法定位本地 Projects 目录，请稍后重试。');
            return;
          }
          const name = buildUniqueNameInFolder(target.parentFolder, stem, '.md');
          const relativePath = target.parentRelativePath ? `${target.parentRelativePath}/${name}` : name;
          const result = await createLocalProjectFileOnDisk({
            projectRootPath: target.projectRootPath,
            relativePath,
            content: markdownText,
          });
          const node = createLocalProjectFileNode(target.projectRootPath, result.relativePath, name, markdownText);
          node.updatedAt = result.updatedAt;
          insertLocalProjectNode(target.parentFolderId, node);
          setContentResetKey((k) => k + 1);
          message.success(`已导入「${name}」`);
          return;
        }

        const { selectedId, addFile } = useEditorStore.getState();
        if (!addFile(selectedId)) {
          message.error('本地项目目录暂不支持新建文件，请先在磁盘目录中创建文件后重新打开项目。');
          return;
        }
        const after = useEditorStore.getState();
        after.updateSelectedFileContent(markdownText);
        const uniqueName = buildUniqueName(after.workspace, stem, '.md');
        after.applyRename(after.selectedId, uniqueName);
        setContentResetKey((k) => k + 1);
        message.success(`已导入「${uniqueName}」`);
      } catch (error) {
        console.error('导入文件失败:', error);
        message.error(error?.message || '导入文件失败，格式可能不受支持。');
      } finally {
        closeLoading();
      }
    };

    // DOCX 需要以 ArrayBuffer 读取，其余以文本读取
    if (isDocx) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
    event.target.value = '';
  }, [localProjectSupported, insertLocalProjectNode, resolveLocalCreateTarget]);

  const handleAddFile = useCallback(async (contextNodeId) => {
    if (localProjectSupported) {
      try {
        const target = await resolveLocalCreateTarget(contextNodeId);
        if (!target) {
          message.error('无法定位本地 Projects 目录，请稍后重试。');
          return { ok: false };
        }
        const name = buildUniqueNameInFolder(target.parentFolder, '未命名', '.md');
        const relativePath = target.parentRelativePath ? `${target.parentRelativePath}/${name}` : name;
        const result = await createLocalProjectFileOnDisk({
          projectRootPath: target.projectRootPath,
          relativePath,
          content: '',
        });
        const node = createLocalProjectFileNode(target.projectRootPath, result.relativePath, name, '');
        node.updatedAt = result.updatedAt;
        insertLocalProjectNode(target.parentFolderId, node);
        setContentResetKey((k) => k + 1);
        return {
          ok: true,
          nodeId: node.id,
          name: node.name,
          type: node.type,
        };
      } catch (error) {
        console.error('新建本地文件失败:', error);
        message.error(error?.message || '新建本地文件失败');
        return { ok: false };
      }
    }

    if (!addFile(contextNodeId)) {
      message.error('本地项目目录暂不支持新建文件，请先在磁盘目录中创建文件后重新打开项目。');
      return { ok: false };
    }
    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, state.selectedId);
    return node
      ? { ok: true, nodeId: node.id, name: node.name, type: node.type }
      : { ok: false };
  }, [localProjectSupported, resolveLocalCreateTarget, addFile, insertLocalProjectNode]);

  const handleAddFolder = useCallback(async (contextNodeId) => {
    if (localProjectSupported) {
      try {
        const target = await resolveLocalCreateTarget(contextNodeId);
        if (!target) {
          message.error('无法定位本地 Projects 目录，请稍后重试。');
          return { ok: false };
        }
        const name = buildUniqueNameInFolder(target.parentFolder, '新建文件夹');
        const relativePath = target.parentRelativePath ? `${target.parentRelativePath}/${name}` : name;
        const result = await createLocalProjectFolderOnDisk({
          projectRootPath: target.projectRootPath,
          relativePath,
        });
        const node = createLocalProjectFolderNode(target.projectRootPath, result.relativePath, name);
        insertLocalProjectNode(target.parentFolderId, node);
        setContentResetKey((k) => k + 1);
        return {
          ok: true,
          nodeId: node.id,
          name: node.name,
          type: node.type,
        };
      } catch (error) {
        console.error('新建本地文件夹失败:', error);
        message.error(error?.message || '新建本地文件夹失败');
        return { ok: false };
      }
    }

    if (!addFolder(contextNodeId)) {
      message.error('本地项目目录暂不支持新建文件夹，请先在磁盘目录中创建文件夹后重新打开项目。');
      return { ok: false };
    }
    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, state.selectedId);
    return node
      ? { ok: true, nodeId: node.id, name: node.name, type: node.type }
      : { ok: false };
  }, [localProjectSupported, resolveLocalCreateTarget, addFolder, insertLocalProjectNode]);

  const handleCreateDraftFromDashboard = useCallback(async (actionKey) => {
    if (actionKey === 'material') {
      setBookmarkImportOpen(true);
      return;
    }

    if (actionKey === 'publish') {
      setSurface('publishing');
      return;
    }

    const beforeSelectedId = useEditorStore.getState().selectedId;
    await handleAddFile();
    const after = useEditorStore.getState();
    const nextFileId = after.selectedId;
    const nextFile = findNodeById(after.workspace, nextFileId);
    if (!nextFile || nextFile.type !== 'file' || nextFileId === beforeSelectedId) return;

    if (actionKey === 'topic') {
      after.setFileKnowledgeMeta(nextFileId, {
        draftStatus: 'idea',
        summary: '',
      });
      if (!localProjectSupported) {
        after.applyRename(nextFileId, buildUniqueName(after.workspace, '新选题', '.md'));
      }
      return;
    }

    after.setFileKnowledgeMeta(nextFileId, {
      draftStatus: 'drafting',
      targetPlatforms: getDefaultTargetPlatforms(publishingPlatforms),
    });
    if (!localProjectSupported) {
      after.applyRename(nextFileId, buildUniqueName(after.workspace, '新稿件', '.md'));
    }
  }, [handleAddFile, localProjectSupported, publishingPlatforms, setSurface]);

  const handleCreateEntryWithStatus = useCallback(async (nextStatus) => {
    const beforeSelectedId = useEditorStore.getState().selectedId;
    await handleAddFile();
    const after = useEditorStore.getState();
    const nextFileId = after.selectedId;
    const nextFile = findNodeById(after.workspace, nextFileId);
    if (!nextFile || nextFile.type !== 'file' || nextFileId === beforeSelectedId) return;

    const targetPlatforms = nextStatus === 'ready' || nextStatus === 'published'
      ? getDefaultTargetPlatforms(publishingPlatforms)
      : [];
    after.setFileKnowledgeMeta(nextFileId, {
      draftStatus: nextStatus,
      targetPlatforms,
    });

    if (!localProjectSupported) {
      const nameMap = {
        idea: '新选题',
        collecting: '新资料单',
        draft: '新草稿',
        drafting: '新稿件',
        revising: '待修改稿',
        ready: '待发布稿',
        published: '已发布稿',
      };
      after.applyRename(nextFileId, buildUniqueName(after.workspace, nameMap[nextStatus] ?? '新稿件', '.md'));
    }
  }, [handleAddFile, localProjectSupported, publishingPlatforms]);

  const handleDashboardViewSection = useCallback((sectionKey) => {
    if (sectionKey === 'planner') {
      alert('规划文档已写入 docs/content-creation-roadmap.md');
      return;
    }
    if (sectionKey === 'topics') {
      setSurface('creation-board');
      return;
    }
    if (sectionKey === 'publishing') {
      setSurface('publishing');
      return;
    }
    const queryMap = {
      drafts: '稿件',
      materials: '素材',
    };
    setKnowledgeSearchQuery(queryMap[sectionKey] ?? '');
    setSurface('search');
  }, [setSurface, setKnowledgeSearchQuery]);

  const handleDashboardOpenItem = useCallback((_, item) => {
    if (item?.id) {
      selectNode(item.id);
    }
  }, [selectNode]);

  const handleBoardOpenItem = useCallback((item) => {
    if (item?.id) selectNode(item.id);
  }, [selectNode]);

  const handleBoardMoveStatus = useCallback((item, nextStatus) => {
    if (!item?.id) return;
    useEditorStore.getState().setFileKnowledgeMeta(item.id, { draftStatus: nextStatus });
  }, []);

  const handlePublishingOpenSearch = useCallback(() => {
    setKnowledgeSearchQuery('待发布');
    setSurface('search');
  }, [setSurface, setKnowledgeSearchQuery]);

  const handlePublishingSchedule = useCallback((item) => {
    if (item?.id) {
      selectNode(item.id);
    }
  }, [selectNode]);

  const handleOpenLocalProject = useCallback(async () => {
    if (!localProjectSupported) {
      message.error('打开本地项目仅支持桌面版应用。');
      return;
    }
    let closeLoading = null;
    try {
      const result = await openLocalProject();
      if (!result || result.canceled) return;
      const projects = Array.isArray(result.projects)
        ? result.projects
        : [{ workspace: result.workspace, projectRootPath: result.projectRootPath }];
      const validProjects = projects.filter((project) => project?.workspace);
      if (validProjects.length === 0) return;
      closeLoading = message.loading('正在打开本地项目…', 0);
      validProjects.forEach((project) => {
        openLocalProjectWorkspace(project.workspace, project.projectRootPath);
      });
      setContentResetKey((k) => k + 1);
      message.success(`已打开 ${validProjects.length} 个本地项目`);
    } catch (error) {
      console.error('打开本地项目失败:', error);
      message.error(error?.message || '打开本地项目失败');
    } finally {
      closeLoading?.();
    }
  }, [localProjectSupported, openLocalProjectWorkspace]);

  const handleManualSyncLocalProject = useCallback(async (projectRootPath = manualSyncProjectRootPath) => {
    if (!localProjectSupported || !projectRootPath) return;

    setManualSyncLoading(true);
    try {
      allFiles
        .filter((file) => file.projectRootPath === projectRootPath)
        .forEach((file) => {
          const timerId = projectSaveTimersRef.current.get(file.id);
          if (timerId) {
            window.clearTimeout(timerId);
            projectSaveTimersRef.current.delete(file.id);
          }
          setDiskSavePending(file.id, false);
        });

      const isTreeMount = (workspace.children ?? []).some(
        (child) => child.localProjectRoot && child.projectRootPath === projectRootPath,
      );
      const result = await readLocalProjectDisk(
        projectRootPath,
        isTreeMount ? 'tree' : 'projects',
      );
      if (!result?.ok) {
        throw new Error(result?.error || '从磁盘同步失败');
      }

      useEditorStore.getState().refreshDiskBackedProject({
        projectRootPath,
        workspace: result.workspace,
        projectsChildren: result.projectsChildren,
        conflictResolution: 'use-disk',
      });
      message.success('已从磁盘同步');
    } catch (error) {
      console.error('手动同步本地项目失败:', error);
      message.error(error?.message || '手动同步失败');
    } finally {
      setManualSyncLoading(false);
    }
  }, [
    allFiles,
    localProjectSupported,
    setDiskSavePending,
    workspace,
  ]);

  const handleCloudUpload = useCallback(async ({ baseRevision } = {}) => {
    setCloudSyncLoading(true);
    setCloudSyncMessage('');
    setCloudSyncError('');
    setCloudSyncConflict(null);
    try {
      const state = useEditorStore.getState();
      const { payload, hash } = state.buildCloudSyncPayload();
      const result = await uploadCloudWorkspaceSnapshot({
        baseUrl: state.cloudSyncBaseUrl,
        workspaceId: state.cloudWorkspaceId,
        payload,
        baseRevision: baseRevision ?? state.cloudLastSyncedRevision,
        clientId: state.cloudClientId,
      });
      const nextRevision = result.revision ?? result.snapshot?.revision ?? state.cloudLastSyncedRevision + 1;
      const updatedAt = result.updatedAt ?? result.snapshot?.updatedAt ?? new Date().toISOString();
      state.markCloudSyncSuccess({ revision: nextRevision, updatedAt, hash });
      setCloudSyncMessage(`已上传到云端，revision ${nextRevision}。`);
      message.success('已上传到云端');
    } catch (error) {
      if (error?.status === 409) {
        const remoteRevision = error.body?.revision ?? error.body?.snapshot?.revision ?? error.body?.remoteRevision;
        setCloudSyncConflict({
          type: 'upload',
          remoteRevision,
          remoteSnapshot: error.body?.snapshot ?? error.body,
        });
        setCloudSyncError('云端已有更新，已阻止覆盖。请选择使用云端版本或覆盖云端。');
      } else {
        console.error('上传云端工作区失败:', error);
        setCloudSyncError(error?.message || '上传失败');
      }
    } finally {
      setCloudSyncLoading(false);
    }
  }, []);

  const applyRemoteCloudSnapshot = useCallback((snapshot) => {
    const payload = snapshot?.payload ?? snapshot?.workspace?.payload;
    const revision = snapshot?.revision ?? snapshot?.workspace?.revision ?? 0;
    const updatedAt = snapshot?.updatedAt ?? snapshot?.workspace?.updatedAt ?? '';
    const result = applyCloudWorkspacePayload(payload, { revision, updatedAt });
    setContentResetKey((k) => k + 1);
    setCloudSyncConflict(null);
    setCloudSyncMessage(`已从云端拉取，revision ${revision}。`);
    message.success('已从云端拉取');
    return result;
  }, [applyCloudWorkspacePayload]);

  const handleCloudPull = useCallback(async ({ force = false } = {}) => {
    setCloudSyncLoading(true);
    setCloudSyncMessage('');
    setCloudSyncError('');
    if (!force) setCloudSyncConflict(null);
    try {
      const state = useEditorStore.getState();
      const snapshot = await fetchCloudWorkspaceSnapshot({
        baseUrl: state.cloudSyncBaseUrl,
        workspaceId: state.cloudWorkspaceId,
      });
      const remoteRevision = snapshot?.revision ?? snapshot?.workspace?.revision ?? 0;
      const { hash } = state.buildCloudSyncPayload();
      const hasLocalChanges = Boolean(state.cloudLastSyncedHash && hash !== state.cloudLastSyncedHash);
      if (!force && hasLocalChanges) {
        setCloudSyncConflict({
          type: 'pull',
          remoteRevision,
          remoteSnapshot: snapshot,
        });
        setCloudSyncError('本地有未上传改动，已阻止云端覆盖。请选择使用云端版本或先上传本地版本。');
        return;
      }
      applyRemoteCloudSnapshot(snapshot);
    } catch (error) {
      console.error('拉取云端工作区失败:', error);
      setCloudSyncError(error?.message || '拉取失败');
    } finally {
      setCloudSyncLoading(false);
    }
  }, [applyRemoteCloudSnapshot]);

  const handleCloudUseRemote = useCallback(() => {
    if (!cloudSyncConflict?.remoteSnapshot) return;
    try {
      applyRemoteCloudSnapshot(cloudSyncConflict.remoteSnapshot);
    } catch (error) {
      console.error('应用云端工作区失败:', error);
      setCloudSyncError(error?.message || '应用云端版本失败');
    }
  }, [applyRemoteCloudSnapshot, cloudSyncConflict]);

  const handleCloudForceUpload = useCallback(() => {
    const remoteRevision = cloudSyncConflict?.remoteRevision;
    if (!Number.isFinite(Number(remoteRevision))) {
      setCloudSyncError('缺少云端 revision，无法确认覆盖。');
      return;
    }
    const confirmed = window.confirm(`确定用本地快照覆盖云端 revision ${remoteRevision} 吗？`);
    if (!confirmed) return;
    handleCloudUpload({ baseRevision: remoteRevision });
  }, [cloudSyncConflict, handleCloudUpload]);

  const handleRemoveLocalProject = useCallback((nodeId) => {
    const node = findNodeById(workspace, nodeId);
    if (!node?.localProjectRoot) return;
    const confirmed = window.confirm(`确定移除项目「${node.name}」吗？本地文件不会被删除。`);
    if (!confirmed) return;
    for (const [fileId, timerId] of projectSaveTimersRef.current.entries()) {
      if (fileId.startsWith(`${node.id}:`)) {
        window.clearTimeout(timerId);
        projectSaveTimersRef.current.delete(fileId);
      }
    }
    deleteNode(nodeId);
    setContentResetKey((k) => k + 1);
  }, [workspace, deleteNode]);

  const handleRevealLocalProjectEntry = useCallback(async (nodeId) => {
    const node = findNodeById(workspace, nodeId);
    if (!node?.projectRootPath || !localProjectSupported) return;

    try {
      await revealLocalProjectEntry({
        projectRootPath: node.projectRootPath,
        relativePath: node.relativePath ?? '',
      });
    } catch (error) {
      console.error('在文件管理器中查看失败:', error);
      message.error(error?.message || '打开失败');
    }
  }, [workspace, localProjectSupported]);

  const handleNotionPull = useCallback(async () => {
    if (!notionAvailable || !selectedFile || !notionToken?.trim() || !linkedNotionPageId?.trim()) return;
    setNotionError('');
    setNotionMessage('');
    setNotionPullLoading(true);
    try {
      const id = cleanPageId(linkedNotionPageId);
      const blocks = await fetchBlocks(id, notionToken);
      const md = normalizeMarkdown(blocksToMarkdown(blocks));
      updateSelectedFileContent(md);
      if (canSaveLocalProjectFile) {
        await saveLocalProjectFile({
          projectRootPath: selectedProjectRootPath,
          relativePath: selectedFile.relativePath,
          content: md,
        });
      }
      setContentResetKey((k) => k + 1);
      setNotionMessage('已从 Notion 拉取并覆盖当前文档。');
    } catch (e) {
      setNotionError(e?.message || '拉取失败');
    } finally {
      setNotionPullLoading(false);
    }
  }, [
    notionAvailable,
    canSaveLocalProjectFile,
    selectedProjectRootPath,
    selectedFile,
    notionToken,
    linkedNotionPageId,
    updateSelectedFileContent,
  ]);

  const handleNotionPush = useCallback(async () => {
    if (!notionAvailable || !selectedFile || !notionToken?.trim() || !linkedNotionPageId?.trim()) return;
    setNotionError('');
    setNotionMessage('');
    setNotionPushLoading(true);
    try {
      const id = cleanPageId(linkedNotionPageId);
      // 单文件目标是独立页面：带上目录块 + 元数据卡片（属性列只对数据库页面有效，这里不传）
      const { blocks } = markdownToNotionPayload(resolvedMarkdown);
      await updatePageBlocks(id, blocks, notionToken);
      setNotionMessage('已推送到 Notion。');
    } catch (e) {
      setNotionError(e?.message || '推送失败');
    } finally {
      setNotionPushLoading(false);
    }
  }, [notionAvailable, selectedFile, notionToken, linkedNotionPageId, resolvedMarkdown, updateSelectedFileContent]);

  const handleBatchPull = useCallback(async () => {
    if (!notionAvailable || !notionToken?.trim() || !notionDatabaseId?.trim()) return;
    setNotionError('');
    setNotionMessage('');
    setBatchPullLoading(true);
    setBatchProgress(null);
    try {
      const result = await batchPull(notionDatabaseId, notionToken, (current, total, title) => {
        setBatchProgress({ current, total, title });
      });
      const { workspace: ws } = useEditorStore.getState();
      const folder = {
        ...result.folder,
        name: buildUniqueName(ws, result.folder.name),
      };
      insertWorkspaceNode(folder);
      mergeNotionFilePages(result.mappings);
      const pulledCount = Object.keys(result.mappings).length;
      setNotionMessage(`已从数据库拉取 ${pulledCount} 个页面到「${folder.name}」。`);
      const failureText = formatBatchFailures(result.failed, '页面');
      if (failureText) {
        setNotionError(failureText);
      }
    } catch (e) {
      setNotionError(e?.message || '批量拉取失败');
    } finally {
      setBatchPullLoading(false);
      setBatchProgress(null);
    }
  }, [notionAvailable, notionToken, notionDatabaseId, insertWorkspaceNode, mergeNotionFilePages]);

  /**
   * 增量拉取：落盘到本地目录，按 last_edited_time 比对，只更新变更页。
   * 目录：Projects/notion-sync/<数据库ID> 下，附 .notion-sync.json 索引。
   */
  const handleIncrementalPull = useCallback(async () => {
    if (!notionAvailable || !notionToken?.trim() || !notionDatabaseId?.trim()) return;
    if (!localProjectSupported) {
      setNotionError('增量拉取仅支持桌面版应用。');
      return;
    }
    setNotionError('');
    setNotionMessage('');
    setIncrementalPullLoading(true);
    setBatchProgress(null);
    try {
      const projectRootPath = await ensureLocalMdRenderWorkspace();
      if (!projectRootPath) {
        setNotionError('无法初始化本地 Projects 目录，请稍后重试。');
        return;
      }

      const dbId = cleanPageId(notionDatabaseId);
      const dbDirRelative = `Projects/notion-sync/${dbId}`;

      // IO 适配器：把统一接口映射到现有本地项目桥接
      const io = {
        ensureDir: (rel) =>
          createLocalProjectFolderOnDisk({ projectRootPath, relativePath: rel }),
        readFile: async (rel) => {
          try {
            const res = await readLocalProjectFileContent({ projectRootPath, relativePath: rel });
            return res?.encoding === 'utf8' ? res.data : null;
          } catch {
            return null; // 文件不存在等价于首次拉取
          }
        },
        writeFile: (rel, content) =>
          saveLocalProjectFile({ projectRootPath, relativePath: rel, content }),
      };

      const notion = {
        queryPages: (id) => queryDatabase(id, notionToken),
        extractTitle: (page) => extractPageTitle(page),
        fetchPageMarkdown: async (pageId) => {
          const blocks = await fetchBlocks(cleanPageId(pageId), notionToken);
          return normalizeMarkdown(blocksToMarkdown(blocks));
        },
      };

      const result = await incrementalPull({
        databaseId: dbId,
        dbDirRelative,
        io,
        notion,
        onProgress: (current, total, title) => setBatchProgress({ current, total, title }),
      });

      // 拉完刷新本地目录树，新增/更新的文件才会出现在侧栏
      const disk = await readLocalProjectDisk(projectRootPath, 'projects');
      if (disk?.projectsChildren) {
        hydrateProjectsWorkspace({ projectRootPath, projectsChildren: disk.projectsChildren });
      }

      setNotionMessage(
        `增量同步完成：新增 ${result.created}，更新 ${result.updated}，跳过 ${result.skipped}` +
          (result.deleted ? `，远端已删 ${result.deleted}（本地保留）` : ''),
      );
      const failureText = formatBatchFailures(result.failed, '页面');
      if (failureText) setNotionError(failureText);
    } catch (e) {
      setNotionError(e?.message || '增量拉取失败');
    } finally {
      setIncrementalPullLoading(false);
      setBatchProgress(null);
    }
  }, [
    notionAvailable,
    notionToken,
    notionDatabaseId,
    localProjectSupported,
    ensureLocalMdRenderWorkspace,
    hydrateProjectsWorkspace,
  ]);

  const handleBatchPush = useCallback(async () => {
    if (!notionAvailable || !notionToken?.trim() || !notionDatabaseId?.trim()) return;
    // 推送当前选中的文件夹，若没选文件夹则推送整个工作区
    const pushTarget = selectedFolder ?? workspace;
    setNotionError('');
    setNotionMessage('');
    setBatchPushLoading(true);
    setBatchProgress(null);
    try {
      const { newMappings, updated, created, failed } = await batchPush(
        notionDatabaseId, pushTarget, notionFilePages, notionToken,
        (current, total, title) => {
          setBatchProgress({ current, total, title });
        },
      );
      if (Object.keys(newMappings).length > 0) {
        mergeNotionFilePages(newMappings);
      }
      setNotionMessage(`已推送到数据库：更新 ${updated} 个，新建 ${created} 个。`);
      const failureText = formatBatchFailures(failed, '文件');
      if (failureText) {
        setNotionError(failureText);
      }
    } catch (e) {
      setNotionError(e?.message || '批量推送失败');
    } finally {
      setBatchPushLoading(false);
      setBatchProgress(null);
    }
  }, [notionAvailable, notionToken, notionDatabaseId, selectedFolder, workspace, notionFilePages, mergeNotionFilePages]);

  const handleOpenBookmarkTabExternal = useCallback((tab) => {
    const url = String(tab?.url ?? '').trim();
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }, []);

  const handleImportBookmarks = useCallback(async (items) => {
    const list = (Array.isArray(items) ? items : []).filter((item) => item?.url);
    if (list.length === 0) {
      return { added: 0, skipped: 0, folderId: null };
    }

    if (!localProjectSupported) {
      const result = importBookmarks(list);
      if (result.added > 0) {
        message.success(`已导入 ${result.added} 条书签`);
      }
      return result;
    }

    try {
      const initialWorkspace = await ensureMdRenderWorkspace();
      if (!initialWorkspace?.projectRootPath) {
        const result = importBookmarks(list);
        if (result.added > 0) {
          message.success(`已导入 ${result.added} 条书签`);
        }
        return result;
      }

      hydrateProjectsWorkspace(initialWorkspace);

      let workingWorkspace = useEditorStore.getState().workspace;
      let folderId = findNodeIdByRelativePath(workingWorkspace, LOCAL_BOOKMARK_FOLDER_RELATIVE_PATH);

      if (!folderId) {
        await createLocalProjectFolderOnDisk({
          projectRootPath: initialWorkspace.projectRootPath,
          relativePath: LOCAL_BOOKMARK_FOLDER_RELATIVE_PATH,
        });
        const refreshed = await ensureMdRenderWorkspace();
        hydrateProjectsWorkspace(refreshed);
        workingWorkspace = useEditorStore.getState().workspace;
        folderId = findNodeIdByRelativePath(workingWorkspace, LOCAL_BOOKMARK_FOLDER_RELATIVE_PATH);
      }

      const folderNode = folderId ? findNodeById(workingWorkspace, folderId) : null;
      if (!folderId || folderNode?.type !== 'folder') {
        throw new Error('无法定位本地书签目录');
      }

      const existingUrls = new Set(
        (folderNode.children ?? []).map((child) => String(child.url ?? '').trim()).filter(Boolean),
      );
      const reservedNames = new Set((folderNode.children ?? []).map((child) => child.name).filter(Boolean));

      let added = 0;
      let skipped = 0;
      let firstRelativePath = null;

      for (const item of list) {
        const sourceUrl = String(item.url ?? '').trim();
        if (!sourceUrl || existingUrls.has(sourceUrl)) {
          skipped += 1;
          continue;
        }

        let clip = null;
        if (String(item.markdown ?? '').trim()) {
          clip = {
            title: item.title || sourceUrl,
            url: sourceUrl,
            summary: String(item.summary ?? '').trim(),
            tags: Array.isArray(item.tags) ? item.tags : [],
            markdown: item.markdown,
          };
        } else {
          try {
            const snapshot = await fetchBookmarkPageSnapshot({ url: sourceUrl });
            clip = await buildBookmarkClipDocument(item, snapshot);
          } catch (error) {
            clip = buildFallbackBookmarkClip(item, error?.message || '正文抓取失败，已保留原链接。');
          }
        }

        const stem = sanitizeBookmarkFileStem(clip.title || item.title || sourceUrl);
        let fileName = `${stem}.md`;
        let index = 1;
        while (reservedNames.has(fileName)) {
          fileName = `${stem} ${index}.md`;
          index += 1;
        }
        reservedNames.add(fileName);

        const relativePath = `${LOCAL_BOOKMARK_FOLDER_RELATIVE_PATH}/${fileName}`;
        await createLocalProjectFileOnDisk({
          projectRootPath: initialWorkspace.projectRootPath,
          relativePath,
          content: clip.markdown,
        });
        await saveLocalProjectMetadata({
          projectRootPath: initialWorkspace.projectRootPath,
          relativePath,
          metadata: {
            nodeType: 'bookmark',
            summary: clip.summary,
            tags: clip.tags,
            url: clip.url,
          },
        });

        existingUrls.add(sourceUrl);
        if (!firstRelativePath) {
          firstRelativePath = relativePath;
        }
        added += 1;
      }

      const finalWorkspace = await ensureMdRenderWorkspace();
      hydrateProjectsWorkspace(finalWorkspace);

      if (firstRelativePath) {
        const nextWorkspace = useEditorStore.getState().workspace;
        const nextId = findNodeIdByRelativePath(nextWorkspace, firstRelativePath);
        if (nextId) {
          selectNode(nextId);
        }
      }

      if (added > 0) {
        message.success(`已保存 ${added} 条书签到本地目录${skipped ? `，跳过 ${skipped} 条重复` : ''}`);
      } else if (skipped > 0) {
        message.info(`没有新增书签，已跳过 ${skipped} 条重复`);
      }

      return { added, skipped, folderId };
    } catch (error) {
      message.error(error?.message || '导入书签失败');
      throw error;
    }
  }, [hydrateProjectsWorkspace, importBookmarks, localProjectSupported, selectNode]);

  const handleCaptureCanvasLibraryItems = useCallback(async (libraryItems) => {
    const bookmarkItems = (Array.isArray(libraryItems) ? libraryItems : [])
      .map((item) => extractCanvasBookmarkCandidate(item))
      .filter(Boolean)
      .map((item) => ({
        ...item,
        markdown: buildBookmarkClipMarkdown({
          title: item.title,
          sourceUrl: item.url,
          createdAt: Date.now(),
          description: item.summary,
          tags: item.tags,
          bodyMarkdown: item.content,
        }),
      }));

    if (!bookmarkItems.length) {
      message.warning('选区里没有可保存的链接');
      return { added: 0, skipped: 0, folderId: null };
    }

    const previousSelectedId = useEditorStore.getState().selectedId;
    const previousSurface = useEditorStore.getState().surface;

    try {
      const result = await handleImportBookmarks(bookmarkItems);
      if (previousSelectedId && findNodeById(useEditorStore.getState().workspace, previousSelectedId)) {
        selectNode(previousSelectedId);
      }
      if (previousSurface === 'canvas') {
        setSurface('canvas');
      }
      return result;
    } catch (error) {
      if (previousSelectedId && findNodeById(useEditorStore.getState().workspace, previousSelectedId)) {
        selectNode(previousSelectedId);
      }
      if (previousSurface === 'canvas') {
        setSurface('canvas');
      }
      throw error;
    }
  }, [handleImportBookmarks, selectNode, setSurface]);

  useEffect(() => {
    applyThemeToBody(theme);
  }, [theme]);

  useEffect(() => {
    if (surface !== 'notion') {
      setNotionMessage('');
      setNotionError('');
    }
  }, [surface]);

  useEffect(() => {
    return () => {
      for (const timerId of projectSaveTimersRef.current.values()) {
        window.clearTimeout(timerId);
      }
      projectSaveTimersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!diskSaveCancelFileIds?.length) return;
    diskSaveCancelFileIds.forEach((fileId) => {
      const timerId = projectSaveTimersRef.current.get(fileId);
      if (timerId) {
        window.clearTimeout(timerId);
        projectSaveTimersRef.current.delete(fileId);
      }
      setDiskSavePending(fileId, false);
    });
  }, [diskSaveCancelSeq, diskSaveCancelFileIds, setDiskSavePending]);

  useEffect(() => {
    if (!localProjectSupported) return undefined;
    let cancelled = false;

    (async () => {
      try {
        const result = await ensureMdRenderWorkspace();
        if (cancelled || !result?.projectRootPath) return;
        useEditorStore.getState().hydrateProjectsWorkspace(result);
        useEditorStore.getState().hydrateDailyWorkspaceFromDisk(result.projectRootPath);
      } catch (error) {
        console.error('初始化 MdRender 本地目录失败:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [localProjectSupported]);

  // 非 MD 文件：加载原始内容用于预览（不自动转为 Markdown）
  useEffect(() => {
    if (!localProjectSupported || !selectedNeedsConversion) {
      setPreviewData({ rawContent: '', fileUrl: '', previewHtml: '', excelSheets: null });
      return undefined;
    }
    if (!selectedFile?.projectRootPath || !selectedFile?.relativePath) return undefined;

    let cancelled = false;
    setPreviewLoading(true);

    (async () => {
      try {
        const result = await readLocalProjectFileContent({
          projectRootPath: selectedFile.projectRootPath,
          relativePath: selectedFile.relativePath,
        });
        if (cancelled) return;

        const data = { rawContent: '', fileUrl: '', previewHtml: '', excelSheets: null };
        const fileExt = (selectedFile.name.match(/\.[^.]+$/) || [''])[0].toLowerCase();

        if (result?.encoding === 'fileUrl') {
          // 媒体文件 — 直接用 file URL
          data.fileUrl = result.data;
        } else if (result?.encoding === 'base64' && (fileExt === '.xlsx' || fileExt === '.xls')) {
          // Excel 文件 — 用 SheetJS 解析为 sheet 数据
          try {
            const XLSX = await import('xlsx');
            const binary = atob(result.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const workbook = XLSX.read(bytes, { type: 'array' });
            data.excelSheets = workbook.SheetNames.map((name) => ({
              name,
              rows: XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' }),
            }));
          } catch {
            data.rawContent = '（无法预览此 Excel 文件）';
          }
        } else if (result?.encoding === 'base64') {
          // DOCX 等二进制 — 转为 HTML 预览
          try {
            const mammoth = await import('mammoth');
            const binary = atob(result.data);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            const { value: html } = await mammoth.convertToHtml({ arrayBuffer: bytes.buffer });
            data.previewHtml = html;
            data.rawContent = result.data; // 保留 base64 用于转 Markdown
          } catch {
            data.rawContent = '（无法预览此二进制文件）';
          }
        } else {
          // 文本文件
          data.rawContent = result?.data ?? '';
        }

        if (!cancelled) setPreviewData(data);
      } catch (error) {
        console.error('加载文件预览失败:', error);
        if (!cancelled) setPreviewData({ rawContent: `加载失败：${error?.message || ''}`, fileUrl: '', previewHtml: '' });
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [localProjectSupported, selectedFile?.id, selectedNeedsConversion]);

  // 「转为 Markdown 编辑」：将预览内容转换后作为新 md 文件
  const handleConvertPreviewToMarkdown = useCallback(async () => {
    if (!selectedFile) return;
    try {
      const raw = previewData.rawContent || '';
      const mdText = normalizeMarkdown(await convertToMarkdown(selectedFile.name, raw));
      const stem = selectedFile.name.replace(/\.[^.]+$/, '').trim() || '转换';

      if (localProjectSupported) {
        const target = await resolveLocalCreateTarget();
        if (!target) { alert('无法定位本地 Projects 目录'); return; }
        const name = buildUniqueNameInFolder(target.parentFolder, stem, '.md');
        const relativePath = target.parentRelativePath ? `${target.parentRelativePath}/${name}` : name;
        const result = await createLocalProjectFileOnDisk({
          projectRootPath: target.projectRootPath, relativePath, content: mdText,
        });
        const node = createLocalProjectFileNode(target.projectRootPath, result.relativePath, name, mdText);
        node.updatedAt = result.updatedAt;
        insertLocalProjectNode(target.parentFolderId, node);
        setContentResetKey((k) => k + 1);
        return;
      }

      const { selectedId: sid, addFile } = useEditorStore.getState();
      if (!addFile(sid)) { alert('无法新建文件'); return; }
      const after = useEditorStore.getState();
      after.updateSelectedFileContent(mdText);
      const uniqueName = buildUniqueName(after.workspace, stem, '.md');
      after.applyRename(after.selectedId, uniqueName);
      setContentResetKey((k) => k + 1);
    } catch (error) {
      console.error('转换为 Markdown 失败:', error);
      alert(error?.message || '转换失败');
    }
  }, [selectedFile, previewData, localProjectSupported, insertLocalProjectNode, resolveLocalCreateTarget]);

  useEffect(() => {
    syncMarkdownFromSelectedFile();
    syncSelectedIdFromWorkspace();
  }, [selectedFile, workspace, markdown, syncMarkdownFromSelectedFile, syncSelectedIdFromWorkspace]);

  // 选中即引用：在编辑器里选中文字（松开鼠标/键），自动写入 store 供 AI 助手引用。
  // 覆盖式更新；选区折叠（点空白）不清空，保留引用，由用户从 chip 上的 × 移除。
  useEffect(() => {
    const commitSelection = () => {
      const text = getSelectedEditorText();
      if (text) setAiQuotedSelection(text);
    };
    document.addEventListener('mouseup', commitSelection);
    document.addEventListener('keyup', commitSelection);
    return () => {
      document.removeEventListener('mouseup', commitSelection);
      document.removeEventListener('keyup', commitSelection);
    };
  }, [setAiQuotedSelection]);

  return (
    <div className={`container immersive-shell${macWindowed ? ' mac-windowed' : ''}`}>
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImport}
        aria-hidden
      />
      <input
        ref={markdownImportInputRef}
        type="file"
        accept={IMPORT_ACCEPT}
        style={{ display: 'none' }}
        onChange={handleImportMarkdown}
        data-testid="import-markdown-input"
        aria-hidden
      />
      <WorkspaceSidebar
        workspace={workspace}
        selectedId={selectedId}
        onSelect={handleSidebarSelect}
        onRemoveLocalProject={handleRemoveLocalProject}
        onManualSyncLocalProject={handleManualSyncLocalProject}
        onAddFile={handleAddFile}
        onAddFolder={handleAddFolder}
        onMoveNode={moveNode}
        onPinNode={pinNode}
        onRevealLocalProjectEntry={localProjectSupported ? handleRevealLocalProjectEntry : null}
        onRename={handleRename}
        onDelete={handleDelete}
        onImportMarkdown={localProjectSupported || !selectedInLocalProject
          ? () => markdownImportInputRef.current?.click()
          : null}
        onExportMarkdown={handleExportMarkdown}
        onExportAs={handleExportAs}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        surface={surface}
        onOpenDaily={() => {
          setDailyCurrentDate(getTodayDateKey());
          setSurface('daily');
        }}
        onOpenOverview={() => setSurface('overview')}
        onOpenCanvas={() => setSurface('canvas')}
        onOpenSearch={() => setSurface('search')}
        onOpenGraph={() => setSurface('graph')}
        onOpenCurrentContent={() => setSurface(selectedContentSurface)}
        searchQuery={knowledgeSearchQuery}
        onSearchQueryChange={setKnowledgeSearchQuery}
        onOpenSettings={() => setSurface(surface === 'settings' ? lastContentSurfaceRef.current : 'settings')}
        onOpenSync={() => {
          if (surface === 'sync') {
            setSurface(lastContentSurfaceRef.current);
          } else {
            setSyncChannel('notion');
            setSurface('sync');
          }
        }}
        settingsActive={surface === 'settings'}
        syncActive={surface === 'sync'}
        platformOptions={publishingPlatforms}
      />
      <div className="right-area immersive-main">
        <UpdateNotifier />
        {/* Obsidian 风格标签页栏 */}
        <TabBar
          tabs={displayTabs}
          activeId={selectedId}
          onSelect={selectNode}
          onClose={closeTab}
          onCloseAll={closeAllTabs}
          onCloseOthers={closeOtherTabs}
          onCloseToTheRight={closeTabsToTheRight}
          onOpenExternal={handleOpenBookmarkTabExternal}
          trailing={(
            <div className="tab-bar-actions">
              <button
                type="button"
                className={`theme-toggle-btn titlebar-agent-toggle${agentPanelOpen ? ' is-open' : ''}`}
                onClick={() => setAgentPanelOpen((v) => !v)}
                aria-label={agentPanelOpen ? '关闭 AI 助手' : '打开 AI 助手'}
                aria-pressed={agentPanelOpen}
                title={agentPanelOpen ? '关闭 AI 助手' : '打开 AI 助手'}
              >
                <Bot size={18} strokeWidth={1.7} />
              </button>
              <ThemeToggleButton theme={theme} onThemeChange={setTheme} />
            </div>
          )}
        />

        <div className="immersive-main-row">
          <div className="immersive-main-content">
        {surface === 'settings' ? (
          <SettingsPanel
            selectedFileName={selectedFile?.name}
            copyStyle={copyStyle}
            publishingPlatforms={publishingPlatforms}
            storageMode={visibleStorageMode}
            projectRootPath={visibleProjectRootPath}
            notionProxyBase={notionProxyBase}
            onNotionProxyBaseChange={setNotionProxyBase}
            onCopyStyleChange={setCopyStyle}
            onPublishingPlatformsChange={setPublishingPlatforms}
            onClose={() => setSurface(lastContentSurfaceRef.current)}
          />
        ) : surface === 'sync' ? (
          <SyncPanel
            initialChannel={syncChannel}
            selectedFileName={selectedFile?.name}
            localProjectSupported={localProjectSupported}
            onClose={() => setSurface(lastContentSurfaceRef.current)}
            notion={{
              canSync: Boolean(selectedFile),
              token: notionToken,
              pageId: linkedNotionPageId,
              databaseId: notionDatabaseId,
              onTokenChange: setNotionToken,
              onPageIdChange: (v) => {
                if (selectedFile) setFileNotionPageId(selectedFile.id, v);
              },
              onDatabaseIdChange: setNotionDatabaseId,
              onPull: handleNotionPull,
              onPush: handleNotionPush,
              onDatabasePull: localProjectSupported ? handleIncrementalPull : handleBatchPull,
              onDatabasePush: handleBatchPush,
              pullLoading: notionPullLoading,
              pushLoading: notionPushLoading,
              databasePullLoading: localProjectSupported ? incrementalPullLoading : batchPullLoading,
              databasePushLoading: batchPushLoading,
              incrementalActive: localProjectSupported,
              batchProgress,
              message: notionMessage,
              error: notionError,
            }}
            cloud={{
              baseUrl: cloudSyncBaseUrl,
              workspaceId: cloudWorkspaceId,
              lastSyncedRevision: cloudLastSyncedRevision,
              lastSyncedAt: cloudLastSyncedAt,
              loading: cloudSyncLoading,
              message: cloudSyncMessage,
              error: cloudSyncError,
              conflict: cloudSyncConflict,
              onBaseUrlChange: setCloudSyncBaseUrl,
              onWorkspaceIdChange: setCloudWorkspaceId,
              onUpload: handleCloudUpload,
              onPull: handleCloudPull,
              onForceUpload: handleCloudForceUpload,
              onUseRemote: handleCloudUseRemote,
            }}
            local={{
              localProjectSupported,
              canSyncFromDisk: canSyncWorkspaceFromDisk,
              syncLoading: manualSyncLoading,
              onOpenLocalProject: handleOpenLocalProject,
              onSyncFromDisk: () => handleManualSyncLocalProject(currentWorkspaceProjectRoot),
            }}
            workspace={{
              onImport: () => importInputRef.current?.click(),
              onExport: handleExport,
            }}
          />
        ) : surface === 'folder' && selectedFolder ? (
          <FolderFileList
            folder={selectedFolder}
            children={folderChildren}
            onSelectItem={selectNode}
            showSyncButton={canManualSyncLocalProject}
            syncLoading={manualSyncLoading}
            onSyncFromDisk={handleManualSyncLocalProject}
          />
        ) : surface === 'daily' ? (
          <DailyNotebook
            dailyWorkspace={dailyWorkspace}
            onSetCurrentDate={setDailyCurrentDate}
            onAddItem={addDailyItem}
            onToggleTaskDone={toggleDailyTaskDone}
            onDeleteItem={deleteDailyItem}
            onUpdateItem={updateDailyItem}
            onMoveItem={moveDailyItem}
            onMoveItems={moveDailyItems}
            onMoveTaskToTodo={moveDailyTaskToTodo}
            onAddTodo={addTodoItem}
            onPromoteTodo={promoteTodoToDaily}
            onRemoveTodo={removeTodoItem}
            onUpdateItemPriority={updateDailyItemPriority}
            onUpdateItemCategory={updateDailyItemCategory}
            onUpdateTodoCategory={updateTodoItemCategory}
          />
        ) : surface === 'overview' ? (
          <CreationDashboard
            recentDrafts={recentDrafts}
            topicQueue={topicQueue}
            materialInbox={materialInbox}
            readyToPublish={readyToPublish}
            onCreate={handleCreateDraftFromDashboard}
            onOpenItem={handleDashboardOpenItem}
            onViewSection={handleDashboardViewSection}
          />
        ) : surface === 'canvas' ? (
          <CanvasSurface
            canvasState={canvasState}
            items={canvasSurfaceItems}
            addableItems={canvasItems}
            edges={canvasState.edges}
            viewport={canvasState.viewport}
            theme={theme}
            onChange={handleCanvasChange}
            onClearCanvas={handleClearCanvas}
            onViewportChange={handleCanvasViewportChange}
            onCaptureLibraryItems={handleCaptureCanvasLibraryItems}
            onOpenFile={selectNode}
          />
        ) : surface === 'creation-board' ? (
          <CreationBoardPanel
            items={creationBoardItems}
            statusOptions={CREATION_STATUS_OPTIONS}
            platformOptions={publishingPlatforms}
            onOpenItem={handleBoardOpenItem}
            onMoveStatus={handleBoardMoveStatus}
            onCreate={handleCreateEntryWithStatus}
          />
        ) : surface === 'publishing' ? (
          <PublishingQueuePanel
            items={publishingQueueItems}
            platformOptions={publishingPlatforms}
            onOpenItem={handleBoardOpenItem}
            onSchedule={handlePublishingSchedule}
            onOpenSearch={handlePublishingOpenSearch}
            onCreate={() => handleCreateEntryWithStatus('ready')}
          />
        ) : surface === 'search' || surface === 'graph' ? (
          <KnowledgeBasePanel
            mode={surface}
            workspace={workspace}
            selectedFile={selectedFile}
            selectedFolder={selectedFolder}
            searchQuery={knowledgeSearchQuery}
            onSearchQueryChange={setKnowledgeSearchQuery}
            onOpenFile={selectNode}
            onOpenFolder={selectNode}
            onOpenSurface={setSurface}
            onImportBookmarks={() => setBookmarkImportOpen(true)}
          />
        ) : selectedUsesBookmarkCard ? (
          <BookmarkCard file={selectedFile} />
        ) : selectedNeedsConversion ? (
          <FilePreviewPanel
            file={selectedFile}
            previewHtml={previewData.previewHtml}
            rawContent={previewData.rawContent}
            fileUrl={previewData.fileUrl}
            excelSheets={previewData.excelSheets}
            loading={previewLoading}
            onConvertToMarkdown={handleConvertPreviewToMarkdown}
          />
        ) : (
          <>
            {/* 面包屑 */}
            <div className="obsidian-header-bar">
              <Breadcrumb workspace={workspace} selectedId={selectedId} onNavigate={selectNode} />
            </div>

            <DocHeader
              selectedFile={selectedFile}
              allFiles={allFiles}
              platformOptions={publishingPlatforms}
              onOpenNotion={() => { setSyncChannel('notion'); setSurface('sync'); }}
              notionLinked={Boolean(notionAvailable && linkedNotionPageId && notionToken?.trim())}
              onTagsChange={setFileTags}
              onKnowledgeMetaChange={setFileKnowledgeMeta}
              onOpenFile={selectNode}
              onRestoreVersion={updateSelectedFileContent}
              titleEditable={!selectedInLocalProject}
              {...titleEditing}
            />
            <EditorQuickToolbar
              editor={editor}
              disabled={!selectedFile}
              onPreviewWeChat={() => setWechatPreviewOpen(true)}
              onCopyWeChat={handleCopyToWeChat}
              onCopyRichText={handleCopyRichText}
              copyStyleName={getTemplateById(copyStyle).name}
            />
            <div className="editor-layout">
              <div className="paper-stage">
                <div className="paper-surface" data-testid="paper-surface">
                  <DiffOverlay />
                  {editorMode === 'preview' ? (
                    <div
                      id="markdown-output"
                      className="paper-content"
                      dangerouslySetInnerHTML={{ __html: wechatSourceHtml }}
                    />
                  ) : (
                    <div id="markdown-output" className="paper-content">
                      <div className="blocknote-paper" onClick={handlePaperClick}>
                        <BlockNoteView
                          editor={editor}
                          className="blocknote-editor"
                          data-testid="blocknote-editor"
                          theme={resolvedTheme}
                          editable={Boolean(selectedFile) && !selectedReadOnly}
                          formattingToolbar
                          linkToolbar
                          slashMenu
                          sideMenu={false}
                          filePanel={false}
                          tableHandles
                          emojiPicker={false}
                          onChange={handleEditorChange}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <TocPanel
                markdown={markdown}
                collapsed={tocCollapsed}
                onToggle={toggleTocCollapsed}
              />
            </div>
            {/* 底部状态栏 */}
            <StatusBar content={resolvedMarkdown} backlinks={0} />
          </>
        )}
          </div>
          {agentPanelOpen && (
            <div className="agent-panel-dock agent-panel-dock--sidebar">
              <AgentPanel onClose={() => setAgentPanelOpen(false)} />
            </div>
          )}
        </div>
      </div>

      <WechatPreviewModal
        open={wechatPreviewOpen}
        onClose={() => setWechatPreviewOpen(false)}
        sourceHtml={wechatSourceHtml}
        initialTemplateId={copyStyle}
        onTemplateChange={setCopyStyle}
      />

      <BookmarkImportModal
        open={bookmarkImportOpen}
        onClose={() => setBookmarkImportOpen(false)}
        onImport={handleImportBookmarks}
      />

      <ImageLightbox
        images={lightbox.images}
        index={lightbox.index}
        onClose={closeLightbox}
        onIndexChange={changeLightboxIndex}
      />
    </div>
  );
}

export default MarkdownEditor;
