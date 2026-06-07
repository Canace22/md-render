import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { message } from 'antd';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteEditor, BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import DocHeader from './DocHeader.jsx';
import AIActionModal from './AIActionModal.jsx';
import EditorQuickToolbar from './EditorQuickToolbar.jsx';
import FolderFileList from './FolderFileList.jsx';
import CreationDashboard from './CreationDashboard.jsx';
import CreationBoardPanel from './CreationBoardPanel.jsx';
import KnowledgeBasePanel from './KnowledgeBasePanel.jsx';
import NotionPanel from './NotionPanel.jsx';
import PublishingQueuePanel from './PublishingQueuePanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import WechatPreviewModal from './WechatPreviewModal.jsx';
import BookmarkImportModal from './BookmarkImportModal.jsx';
import BookmarkCard from './BookmarkCard.jsx';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import FilePreviewPanel from './FilePreviewPanel.jsx';
import TocPanel from './TocPanel.jsx';
import TabBar from './TabBar.jsx';
import Breadcrumb from './Breadcrumb.jsx';
import StatusBar from './StatusBar.jsx';
import UpdateNotifier from './UpdateNotifier.jsx';
import {
  createEmptyDocument,
  extractCodeBlockFromClipboardHtml,
  getBlockTextContent,
  getMarkdownCodeFenceLanguage,
  looksLikeCodeBlockClipboardHtml,
  looksLikeMarkdownCodeFenceClipboardText,
  looksLikeMarkdownClipboardText,
  looksLikePlainTextHtml,
  normalizeMarkdown,
} from '../utils/markdownUtils';
import { applyThemeToBody } from '../utils/themeUtils';
import { copyToWeChat, htmlToPlainText } from '../utils/wechatCopy';
import { getTemplateById } from '../utils/wechatTemplates';
import { blocksToMarkdown, markdownToBlocks } from '../utils/notionConverter.js';
import { cleanPageId, fetchBlocks, isLocalDevMode, updatePageBlocks } from '../utils/notionService.js';
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
  PLATFORM_OPTIONS,
} from '../store/creationUtils.js';
import { useEditorStore, useSelectedFile } from '../store/useEditorStore.js';
import {
  buildUniqueName,
  buildUniqueNameInFolder,
  collectFiles,
  createLocalProjectFileNode,
  createLocalProjectFolderNode,
  findNodeIdByRelativePath,
  findNodeById,
  findParentId,
  getFolderDirectChildren,
  nameExistsAmongSiblings,
  replaceRelativePathBasename,
  ensureRenameFileName,
  resolveLocalProjectCreateTarget,
} from '../store/workspaceUtils.js';
import { downloadMarkdownFile, ensureMarkdownDownloadName } from '../utils/markdownIO.js';
import { convertToMarkdown, IMPORT_ACCEPT, needsConversion } from '../utils/fileConverters.js';
import {
  buildBookmarkClipDocument,
  buildFallbackBookmarkClip,
  sanitizeBookmarkFileStem,
} from '../utils/bookmarkClipper.js';
import { DEFAULT_TARGET_PLATFORMS } from '../utils/publishingPlatforms.js';
import {
  buildAIActionContext,
  buildAIActionPrompt,
  getAIAction,
} from '../utils/aiActions.js';
import { exportDocument } from '../utils/exportService.js';
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

const EDITOR_SCHEMA = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec({
      supportedLanguages: CODE_BLOCK_LANGUAGES,
      defaultLanguage: 'text',
      createHighlighter: createCodeBlockHighlighter,
    }),
  },
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
const PLATFORM_LABELS = new Map(PLATFORM_OPTIONS.map((item) => [item.value, item.label]));

const stripMarkdownExtension = (name = '') => String(name).replace(/\.md$/i, '');
const truncateInlineText = (value, maxLength = 96) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

const getStatusLabel = (status) => STATUS_LABELS.get(status) ?? status ?? '待整理';
const getPrimaryPlatformLabel = (platforms = []) => {
  const primary = Array.isArray(platforms) ? platforms[0] : '';
  return PLATFORM_LABELS.get(primary) ?? primary ?? '待选渠道';
};
const getParsedWordCount = (content = '') => {
  return String(content ?? '')
    .replace(/\s+/g, '')
    .trim()
    .length;
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
    notionToken,
    notionFilePages,
    notionDatabaseId,
    setTheme,
    setCopyStyle,
    setSurface,
    setNotionToken,
    setNotionDatabaseId,
    setFileNotionPageId,
    setFileTags,
    setFileKnowledgeMeta,
    mergeNotionFilePages,
    toggleSidebarCollapsed,
    toggleTocCollapsed,
    updateSelectedFileContent,
    selectNode,
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
    toggleEditorMode,
  } = useEditorStore();

  const selectedFile = useSelectedFile();
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
      title: stripMarkdownExtension(file.name),
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
      title: stripMarkdownExtension(item.name),
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
      title: stripMarkdownExtension(file.name),
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
        title: stripMarkdownExtension(file.name),
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
      channel: getPrimaryPlatformLabel(item.targetPlatforms),
    }));
  }, [publishingQueueItems]);
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
          title: stripMarkdownExtension(file.name),
          summary: file.summary || truncateInlineText(file.content, 100),
          updatedAt: file.updatedAt,
          createdAt: file.createdAt,
          draftStatus: resolvedStatus ?? file.draftStatus,
          targetPlatforms: file.targetPlatforms ?? [],
          wordCount: getParsedWordCount(file.content),
        };
      });
  }, [allFiles]);
  const linkedNotionPageId = selectedFile ? notionFilePages[selectedFile.id] ?? '' : '';
  const notionLocalDev = isLocalDevMode();
  const importInputRef = useRef(null);
  const markdownImportInputRef = useRef(null);
  const projectSaveTimersRef = useRef(new Map());
  const lastContentSurfaceRef = useRef(surface);
  const lastSyncedMarkdownRef = useRef(normalizeMarkdown(markdown));
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());
  const localProjectSupported = isLocalProjectSupported();
  const [knowledgeSearchQuery, setKnowledgeSearchQuery] = useState('');
  const performRename = useCallback(async (targetId, rawName) => {
    const trimmed = String(rawName ?? '').trim();
    if (!trimmed) return false;

    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, targetId);
    if (!node) return false;

    if (node.projectRootPath && node.relativePath && localProjectSupported) {
      const parentId = findParentId(state.workspace, targetId) ?? state.workspace.id;
      const parent = findNodeById(state.workspace, parentId) ?? state.workspace;

      const diskName = node.type === 'file'
        ? ensureRenameFileName(trimmed, node.name)
        : trimmed;
      if (nameExistsAmongSiblings(parent, diskName, targetId)) return false;
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

    return useEditorStore.getState().applyRename(targetId, trimmed);
  }, [localProjectSupported]);

  const titleEditing = useTitleEditing(selectedFile, performRename);
  const { handleExport, handleImport } = useWorkspaceActions({
    workspace,
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
  const [wechatPreviewOpen, setWechatPreviewOpen] = useState(false);
  const [bookmarkImportOpen, setBookmarkImportOpen] = useState(false);
  const [contentResetKey, setContentResetKey] = useState(0);
  const editorReloadToken = useEditorStore((state) => state.editorReloadToken);
  const [notionMessage, setNotionMessage] = useState('');
  const [notionError, setNotionError] = useState('');
  const [notionPullLoading, setNotionPullLoading] = useState(false);
  const [notionPushLoading, setNotionPushLoading] = useState(false);
  const [batchPullLoading, setBatchPullLoading] = useState(false);
  const [batchPushLoading, setBatchPushLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);
  const [manualSyncLoading, setManualSyncLoading] = useState(false);
  const [aiActionState, setAIActionState] = useState(null);
  const [aiResultDraft, setAIResultDraft] = useState('');
  const selectedNeedsConversion = Boolean(
    selectedFile?.needsConversion
      || (selectedFile?.projectRootPath && selectedFile?.name && needsConversion(selectedFile.name)),
  );
  const [previewData, setPreviewData] = useState({ rawContent: '', fileUrl: '', previewHtml: '', excelSheets: null });
  const [previewLoading, setPreviewLoading] = useState(false);
  const canSaveLocalProjectFile = localProjectSupported
    && Boolean(selectedProjectRootPath && selectedFile?.relativePath)
    && !selectedNeedsConversion;
  const canManualSyncLocalProject = localProjectSupported && Boolean(manualSyncProjectRootPath);
  const visibleStorageMode = hasLocalProjectWorkspace ? 'project' : storageMode;
  const visibleProjectRootPath = hasLocalProjectWorkspace ? '已导入本地目录' : '';

  const initialContent = useMemo(() => {
    const sourceMarkdown = normalizeMarkdown(markdown);
    lastSyncedMarkdownRef.current = sourceMarkdown;

    if (!sourceMarkdown) {
      return createEmptyDocument();
    }

    const parserEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
    const parsedBlocks = parserEditor.tryParseMarkdownToBlocks(sourceMarkdown);
    return parsedBlocks.length > 0 ? parsedBlocks : createEmptyDocument();
  }, [selectedId, contentResetKey, editorReloadToken]);

  const editor = useCreateBlockNote(
    {
      ...BLOCKNOTE_OPTIONS,
      initialContent,
      pasteHandler: ({ event, editor: pasteEditor, defaultPasteHandler }) => {
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

  const wechatSourceHtml = useMemo(() => {
    const tokens = parserRef.current.parse(markdown);
    return rendererRef.current.render(tokens);
  }, [markdown]);

  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
  const selectedContentSurface = selectedFolder ? 'folder' : selectedFile ? 'paper' : 'overview';

  useEffect(() => {
    if (surface !== 'settings' && surface !== 'notion') {
      lastContentSurfaceRef.current = surface;
    }
  }, [surface]);

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
    tryConvertTypedMarkdownCodeFence();

    const nextMarkdown = normalizeMarkdown(editor.blocksToMarkdownLossy(editor.document));
    if (nextMarkdown === lastSyncedMarkdownRef.current) return;
    lastSyncedMarkdownRef.current = nextMarkdown;
    updateSelectedFileContent(nextMarkdown);
    if (canSaveLocalProjectFile) {
      const existingTimer = projectSaveTimersRef.current.get(selectedFile.id);
      if (existingTimer) {
        window.clearTimeout(existingTimer);
      }
      setDiskSavePending(selectedFile.id, true);
      const timerId = window.setTimeout(async () => {
        try {
          await saveLocalProjectFile({
            projectRootPath: selectedProjectRootPath,
            relativePath: selectedFile.relativePath,
            content: nextMarkdown,
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

  const handleOpenAIAction = useCallback((actionKey) => {
    const action = getAIAction(actionKey);
    if (!action) return;
    const selectionText = getSelectedEditorText();
    const documentForAI = {
      ...selectedFile,
      title: selectedFile?.name?.replace(/\.md$/i, '') ?? '',
      summary: selectedFile?.summary ?? '',
      content: markdown,
    };

    const context = buildAIActionContext({
      actionKey,
      selectionText,
      document: documentForAI,
    });

    setAIResultDraft('');
    setAIActionState({
      ...action,
      ...context,
      generatedPrompt: buildAIActionPrompt({
        actionKey,
        selectionText,
        document: documentForAI,
      }),
    });
  }, [markdown, selectedFile]);

  const handleCopyAIPrompt = useCallback(async () => {
    const prompt = aiActionState?.generatedPrompt ?? '';
    if (!prompt.trim()) return;
    try {
      await navigator.clipboard.writeText(prompt);
      message.success('Prompt 已复制');
    } catch (error) {
      console.error('复制 AI Prompt 失败:', error);
      message.error('复制 Prompt 失败');
    }
  }, [aiActionState]);

  const handleApplyAIResult = useCallback(() => {
    const nextText = normalizeMarkdown(aiResultDraft);
    if (!nextText) return;

    const parsedBlocks = editor.tryParseMarkdownToBlocks(nextText);
    const blocksToInsert = parsedBlocks.length > 0
      ? parsedBlocks
      : [{ type: 'paragraph', content: nextText }];
    const anchorBlock = editor.getTextCursorPosition()?.block ?? editor.document?.[editor.document.length - 1];

    if (!anchorBlock) {
      message.warning('当前无法定位插入位置');
      return;
    }

    editor.insertBlocks(blocksToInsert, anchorBlock, 'after');
    editor.focus();
    setAIActionState(null);
    setAIResultDraft('');
    message.success('AI 内容已插入到文档');
  }, [aiResultDraft, editor]);

  const handleCopyRichText = async () => {
    const html = wechatSourceHtml;
    if (!html.trim()) {
      alert('没有可复制的内容');
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
      document.execCommand('copy');
      document.body.removeChild(container);
      sel.removeAllRanges();
    }
  };

  const handleCopyToWeChat = async () => {
    const html = wechatSourceHtml;
    if (!html.trim()) {
      alert('没有可复制的内容');
      return;
    }
    await copyToWeChat(html, { templateId: copyStyle });
  };

  const handleExportMarkdown = useCallback(() => {
    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, state.selectedId);
    if (node?.type !== 'file') {
      alert('请先选中一个文档后再导出 Markdown。');
      return;
    }
    const filename = ensureMarkdownDownloadName(node.name);
    downloadMarkdownFile(normalizeMarkdown(state.markdown), filename);
  }, []);

  const handleExportAs = useCallback(async (format) => {
    const state = useEditorStore.getState();
    const node = findNodeById(state.workspace, state.selectedId);
    if (node?.type !== 'file') {
      alert('请先选中一个文档后再导出。');
      return;
    }
    const md = normalizeMarkdown(state.markdown);
    const title = node.name.replace(/\.[^.]+$/, '');
    const filename = title || '导出文档';
    const tokens = parserRef.current.parse(md);
    const html = rendererRef.current.render(tokens);
    await exportDocument(format, { markdown: md, html, title, filename });
  }, []);

  const ensureLocalMdRenderWorkspace = useCallback(async () => {
    if (!localProjectSupported) return null;
    const state = useEditorStore.getState();
    if (state.projectRootPath) return state.projectRootPath;

    // 按需初始化本地目录，避免应用启动时直接触发 macOS Documents 权限弹窗。
    const result = await ensureMdRenderWorkspace();
    if (!result?.projectRootPath) return null;

    hydrateProjectsWorkspace(result);
    return result.projectRootPath;
  }, [localProjectSupported, hydrateProjectsWorkspace]);

  const handleImportMarkdown = useCallback((event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    const isDocx = /\.docx$/i.test(file.name);
    const reader = new FileReader();

    reader.onload = async () => {
      try {
        const raw = reader.result;
        const markdownText = normalizeMarkdown(await convertToMarkdown(file.name, raw));
        const stem = file.name.replace(/\.[^.]+$/, '').trim() || '导入';

        if (localProjectSupported) {
          const projectRootPath = await ensureLocalMdRenderWorkspace();
          if (!projectRootPath) {
            alert('无法初始化本地 Projects 目录，请稍后重试。');
            return;
          }
          const state = useEditorStore.getState();
          const target = resolveLocalProjectCreateTarget(state.workspace, state.selectedId, projectRootPath);
          if (!target) {
            alert('无法定位本地 Projects 目录，请稍后重试。');
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
          return;
        }

        const { selectedId, addFile } = useEditorStore.getState();
        if (!addFile(selectedId)) {
          alert('本地项目目录暂不支持新建文件，请先在磁盘目录中创建文件后重新打开项目。');
          return;
        }
        const after = useEditorStore.getState();
        after.updateSelectedFileContent(markdownText);
        const uniqueName = buildUniqueName(after.workspace, stem, '.md');
        after.applyRename(after.selectedId, uniqueName);
        setContentResetKey((k) => k + 1);
      } catch (error) {
        console.error('导入文件失败:', error);
        alert(error?.message || '导入文件失败，格式可能不受支持。');
      }
    };

    // DOCX 需要以 ArrayBuffer 读取，其余以文本读取
    if (isDocx) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
    event.target.value = '';
  }, [localProjectSupported, insertLocalProjectNode, ensureLocalMdRenderWorkspace]);

  const handleAddFile = useCallback(async (contextNodeId) => {
    if (localProjectSupported) {
      try {
        const projectRootPath = await ensureLocalMdRenderWorkspace();
        if (!projectRootPath) {
          alert('无法初始化本地 Projects 目录，请稍后重试。');
          return;
        }
        const state = useEditorStore.getState();
        const target = resolveLocalProjectCreateTarget(
          state.workspace,
          contextNodeId ?? state.selectedId,
          projectRootPath,
        );
        if (!target) {
          alert('无法定位本地 Projects 目录，请稍后重试。');
          return;
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
      } catch (error) {
        console.error('新建本地文件失败:', error);
        alert(error?.message || '新建本地文件失败');
      }
      return;
    }

    if (!addFile(contextNodeId)) {
      alert('本地项目目录暂不支持新建文件，请先在磁盘目录中创建文件后重新打开项目。');
    }
  }, [localProjectSupported, ensureLocalMdRenderWorkspace, addFile, insertLocalProjectNode]);

  const handleAddFolder = useCallback(async (contextNodeId) => {
    if (localProjectSupported) {
      try {
        const projectRootPath = await ensureLocalMdRenderWorkspace();
        if (!projectRootPath) {
          alert('无法初始化本地 Projects 目录，请稍后重试。');
          return;
        }
        const state = useEditorStore.getState();
        const target = resolveLocalProjectCreateTarget(
          state.workspace,
          contextNodeId ?? state.selectedId,
          projectRootPath,
        );
        if (!target) {
          alert('无法定位本地 Projects 目录，请稍后重试。');
          return;
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
      } catch (error) {
        console.error('新建本地文件夹失败:', error);
        alert(error?.message || '新建本地文件夹失败');
      }
      return;
    }

    if (!addFolder(contextNodeId)) {
      alert('本地项目目录暂不支持新建文件夹，请先在磁盘目录中创建文件夹后重新打开项目。');
    }
  }, [localProjectSupported, ensureLocalMdRenderWorkspace, addFolder, insertLocalProjectNode]);

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
      targetPlatforms: DEFAULT_TARGET_PLATFORMS.slice(),
    });
    if (!localProjectSupported) {
      after.applyRename(nextFileId, buildUniqueName(after.workspace, '新稿件', '.md'));
    }
  }, [handleAddFile, localProjectSupported, setSurface]);

  const handleCreateEntryWithStatus = useCallback(async (nextStatus) => {
    const beforeSelectedId = useEditorStore.getState().selectedId;
    await handleAddFile();
    const after = useEditorStore.getState();
    const nextFileId = after.selectedId;
    const nextFile = findNodeById(after.workspace, nextFileId);
    if (!nextFile || nextFile.type !== 'file' || nextFileId === beforeSelectedId) return;

    const targetPlatforms = nextStatus === 'ready' || nextStatus === 'published'
      ? DEFAULT_TARGET_PLATFORMS.slice()
      : [];
    after.setFileKnowledgeMeta(nextFileId, {
      draftStatus: nextStatus,
      targetPlatforms,
    });

    if (!localProjectSupported) {
      const nameMap = {
        idea: '新选题',
        collecting: '新资料单',
        drafting: '新稿件',
        revising: '待修改稿',
        ready: '待发布稿',
        published: '已发布稿',
      };
      after.applyRename(nextFileId, buildUniqueName(after.workspace, nameMap[nextStatus] ?? '新稿件', '.md'));
    }
  }, [handleAddFile, localProjectSupported]);

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
      alert('打开本地项目仅支持桌面版应用。');
      return;
    }
    try {
      const result = await openLocalProject();
      if (!result || result.canceled) return;
      const projects = Array.isArray(result.projects)
        ? result.projects
        : [{ workspace: result.workspace, projectRootPath: result.projectRootPath }];
      if (!projects.some((project) => project?.workspace)) return;
      projects.forEach((project) => {
        if (project?.workspace) {
          openLocalProjectWorkspace(project.workspace, project.projectRootPath);
        }
      });
      setContentResetKey((k) => k + 1);
    } catch (error) {
      console.error('打开本地项目失败:', error);
      alert(error?.message || '打开本地项目失败');
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
    if (!notionLocalDev || !selectedFile || !notionToken?.trim() || !linkedNotionPageId?.trim()) return;
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
    notionLocalDev,
    canSaveLocalProjectFile,
    selectedProjectRootPath,
    selectedFile,
    notionToken,
    linkedNotionPageId,
    updateSelectedFileContent,
  ]);

  const handleNotionPush = useCallback(async () => {
    if (!notionLocalDev || !selectedFile || !notionToken?.trim() || !linkedNotionPageId?.trim()) return;
    setNotionError('');
    setNotionMessage('');
    setNotionPushLoading(true);
    try {
      const id = cleanPageId(linkedNotionPageId);
      const blocks = markdownToBlocks(normalizeMarkdown(markdown));
      await updatePageBlocks(id, blocks, notionToken);
      setNotionMessage('已推送到 Notion。');
    } catch (e) {
      setNotionError(e?.message || '推送失败');
    } finally {
      setNotionPushLoading(false);
    }
  }, [notionLocalDev, selectedFile, notionToken, linkedNotionPageId, markdown, updateSelectedFileContent]);

  const handleBatchPull = useCallback(async () => {
    if (!notionLocalDev || !notionToken?.trim() || !notionDatabaseId?.trim()) return;
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
  }, [notionLocalDev, notionToken, notionDatabaseId, insertWorkspaceNode, mergeNotionFilePages]);

  const handleBatchPush = useCallback(async () => {
    if (!notionLocalDev || !notionToken?.trim() || !notionDatabaseId?.trim()) return;
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
  }, [notionLocalDev, notionToken, notionDatabaseId, selectedFolder, workspace, notionFilePages, mergeNotionFilePages]);

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

        let clip;
        try {
          const snapshot = await fetchBookmarkPageSnapshot({ url: sourceUrl });
          clip = await buildBookmarkClipDocument(item, snapshot);
        } catch (error) {
          clip = buildFallbackBookmarkClip(item, error?.message || '正文抓取失败，已保留原链接。');
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
        const projectRootPath = await ensureLocalMdRenderWorkspace();
        if (!projectRootPath) { alert('无法初始化本地 Projects 目录'); return; }
        const state = useEditorStore.getState();
        const target = resolveLocalProjectCreateTarget(state.workspace, state.selectedId, projectRootPath);
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
  }, [selectedFile, previewData, localProjectSupported, insertLocalProjectNode, ensureLocalMdRenderWorkspace]);

  useEffect(() => {
    syncMarkdownFromSelectedFile();
    syncSelectedIdFromWorkspace();
  }, [selectedFile, workspace, markdown, syncMarkdownFromSelectedFile, syncSelectedIdFromWorkspace]);

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
        onOpenLocalProject={handleOpenLocalProject}
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
        onOpenOverview={() => setSurface('overview')}
        onOpenSearch={() => setSurface('search')}
        onOpenGraph={() => setSurface('graph')}
        onOpenCurrentContent={() => setSurface(selectedContentSurface)}
        searchQuery={knowledgeSearchQuery}
        onSearchQueryChange={setKnowledgeSearchQuery}
        onOpenSettings={() => setSurface(surface === 'settings' ? lastContentSurfaceRef.current : 'settings')}
        onOpenNotion={() => setSurface(surface === 'notion' ? lastContentSurfaceRef.current : 'notion')}
        settingsActive={surface === 'settings'}
        notionActive={surface === 'notion'}
        localProjectSupported={localProjectSupported}
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
        />

        {surface === 'settings' ? (
          <SettingsPanel
            selectedFileName={selectedFile?.name}
            theme={theme}
            copyStyle={copyStyle}
            storageMode={visibleStorageMode}
            projectRootPath={visibleProjectRootPath}
            localProjectSupported={localProjectSupported}
            onThemeChange={setTheme}
            onCopyStyleChange={setCopyStyle}
            onOpenLocalProject={handleOpenLocalProject}
            onImport={() => importInputRef.current?.click()}
            onExport={handleExport}
            onOpenNotion={() => setSurface('notion')}
            onClose={() => setSurface(lastContentSurfaceRef.current)}
          />
        ) : surface === 'notion' ? (
          <NotionPanel
            selectedFileName={selectedFile?.name}
            canSync={Boolean(selectedFile)}
            token={notionToken}
            pageId={linkedNotionPageId}
            databaseId={notionDatabaseId}
            onTokenChange={setNotionToken}
            onPageIdChange={(v) => {
              if (selectedFile) setFileNotionPageId(selectedFile.id, v);
            }}
            onDatabaseIdChange={setNotionDatabaseId}
            onPull={handleNotionPull}
            onPush={handleNotionPush}
            onBatchPull={handleBatchPull}
            onBatchPush={handleBatchPush}
            pullLoading={notionPullLoading}
            pushLoading={notionPushLoading}
            batchPullLoading={batchPullLoading}
            batchPushLoading={batchPushLoading}
            batchProgress={batchProgress}
            message={notionMessage}
            error={notionError}
            onClose={() => setSurface(lastContentSurfaceRef.current)}
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
        ) : surface === 'creation-board' ? (
          <CreationBoardPanel
            items={creationBoardItems}
            statusOptions={CREATION_STATUS_OPTIONS}
            onOpenItem={handleBoardOpenItem}
            onMoveStatus={handleBoardMoveStatus}
            onCreate={handleCreateEntryWithStatus}
          />
        ) : surface === 'publishing' ? (
          <PublishingQueuePanel
            items={publishingQueueItems}
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
            {/* 面包屑 + 编辑/预览切换 */}
            <div className="obsidian-header-bar">
              <Breadcrumb workspace={workspace} selectedId={selectedId} onNavigate={selectNode} />
              <button
                type="button"
                className={`editor-mode-toggle${editorMode === 'preview' ? ' is-preview' : ''}`}
                onClick={toggleEditorMode}
                title={editorMode === 'preview' ? '切换到编辑模式' : '切换到预览模式'}
                aria-label={editorMode === 'preview' ? '编辑模式' : '预览模式'}
              >
                {editorMode === 'preview' ? '预览' : '编辑'}
              </button>
            </div>

            <DocHeader
              selectedFile={selectedFile}
              allFiles={allFiles}
              onOpenNotion={() => setSurface('notion')}
              notionLinked={Boolean(notionLocalDev && linkedNotionPageId && notionToken?.trim())}
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
              onAIAction={handleOpenAIAction}
              onPreviewWeChat={() => setWechatPreviewOpen(true)}
              onCopyWeChat={handleCopyToWeChat}
              onCopyRichText={handleCopyRichText}
              copyStyleName={getTemplateById(copyStyle).name}
            />
            <div className="editor-layout">
              <div className="paper-stage">
                <div className="paper-surface" data-testid="paper-surface">
                  {editorMode === 'preview' ? (
                    <div
                      id="markdown-output"
                      className="paper-content"
                      dangerouslySetInnerHTML={{ __html: wechatSourceHtml }}
                    />
                  ) : (
                    <div id="markdown-output" className="paper-content">
                      <div className="blocknote-paper">
                        <BlockNoteView
                          editor={editor}
                          className="blocknote-editor"
                          data-testid="blocknote-editor"
                          theme={resolvedTheme}
                          editable={Boolean(selectedFile)}
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
            <StatusBar content={markdown} backlinks={0} />
          </>
        )}
      </div>

      <WechatPreviewModal
        open={wechatPreviewOpen}
        onClose={() => setWechatPreviewOpen(false)}
        sourceHtml={wechatSourceHtml}
        initialTemplateId={copyStyle}
        onTemplateChange={setCopyStyle}
      />

      <AIActionModal
        open={Boolean(aiActionState)}
        action={aiActionState}
        sourceText={aiActionState?.sourceText ?? ''}
        scopeLabel={aiActionState?.scopeLabel ?? ''}
        generatedPrompt={aiActionState?.generatedPrompt ?? ''}
        resultDraft={aiResultDraft}
        onResultDraftChange={setAIResultDraft}
        onCopyPrompt={handleCopyAIPrompt}
        onApplyResult={handleApplyAIResult}
        onClose={() => {
          setAIActionState(null);
          setAIResultDraft('');
        }}
      />

      <BookmarkImportModal
        open={bookmarkImportOpen}
        onClose={() => setBookmarkImportOpen(false)}
        onImport={handleImportBookmarks}
      />
    </div>
  );
}

export default MarkdownEditor;
