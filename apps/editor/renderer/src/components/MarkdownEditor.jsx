import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteEditor, createCodeBlockSpec } from '@blocknote/core';
import { buildSchema } from '@narrative/blocknote-core';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import DocHeader from './DocHeader.jsx';
import ExternalChangeBanner from './ExternalChangeBanner.jsx';
import EditorQuickToolbar from './EditorQuickToolbar.jsx';
import EditorFormattingToolbarController from './EditorFormattingToolbar.jsx';
import EditorSlashMenu from './EditorSlashMenu.jsx';
import EditorDocLinks from './EditorDocLinks.jsx';
import { useOpenWikilink } from '../hooks/useWikilinkNavigation.js';
import FolderFileList from './FolderFileList.jsx';
import DocEmptyState from './DocEmptyState.jsx';
import CreationDashboard from './CreationDashboard.jsx';
import CreationBoardPanel from './CreationBoardPanel.jsx';
import CanvasSurface from './CanvasSurface.jsx';
import DailyNotebook from './DailyNotebook.jsx';
import KnowledgeBasePanel from './KnowledgeBasePanel.jsx';
import PublishingQueuePanel from './PublishingQueuePanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import PreparePublishModal from './PreparePublishModal.jsx';
import WechatPreviewModal from './WechatPreviewModal.jsx';
import VersionHistoryModal from './VersionHistoryModal.jsx';
import BookmarkImportModal from './BookmarkImportModal.jsx';
import ImageLightbox from './ImageLightbox.jsx';
import BookmarkCard from './BookmarkCard.jsx';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import FilePreviewPanel from './FilePreviewPanel.jsx';
import TocPanel from './TocPanel.jsx';
import CommentsPanel from './CommentsPanel.jsx';
import AgentPanel from './AgentPanel.jsx';
import DiffOverlay from './DiffOverlay.jsx';
import EditorTopBar from './EditorTopBar.jsx';
import StatusBar from './StatusBar.jsx';
import UpdateNotifier from './UpdateNotifier.jsx';
import CommandPalette from './CommandPalette.jsx';
import {
  buildCodeBlockClipboardHtml,
  createEmptyDocument,
  extractCodeBlockFromClipboardHtml,
  getBlockTextContent,
  getMarkdownCodeFenceLanguage,
  isBlockNoteContent,
  parseBlockNoteContent,
  resolvePendingImagesInContent,
  serializeBlockNoteContent,
  looksLikeCodeBlockClipboardHtml,
  looksLikeMarkdownCodeFenceClipboardText,
  looksLikeMarkdownClipboardText,
  looksLikePlainTextHtml,
  isVsCodeMarkdownClipboard,
  normalizeFrontmatterForPaste,
  normalizeMarkdown,
  tightenListSpacing,
} from '../utils/markdownUtils';
import {
  rewriteMarkdownImagesForDisk,
  rewriteMarkdownImagesForEditor,
} from '../utils/localMediaMarkdown.js';
import { applyThemeToBody } from '../utils/themeUtils';
import { stripFileExtension } from '../utils/fileDisplayName.js';
import { docFilePath, findDocByWikiName, listWorkspaceDocs } from '../utils/docMentionItems.js';
import { wikilinksToPathLinks } from '../utils/wikilinkText.js';
import { copyToWeChat } from '../utils/wechatCopy';
import { copyHtmlWithExecCommand } from '../utils/clipboardUtils.js';
import { getTemplateById } from '../utils/wechatTemplates';
import { MarkdownParser, MarkdownRenderer } from '../core';
import { useMacTitlebarInset } from '../hooks/useMacTitlebarInset.js';
import {
  classifyClipboardFiles,
  flushPendingImageLifecycles,
  hasPendingImageClipboardData,
  hasPendingImagePlaceholders,
  insertImagesFromFiles,
  reconcilePendingImages,
  trackPendingImageLifecycle,
  useEditorImageUpload,
} from '../hooks/useEditorImageUpload.js';
import { useTitleEditing } from '../hooks/useTitleEditing.js';
import { useWorkspaceActions } from '../hooks/useWorkspaceActions.js';
import { useLocalProjectWatcher } from '../hooks/useLocalProjectWatcher.js';
import { useMermaidPreview } from '../hooks/useMermaidPreview.js';
import { handleLeadingEmptyBlockBackspace } from '../utils/leadingEmptyBlock.js';
import { useTwoStageSelectAll } from '../hooks/useTwoStageSelectAll.js';
import { useSkillRegistry } from '../hooks/useSkillRegistry.js';
import { filterSkillsByEntry } from '../core/agent/skillRegistry.js';
import { useAgentRuntime } from '../hooks/useAgentRuntime.js';
import { useVaultStorage } from '../hooks/useVaultStorage.js';
import { AGENT_HOST_DIALOGS } from './agentHostDialogs.jsx';
import {
  buildPlatformDraftContent,
  buildPlatformDraftFileName,
} from '../core/agent/publishPreparation.js';
import useCommandPalette from '../hooks/useCommandPalette.js';
import { createCommands } from '../core/commands/commandRegistry.js';
import { hasDbBridge } from '../services/electronBridge.js';
import {
  flushTauriCloseDrains,
  listenForTauriClose,
  registerTauriCloseDrain,
} from '../services/desktopCloseBridge.js';
import { openExternalUrl } from '../services/desktopShellBridge.js';
import { FILE_CONVERT_TOOLS, isFileConvertSupported } from '../services/fileConvertTools.js';
import { useFileConvertTool } from '../hooks/useFileConvertTool.js';
import { useImageLightbox } from '../hooks/useImageLightbox.js';
import { useOutlinePage } from '../hooks/useOutlinePage.js';
import { PAGE_LAYOUT_KEY, PAGE_LAYOUT_OUTLINE, PAGE_LAYOUT_SCRIPT, withTitleHeading } from '@shared/outline/outlineTree.js';
import { useScriptPage } from '../hooks/useScriptPage.js';
import ScriptPanel from './script/ScriptPanel.jsx';
import MindMapView from './outline/MindMapView.jsx';
import OutlineViewSwitch from './outline/OutlineViewSwitch.jsx';
import LocalProjectConflictModal from './LocalProjectConflictModal.jsx';
import {
  buildActiveTopicSummary,
  collectPendingMaterials,
  collectPendingPublishDrafts,
  collectRecentDrafts,
  CREATION_STATUS_OPTIONS,
  getDocumentStatus,
} from '../store/creationUtils.js';
import {
  flushDesktopStatePersistence,
  useEditorStore,
  useSelectedFile,
} from '../store/useEditorStore.js';
import { countOpenThreads } from '../utils/commentThreads.js';
import {
  buildUniqueName,
  buildUniqueNameInFolder,
  buildUniqueRenameNameInFolder,
  canMoveNodeToFolder,
  resolveDiskMoveParentPath,
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
  createLocalProjectFileOnDisk,
  createLocalProjectFolderOnDisk,
  deleteLocalProjectEntryOnDisk,
  ensureMdRenderWorkspace,
  fetchBookmarkPageSnapshot,
  flushLocalProjectMutations,
  getLocalProjectCapabilities,
  isLocalProjectSupported,
  isDesktopProjectSupported,
  openLocalProject,
  readLocalProjectDisk,
  readLocalProjectFileContent,
  revealLocalProjectEntry,
  revokeLocalProjectAccess,
  renameLocalProjectEntryOnDisk,
  saveLocalProjectFile,
  saveLocalProjectMetadata,
} from '../utils/localProjectBridge.js';
import '../styles/styles.css';

const JsonTool = lazy(() => import('@md-render/json-tool').then((module) => ({
  default: module.JsonTool,
})));

// 只有真正在看文档/文件夹时才显示文档标签页。
// 其余都是独立空间：overview(内容创作首页)/daily/canvas/creation-board/
// publishing/json-tool/search/graph/settings
const DOC_TAB_SURFACES = new Set(['paper', 'folder']);
const LOCAL_PROJECT_REAUTHORIZATION_REQUIRED = 'reauthorization-required';

const needsLocalProjectReauthorization = (node) => (
  node?.access === LOCAL_PROJECT_REAUTHORIZATION_REQUIRED
);

const findLocalProjectRootByPath = (node, projectRootPath) => {
  if (!node || !projectRootPath) return null;
  if (node.localProjectRoot && node.projectRootPath === projectRootPath) return node;
  if (!Array.isArray(node.children)) return null;
  for (const child of node.children) {
    const match = findLocalProjectRootByPath(child, projectRootPath);
    if (match) return match;
  }
  return null;
};

const collectLocalProjectRelativePaths = (
  node,
  paths = new Set(),
  rootRelativePath = node?.relativePath ?? '',
  isRoot = true,
) => {
  if (!node) return paths;
  const relativePath = String(node.relativePath ?? '');
  const normalizedPath = rootRelativePath && relativePath.startsWith(`${rootRelativePath}/`)
    ? relativePath.slice(rootRelativePath.length + 1)
    : relativePath;
  if (!isRoot && normalizedPath) paths.add(`${node.type}:${normalizedPath}`);
  node.children?.forEach?.((child) => (
    collectLocalProjectRelativePaths(child, paths, rootRelativePath, false)
  ));
  return paths;
};

const matchesLocalProjectSnapshot = (snapshot, selectedWorkspace) => {
  if (!snapshot || !selectedWorkspace || snapshot.name !== selectedWorkspace.name) return false;
  const snapshotPaths = collectLocalProjectRelativePaths(snapshot);
  const selectedPaths = collectLocalProjectRelativePaths(selectedWorkspace);
  if (snapshotPaths.size < 3 || selectedPaths.size < 3) {
    return snapshotPaths.size === selectedPaths.size
      && [...snapshotPaths].every((path) => selectedPaths.has(path));
  }
  const commonCount = [...snapshotPaths].filter((path) => selectedPaths.has(path)).length;
  return commonCount >= 3
    && commonCount / snapshotPaths.size >= 0.75
    && commonCount / selectedPaths.size >= 0.5;
};

const getReauthorizedProjectIdentity = (snapshot) => {
  if (snapshot?.localProjectRoot) return snapshot.projectRootPath;
  const nodeId = String(snapshot?.id ?? '');
  if (nodeId) return nodeId.replace(/^project:/, '');
  return snapshot?.projectRootPath;
};

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

// 亮/暗双主题：token 只输出 --shiki-light / --shiki-dark 两个 CSS 变量，
// 由 styles.css 按当前主题取色，切主题不用重新高亮。
const CODE_BLOCK_THEMES = { light: 'github-light', dark: 'github-dark' };

const createCodeBlockHighlighter = async () => {
  const { createHighlighter } = await import('shiki');
  const highlighter = await createHighlighter({
    themes: Object.values(CODE_BLOCK_THEMES),
    langs: Object.keys(CODE_BLOCK_LANGUAGES),
  });

  // BlockNote 调 codeToTokens 时只传单主题，这里拦一下换成双主题
  return new Proxy(highlighter, {
    get(target, key) {
      if (key !== 'codeToTokens') return Reflect.get(target, key);
      return (code, options) => target.codeToTokens(code, {
        lang: options?.lang,
        themes: CODE_BLOCK_THEMES,
        defaultColor: false,
      });
    },
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

const mediaContextFromFile = (file) => ({
  projectRootPath: file?.projectRootPath || '',
  noteRelativePath: file?.relativePath || '',
});

const contentToDiskMarkdown = (content, mediaContext) => {
  const blocks = parseBlockNoteContent(content);
  const markdown = blocks
    ? normalizeMarkdown(BlockNoteEditor.create(BLOCKNOTE_OPTIONS).blocksToMarkdownLossy(blocks))
    : normalizeMarkdown(content);
  return rewriteMarkdownImagesForDisk(markdown, mediaContext);
};

/** 迁移用：BlockNote 旧格式正文转 Markdown，普通 Markdown 原样返回 */
const blockNoteContentToMarkdown = (content) => {
  const blocks = parseBlockNoteContent(content);
  return blocks ? normalizeMarkdown(BlockNoteEditor.create(BLOCKNOTE_OPTIONS).blocksToMarkdownLossy(blocks)) : content;
};

/** 存储正文（BlockNote JSON 或 Markdown）→ 编辑器块，版本恢复时整篇替换用 */
const contentToEditorBlocks = (content, mediaContext) => {
  const blocks = parseBlockNoteContent(content);
  if (blocks?.length) return blocks;
  const source = rewriteMarkdownImagesForEditor(normalizeMarkdown(content ?? ''), mediaContext);
  if (!source) return createEmptyDocument();
  const parsed = BlockNoteEditor.create(BLOCKNOTE_OPTIONS).tryParseMarkdownToBlocks(source);
  return parsed.length > 0 ? parsed : createEmptyDocument();
};

const DEFAULT_PASTE_MIME_TYPES = new Set([
  'vscode-editor-data',
  'blocknote/html',
  'text/markdown',
]);
const PROJECT_SAVE_DEBOUNCE_MS = 400;

const shouldUseDefaultPasteMime = (clipboardData) => (
  Array.from(clipboardData?.types ?? []).some((type) => DEFAULT_PASTE_MIME_TYPES.has(type))
);

const hasLocalProjectNode = (node) => {
  if (!node) return false;
  if (node.localProjectRoot) return true;
  if (!Array.isArray(node.children)) return false;
  return node.children.some((child) => hasLocalProjectNode(child));
};

const findProjectNodeByRelativePath = (node, projectRootPath, relativePath) => {
  if (!node) return null;
  if (node.projectRootPath === projectRootPath && node.relativePath === relativePath) return node;
  if (node.type !== 'folder') return null;
  for (const child of node.children ?? []) {
    const found = findProjectNodeByRelativePath(child, projectRootPath, relativePath);
    if (found) return found;
  }
  return null;
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
    projectRootPath,
    publishingPlatforms,
    setTheme,
    setCopyStyle,
    setPublishingPlatforms,
    setSurface,
    setDailyCurrentDate,
    setDailyBlocks,
    setDailyNoteOrganized,
    hydrateDailyWorkspaceFromDisk,
    setWorkspaceCanvas,
    setFileTags,
    setFileKnowledgeMeta,
    setFileFrontmatterProperty,
    toggleSidebarCollapsed,
    toggleTocCollapsed,
    updateSelectedFileContent,
    selectNode,
    openLocalProjectWorkspace,
    addFile,
    addFolder,
    createGeneratedFile,
    moveNode,
    pinNode,
    applyRename,
    deleteNode,
    replaceDiskBackedNode,
    removeDiskBackedNode,
    localProjectConflict,
    resolveLocalProjectConflict,
    dismissLocalProjectConflict,
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
  const commentsPanelOpen = useEditorStore((state) => state.commentsPanelOpen);
  const setCommentsPanelOpen = useEditorStore((state) => state.setCommentsPanelOpen);
  const headingNumbering = useEditorStore((state) => state.headingNumbering);
  const toggleHeadingNumbering = useEditorStore((state) => state.toggleHeadingNumbering);
  const openCommentCount = useEditorStore((state) => countOpenThreads(state.commentThreads, state.selectedId));
  // 评论面板展开时占住右侧，目录先让开
  const commentsVisible = commentsPanelOpen && editorMode !== 'preview';
  const publishingPlatformLabelMap = useMemo(
    () => buildPublishingPlatformLabelMap(publishingPlatforms),
    [publishingPlatforms],
  );

  const selectedFile = useSelectedFile();
  const selectedReadOnly = Boolean(selectedFile?.readOnly);
  const selectedNode = useMemo(() => findNodeById(workspace, selectedId), [workspace, selectedId]);
  const selectedFolder = selectedNode?.type === 'folder' ? selectedNode : null;
  const selectedNeedsLocalProjectReauthorization = needsLocalProjectReauthorization(selectedNode);
  // 标题下方元信息里的「所属目录」
  const selectedParentLabel = useMemo(() => {
    const parentId = findParentId(workspace, selectedId);
    if (!parentId || parentId === 'root') return '';
    return findNodeById(workspace, parentId)?.name ?? '';
  }, [workspace, selectedId]);
  const selectedProjectRootPath = selectedNeedsLocalProjectReauthorization
    ? ''
    : (selectedFile?.projectRootPath ?? '');
  const manualSyncProjectRootPath = selectedNeedsLocalProjectReauthorization
    ? ''
    : (selectedFolder?.projectRootPath ?? '');
  const selectedInLocalProject = Boolean(selectedNode?.projectRootPath);
  const selectedUsesBookmarkCard = selectedFile?.nodeType === 'bookmark'
    && !String(selectedFile?.content ?? '').trim();
  const hasLocalProjectWorkspace = useMemo(() => hasLocalProjectNode(workspace), [workspace]);
  const folderChildren = useMemo(
    () => (selectedFolder ? getFolderDirectChildren(selectedFolder) : []),
    [selectedFolder],
  );
  const allFiles = useMemo(() => collectFiles(workspace), [workspace]);
  // 只有文档相关的 surface 才显示文档标签页（今日/画布/搜索/关系图等空间不显示）
  const showDocTabs = DOC_TAB_SURFACES.has(surface);
  const displayTabs = useMemo(() => {
    if (!showDocTabs) return [];
    return openTabs.map((tab) => {
      const node = findNodeById(workspace, tab.id);
      return {
        ...tab,
        nodeType: node?.type === 'file' ? node.nodeType : undefined,
        url: node?.type === 'file' ? String(node.url ?? '').trim() : '',
      };
    });
  }, [showDocTabs, openTabs, workspace]);
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
          readOnly: Boolean(file.readOnly),
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
  const importInputRef = useRef(null);
  const markdownImportInputRef = useRef(null);
  const projectSaveTimersRef = useRef(new Map());
  const projectSaveQueuesRef = useRef(new Map());
  const projectPathChangesRef = useRef(new Map());
  const projectPathChangeDirtyRef = useRef(new Set());
  const activeEditorRef = useRef(null);
  const lastContentSurfaceRef = useRef(surface);
  const previousSurfaceRef = useRef(null);
  const lastSyncedMarkdownRef = useRef(normalizeMarkdown(markdown));
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());
  const localProjectSupported = isLocalProjectSupported();
  const localProjectCapabilities = getLocalProjectCapabilities();
  const canOpenLocalProject = localProjectCapabilities.canOpen;
  const canReadLocalProject = localProjectCapabilities.canRead;
  const canWriteLocalProject = localProjectCapabilities.canWrite;
  const canRevealLocalProject = localProjectCapabilities.canReveal;
  const canUseDefaultWorkspace = localProjectCapabilities.canUseDefaultWorkspace;

  const enqueueProjectFileSave = useCallback((fileId, saveTask) => {
    const previousSave = projectSaveQueuesRef.current.get(fileId) ?? Promise.resolve();
    const queuedSave = previousSave.catch(() => {}).then(saveTask);
    projectSaveQueuesRef.current.set(fileId, queuedSave);
    return queuedSave.finally(() => {
      if (projectSaveQueuesRef.current.get(fileId) === queuedSave) {
        projectSaveQueuesRef.current.delete(fileId);
      }
    });
  }, []);

  const flushPendingProjectFileSaves = useCallback(async () => {
    while (
      projectPathChangesRef.current.size > 0
      || projectSaveTimersRef.current.size > 0
      || projectSaveQueuesRef.current.size > 0
      || Object.keys(useEditorStore.getState().diskSavePendingFileIds ?? {}).length > 0
    ) {
      const pathChanges = [...new Set(projectPathChangesRef.current.values())];
      if (pathChanges.length > 0) {
        await Promise.all(pathChanges);
      }

      const pendingFileIds = [...new Set([
        ...projectSaveTimersRef.current.keys(),
        ...Object.keys(useEditorStore.getState().diskSavePendingFileIds ?? {}),
      ])];
      pendingFileIds.forEach((fileId) => {
        window.clearTimeout(projectSaveTimersRef.current.get(fileId));
        projectSaveTimersRef.current.delete(fileId);
      });

      await Promise.all(pendingFileIds.map(async (fileId) => {
        const file = findNodeById(useEditorStore.getState().workspace, fileId);
        if (!file) {
          setDiskSavePending(fileId, false);
          return;
        }

        const blocks = parseBlockNoteContent(file.content);
        const canSaveFile = canWriteLocalProject
          && file.type === 'file'
          && file.projectRootPath
          && file.relativePath
          && !file.readOnly
          && !file.needsConversion
          && !needsConversion(file.name)
          && !hasPendingImagePlaceholders(blocks);
        if (!canSaveFile) {
          throw new Error(`文档「${file.name || fileId}」还不能安全写入磁盘。`);
        }

        const diskMarkdown = contentToDiskMarkdown(file.content, mediaContextFromFile(file));
        await enqueueProjectFileSave(fileId, () => saveLocalProjectFile({
          projectRootPath: file.projectRootPath,
          relativePath: file.relativePath,
          content: diskMarkdown,
        }));
        useEditorStore.getState().markLocalFileDiskSaved(fileId, diskMarkdown);
        setDiskSavePending(fileId, false);
      }));

      const queuedSaves = [...new Set(projectSaveQueuesRef.current.values())];
      if (queuedSaves.length > 0) {
        await Promise.all(queuedSaves);
      }
    }

    const remainingFileIds = Object.keys(
      useEditorStore.getState().diskSavePendingFileIds ?? {},
    );
    if (remainingFileIds.length > 0) {
      throw new Error(`仍有 ${remainingFileIds.length} 个本地文档未安全写入磁盘。`);
    }
  }, [canWriteLocalProject, enqueueProjectFileSave, setDiskSavePending]);

  const flushPendingDesktopChanges = useCallback(async () => {
    await flushPendingImageLifecycles();
    await flushLocalProjectMutations();
    await flushPendingProjectFileSaves();
    await flushPendingImageLifecycles();
    await flushLocalProjectMutations();
  }, [flushPendingProjectFileSaves]);

  const flushBeforeTauriClose = useCallback(async ({ freezeMutations } = {}) => {
    await flushTauriCloseDrains();
    freezeMutations?.();
    await flushDesktopStatePersistence();
  }, []);

  const beginNodePathChange = useCallback((node) => {
    const trackedFileIds = new Set();
    let release;
    const completion = new Promise((resolve) => {
      release = resolve;
    });

    const trackNode = (targetNode) => {
      const files = targetNode?.type === 'file' ? [targetNode] : collectFiles(targetNode);
      files.forEach((file) => {
        trackedFileIds.add(file.id);
        projectPathChangesRef.current.set(file.id, completion);
      });
    };
    trackNode(node);

    return {
      consumeDirty: () => {
        let dirty = false;
        trackedFileIds.forEach((fileId) => {
          if (projectPathChangeDirtyRef.current.delete(fileId)) dirty = true;
        });
        return dirty;
      },
      finish: () => {
        release();
        trackedFileIds.forEach((fileId) => {
          projectPathChangeDirtyRef.current.delete(fileId);
          if (projectPathChangesRef.current.get(fileId) === completion) {
            projectPathChangesRef.current.delete(fileId);
          }
        });
      },
      trackNode,
    };
  }, []);
  // 仅桌面版为 true：MdRender Projects 目录、增量落盘等能力依赖 Electron
  const desktopProjectSupported = isDesktopProjectSupported();
  // 监听本地项目磁盘变化：外部改动自动刷新，编辑冲突时弹窗
  useLocalProjectWatcher();

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

  const flushFileSaveBeforePathChange = useCallback(async (file) => {
    if (file?.type !== 'file' || !file.projectRootPath || !file.relativePath) return;

    const pendingTimer = projectSaveTimersRef.current.get(file.id);
    const wasDiskSavePending = Boolean(
      useEditorStore.getState().diskSavePendingFileIds?.[file.id],
    );
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
      projectSaveTimersRef.current.delete(file.id);
    }

    await projectSaveQueuesRef.current.get(file.id)?.catch(() => {});
    const latestFile = findNodeById(useEditorStore.getState().workspace, file.id);
    const latestBlocks = parseBlockNoteContent(latestFile?.content);

    // 图片占位等最终 URL 回填后按新路径保存，不将 blob: 写入旧文件。
    if (
      (!pendingTimer && !wasDiskSavePending)
      || latestFile?.type !== 'file'
      || hasPendingImagePlaceholders(latestBlocks)
    ) {
      if (!wasDiskSavePending) setDiskSavePending(file.id, false);
      return;
    }

    setDiskSavePending(file.id, true);
    const diskMarkdown = contentToDiskMarkdown(latestFile.content, mediaContextFromFile(latestFile));
    let saveFailed = false;
    try {
      await enqueueProjectFileSave(file.id, () => saveLocalProjectFile({
        projectRootPath: latestFile.projectRootPath,
        relativePath: latestFile.relativePath,
        content: diskMarkdown,
      }));
    } catch (error) {
      saveFailed = true;
      throw error;
    } finally {
      setDiskSavePending(file.id, saveFailed);
    }
  }, [enqueueProjectFileSave, setDiskSavePending]);

  const flushNodeSavesBeforePathChange = useCallback(async (node) => {
    const files = node?.type === 'file' ? [node] : collectFiles(node);
    await Promise.all(files.map(flushFileSaveBeforePathChange));
  }, [flushFileSaveBeforePathChange]);

  const saveNodeContentAfterPathChange = useCallback(async (node) => {
    const files = node?.type === 'file' ? [node] : collectFiles(node);
    await Promise.all(files.map(async (file) => {
      const blocks = parseBlockNoteContent(file.content);
      const canSaveFile = file.projectRootPath
        && file.relativePath
        && !file.readOnly
        && !file.needsConversion
        && !needsConversion(file.name)
        && !hasPendingImagePlaceholders(blocks);
      if (!canSaveFile) return;

      setDiskSavePending(file.id, true);
      let saveFailed = false;
      try {
        await enqueueProjectFileSave(file.id, () => saveLocalProjectFile({
          projectRootPath: file.projectRootPath,
          relativePath: file.relativePath,
          content: contentToDiskMarkdown(file.content, mediaContextFromFile(file)),
        }));
      } catch (error) {
        saveFailed = true;
        console.error('路径变更后保存文件失败:', error);
        message.error(error?.message || '移动后保存文件失败');
      } finally {
        setDiskSavePending(file.id, saveFailed);
      }
    }));
  }, [enqueueProjectFileSave, setDiskSavePending]);

  const performRename = useCallback(async (targetId, rawName) => {
    const trimmed = String(rawName ?? '').trim();
    if (!trimmed) return false;

    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, targetId);
    if (!node) return false;
    if (node.readOnly) return false;
    const normalizedName = node.type === 'file'
      ? ensureRenameFileName(trimmed, node.name)
      : trimmed;

    if (node.projectRootPath && node.relativePath && canWriteLocalProject) {
      const parentId = findParentId(state.workspace, targetId) ?? state.workspace.id;
      const parent = findNodeById(state.workspace, parentId) ?? state.workspace;

      const diskName = buildUniqueRenameNameInFolder(parent, normalizedName, targetId);
      const newRelativePath = replaceRelativePathBasename(node.relativePath, diskName);
      const pathChange = beginNodePathChange(node);
      let diskPathChanged = false;

      try {
        await flushNodeSavesBeforePathChange(node);
        const result = await renameLocalProjectEntryOnDisk({
          projectRootPath: node.projectRootPath,
          relativePath: node.relativePath,
          newRelativePath,
        });
        diskPathChanged = true;
        useEditorStore.getState().replaceDiskBackedNode(targetId, {
          name: diskName,
          relativePath: result.relativePath ?? newRelativePath,
          updatedAt: result.updatedAt,
        });
        const finalRelativePath = result.relativePath ?? newRelativePath;
        const nextState = useEditorStore.getState();
        let nextNode = findProjectNodeByRelativePath(
          nextState.workspace,
          node.projectRootPath,
          finalRelativePath,
        );
        if (nextNode) pathChange.trackNode(nextNode);
        while (nextNode && pathChange.consumeDirty()) {
          await saveNodeContentAfterPathChange(nextNode);
          const latestState = useEditorStore.getState();
          nextNode = findProjectNodeByRelativePath(
            latestState.workspace,
            node.projectRootPath,
            finalRelativePath,
          );
        }
        (node.type === 'file' ? [node] : collectFiles(node))
          .forEach((file) => setDiskSavePending(file.id, false));
        return true;
      } catch (error) {
        if (!diskPathChanged) {
          let currentNode = findProjectNodeByRelativePath(
            useEditorStore.getState().workspace,
            node.projectRootPath,
            node.relativePath,
          );
          while (currentNode && pathChange.consumeDirty()) {
            await saveNodeContentAfterPathChange(currentNode);
            currentNode = findProjectNodeByRelativePath(
              useEditorStore.getState().workspace,
              node.projectRootPath,
              node.relativePath,
            );
          }
        }
        console.error('重命名本地文件失败:', error);
        message.error(error?.message || '重命名失败');
        return false;
      } finally {
        pathChange.finish();
      }
    }

    return useEditorStore.getState().applyRename(targetId, normalizedName);
  }, [
    beginNodePathChange,
    flushNodeSavesBeforePathChange,
    canWriteLocalProject,
    saveNodeContentAfterPathChange,
    setDiskSavePending,
  ]);

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
      message.warning('名称已存在，请换一个。');
    }
    return ok;
  }, [workspace, selectedId, performRename]);

  const handleDelete = useCallback(async (nodeId) => {
    const targetId = nodeId ?? selectedId;
    if (targetId === 'root') {
      message.warning('根目录不能删除');
      return;
    }
    const node = findNodeById(workspace, targetId);
    if (!node) return;
    if (node.readOnly) return;
    const isFolder = node.type === 'folder';
    const confirmed = window.confirm(
      `确定删除${isFolder ? '文件夹及其全部内容' : '文件'}「${node.name}」吗？`,
    );
    if (!confirmed) return;

    if (node.projectRootPath && node.relativePath && canWriteLocalProject) {
      const pathChange = beginNodePathChange(node);
      let deletedFromDisk = false;
      try {
        await flushNodeSavesBeforePathChange(node);
        await deleteLocalProjectEntryOnDisk({
          projectRootPath: node.projectRootPath,
          relativePath: node.relativePath,
        });
        deletedFromDisk = true;
        (node.type === 'file' ? [node] : collectFiles(node))
          .forEach((file) => setDiskSavePending(file.id, false));
        removeDiskBackedNode(targetId);
        setContentResetKey((k) => k + 1);
      } catch (error) {
        if (!deletedFromDisk) {
          let currentNode = findProjectNodeByRelativePath(
            useEditorStore.getState().workspace,
            node.projectRootPath,
            node.relativePath,
          );
          while (currentNode && pathChange.consumeDirty()) {
            await saveNodeContentAfterPathChange(currentNode);
            currentNode = findProjectNodeByRelativePath(
              useEditorStore.getState().workspace,
              node.projectRootPath,
              node.relativePath,
            );
          }
        }
        console.error('删除本地文件失败:', error);
        message.error(error?.message || '删除失败');
      } finally {
        pathChange.finish();
      }
      return;
    }

    deleteNode(targetId);
  }, [
    beginNodePathChange,
    deleteNode,
    flushNodeSavesBeforePathChange,
    canWriteLocalProject,
    removeDiskBackedNode,
    saveNodeContentAfterPathChange,
    selectedId,
    setDiskSavePending,
    workspace,
  ]);

  /**
   * 侧边栏拖拽 / 「移动到」：拖到文件上 = 同级排序；拖到文件夹（含根目录）上 = 移入该文件夹。
   * 磁盘挂载节点移动时先在磁盘上 rename，成功后再同步内存树。
   */
  const handleMoveNode = useCallback(async (fromId, toId) => {
    const state = useEditorStore.getState();
    const from = findNodeById(state.workspace, fromId);
    const to = findNodeById(state.workspace, toId);
    if (!from || !to || fromId === toId) return;
    if (from.readOnly || to.readOnly) return;
    if (from.projectRootPath && !canWriteLocalProject) return;

    // 拖到文件上：同级排序（磁盘节点顺序由磁盘决定，不支持排序）
    if (to.type !== 'folder') {
      if (!from.projectRootPath) moveNode(fromId, toId);
      return;
    }

    if (!canMoveNodeToFolder(state.workspace, fromId, toId)) {
      const crossSource = from.projectRootPath !== to.projectRootPath && to.id !== state.workspace?.id;
      if (crossSource) {
        message.warning('暂不支持在本地项目和内存工作区之间移动');
      }
      return;
    }

    const fromDisk = Boolean(from.projectRootPath && from.relativePath);
    if (!fromDisk) {
      state.moveNodeToFolderById(fromId, toId);
      return;
    }

    // 工作区根对应磁盘 Projects/，由 resolveDiskMoveParentPath 统一换算
    const parentRelativePath = resolveDiskMoveParentPath(state.workspace, from, to);
    const uniqueName = buildUniqueRenameNameInFolder(to, from.name, fromId);
    const newRelativePath = parentRelativePath ? `${parentRelativePath}/${uniqueName}` : uniqueName;
    const pathChange = beginNodePathChange(from);
    let diskPathChanged = false;
    try {
      await flushNodeSavesBeforePathChange(from);
      const result = await renameLocalProjectEntryOnDisk({
        projectRootPath: from.projectRootPath,
        relativePath: from.relativePath,
        newRelativePath,
      });
      diskPathChanged = true;
      useEditorStore.getState().moveDiskBackedNodeToFolder(fromId, toId, {
        relativePath: result?.relativePath ?? newRelativePath,
      });
      const finalRelativePath = result?.relativePath ?? newRelativePath;
      const nextState = useEditorStore.getState();
      let nextNode = findProjectNodeByRelativePath(
        nextState.workspace,
        from.projectRootPath,
        finalRelativePath,
      );
      if (nextNode) pathChange.trackNode(nextNode);
      while (nextNode && pathChange.consumeDirty()) {
        await saveNodeContentAfterPathChange(nextNode);
        const latestState = useEditorStore.getState();
        nextNode = findProjectNodeByRelativePath(
          latestState.workspace,
          from.projectRootPath,
          finalRelativePath,
        );
      }
      (from.type === 'file' ? [from] : collectFiles(from))
        .forEach((file) => setDiskSavePending(file.id, false));
    } catch (error) {
      if (!diskPathChanged) {
        let currentNode = findProjectNodeByRelativePath(
          useEditorStore.getState().workspace,
          from.projectRootPath,
          from.relativePath,
        );
        while (currentNode && pathChange.consumeDirty()) {
          await saveNodeContentAfterPathChange(currentNode);
          currentNode = findProjectNodeByRelativePath(
            useEditorStore.getState().workspace,
            from.projectRootPath,
            from.relativePath,
          );
        }
      }
      console.error('移动本地文件失败:', error);
      message.error(error?.message || '移动失败');
    } finally {
      pathChange.finish();
    }
  }, [
    beginNodePathChange,
    canWriteLocalProject,
    flushNodeSavesBeforePathChange,
    moveNode,
    saveNodeContentAfterPathChange,
    setDiskSavePending,
  ]);
  const [wechatPreviewOpen, setWechatPreviewOpen] = useState(false);
  const [preparePublishSource, setPreparePublishSource] = useState(null);
  const [bookmarkImportOpen, setBookmarkImportOpen] = useState(false);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(false);
  const [agentPanelOpen, setAgentPanelOpen] = useState(false);
  // Cmd/Ctrl+J 开关 AI 助手面板
  useEffect(() => {
    const onKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey
        && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        setAgentPanelOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const [contentResetKey, setContentResetKey] = useState(0);
  const editorReloadToken = useEditorStore((state) => state.editorReloadToken);
  const externalContentRequests = useEditorStore((state) => state.externalContentRequests);
  const applyContentFromOutside = useEditorStore((state) => state.applyContentFromOutside);
  // agent 运行时（MCP 控制桥、提案收件箱）不依赖 AI 面板是否打开
  useAgentRuntime({ dialogs: AGENT_HOST_DIALOGS });
  // 数据层文件化：迁移后 Daily / 白板 / 编辑部记忆以内容库文件为准
  useVaultStorage();
  // 准备发布会复用平台 skill 的 prompt，也保留内容库的同名覆盖。
  const { skills: registrySkills } = useSkillRegistry();
  const selectionToolbarSkillIds = useMemo(
    () => new Set(filterSkillsByEntry(registrySkills, 'selection-toolbar').map((skill) => skill.id)),
    [registrySkills],
  );
  const [manualSyncLoading, setManualSyncLoading] = useState(false);
  const selectedNeedsConversion = Boolean(
    selectedFile?.needsConversion
      || (selectedFile?.projectRootPath && selectedFile?.name && needsConversion(selectedFile.name)),
  );

  const [previewData, setPreviewData] = useState({ rawContent: '', fileUrl: '', previewHtml: '', excelSheets: null });
  const [previewLoading, setPreviewLoading] = useState(false);
  // 图片放大查看器：双击编辑器内图片打开；关闭后把焦点还给编辑器，否则键盘操作（删除等）落不到图片块上
  const focusActiveEditor = useCallback(() => activeEditorRef.current?.focus?.(), []);
  const {
    lightbox,
    openFromEvent: handlePaperDoubleClick,
    close: closeLightbox,
    changeIndex: changeLightboxIndex,
  } = useImageLightbox(focusActiveEditor);
  const canSaveLocalProjectFile = canWriteLocalProject
    && Boolean(selectedProjectRootPath && selectedFile?.relativePath)
    && !selectedReadOnly
    && !selectedNeedsConversion;
  const canManualSyncLocalProject = canReadLocalProject && Boolean(manualSyncProjectRootPath);
  const authorizedLocalProjectRootPaths = useMemo(() => (
    collectLocalProjectRootPaths(workspace).filter((rootPath) => (
      !needsLocalProjectReauthorization(findLocalProjectRootByPath(workspace, rootPath))
    ))
  ), [workspace]);
  // 同步页用：不论当前选中文件还是文件夹，只要工作区里有本地项目就能同步。
  // 取路径优先级：选中文件夹 → 选中文件 → 工作区第一个本地项目根。
  const currentWorkspaceProjectRoot = useMemo(() => {
    if (selectedNeedsLocalProjectReauthorization) return '';
    return manualSyncProjectRootPath
      || selectedProjectRootPath
      || authorizedLocalProjectRootPaths[0]
      || '';
  }, [
    authorizedLocalProjectRootPaths,
    manualSyncProjectRootPath,
    selectedNeedsLocalProjectReauthorization,
    selectedProjectRootPath,
  ]);
  const canSyncWorkspaceFromDisk = canReadLocalProject && Boolean(currentWorkspaceProjectRoot);
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

    const sourceMarkdown = rewriteMarkdownImagesForEditor(
      normalizeMarkdown(markdown),
      mediaContextFromFile(selectedFile),
    );
    lastSyncedMarkdownRef.current = sourceMarkdown;

    if (!sourceMarkdown) {
      return createEmptyDocument();
    }

    const parserEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
    const parsedBlocks = parserEditor.tryParseMarkdownToBlocks(sourceMarkdown);
    return parsedBlocks.length > 0 ? parsedBlocks : createEmptyDocument();
  }, [selectedId, contentResetKey, editorReloadToken]);

  const { uploadFile } = useEditorImageUpload({
    localProjectSupported,
    selectedProjectRootPath,
  });

  const persistResolvedImages = useCallback(async (fileId, resolutions, sourceEditor) => {
    if (!fileId || resolutions.length === 0) return true;
    const pendingPathChange = projectPathChangesRef.current.get(fileId);
    if (pendingPathChange) await pendingPathChange;

    const state = useEditorStore.getState();
    let sourceFile = findNodeById(state.workspace, fileId);
    let resolvedContent = sourceFile?.type === 'file'
      ? resolvePendingImagesInContent(sourceFile.content, resolutions)
      : null;

    // 本地项目重命名/移动会更换路径型 fileId，用 blockId + pendingUrl
    // 在最新 workspace 里重新定位，避免写回旧路径。
    if (!resolvedContent) {
      for (const file of collectFiles(state.workspace)) {
        const nextContent = resolvePendingImagesInContent(file.content, resolutions);
        if (nextContent) {
          sourceFile = file;
          resolvedContent = nextContent;
          break;
        }
      }
    }

    // 文档已删除，或当前 editor onChange 已完成回填。
    if (sourceFile?.type !== 'file' || !resolvedContent) return true;

    const resolvedFileId = sourceFile.id;
    resolutions.forEach((resolution) => {
      resolution.fileId = resolvedFileId;
    });

    // 当前编辑器的 onChange 已经落盘时不再重复保存；
    // 只处理切换文档后仍留在 store 里的占位 URL。
    state.updateFileContentById(resolvedFileId, resolvedContent);
    const diskMarkdown = contentToDiskMarkdown(resolvedContent, mediaContextFromFile(sourceFile));

    for (const pendingFileId of new Set([fileId, resolvedFileId])) {
      const pendingTimer = projectSaveTimersRef.current.get(pendingFileId);
      if (pendingTimer) {
        window.clearTimeout(pendingTimer);
        projectSaveTimersRef.current.delete(pendingFileId);
      }
      setDiskSavePending(pendingFileId, false);
    }

    const activeEditor = activeEditorRef.current;
    if (activeEditor && activeEditor !== sourceEditor) {
      try {
        reconcilePendingImages(activeEditor, resolvedFileId);
      } catch (error) {
        console.warn('[asset] 当前编辑器回填延后处理:', error);
      }
    }

    const canSaveSourceFile = canWriteLocalProject
      && sourceFile.projectRootPath
      && sourceFile.relativePath
      && !sourceFile.readOnly
      && !sourceFile.needsConversion
      && !needsConversion(sourceFile.name);

    let diskSaveFailed = false;
    try {
      if (canSaveSourceFile) {
        setDiskSavePending(resolvedFileId, true);
        if (fileId !== resolvedFileId) {
          await projectSaveQueuesRef.current.get(fileId)?.catch(() => {});
        }
        await enqueueProjectFileSave(resolvedFileId, () => saveLocalProjectFile({
          projectRootPath: sourceFile.projectRootPath,
          relativePath: sourceFile.relativePath,
          content: diskMarkdown,
        }));
        // 同步更新基线，避免图片地址写回落盘被文件监听当外部改动重载。
        useEditorStore.getState().markLocalFileDiskSaved(resolvedFileId, diskMarkdown);
      }

      return true;
    } catch (error) {
      diskSaveFailed = true;
      if (canSaveSourceFile) setDiskSavePending(resolvedFileId, true);
      console.error('[asset] 图片地址写回文档失败:', error);
      message.error(error?.message || '图片地址写回文档失败');
      return false;
    } finally {
      if (
        canSaveSourceFile
        && !diskSaveFailed
        && !projectSaveTimersRef.current.has(resolvedFileId)
      ) {
        setDiskSavePending(resolvedFileId, false);
      }
    }
  }, [canWriteLocalProject, enqueueProjectFileSave, setDiskSavePending]);

  // 粘贴截图和斜杠菜单「图片」共用：先占位，再异步存盘并把 URL 回填到当前文档
  const insertImagesIntoFile = (targetEditor, imageFiles) => {
    const sourceFileId = selectedFile?.id ?? '';
    const insertion = insertImagesFromFiles(targetEditor, imageFiles, uploadFile, {
      fileId: sourceFileId,
      onResolved: (resolutions) => persistResolvedImages(sourceFileId, resolutions, targetEditor),
    });
    return trackPendingImageLifecycle(insertion);
  };

  const editor = useCreateBlockNote(
    {
      ...BLOCKNOTE_OPTIONS,
      initialContent,
      uploadFile,
      pasteHandler: ({ event, editor: pasteEditor, defaultPasteHandler }) => {
        const clipboardData = event.clipboardData;
        const useDefaultPaste = () => defaultPasteHandler({
          prioritizeMarkdownOverHTML: false,
          plainTextAsMarkdown: false,
        });

        if (hasPendingImageClipboardData(clipboardData)) {
          message.warning('图片仍在上传，请等待完成后再复制粘贴');
          return true;
        }

        // 剪贴板里的图片文件（截图、复制图片）先占住当前选区，再异步存盘回填 URL。
        const { hasFiles, imageFiles, unsupportedFiles } = classifyClipboardFiles(clipboardData);
        if (hasFiles) {
          if (unsupportedFiles.length > 0 || imageFiles.length === 0) {
            message.warning('暂不支持粘贴非图片附件，请使用文件导入');
          }
          if (imageFiles.length > 0) void insertImagesIntoFile(pasteEditor, imageFiles);
          return true;
        }

        // BlockNote 在代码块内会强制按纯文本粘贴，不让 Markdown 记号改变块结构。
        if (pasteEditor.getTextCursorPosition()?.block?.type === 'codeBlock') {
          return useDefaultPaste();
        }

        const plainText = clipboardData?.getData('text/plain') ?? '';

        // VS Code 里复制 .md 源码：按 Markdown 解析，
        // 否则逐行高亮的 HTML 会让每行变成一个块、空行变成空段落。
        if (isVsCodeMarkdownClipboard(clipboardData) && plainText.trim()) {
          pasteEditor.pasteMarkdown(normalizeFrontmatterForPaste(plainText));
          return true;
        }

        // 其余情况保留 BlockNote/VS Code/Markdown 的明确 MIME 语义，避免内部复制被启发式判断降级。
        if (shouldUseDefaultPasteMime(clipboardData)) {
          return useDefaultPaste();
        }

        const htmlText = clipboardData?.getData('text/html') ?? '';
        const hasHtmlCodeBlock = looksLikeCodeBlockClipboardHtml(htmlText);
        const hasPlainTextHtml = looksLikePlainTextHtml(htmlText);

        if (hasHtmlCodeBlock && looksLikeMarkdownCodeFenceClipboardText(plainText)) {
          pasteEditor.pasteMarkdown(plainText);
          return true;
        }

        if (hasHtmlCodeBlock) {
          const codeBlock = extractCodeBlockFromClipboardHtml(htmlText);
          const codeBlockHtml = buildCodeBlockClipboardHtml(codeBlock);
          if (codeBlockHtml) {
            // 走 ProseMirror 粘贴以正确替换选区、拆分光标所在段落。
            pasteEditor.pasteHTML(codeBlockHtml);
            return true;
          }
        }

        if (looksLikeMarkdownClipboardText(plainText) && (!htmlText.trim() || hasPlainTextHtml)) {
          pasteEditor.pasteMarkdown(normalizeFrontmatterForPaste(plainText));
          return true;
        }

        // HTML 只含 <br>/<p>/<div> 等结构标签、无富文本时，
        // 用纯文本走 pasteMarkdown 避免 <br><br> 被转成多余空段落
        if (plainText.trim() && hasPlainTextHtml) {
          const collapsed = plainText.replace(/\n{3,}/g, '\n\n');
          pasteEditor.pasteMarkdown(collapsed);
          return true;
        }

        return useDefaultPaste();
      },
    },
    [selectedId, contentResetKey, editorReloadToken],
  );
  const outlinePage = useOutlinePage(editor, selectedFile);
  const scriptPage = useScriptPage(editor, selectedFile);
  // 标题编号走 CSS 计数器，只加个 class，正文和 Markdown 都不动；大纲页不编号
  const showHeadingNumbers = headingNumbering && !outlinePage.isOutline;
  const paperContentClassName = `paper-content${showHeadingNumbers ? ' heading-numbered' : ''}`;
  const openWikilink = useOpenWikilink(workspace);

  useEffect(() => {
    activeEditorRef.current = editor;
    return () => {
      if (activeEditorRef.current === editor) activeEditorRef.current = null;
    };
  }, [editor]);

  useEffect(() => {
    reconcilePendingImages(editor, selectedFile?.id ?? '');
  }, [editor, markdown, selectedFile?.id]);

  const {
    handleSelectAllBlurCapture,
    handleSelectAllKeyDownCapture,
    handleSelectAllKeyUpCapture,
    resetSelectAllState,
    shouldSuppressSelectAllKeyUp,
  } = useTwoStageSelectAll(editor);

  const handlePaperKeyDownCapture = useCallback((event) => {
    handleSelectAllKeyDownCapture(event);
    if (event.defaultPrevented || !editor.domElement?.contains(event.target)) return;
    // BlockNote 不删除文档首个空块，这里补齐「首行空段落按 Backspace 删除」。
    handleLeadingEmptyBlockBackspace(editor, event);
  }, [editor, handleSelectAllKeyDownCapture]);

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

  const handleOpenPreparePublish = useCallback(() => {
    if (!selectedFile) return;
    // 保存平台稿会切换当前文档，这里先锁定原稿快照，避免后续平台稿串错来源。
    setPreparePublishSource({ file: selectedFile, content: resolvedMarkdown });
  }, [resolvedMarkdown, selectedFile]);

  const handleSavePlatformDraft = useCallback(async (platform) => {
    const sourceFile = preparePublishSource?.file;
    if (!sourceFile?.id || !platform?.result) throw new Error('无法确定平台稿来源');

    const created = await createGeneratedFile({
      name: buildPlatformDraftFileName(sourceFile.name, platform.label),
      content: buildPlatformDraftContent(platform.result),
      contextNodeId: sourceFile.id,
      meta: {
        summary: platform.result.summary,
        tags: platform.result.tags,
        draftStatus: 'ready',
        targetPlatforms: [platform.id],
        sourceMaterialIds: [sourceFile.id],
      },
    });
    if (!created?.ok) throw new Error(created?.error || '保存平台稿失败');
    return created;
  }, [createGeneratedFile, preparePublishSource]);

  const wechatSourceHtml = useMemo(() => {
    const tokens = parserRef.current.parse(resolvedMarkdown);
    return rendererRef.current.render(tokens);
  }, [resolvedMarkdown]);
  useMermaidPreview(editorMode === 'preview', wechatSourceHtml);

  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  const selectedContentSurface = selectedFolder ? 'folder' : selectedFile ? 'paper' : 'overview';

  useEffect(() => {
    if (surface !== 'settings') {
      lastContentSurfaceRef.current = surface;
    }
  }, [surface]);

  // 冷启动时若上次停在设置页，ref 初值就是 'settings'（上面的 effect 又跳过 settings，
  // 永远刷不新），直接回它等于原地不动。此时回落到当前选中项对应的内容视图。
  const leaveSettings = useCallback(() => {
    const last = lastContentSurfaceRef.current;
    setSurface(last === 'settings' ? selectedContentSurface : last);
  }, [selectedContentSurface, setSurface]);

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
    reconcilePendingImages(editor, selectedFile?.id ?? '');
    tryConvertTypedMarkdownCodeFence();

    // content 字段存 BlockNote JSON（保留颜色等富文本样式）
    const nextContent = serializeBlockNoteContent(editor.document);
    if (nextContent === lastSyncedMarkdownRef.current) return;
    lastSyncedMarkdownRef.current = nextContent;
    updateSelectedFileContent(nextContent);

    // 重命名/移动期间只更新 store，不再按旧路径新建保存定时器。
    // 路径变更完成后会把最新内容写到新路径。
    if (projectPathChangesRef.current.has(selectedFile?.id)) {
      projectPathChangeDirtyRef.current.add(selectedFile.id);
      const pendingTimer = projectSaveTimersRef.current.get(selectedFile.id);
      if (pendingTimer) window.clearTimeout(pendingTimer);
      projectSaveTimersRef.current.delete(selectedFile.id);
      setDiskSavePending(selectedFile.id, true);
      return;
    }

    // blob:/pending 只是显示占位，不能写进 Markdown。
    // 最终 URL 由上传回调精确回填后再落盘。
    if (hasPendingImagePlaceholders(editor.document)) {
      if (canSaveLocalProjectFile) {
        const pendingTimer = projectSaveTimersRef.current.get(selectedFile.id);
        if (pendingTimer) window.clearTimeout(pendingTimer);
        projectSaveTimersRef.current.delete(selectedFile.id);
        setDiskSavePending(selectedFile.id, true);
      }
      return;
    }

    if (canSaveLocalProjectFile) {
      const existingTimer = projectSaveTimersRef.current.get(selectedFile.id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      setDiskSavePending(selectedFile.id, true);
      const timerId = window.setTimeout(async () => {
        let saveFailed = false;
        try {
          // 磁盘 .md 文件仍写 Markdown（有损转换，但保持文件可读性）
          const diskMarkdown = rewriteMarkdownImagesForDisk(
            normalizeMarkdown(editor.blocksToMarkdownLossy(editor.document)),
            mediaContextFromFile(selectedFile),
          );
          await enqueueProjectFileSave(selectedFile.id, () => saveLocalProjectFile({
            projectRootPath: selectedProjectRootPath,
            relativePath: selectedFile.relativePath,
            content: diskMarkdown,
          }));
          // 记录"刚写下去的磁盘正文"为新基线：稍后文件监听回灌时可据此识别为自写 echo，
          // 从而只重载真·外部改动、忽略自己保存产生的变更（不再抢焦点）。
          useEditorStore.getState().markLocalFileDiskSaved(selectedFile.id, diskMarkdown);
        } catch (error) {
          saveFailed = true;
          console.error('保存本地项目文件失败:', error);
          alert(error?.message || '保存本地项目文件失败');
        } finally {
          if (projectSaveTimersRef.current.get(selectedFile.id) === timerId) {
            projectSaveTimersRef.current.delete(selectedFile.id);
            setDiskSavePending(selectedFile.id, saveFailed);
          }
        }
      }, PROJECT_SAVE_DEBOUNCE_MS);
      projectSaveTimersRef.current.set(selectedFile.id, timerId);
    }
  };

  const handleCopyRichText = async () => {
    if (hasPendingImagePlaceholders(editor.document)) {
      message.warning('图片仍在上传，请稍后再复制');
      return false;
    }
    const html = editor.blocksToHTMLLossy(editor.document);
    if (!html.trim()) {
      message.warning('没有可复制的内容');
      return false;
    }
    const plainText = editor.blocksToMarkdownLossy(editor.document);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html;charset=utf-8' }),
          'text/plain': new Blob([plainText], { type: 'text/plain;charset=utf-8' }),
        }),
      ]);
      message.success('已复制富文本');
      return true;
    } catch {
      // 降级：execCommand
      let ok = false;
      try {
        ok = copyHtmlWithExecCommand(html, plainText);
      } catch {
        ok = false;
      }
      if (ok) {
        message.success('已复制富文本');
        return true;
      }
      message.error('复制失败，请重试');
      return false;
    }
  };

  const handleCopyMarkdown = async () => {
    if (hasPendingImagePlaceholders(editor.document)) {
      message.warning('图片仍在上传，请稍后再复制');
      return false;
    }
    const docs = listWorkspaceDocs(workspace);
    const body = wikilinksToPathLinks(
      tightenListSpacing(normalizeMarkdown(editor.blocksToMarkdownLossy(editor.document))),
      (name) => docFilePath(findDocByWikiName(docs, name)),
    );
    const text = withTitleHeading(stripFileExtension(selectedFile?.name), body);
    if (!text) {
      message.warning('没有可复制的内容');
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      message.success('已复制 Markdown');
      return true;
    } catch {
      message.error('复制失败，请重试');
      return false;
    }
  };

  const handleCopyToWeChat = async () => {
    if (hasPendingImagePlaceholders(editor.document)) {
      message.warning('图片仍在上传，请稍后再复制');
      return false;
    }
    const html = wechatSourceHtml;
    if (!html.trim()) {
      message.warning('没有可复制的内容');
      return false;
    }
    try {
      await copyToWeChat(html, { templateId: copyStyle });
      message.success('已复制，可直接粘贴到公众号编辑器');
      return true;
    } catch {
      message.error('复制失败，请重试');
      return false;
    }
  };

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
    if (targetNode?.readOnly) return null;
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

        const importTarget = canWriteLocalProject ? await resolveLocalCreateTarget() : null;
        if (canWriteLocalProject && !importTarget && desktopProjectSupported) {
          message.error('无法定位本地 Projects 目录，请稍后重试。');
          return;
        }
        if (importTarget) {
          const target = importTarget;
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
  }, [canWriteLocalProject, desktopProjectSupported, insertLocalProjectNode, resolveLocalCreateTarget]);

  // 唤起隐藏的 file input。本地项目里的文档要靠本地文件能力落盘，浏览器不支持时直接提示。
  const triggerImportMarkdown = () => {
    if (!canWriteLocalProject && selectedInLocalProject) {
      message.warning('当前环境不支持导入到本地项目，请先选中非本地项目的位置。');
      return;
    }
    markdownImportInputRef.current?.click();
  };

  const handleAddFile = useCallback(async (contextNodeId) => {
    if (canWriteLocalProject) {
      try {
        const target = await resolveLocalCreateTarget(contextNodeId);
        if (!target && desktopProjectSupported) {
          message.error('无法定位本地 Projects 目录，请稍后重试。');
          return { ok: false };
        }
        // Web 端不在本地项目上下文时，target 为空 → 落到下方内存流程
        if (target) {
          const name = buildUniqueNameInFolder(target.parentFolder, '未命名', '.md');
          const relativePath = target.parentRelativePath ? `${target.parentRelativePath}/${name}` : name;
          const result = await createLocalProjectFileOnDisk({
            projectRootPath: target.projectRootPath,
            relativePath,
            content: '',
          });
          const node = createLocalProjectFileNode(target.projectRootPath, result.relativePath, name, '');
          node.updatedAt = result.updatedAt;
          const nodeId = insertLocalProjectNode(target.parentFolderId, node);
          setContentResetKey((k) => k + 1);
          return {
            ok: true,
            nodeId: nodeId || node.id,
            name: node.name,
            type: node.type,
          };
        }
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
  }, [canWriteLocalProject, desktopProjectSupported, resolveLocalCreateTarget, addFile, insertLocalProjectNode]);

  // 大纲页面 = 普通 .md + frontmatter `layout: outline`（Obsidian / 其他 AI 照常能读）
  const handleAddOutline = useCallback(async (contextNodeId) => {
    const result = await handleAddFile(contextNodeId);
    if (result?.ok) setFileFrontmatterProperty(result.nodeId, PAGE_LAYOUT_KEY, PAGE_LAYOUT_OUTLINE);
    return result;
  }, [handleAddFile, setFileFrontmatterProperty]);

  // 剧本页面同理：frontmatter `layout: script`
  const handleAddScript = useCallback(async (contextNodeId) => {
    const result = await handleAddFile(contextNodeId);
    if (result?.ok) setFileFrontmatterProperty(result.nodeId, PAGE_LAYOUT_KEY, PAGE_LAYOUT_SCRIPT);
    return result;
  }, [handleAddFile, setFileFrontmatterProperty]);

  const handleAddFolder = useCallback(async (contextNodeId) => {
    if (canWriteLocalProject) {
      try {
        const target = await resolveLocalCreateTarget(contextNodeId);
        if (!target && desktopProjectSupported) {
          message.error('无法定位本地 Projects 目录，请稍后重试。');
          return { ok: false };
        }
        // Web 端不在本地项目上下文时，target 为空 → 落到下方内存流程
        if (target) {
          const name = buildUniqueNameInFolder(target.parentFolder, '新建文件夹');
          const relativePath = target.parentRelativePath ? `${target.parentRelativePath}/${name}` : name;
          const result = await createLocalProjectFolderOnDisk({
            projectRootPath: target.projectRootPath,
            relativePath,
          });
          const node = createLocalProjectFolderNode(target.projectRootPath, result.relativePath, name);
          const nodeId = insertLocalProjectNode(target.parentFolderId, node);
          setContentResetKey((k) => k + 1);
          return {
            ok: true,
            nodeId: nodeId || node.id,
            name: node.name,
            type: node.type,
          };
        }
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
  }, [canWriteLocalProject, desktopProjectSupported, resolveLocalCreateTarget, addFolder, insertLocalProjectNode]);

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
      if (!nextFile.projectRootPath) {
        after.applyRename(nextFileId, buildUniqueName(after.workspace, '新选题', '.md'));
      }
      return;
    }

    after.setFileKnowledgeMeta(nextFileId, {
      draftStatus: 'drafting',
      targetPlatforms: getDefaultTargetPlatforms(publishingPlatforms),
    });
    if (!nextFile.projectRootPath) {
      after.applyRename(nextFileId, buildUniqueName(after.workspace, '新稿件', '.md'));
    }
  }, [handleAddFile, publishingPlatforms, setSurface]);

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

    if (!nextFile.projectRootPath) {
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
  }, [handleAddFile, publishingPlatforms]);

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
    if (!item?.id || item.readOnly) return;
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

  const handleOpenLocalProject = useCallback(async (access = 'read-write', replaceNodeId = null) => {
    if (!canOpenLocalProject) {
      message.error('打开本地项目仅支持桌面版应用。');
      return;
    }
    let closeLoading = null;
    try {
      const result = await openLocalProject({ access });
      if (!result || result.canceled) return;
      const projects = Array.isArray(result.projects)
        ? result.projects
        : [{ workspace: result.workspace, projectRootPath: result.projectRootPath }];
      const validProjects = projects.filter((project) => project?.workspace);
      if (validProjects.length === 0) return;
      closeLoading = message.loading('正在打开本地项目…', 0);
      const replacementSnapshot = replaceNodeId
        ? findNodeById(useEditorStore.getState().workspace, replaceNodeId)
        : null;
      const canReplaceSnapshot = needsLocalProjectReauthorization(replacementSnapshot);
      if (canReplaceSnapshot && validProjects[0]?.complete === false) {
        await Promise.all(validProjects.map(async (project) => {
          try {
            await revokeLocalProjectAccess(project.mountId);
          } catch (error) {
            console.warn('[local-project] 撤销不完整的重授权会话失败:', error);
          }
        }));
        throw new Error('目录扫描不完整，旧快照已保留。请检查权限、超大文件或文件数量后重试。');
      }
      const snapshotMatches = canReplaceSnapshot && matchesLocalProjectSnapshot(
        replacementSnapshot,
        validProjects[0]?.workspace,
      );
      validProjects.forEach((project, index) => {
        const replacesSnapshot = snapshotMatches && index === 0;
        openLocalProjectWorkspace(project.workspace, project.projectRootPath, {
          projectMountId: project.mountId,
          readOnly: project.access === 'read-only',
          access: project.access,
          projectRevision: project.revision,
          ...(replacesSnapshot ? {
            replaceNodeId,
            persistenceSnapshot: replacementSnapshot,
            projectIdentity: getReauthorizedProjectIdentity(replacementSnapshot),
          } : {}),
        });
      });
      setContentResetKey((k) => k + 1);
      const readOnlyCount = validProjects.filter((project) => project.access === 'read-only').length;
      const skippedCount = validProjects.reduce(
        (total, project) => total + (Number(project.skippedCount) || 0),
        0,
      );
      const skippedText = skippedCount > 0 ? `，跳过 ${skippedCount} 个不支持或受限条目` : '';
      const incompleteCount = validProjects.filter((project) => project.complete === false).length;
      if (canReplaceSnapshot && !snapshotMatches) {
        message.warning('所选目录与旧快照不匹配，已作为新项目打开，旧快照保留不变。');
      } else if (replaceNodeId) {
        message.success(`已重新授权 ${validProjects.length} 个本地目录${skippedText}`);
      } else if (incompleteCount > 0) {
        message.warning(`已打开目录，但 ${incompleteCount} 个目录扫描不完整，自动刷新不会覆盖当前快照${skippedText}`);
      } else {
        message.success(
          readOnlyCount === validProjects.length
            ? `已只读打开 ${validProjects.length} 个本地项目${skippedText}`
            : `已打开 ${validProjects.length} 个本地项目${skippedText}`,
        );
      }
    } catch (error) {
      console.error('打开本地项目失败:', error);
      message.error(error?.message || '打开本地项目失败');
    } finally {
      closeLoading?.();
    }
  }, [canOpenLocalProject, openLocalProjectWorkspace]);

  const handleReauthorizeLocalProject = useCallback(async (nodeId, access = 'read-write') => {
    const node = findNodeById(workspace, nodeId);
    if (node?.type !== 'folder' || !needsLocalProjectReauthorization(node)) return;
    await handleOpenLocalProject(access, nodeId);
  }, [handleOpenLocalProject, workspace]);

  const handleManualSyncLocalProject = useCallback(async (projectRootPath = manualSyncProjectRootPath) => {
    if (!canReadLocalProject || !projectRootPath) return;
    const projectRoot = findLocalProjectRootByPath(workspace, projectRootPath);
    if (needsLocalProjectReauthorization(projectRoot)) {
      message.warning('请先重新授权这个本地目录');
      return;
    }

    setManualSyncLoading(true);
    try {
      await flushPendingDesktopChanges();

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
      if (result.complete === false) {
        const skippedCount = Number(result.skippedCount) || 0;
        throw new Error(
          skippedCount > 0
            ? `本次扫描不完整（跳过 ${skippedCount} 个条目），已保留现有项目数据。`
            : '本次扫描不完整，已保留现有项目数据。',
        );
      }

      useEditorStore.getState().refreshDiskBackedProject({
        projectRootPath,
        workspace: result.workspace,
        projectsChildren: result.projectsChildren,
        projectRevision: result.revision,
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
    canReadLocalProject,
    flushPendingDesktopChanges,
    workspace,
  ]);

  const handleRemoveLocalProject = useCallback(async (nodeId) => {
    const node = findNodeById(workspace, nodeId);
    if (!node?.localProjectRoot) return;
    const confirmed = window.confirm(`确定移除项目「${node.name}」吗？本地文件不会被删除。`);
    if (!confirmed) return;
    try {
      await flushPendingDesktopChanges();
      await revokeLocalProjectAccess(node.projectMountId);
    } catch (error) {
      console.error('移除本地项目前保存失败:', error);
      message.error(error?.message || '数据还没有安全保存，已取消移除');
      return;
    }
    deleteNode(nodeId);
    setContentResetKey((k) => k + 1);
  }, [workspace, deleteNode, flushPendingDesktopChanges]);

  const handleRevealLocalProjectEntry = useCallback(async (nodeId) => {
    const node = findNodeById(workspace, nodeId);
    if (
      !node?.projectRootPath
      || !canRevealLocalProject
      || needsLocalProjectReauthorization(node)
    ) return;

    try {
      await revealLocalProjectEntry({
        projectMountId: node.projectMountId,
        projectRootPath: node.projectRootPath,
        relativePath: node.relativePath ?? '',
      });
    } catch (error) {
      console.error('在文件管理器中查看失败:', error);
      message.error(error?.message || '打开失败');
    }
  }, [canRevealLocalProject, workspace]);

  const handleOpenBookmarkTabExternal = useCallback((tab) => {
    const url = String(tab?.url ?? '').trim();
    if (!url) return;
    openExternalUrl(url).catch((error) => {
      message.error(error?.message || '无法打开链接');
    });
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

  useEffect(() => registerTauriCloseDrain(flushPendingDesktopChanges), [flushPendingDesktopChanges]);

  useEffect(() => {
    let disposed = false;
    let unlisten = () => {};

    listenForTauriClose({
      beforeClose: flushBeforeTauriClose,
      onError: (error) => {
        console.error('[tauri] 关闭前保存失败:', error);
        message.error(error?.message || '数据还没有安全保存，已取消关闭');
      },
    }).then((stopListening) => {
      if (disposed) {
        stopListening();
        return;
      }
      unlisten = stopListening;
    }).catch((error) => {
      if (disposed) return;
      console.error('[tauri] 无法注册安全退出处理:', error);
      message.error('无法启用安全退出保护，请先保存数据');
    });

    return () => {
      disposed = true;
      unlisten();
    };
  }, [flushBeforeTauriClose]);

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
    if (!canUseDefaultWorkspace) return undefined;
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
  }, [canUseDefaultWorkspace]);

  // 非 MD 文件：加载原始内容用于预览（不自动转为 Markdown）
  useEffect(() => {
    if (
      !canReadLocalProject
      || selectedNeedsLocalProjectReauthorization
      || !selectedNeedsConversion
    ) {
      setPreviewData({ rawContent: '', fileUrl: '', previewHtml: '', excelSheets: null });
      return undefined;
    }
    if (!selectedFile?.projectRootPath || !selectedFile?.relativePath) return undefined;

    let cancelled = false;
    setPreviewLoading(true);

    (async () => {
      try {
        const result = await readLocalProjectFileContent({
          projectMountId: selectedFile.projectMountId,
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
  }, [
    canReadLocalProject,
    selectedFile?.id,
    selectedNeedsConversion,
    selectedNeedsLocalProjectReauthorization,
  ]);

  // 「转为 Markdown 编辑」：将预览内容转换后作为新 md 文件
  const handleConvertPreviewToMarkdown = useCallback(async () => {
    if (!selectedFile) return;
    try {
      const raw = previewData.rawContent || '';
      const mdText = normalizeMarkdown(await convertToMarkdown(selectedFile.name, raw));
      const stem = selectedFile.name.replace(/\.[^.]+$/, '').trim() || '转换';

      if (canWriteLocalProject && !selectedReadOnly) {
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
  }, [
    canWriteLocalProject,
    insertLocalProjectNode,
    previewData,
    resolveLocalCreateTarget,
    selectedFile,
    selectedReadOnly,
  ]);

  useEffect(() => {
    syncMarkdownFromSelectedFile();
    syncSelectedIdFromWorkspace();
  }, [selectedFile, workspace, markdown, syncMarkdownFromSelectedFile, syncSelectedIdFromWorkspace]);

  // 选中即引用：在编辑器里选中文字（松开鼠标/键），自动写入 store 供 AI 助手引用。
  // 覆盖式更新；选区折叠（点空白）不清空，保留引用，由用户从 chip 上的 × 移除。
  useEffect(() => {
    const commitSelection = (event) => {
      // 快捷键释放可能落在编辑器容器外，需复用全选状态避免更新 Zustand 取消选区。
      if (event.type === 'keyup' && shouldSuppressSelectAllKeyUp(event)) return;
      const text = getSelectedEditorText();
      if (text) setAiQuotedSelection(text);
    };
    document.addEventListener('mouseup', commitSelection);
    document.addEventListener('keyup', commitSelection);
    return () => {
      document.removeEventListener('mouseup', commitSelection);
      document.removeEventListener('keyup', commitSelection);
    };
  }, [setAiQuotedSelection, shouldSuppressSelectAllKeyUp]);

  // 编辑器接不了的外部改动（非当前文档 / 编辑器没挂载），直接把正文写回本地文件
  const saveContentToDiskNow = useCallback(async (file, content) => {
    const canSave = canWriteLocalProject && file?.projectRootPath && file.relativePath
      && !file.readOnly && !file.needsConversion && !needsConversion(file.name);
    if (!canSave) return;
    const pendingTimer = projectSaveTimersRef.current.get(file.id);
    if (pendingTimer) {
      // 丢掉编辑器里还没写出去的旧正文，避免它稍后覆盖这次的内容
      window.clearTimeout(pendingTimer);
      projectSaveTimersRef.current.delete(file.id);
    }
    const diskMarkdown = contentToDiskMarkdown(content, mediaContextFromFile(file));
    setDiskSavePending(file.id, true);
    try {
      await enqueueProjectFileSave(file.id, () => saveLocalProjectFile({
        projectRootPath: file.projectRootPath,
        relativePath: file.relativePath,
        content: diskMarkdown,
      }));
      useEditorStore.getState().markLocalFileDiskSaved(file.id, diskMarkdown);
      setDiskSavePending(file.id, false);
    } catch (error) {
      console.error('保存本地项目文件失败:', error);
      message.error(error?.message || '保存本地项目文件失败');
    }
  }, [canWriteLocalProject, enqueueProjectFileSave, setDiskSavePending]);

  // 接手编辑器之外的正文改动（applyContentFromOutside）：store 已经写好了，
  // 当前文档用 replaceBlocks 整篇替换——等同一次正常编辑，onChange 落盘、可 Cmd/Ctrl+Z；
  // 编辑器接不了时重建编辑器（若是当前文档）并直接落盘。
  useEffect(() => {
    if (!externalContentRequests.length) return;
    const requests = useEditorStore.getState().takeExternalContentRequests();
    requests.forEach(({ fileId, content }) => {
      const canUseEditor = fileId === selectedId && Boolean(editor.domElement)
        && !selectedReadOnly && !selectedUsesBookmarkCard && !selectedNeedsConversion;
      if (canUseEditor) {
        editor.replaceBlocks(editor.document, contentToEditorBlocks(content, mediaContextFromFile(selectedFile)));
        return;
      }
      if (fileId === selectedId) setContentResetKey((k) => k + 1);
      saveContentToDiskNow(findNodeById(useEditorStore.getState().workspace, fileId), content);
    });
    // 只在有新请求时跑；其余值取本次渲染的最新值即可
  }, [externalContentRequests]);

  // 版本历史只对正文编辑器里的文档开放；恢复走 applyContentFromOutside。
  const handleOpenVersionHistory = () => {
    if (!hasDbBridge()) {
      message.info('版本历史仅桌面版可用');
      return;
    }
    if (!selectedFile || selectedUsesBookmarkCard || selectedNeedsConversion) {
      message.info('先打开一篇文档再查看版本历史');
      return;
    }
    setSurface('paper');
    useEditorStore.getState().setEditorMode('edit');
    setVersionHistoryOpen(true);
  };

  const handleRestoreVersion = (content) => applyContentFromOutside(selectedFile?.id, content);

  // 命令面板：把散落各处的入口收成一份可搜索清单，Cmd/Ctrl+K 唤起。
  // 部分 handler（如复制公众号）闭包里带着随渲染变化的正文，统一走 ref 取最新版本，
  // 否则 useMemo 缓存住的会是旧闭包，复制到的是过期内容。
  const {
    open: commandPaletteOpen,
    close: closeCommandPalette,
    show: showCommandPalette,
  } = useCommandPalette();
  const commandHandlersRef = useRef(null);
  const runFileConvertTool = useFileConvertTool();
  commandHandlersRef.current = {
    openCurrentContent: () => setSurface(selectedContentSurface),
    openDaily: () => {
      setDailyCurrentDate(getTodayDateKey());
      setSurface('daily');
    },
    toggleAgentPanel: () => setAgentPanelOpen((v) => !v),
    openWechatPreview: () => setWechatPreviewOpen(true),
    openBookmarkImport: () => setBookmarkImportOpen(true),
    importMarkdown: triggerImportMarkdown,
    copyToWechat: handleCopyToWeChat,
    exportAs: handleExportAs,
    toggleTheme: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
    toggleSidebar: toggleSidebarCollapsed,
    syncFromDisk: () => handleManualSyncLocalProject(currentWorkspaceProjectRoot),
    openVersionHistory: handleOpenVersionHistory,
  };
  const commands = useMemo(() => createCommands({
    openSurface: setSurface,
    openCurrentContent: () => commandHandlersRef.current.openCurrentContent(),
    openDaily: () => commandHandlersRef.current.openDaily(),
    toggleAgentPanel: () => commandHandlersRef.current.toggleAgentPanel(),
    openWechatPreview: () => commandHandlersRef.current.openWechatPreview(),
    openBookmarkImport: () => commandHandlersRef.current.openBookmarkImport(),
    importMarkdown: () => commandHandlersRef.current.importMarkdown(),
    copyToWechat: () => commandHandlersRef.current.copyToWechat(),
    exportAs: (format) => commandHandlersRef.current.exportAs(format),
    toggleTheme: () => commandHandlersRef.current.toggleTheme(),
    toggleSidebar: () => commandHandlersRef.current.toggleSidebar(),
    syncFromDisk: canSyncWorkspaceFromDisk
      ? () => commandHandlersRef.current.syncFromDisk()
      : null,
    openVersionHistory: () => commandHandlersRef.current.openVersionHistory(),
    fileConvertTools: isFileConvertSupported() ? FILE_CONVERT_TOOLS : [],
    runFileConvertTool,
  }), [canSyncWorkspaceFromDisk, setSurface, runFileConvertTool]);

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
        onSelect={selectNode}
        onRemoveLocalProject={handleRemoveLocalProject}
        onManualSyncLocalProject={handleManualSyncLocalProject}
        onReauthorizeLocalProject={handleReauthorizeLocalProject}
        onAddFile={handleAddFile}
        onAddOutline={handleAddOutline}
        onAddScript={handleAddScript}
        onAddFolder={handleAddFolder}
        onMoveNode={handleMoveNode}
        onPinNode={pinNode}
        onRevealLocalProjectEntry={canRevealLocalProject ? handleRevealLocalProjectEntry : null}
        docActions={{
          openVersionHistory: handleOpenVersionHistory,
          exportAs: handleExportAs,
          copyToWechat: handleCopyToWeChat,
        }}
        onRename={handleRename}
        onDelete={handleDelete}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        surface={surface}
        onOpenDaily={() => {
          setDailyCurrentDate(getTodayDateKey());
          setSurface('daily');
        }}
        onOpenSearch={() => setSurface('search')}
        onOpenGraph={() => setSurface('graph')}
        onOpenCurrentContent={() => setSurface(selectedContentSurface)}
        searchQuery={knowledgeSearchQuery}
        onSearchQueryChange={setKnowledgeSearchQuery}
        onOpenSettings={() => (surface === 'settings' ? leaveSettings() : setSurface('settings'))}
        settingsActive={surface === 'settings'}
        platformOptions={publishingPlatforms}
      />
      <div className="right-area immersive-main">
        <UpdateNotifier />
        <CommandPalette
          open={commandPaletteOpen}
          onClose={closeCommandPalette}
          commands={commands}
        />
        {/* 唯一顶栏：折叠 + 面包屑 + 当前文档下拉 | AI 助手 + 主题 */}
        <EditorTopBar
          workspace={workspace}
          selectedId={showDocTabs ? selectedId : null}
          onNavigate={selectNode}
          tabs={displayTabs}
          onCloseTab={closeTab}
          onCloseOtherTabs={closeOtherTabs}
          onCloseAllTabs={closeAllTabs}
          onCloseTabsToTheRight={closeTabsToTheRight}
          onOpenTabExternal={handleOpenBookmarkTabExternal}
          showDocumentContext={showDocTabs}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={toggleSidebarCollapsed}
          theme={theme}
          onThemeChange={setTheme}
          agentPanelOpen={agentPanelOpen}
          onToggleAgentPanel={() => setAgentPanelOpen((v) => !v)}
          onOpenCommandPalette={showCommandPalette}
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
            onCopyStyleChange={setCopyStyle}
            onPublishingPlatformsChange={setPublishingPlatforms}
            onClose={leaveSettings}
            toMarkdown={blockNoteContentToMarkdown}
            local={{
              canOpen: canOpenLocalProject,
              canOpenReadOnly: localProjectCapabilities.canOpenReadOnly,
              canOpenReadWrite: localProjectCapabilities.canOpenReadWrite,
              canWrite: localProjectCapabilities.canWrite,
              canSyncFromDisk: canSyncWorkspaceFromDisk,
              syncLoading: manualSyncLoading,
              onOpenLocalProjectReadOnly: () => handleOpenLocalProject('read-only'),
              onOpenLocalProjectReadWrite: () => handleOpenLocalProject('read-write'),
              onSyncFromDisk: () => handleManualSyncLocalProject(currentWorkspaceProjectRoot),
            }}
            backup={{
              onImport: () => importInputRef.current?.click(),
              onExport: handleExport,
            }}
          />
        ) : surface === 'folder' && selectedFolder ? (
          <FolderFileList
            folder={selectedFolder}
            children={folderChildren}
            onSelectItem={selectNode}
            needsReauthorization={selectedNeedsLocalProjectReauthorization}
            onReauthorize={() => handleReauthorizeLocalProject(selectedFolder.id, 'read-write')}
            showSyncButton={canManualSyncLocalProject}
            syncLoading={manualSyncLoading}
            onSyncFromDisk={handleManualSyncLocalProject}
          />
        ) : surface === 'daily' ? (
          <DailyNotebook
            dailyWorkspace={dailyWorkspace}
            onSetCurrentDate={setDailyCurrentDate}
            onSetBlocks={setDailyBlocks}
            onSetNoteOrganized={setDailyNoteOrganized}
            localProjectSupported={localProjectSupported}
            assetRootPath={projectRootPath}
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
        ) : surface === 'json-tool' ? (
          <Suspense fallback={<div className="surface-loading">正在加载 JSON 解析器…</div>}>
            <JsonTool />
          </Suspense>
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
        ) : !selectedFile ? (
          <DocEmptyState onCreate={() => handleCreateDraftFromDashboard('draft')} />
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
            {/* 文档级动作：参照 Obsidian 的视图头部，独占一条细栏，不遮挡正文 */}
            <EditorQuickToolbar
              leading={outlinePage.isOutline
                ? <OutlineViewSwitch value={outlinePage.view} onChange={outlinePage.setView} />
                : null}
              disabled={!selectedFile}
              isOutline={outlinePage.isOutline}
              onPreparePublish={handleOpenPreparePublish}
              onCopyRichText={handleCopyRichText}
              onCopyMarkdown={handleCopyMarkdown}
              onExportAs={handleExportAs}
              onPreviewWeChat={() => setWechatPreviewOpen(true)}
              onCopyWeChat={handleCopyToWeChat}
              copyStyleName={getTemplateById(copyStyle).name}
              commentCount={openCommentCount}
              commentsOpen={commentsPanelOpen}
              onToggleComments={() => setCommentsPanelOpen(!commentsPanelOpen)}
              headingNumbering={headingNumbering}
              onToggleHeadingNumbering={toggleHeadingNumbering}
            />
            <div className={`editor-layout${outlinePage.showMindMap ? ' is-mindmap' : ''}`}>
              {/* 大纲页的导图：编辑器常挂载只是藏起来，切回大纲光标和撤销栈都还在 */}
              {outlinePage.showMindMap && (
                <MindMapView
                  key={selectedFile.id}
                  tree={outlinePage.mindTree}
                  onSelectNode={outlinePage.handleSelectNode}
                  onOpenLink={openWikilink}
                />
              )}
              <div className="paper-stage">
                <div className="paper-surface" data-testid="paper-surface">
                  <DiffOverlay />
                  <ExternalChangeBanner />
                  {/* 标题下沉进纸面，与正文同列 */}
                  <DocHeader
                    selectedFile={selectedFile}
                    parentLabel={selectedParentLabel}
                    allFiles={allFiles}
                    platformOptions={publishingPlatforms}
                    onTagsChange={setFileTags}
                    onKnowledgeMetaChange={setFileKnowledgeMeta}
                    onFrontmatterPropertyChange={setFileFrontmatterProperty}
                    onOpenFile={selectNode}
                    onOpenVersionHistory={handleOpenVersionHistory}
                    readOnly={selectedReadOnly}
                    titleEditable={!selectedReadOnly && (!selectedInLocalProject || canWriteLocalProject)}
                    {...titleEditing}
                  />
                  {editorMode === 'preview' ? (
                    <div
                      id="markdown-output"
                      className={paperContentClassName}
                      dangerouslySetInnerHTML={{ __html: wechatSourceHtml }}
                    />
                  ) : (
                    <div id="markdown-output" className={paperContentClassName}>
                      <div
                        className="blocknote-paper"
                        onDoubleClick={handlePaperDoubleClick}
                        onBlurCapture={handleSelectAllBlurCapture}
                        onKeyDownCapture={handlePaperKeyDownCapture}
                        onKeyUpCapture={handleSelectAllKeyUpCapture}
                        onPointerDownCapture={resetSelectAllState}
                      >
                        <BlockNoteView
                          editor={editor}
                          className={`blocknote-editor${outlinePage.isOutline ? ' outline-editor' : ''}${scriptPage.isScript ? ' script-editor' : ''}`}
                          data-testid="blocknote-editor"
                          theme={resolvedTheme}
                          editable={Boolean(selectedFile) && !selectedReadOnly}
                          formattingToolbar={false}
                          linkToolbar
                          slashMenu={false}
                          sideMenu={false}
                          filePanel={false}
                          tableHandles
                          emojiPicker={false}
                          onChange={handleEditorChange}
                        >
                          <EditorFormattingToolbarController
                            enableAiRewrite
                            selectionSkillIds={selectionToolbarSkillIds}
                          />
                          <EditorSlashMenu onInsertImages={insertImagesIntoFile} />
                          <EditorDocLinks
                            workspace={workspace}
                            currentFileId={selectedFile?.id}
                          />
                        </BlockNoteView>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* 评论面板常挂载（收起时只负责正文高亮）；展开时让出右侧，不再叠目录 */}
              {editorMode !== 'preview' && (
                <CommentsPanel editor={editor} fileId={selectedFile?.id} />
              )}
              {scriptPage.isScript && <ScriptPanel script={scriptPage} />}
              {!scriptPage.isScript && !commentsVisible && (
                <TocPanel
                  markdown={resolvedMarkdown}
                  collapsed={tocCollapsed}
                  onToggle={toggleTocCollapsed}
                />
              )}
            </div>
            {/* 底部状态栏 */}
            <StatusBar content={resolvedMarkdown} backlinks={0} />
          </>
        )}
          </div>
          {/* 常挂载、用 display 控制显隐：收起时不卸载 AgentPanel，
              避免其卸载清理里的 abort 掐断进行中的回复，也保留输入草稿等面板状态 */}
          <div
            className="agent-panel-dock agent-panel-dock--sidebar"
            style={agentPanelOpen ? undefined : { display: 'none' }}
            aria-hidden={!agentPanelOpen}
          >
            <AgentPanel
              open={agentPanelOpen}
              onClose={() => setAgentPanelOpen(false)}
            />
          </div>
        </div>
      </div>

      <WechatPreviewModal
        open={wechatPreviewOpen}
        onClose={() => setWechatPreviewOpen(false)}
        sourceHtml={wechatSourceHtml}
        initialTemplateId={copyStyle}
        onTemplateChange={setCopyStyle}
      />

      <PreparePublishModal
        open={Boolean(preparePublishSource)}
        onClose={() => setPreparePublishSource(null)}
        sourceFile={preparePublishSource?.file}
        sourceContent={preparePublishSource?.content ?? ''}
        skills={registrySkills}
        initialTemplateId={copyStyle}
        onTemplateChange={setCopyStyle}
        onSavePlatform={handleSavePlatformDraft}
      />

      <VersionHistoryModal
        open={versionHistoryOpen}
        onClose={() => setVersionHistoryOpen(false)}
        file={selectedFile}
        currentContent={markdown}
        toMarkdown={blockNoteContentToMarkdown}
        onRestore={handleRestoreVersion}
        readOnly={selectedReadOnly}
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

      <LocalProjectConflictModal
        open={Boolean(localProjectConflict)}
        conflicts={localProjectConflict?.conflicts ?? []}
        onKeepLocal={() => resolveLocalProjectConflict('keep-local')}
        onUseDisk={() => resolveLocalProjectConflict('use-disk')}
        onDismiss={dismissLocalProjectConflict}
      />
    </div>
  );
}

export default MarkdownEditor;
