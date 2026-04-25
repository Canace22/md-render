import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { SuggestionMenuController } from '@blocknote/react';
import { BlockNoteEditor, BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs } from '@blocknote/core';
import { SuggestionMenu as SuggestionMenuExtension, filterSuggestionItems } from '@blocknote/core/extensions';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import { Copy } from 'lucide-react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import DocHeader from './DocHeader.jsx';
import EditorQuickToolbar from './EditorQuickToolbar.jsx';
import NovelAssistantPanel from './NovelAssistantPanel.jsx';
import SettingsPanel from './SettingsPanel.jsx';
import NovelEntityMark from './NovelEntityMark.jsx';
import NovelEntityPreviewModal from './NovelEntityPreviewModal.jsx';
import NovelMentionMenu from './NovelMentionMenu.jsx';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import {
  applyNovelEntityHighlights,
  clearNovelEntityHighlights,
  findClickedNovelEntity,
} from '../utils/novelEntityHighlight';
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
import { MarkdownParser, MarkdownRenderer } from '../core';
import { useTitleEditing } from '../hooks/useTitleEditing.js';
import { useWorkspaceActions } from '../hooks/useWorkspaceActions.js';
import { useEditorStore, useSelectedFile } from '../store/useEditorStore.js';
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

const ENTITY_MENTION_META = {
  character: { label: '角色' },
  location: { label: '地点' },
  faction: { label: '势力' },
  item: { label: '物件' },
  mission: { label: '任务' },
};

function MarkdownEditor() {
  const {
    workspace,
    selectedId,
    markdown,
    mode,
    sidebarCollapsed,
    theme,
    copyStyle,
    surface,
    novelPanelOpen,
    novelMemory,
    novelFindings,
    novelAgentSuggestions,
    setTheme,
    setCopyStyle,
    setSurface,
    toggleMode,
    toggleNovelPanel,
    toggleSidebarCollapsed,
    updateSelectedFileContent,
    selectNode,
    addFile,
    addFolder,
    applyRename,
    deleteNode,
    importWorkspace,
    analyzeNovelFile,
    updateNovelEntity,
    resolveNovelFinding,
    queueNovelAgentSuggestion,
    markNovelAgentSuggestion,
    syncMarkdownFromSelectedFile,
    syncSelectedIdFromWorkspace,
  } = useEditorStore();

  const selectedFile = useSelectedFile();
  const importInputRef = useRef(null);
  const lastSyncedMarkdownRef = useRef(normalizeMarkdown(markdown));
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());
  const highlightRootRef = useRef(null);
  const novelHighlightMatchesRef = useRef([]);
  const [activeNovelEntityId, setActiveNovelEntityId] = useState(null);
  const titleEditing = useTitleEditing(selectedFile, applyRename);
  const { handleRename, handleDelete, handleExport, handleImport } = useWorkspaceActions({
    workspace,
    selectedId,
    applyRename,
    deleteNode,
    importWorkspace,
  });
  const [novelEntityPreviewOpen, setNovelEntityPreviewOpen] = useState(false);

  const initialContent = useMemo(() => {
    const sourceMarkdown = normalizeMarkdown(markdown);
    lastSyncedMarkdownRef.current = sourceMarkdown;

    if (!sourceMarkdown) {
      return createEmptyDocument();
    }

    const parserEditor = BlockNoteEditor.create(BLOCKNOTE_OPTIONS);
    const parsedBlocks = parserEditor.tryParseMarkdownToBlocks(sourceMarkdown);
    return parsedBlocks.length > 0 ? parsedBlocks : createEmptyDocument();
  }, [selectedId]);

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
    [selectedId],
  );

  const wechatSourceHtml = useMemo(() => {
    const tokens = parserRef.current.parse(markdown);
    return rendererRef.current.render(tokens);
  }, [markdown]);

  const resolvedTheme = theme === 'dark' ? 'dark' : 'light';

  const currentScene = useMemo(() => {
    const currentSceneId = novelMemory?.currentSceneByFile?.[selectedId];
    const scenes = novelMemory?.scenesByFile?.[selectedId] ?? [];
    return scenes.find((scene) => scene.id === currentSceneId) ?? scenes.at(-1) ?? null;
  }, [novelMemory, selectedId]);

  const visibleNovelEntities = useMemo(() => {
    const entities = novelMemory?.entities ?? [];
    if (!selectedFile) return entities;
    return entities.filter((entity) => {
      const mentionCount = entity.mentionsByFile?.[selectedFile.id] ?? 0;
      return mentionCount > 0 || entity.status === 'pending' || entity.status === 'confirmed';
    });
  }, [novelMemory, selectedFile]);
  const activeNovelEntity = useMemo(() => {
    return visibleNovelEntities.find((entity) => entity.id === activeNovelEntityId) ?? null;
  }, [visibleNovelEntities, activeNovelEntityId]);

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

    try {
      await copyToWeChat(html, {
        buttonId: 'paper-copy-wechat-btn',
        templateId: copyStyle,
      });
    } catch (error) {
      alert('复制失败，请手动复制');
    }
  };

  const handleInsertNovelEntity = useCallback(
    (entity) => {
      if (!entity?.name || !selectedFile) return;
      editor.focus();
      editor.insertInlineContent(entity.name);
      const nextMarkdown = normalizeMarkdown(editor.blocksToMarkdownLossy(editor.document));
      lastSyncedMarkdownRef.current = nextMarkdown;
      updateSelectedFileContent(nextMarkdown);
      setActiveNovelEntityId(entity.id);
    },
    [editor, selectedFile, updateSelectedFileContent],
  );

  const handleOpenNovelEntityPreview = (entityId) => {
    if (!entityId) return;
    setActiveNovelEntityId(entityId);
    setNovelEntityPreviewOpen(true);
  };

  const handleCloseNovelEntityPreview = () => {
    setNovelEntityPreviewOpen(false);
  };

  const handleOpenEntityInPanel = (entity) => {
    if (!entity?.id) return;
    setActiveNovelEntityId(entity.id);
    setNovelEntityPreviewOpen(false);
    if (!novelPanelOpen) {
      toggleNovelPanel();
    }
  };

  const handleOpenEntityMentionMenu = () => {
    if (mode !== 'novel') return;
    const suggestionMenu = editor.getExtension(SuggestionMenuExtension);
    suggestionMenu?.openSuggestionMenu('@', { ignoreQueryLength: true });
  };

  const mentionMenuItems = useMemo(() => {
    if (mode !== 'novel') return [];

    return visibleNovelEntities.map((entity) => {
      const meta = ENTITY_MENTION_META[entity.type] ?? {
        label: '实体',
      };

      return {
        title: entity.name,
        subtext: entity.summary || `插入${meta.label}到正文`,
        aliases: [entity.name, ...(entity.aliases ?? []), meta.label],
        group: '小说实体',
        badge: meta.label,
        icon: <NovelEntityMark type={entity.type} />,
        entityId: entity.id,
        entityType: entity.type,
        onItemClick: () => {
          handleInsertNovelEntity(entity);
        },
      };
    });
  }, [editor, mode, visibleNovelEntities, handleInsertNovelEntity]);
  const getMentionMenuItems = useMemo(() => {
    return async (query) => filterSuggestionItems(mentionMenuItems, query);
  }, [mentionMenuItems]);

  useEffect(() => {
    applyThemeToBody(theme);
  }, [theme]);

  useEffect(() => {
    syncMarkdownFromSelectedFile();
    syncSelectedIdFromWorkspace();
  }, [selectedFile, workspace, markdown, syncMarkdownFromSelectedFile, syncSelectedIdFromWorkspace]);

  useEffect(() => {
    if (activeNovelEntityId && !visibleNovelEntities.some((entity) => entity.id === activeNovelEntityId)) {
      setActiveNovelEntityId(null);
      setNovelEntityPreviewOpen(false);
    }
  }, [visibleNovelEntities, activeNovelEntityId]);

  useEffect(() => {
    if (mode === 'novel') return;
    setNovelEntityPreviewOpen(false);
  }, [mode]);

  useEffect(() => {
    setNovelEntityPreviewOpen(false);
  }, [selectedId]);

  useEffect(() => {
    const root = highlightRootRef.current ?? editor?.domElement;
    if (!root) return undefined;

    if (mode !== 'novel') {
      novelHighlightMatchesRef.current = [];
      clearNovelEntityHighlights();
      return undefined;
    }

    const rafId = window.requestAnimationFrame(() => {
      novelHighlightMatchesRef.current = applyNovelEntityHighlights(
        root,
        visibleNovelEntities,
        activeNovelEntityId,
      );
    });

    const handleClick = (event) => {
      const entityId = findClickedNovelEntity(event, root, novelHighlightMatchesRef.current);
      if (!entityId) return;
      handleOpenNovelEntityPreview(entityId);
    };

    root.addEventListener('click', handleClick);
    return () => {
      window.cancelAnimationFrame(rafId);
      root.removeEventListener('click', handleClick);
      clearNovelEntityHighlights();
    };
  }, [mode, visibleNovelEntities, activeNovelEntityId, editor, markdown]);

  useEffect(() => {
    if (mode !== 'novel' || !selectedFile) return undefined;

    const timer = window.setTimeout(() => {
      analyzeNovelFile(selectedFile.id, markdown);
    }, 1000);

    return () => window.clearTimeout(timer);
  }, [mode, selectedFile, markdown, analyzeNovelFile]);

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
      <WorkspaceSidebar
        workspace={workspace}
        selectedId={selectedId}
        onSelect={selectNode}
        onAddFile={addFile}
        onAddFolder={addFolder}
        onRename={handleRename}
        onDelete={handleDelete}
        collapsed={sidebarCollapsed}
        onToggleCollapse={toggleSidebarCollapsed}
        onOpenSettings={() => setSurface(surface === 'settings' ? 'paper' : 'settings')}
        settingsActive={surface === 'settings'}
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
            onClose={() => setSurface('paper')}
          />
        ) : (
          <>
            <DocHeader
              selectedFile={selectedFile}
              mode={mode}
              toggleMode={toggleMode}
              novelPanelOpen={novelPanelOpen}
              toggleNovelPanel={toggleNovelPanel}
              {...titleEditing}
            />
            <EditorQuickToolbar
              editor={editor}
              disabled={!selectedFile}
              isNovelMode={mode === 'novel'}
              onOpenEntityMention={handleOpenEntityMentionMenu}
            />
            <div className={`novel-layout ${mode === 'novel' ? 'is-novel' : ''}`}>
              <div className="paper-stage">
                <div className="paper-surface" data-testid="paper-surface">
                  <div className="paper-floating-actions">
                    <button
                      id="paper-copy-wechat-btn"
                      data-testid="paper-copy-wechat"
                      type="button"
                      className="copy-wechat-btn paper-copy-wechat-btn"
                      onClick={handleCopyToWeChat}
                      title={`复制为微信公众号格式（${getTemplateById(copyStyle).name}）`}
                      aria-label="复制到微信公众号"
                    >
                      <Copy size={18} strokeWidth={1.7} />
                    </button>
                  </div>

                  <div id="markdown-output" className="paper-content">
                    <div ref={highlightRootRef} className="blocknote-paper">
                      <BlockNoteView
                        editor={editor}
                        className="blocknote-editor"
                        data-testid="blocknote-editor"
                        theme={resolvedTheme}
                        editable={Boolean(selectedFile)}
                        formattingToolbar
                        linkToolbar
                        slashMenu
                        sideMenu
                        filePanel={false}
                        tableHandles
                        emojiPicker={false}
                        onChange={handleEditorChange}
                      >
                        {mode === 'novel' && (
                          <SuggestionMenuController
                            triggerCharacter="@"
                            getItems={getMentionMenuItems}
                            minQueryLength={0}
                            suggestionMenuComponent={NovelMentionMenu}
                            shouldOpen={(state) =>
                              !state.selection.$from.parent.type.isInGroup('tableContent')
                            }
                          />
                        )}
                      </BlockNoteView>
                    </div>
                  </div>
                </div>
              </div>

              {mode === 'novel' && (
                <NovelEntityPreviewModal
                  open={novelEntityPreviewOpen}
                  entity={activeNovelEntity}
                  currentFileId={selectedFile?.id}
                  currentFileName={selectedFile?.name}
                  onClose={handleCloseNovelEntityPreview}
                  onEntityUpdate={(entityId, patch) => updateNovelEntity(entityId, patch)}
                />
              )}

              {mode === 'novel' && (
                <NovelAssistantPanel
                  open={novelPanelOpen}
                  currentScene={currentScene}
                  entities={visibleNovelEntities}
                  currentFileId={selectedFile?.id}
                  findings={novelFindings}
                  agentSuggestions={novelAgentSuggestions}
                  activeEntityId={activeNovelEntity?.id ?? null}
                  onClose={toggleNovelPanel}
                  onEntityUpdate={(entityId, patch) => updateNovelEntity(entityId, patch)}
                  onAcceptFinding={(suggestionId) => resolveNovelFinding(suggestionId, 'accept')}
                  onDismissFinding={(suggestionId) => resolveNovelFinding(suggestionId, 'dismiss')}
                  onAcknowledgeAgentSuggestion={(suggestionId) =>
                    markNovelAgentSuggestion(suggestionId, 'accepted')
                  }
                  onDismissAgentSuggestion={(suggestionId) =>
                    markNovelAgentSuggestion(suggestionId, 'dismissed')
                  }
                  onSelectEntity={setActiveNovelEntityId}
                  onRequestAgentScene={(scene) =>
                    queueNovelAgentSuggestion('scene-completion', {
                      targetId: scene?.id ?? selectedFile?.id,
                      fileId: selectedFile?.id,
                    })
                  }
                  onRequestAgentEntity={(entity) =>
                    queueNovelAgentSuggestion('entity-completion', {
                      targetId: entity?.id,
                      fileId: selectedFile?.id,
                    })
                  }
                  onInsertEntity={handleInsertNovelEntity}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MarkdownEditor;
