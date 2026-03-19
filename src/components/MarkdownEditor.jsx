import { useEffect, useMemo, useRef, useState } from 'react';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteEditor } from '@blocknote/core';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import { ArrowLeft, Copy, Download, Monitor, Moon, Sun, Upload } from 'lucide-react';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import WorkspaceSidebar from './WorkspaceSidebar.jsx';
import { copyToWeChat } from '../utils/wechatCopy';
import { exportWorkspaceToJSON, parseWorkspaceFromJSON } from '../utils/workspaceIO';
import { TEMPLATES, getTemplateById } from '../utils/wechatTemplates';
import { MarkdownParser, MarkdownRenderer } from '../core';
import { useEditorStore, useSelectedFile } from '../store/useEditorStore.js';
import { findNodeById } from '../store/workspaceUtils.js';
import '../styles/styles.css';

const THEME_OPTIONS = [
  { id: 'system', label: '跟随系统', icon: Monitor },
  { id: 'light', label: '浅色', icon: Sun },
  { id: 'dark', label: '深色', icon: Moon },
];

const BLOCKNOTE_OPTIONS = {
  dictionary: zh,
  defaultStyles: false,
  setIdAttribute: true,
  tables: {
    headers: true,
    splitCells: true,
    cellBackgroundColor: true,
    cellTextColor: true,
  },
};

const createEmptyDocument = () => [{ type: 'paragraph', content: '' }];

const normalizeMarkdown = (value = '') => {
  return value.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trimEnd();
};

function SettingsPanel({
  selectedFileName,
  theme,
  copyStyle,
  onThemeChange,
  onCopyStyleChange,
  onImport,
  onExport,
  onClose,
}) {
  return (
    <section className="settings-panel" data-testid="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="settings-back-btn" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.8} />
          <span>返回文稿</span>
        </button>
        <div className="settings-panel-intro">
          <p className="settings-kicker">SETTINGS</p>
          <h2>编辑器设置</h2>
          <p>当前文档：{selectedFileName ?? '未命名'}</p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">主题</div>
        <div className="settings-option-grid">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                className={`settings-option-card ${theme === option.id ? 'active' : ''}`}
                onClick={() => onThemeChange(option.id)}
                aria-label={`切换到${option.label}`}
              >
                <Icon size={18} strokeWidth={1.6} />
                <span>{option.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">排版风格</div>
        <div className="settings-template-list">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`settings-template-item ${copyStyle === template.id ? 'active' : ''}`}
              onClick={() => onCopyStyleChange(template.id)}
              aria-label={`切换到${template.name}风格`}
            >
              <span>{template.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">工作区</div>
        <div className="settings-action-list">
          <button type="button" className="settings-action-btn" onClick={onImport}>
            <Upload size={16} strokeWidth={1.6} />
            <span>导入工作区 JSON</span>
          </button>
          <button type="button" className="settings-action-btn" onClick={onExport}>
            <Download size={16} strokeWidth={1.6} />
            <span>导出当前工作区</span>
          </button>
        </div>
      </div>
    </section>
  );
}

function MarkdownEditor() {
  const {
    workspace,
    selectedId,
    markdown,
    sidebarCollapsed,
    theme,
    copyStyle,
    surface,
    setTheme,
    setCopyStyle,
    setSurface,
    toggleSidebarCollapsed,
    updateSelectedFileContent,
    selectNode,
    addFile,
    addFolder,
    applyRename,
    deleteNode,
    importWorkspace,
    syncMarkdownFromSelectedFile,
    syncSelectedIdFromWorkspace,
  } = useEditorStore();

  const selectedFile = useSelectedFile();
  const importInputRef = useRef(null);
  const lastSyncedMarkdownRef = useRef(normalizeMarkdown(markdown));
  const parserRef = useRef(new MarkdownParser());
  const rendererRef = useRef(new MarkdownRenderer());
  const titleInputRef = useRef(null);
  const titleMeasureRef = useRef(null);
  const [systemTheme, setSystemTheme] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [isTitleEditing, setIsTitleEditing] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [titleInputWidth, setTitleInputWidth] = useState(160);

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
    },
    [selectedId],
  );

  const wechatSourceHtml = useMemo(() => {
    const tokens = parserRef.current.parse(markdown);
    return rendererRef.current.render(tokens);
  }, [markdown]);

  const resolvedTheme = useMemo(() => {
    if (theme === 'system') return systemTheme;
    return theme === 'dark' ? 'dark' : 'light';
  }, [systemTheme, theme]);

  const applyThemeToBody = (nextTheme) => {
    if (typeof document === 'undefined') return;
    const body = document.body;
    body.classList.remove('theme-light', 'theme-dark');
    if (nextTheme === 'light') {
      body.classList.add('theme-light');
    } else if (nextTheme === 'dark') {
      body.classList.add('theme-dark');
    }
  };

  const handleEditorChange = () => {
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

  const handleRename = (nodeId) => {
    const targetId = nodeId ?? selectedId;
    const node = findNodeById(workspace, targetId);
    if (!node) return;
    const nextName = window.prompt('请输入新名称', node.name);
    if (!nextName) return;
    if (!applyRename(targetId, nextName)) {
      alert('名称已存在，请换一个。');
    }
  };

  const startTitleEditing = () => {
    if (!selectedFile) return;
    setTitleDraft(selectedFile.name);
    setIsTitleEditing(true);
  };

  const commitTitleEditing = () => {
    if (!selectedFile) {
      setIsTitleEditing(false);
      setTitleDraft('');
      return;
    }

    const nextName = titleDraft.trim();
    if (!nextName) {
      setTitleDraft(selectedFile.name);
      setIsTitleEditing(false);
      return;
    }

    if (!applyRename(selectedFile.id, nextName)) {
      alert('名称已存在，请换一个。');
      setTitleDraft(selectedFile.name);
    }

    setIsTitleEditing(false);
  };

  const handleDelete = (nodeId) => {
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
    deleteNode(targetId);
  };

  const handleExport = () => {
    const json = exportWorkspaceToJSON(workspace);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workspace-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const { workspace: imported, error } = parseWorkspaceFromJSON(reader.result);
      if (error) {
        alert(error);
        return;
      }
      const confirmed = window.confirm('导入将替换当前工作区，是否继续？');
      if (!confirmed) return;
      importWorkspace(imported);
    };
    reader.readAsText(file, 'UTF-8');
    event.target.value = '';
  };

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = () => {
      setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    };

    updateSystemTheme();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateSystemTheme);
      return () => mediaQuery.removeEventListener('change', updateSystemTheme);
    }

    mediaQuery.addListener(updateSystemTheme);
    return () => mediaQuery.removeListener(updateSystemTheme);
  }, []);

  useEffect(() => {
    applyThemeToBody(theme);
  }, [theme]);

  useEffect(() => {
    if (!isTitleEditing || !titleInputRef.current) return;
    titleInputRef.current.focus();
    titleInputRef.current.select();
  }, [isTitleEditing]);

  useEffect(() => {
    if (!isTitleEditing || !titleMeasureRef.current) return;
    const measuredWidth = Math.ceil(titleMeasureRef.current.getBoundingClientRect().width) + 8;
    setTitleInputWidth(Math.max(120, measuredWidth));
  }, [isTitleEditing, titleDraft]);

  useEffect(() => {
    if (!selectedFile) return;
    if (!isTitleEditing) {
      setTitleDraft(selectedFile.name);
    }
  }, [selectedFile, isTitleEditing]);

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
            <div className="right-area-header">
              <div className="right-area-doc-title">
                <span
                  ref={titleMeasureRef}
                  className="right-area-doc-title-measure"
                  aria-hidden="true"
                >
                  {titleDraft || selectedFile?.name || '未命名'}
                </span>
                {isTitleEditing ? (
                  <input
                    ref={titleInputRef}
                    className="right-area-doc-title-input"
                    style={{ width: `${titleInputWidth}px` }}
                    value={titleDraft}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onBlur={commitTitleEditing}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitTitleEditing();
                      }
                      if (event.key === 'Escape') {
                        event.preventDefault();
                        setTitleDraft(selectedFile?.name ?? '');
                        setIsTitleEditing(false);
                      }
                    }}
                    aria-label="编辑文件标题"
                  />
                ) : (
                  <span
                    className="right-area-doc-title-clickable"
                    onClick={startTitleEditing}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        startTitleEditing();
                      }
                    }}
                  >
                    {selectedFile?.name ?? '未命名'}
                  </span>
                )}
              </div>
              <div className="right-area-actions" />
            </div>
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
                      sideMenu
                      filePanel={false}
                      tableHandles
                      emojiPicker={false}
                      onChange={handleEditorChange}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default MarkdownEditor;
