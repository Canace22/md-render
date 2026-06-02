import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteEditor, BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import DocHeader from './DocHeader.jsx';
import EditorQuickToolbar from './EditorQuickToolbar.jsx';
import FolderFileList from './FolderFileList.jsx';
import NotionPanel from './NotionPanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import WechatPreviewModal from './WechatPreviewModal.jsx';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import {
  createEmptyDocument,
  extractCodeBlockFromClipboardHtml,
  getBlockTextContent,
  getMarkdownCodeFenceLanguage,
  looksLikeCodeBlockClipboardHtml,
  looksLikeMarkdownCodeFenceClipboardText,
  looksLikeMarkdownClipboardText,
  normalizeMarkdown,
} from '../utils/markdownUtils';
import { applyThemeToBody } from '../utils/themeUtils';
import { copyToWeChat } from '../utils/wechatCopy';
import { getTemplateById } from '../utils/wechatTemplates';
import { blocksToMarkdown, markdownToBlocks } from '../utils/notionConverter.js';
import { cleanPageId, fetchBlocks, isLocalDevMode, updatePageBlocks } from '../utils/notionService.js';
import { batchPull, batchPush } from '../utils/notionBatchSync.js';
import { MarkdownParser, MarkdownRenderer } from '../core';
import { useTitleEditing } from '../hooks/useTitleEditing.js';
import { useWorkspaceActions } from '../hooks/useWorkspaceActions.js';
import { useEditorStore, useSelectedFile } from '../store/useEditorStore.js';
import { buildUniqueName, collectFiles, findNodeById } from '../store/workspaceUtils.js';
import { downloadMarkdownFile, ensureMarkdownDownloadName } from '../utils/markdownIO.js';
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

function MarkdownEditor() {
  const {
    workspace,
    selectedId,
    markdown,
    sidebarCollapsed,
    theme,
    copyStyle,
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
    mergeNotionFilePages,
    toggleSidebarCollapsed,
    updateSelectedFileContent,
    selectNode,
    addFile,
    addFolder,
    applyRename,
    deleteNode,
    importWorkspace,
    insertWorkspaceNode,
    syncMarkdownFromSelectedFile,
    syncSelectedIdFromWorkspace,
  } = useEditorStore();

  const selectedFile = useSelectedFile();
  const selectedNode = useMemo(() => findNodeById(workspace, selectedId), [workspace, selectedId]);
  const selectedFolder = selectedNode?.type === 'folder' ? selectedNode : null;
  const folderFiles = useMemo(
    () => (selectedFolder ? collectFiles(selectedFolder) : []),
    [selectedFolder],
  );
  const contentSurface = selectedFolder ? 'folder' : 'paper';
  const linkedNotionPageId = selectedFile ? notionFilePages[selectedFile.id] ?? '' : '';
  const notionLocalDev = isLocalDevMode();
  const importInputRef = useRef(null);
  const markdownImportInputRef = useRef(null);
  const lastSyncedMarkdownRef = useRef(normalizeMarkdown(markdown));
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());
  const titleEditing = useTitleEditing(selectedFile, applyRename);
  const { handleRename, handleDelete, handleExport, handleImport } = useWorkspaceActions({
    workspace,
    selectedId,
    applyRename,
    deleteNode,
    importWorkspace,
  });
  const [wechatPreviewOpen, setWechatPreviewOpen] = useState(false);
  const [contentResetKey, setContentResetKey] = useState(0);
  const [notionMessage, setNotionMessage] = useState('');
  const [notionError, setNotionError] = useState('');
  const [notionPullLoading, setNotionPullLoading] = useState(false);
  const [notionPushLoading, setNotionPushLoading] = useState(false);
  const [batchPullLoading, setBatchPullLoading] = useState(false);
  const [batchPushLoading, setBatchPushLoading] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null);

  const initialContent = useMemo(() => {
    const sourceMarkdown = normalizeMarkdown(markdown);
    lastSyncedMarkdownRef.current = sourceMarkdown;

    if (!sourceMarkdown) {
      return createEmptyDocument();
    }

    const parserEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
    const parsedBlocks = parserEditor.tryParseMarkdownToBlocks(sourceMarkdown);
    return parsedBlocks.length > 0 ? parsedBlocks : createEmptyDocument();
  }, [selectedId, contentResetKey]);

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

        return defaultPasteHandler({
          prioritizeMarkdownOverHTML: false,
          plainTextAsMarkdown: false,
        });
      },
    },
    [selectedId, contentResetKey],
  );

  const wechatSourceHtml = useMemo(() => {
    const tokens = parserRef.current.parse(markdown);
    return rendererRef.current.render(tokens);
  }, [markdown]);

  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';

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

  const handleImportMarkdown = useCallback((event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = normalizeMarkdown(String(reader.result ?? ''));
      const { selectedId, addFile } = useEditorStore.getState();
      addFile(selectedId);
      const after = useEditorStore.getState();
      after.updateSelectedFileContent(text);
      const stem = file.name.replace(/\.(md|markdown|txt)$/i, '').trim() || '导入';
      const uniqueName = buildUniqueName(after.workspace, stem, '.md');
      after.applyRename(after.selectedId, uniqueName);
      setContentResetKey((k) => k + 1);
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
  }, []);

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
      setContentResetKey((k) => k + 1);
      setNotionMessage('已从 Notion 拉取并覆盖当前文档。');
    } catch (e) {
      setNotionError(e?.message || '拉取失败');
    } finally {
      setNotionPullLoading(false);
    }
  }, [notionLocalDev, selectedFile, notionToken, linkedNotionPageId, updateSelectedFileContent]);

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
    syncMarkdownFromSelectedFile();
    syncSelectedIdFromWorkspace();
  }, [selectedFile, workspace, markdown, syncMarkdownFromSelectedFile, syncSelectedIdFromWorkspace]);

  return (
    <div className="container immersive-shell">
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
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        style={{ display: 'none' }}
        onChange={handleImportMarkdown}
        data-testid="import-markdown-input"
        aria-hidden
      />
      <WorkspaceSidebar
        workspace={workspace}
        selectedId={selectedId}
        onSelect={selectNode}
        onAddFile={addFile}
        onAddFolder={addFolder}
        onRename={handleRename}
        onDelete={handleDelete}
        onImportMarkdown={() => markdownImportInputRef.current?.click()}
        onExportMarkdown={handleExportMarkdown}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        onOpenSettings={() => setSurface(surface === 'settings' ? contentSurface : 'settings')}
        onOpenNotion={() => setSurface(surface === 'notion' ? contentSurface : 'notion')}
        settingsActive={surface === 'settings'}
        notionActive={surface === 'notion'}
      />
      <div className="right-area immersive-main">
        {surface === 'settings' ? (
          <SettingsPanel
            selectedFileName={selectedFile?.name}
            theme={theme}
            copyStyle={copyStyle}
            onThemeChange={setTheme}
            onCopyStyleChange={setCopyStyle}
            onImport={() => importInputRef.current?.click()}
            onExport={handleExport}
            onOpenNotion={() => setSurface('notion')}
            onClose={() => setSurface(contentSurface)}
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
            onClose={() => setSurface(contentSurface)}
          />
        ) : surface === 'folder' && selectedFolder ? (
          <FolderFileList
            folder={selectedFolder}
            files={folderFiles}
            onOpenFile={selectNode}
          />
        ) : (
          <>
            <DocHeader
              selectedFile={selectedFile}
              onOpenNotion={() => setSurface('notion')}
              notionLinked={Boolean(notionLocalDev && linkedNotionPageId && notionToken?.trim())}
              onTagsChange={setFileTags}
              {...titleEditing}
            />
            <EditorQuickToolbar
              editor={editor}
              disabled={!selectedFile}
              onPreviewWeChat={() => setWechatPreviewOpen(true)}
              onCopyWeChat={handleCopyToWeChat}
              copyStyleName={getTemplateById(copyStyle).name}
            />
            <div className="editor-layout">
              <div className="paper-stage">
                <div className="paper-surface" data-testid="paper-surface">
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
                </div>
              </div>
            </div>
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
    </div>
  );
}

export default MarkdownEditor;
