import { useCallback, useMemo, useRef, useState } from 'react';
import { Dropdown } from 'antd';
import {
  ApartmentOutlined,
  ArrowsAltOutlined,
  CameraOutlined,
  CompressOutlined,
  FileTextOutlined,
  HighlightOutlined,
  HistoryOutlined,
  MoreOutlined,
  PaperClipOutlined,
  PlusOutlined,
  SendOutlined,
  SettingOutlined as AntdSettingOutlined,
  WechatOutlined,
} from '@ant-design/icons';
import { Bot, Settings, Square, Wrench, User, Loader2, Plus, Trash2, MessagesSquare, FileText, X, MessageSquareQuote, Check, Copy } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import { findNodeById } from '../store/workspaceUtils.js';
import AgentDocMeta from './AgentDocMeta.jsx';
import { runAgent } from '../core/agent/agentEngine.js';
import { buildInputWithAttachments } from '../core/agent/sessionUtils.js';
import { AI_ACTION_KEYS, buildQuickActionInstruction, getAiActionLabel } from '../utils/aiActions.js';
import { PLATFORM_VARIANT_KEYS, buildPlatformVariantInstruction, listPlatformVariants } from '../utils/platformVariant.js';
import { extractRecallKeywords, rankRelatedDocs } from '../core/agent/contextRecall.js';
import {
  isAiConfigured,
  listProviders,
  getActiveProviderId,
  readProviderConfig,
  setActiveProvider,
  saveProviderConfig,
} from '../core/agent/aiClient.js';

const hasElectronSearch = () =>
  typeof window !== 'undefined' && typeof window.electronAPI?.db?.search === 'function';

/** 把工作区文件树拍平成文件数组（web 端搜索兜底用） */
const flattenFiles = (node, acc = []) => {
  if (!node) return acc;
  if (node.type === 'file') acc.push(node);
  (node.children ?? []).forEach((child) => flattenFiles(child, acc));
  return acc;
};

/** 是否可读的 Markdown 文件（.md 结尾且有文本内容） */
const isMarkdownFile = (node) =>
  node?.type === 'file'
  && /\.md$/i.test(node.name ?? '')
  && typeof node.content === 'string';

/** 把 tool 消息里最后一条 running 改成 done */
const markLastToolDone = (messages, label) => {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role === 'tool' && next[i].label === label && next[i].status === 'running') {
      next[i] = { ...next[i], status: 'done' };
      break;
    }
  }
  return next;
};

// 平台版本：同一正文改写成对应平台版（走 AI 助手，让 agent 读当前文档并写回）
const PLATFORM_VARIANTS = listPlatformVariants();
const PLATFORM_VARIANT_LABELS = Object.freeze(
  PLATFORM_VARIANTS.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {}),
);

const WELCOME_SUGGESTIONS = Object.freeze([
  { type: 'quick', actionKey: AI_ACTION_KEYS.OUTLINE, label: '基于当前主题先给我一版可直接动笔的提纲' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.POLISH, label: '把当前文档润色得更自然、更顺口' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.SUMMARIZE, label: '帮我压缩当前文档，保留核心信息和重点' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.KEY_POINTS, label: '提炼这篇内容的 5 个关键要点' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.TITLE_SUGGESTIONS, label: '给这篇内容想几组更抓人的标题' },
  { type: 'platform', platformValue: PLATFORM_VARIANT_KEYS.WECHAT, label: '生成一版适合微信公众号发布的版本' },
  { type: 'platform', platformValue: PLATFORM_VARIANT_KEYS.XIAOHONGSHU, label: '改写成更适合小红书发布的版本' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.CONTINUE, label: '沿着当前内容继续往下写一段' },
]);

const COMPOSER_SHORTCUTS = Object.freeze([
  { id: 'summarize', type: 'quick', actionKey: AI_ACTION_KEYS.SUMMARIZE, label: '压缩', icon: CompressOutlined, tone: 'amber' },
  { id: 'expand', type: 'quick', actionKey: AI_ACTION_KEYS.EXPAND, label: '扩写', icon: ArrowsAltOutlined, tone: 'blue' },
  { id: 'polish', type: 'quick', actionKey: AI_ACTION_KEYS.POLISH, label: '润色', icon: HighlightOutlined, tone: 'rose' },
  { id: 'outline', type: 'quick', actionKey: AI_ACTION_KEYS.OUTLINE, label: '提纲', icon: ApartmentOutlined, tone: 'teal' },
  { id: 'wechat', type: 'platform', platformValue: PLATFORM_VARIANT_KEYS.WECHAT, label: '公众号版', icon: WechatOutlined, tone: 'green' },
]);

const COMPOSER_MORE_ACTIONS = Object.freeze([
  { id: 'title', type: 'quick', actionKey: AI_ACTION_KEYS.TITLE_SUGGESTIONS, label: '标题建议', icon: FileTextOutlined, tone: 'cyan' },
  { id: 'xiaohongshu', type: 'platform', platformValue: PLATFORM_VARIANT_KEYS.XIAOHONGSHU, label: '小红书版', icon: CameraOutlined, tone: 'magenta' },
  { id: 'mention', type: 'mention', label: '引用文件', icon: PaperClipOutlined, tone: 'slate' },
  { id: 'sessions', type: 'sessions', label: '会话列表', icon: HistoryOutlined, tone: 'violet' },
  { id: 'settings', type: 'settings', label: '设置', icon: AntdSettingOutlined, tone: 'gray' },
]);

const COMPOSER_MORE_ACTION_MAP = new Map(COMPOSER_MORE_ACTIONS.map((item) => [item.id, item]));

export default function AgentPanel() {
  const markdown = useEditorStore((s) => s.markdown);
  const workspace = useEditorStore((s) => s.workspace);
  const selectedId = useEditorStore((s) => s.selectedId);

  // AI 待确认写入：stage 暂存改动；diff 对比与应用/放弃由预览区的 DiffOverlay 负责
  const stageAgentWrite = useEditorStore((s) => s.stageAgentWrite);
  // 直接写当前文档（插入引用用，无需 diff 确认）
  const updateSelectedFileContent = useEditorStore((s) => s.updateSelectedFileContent);
  const createGeneratedFile = useEditorStore((s) => s.createGeneratedFile);

  // 全局会话状态（切页不丢）
  const sessions = useEditorStore((s) => s.agentSessions);
  const activeSessionId = useEditorStore((s) => s.getActiveAgentSessionId());
  const createAgentSession = useEditorStore((s) => s.createAgentSession);
  const switchAgentSession = useEditorStore((s) => s.switchAgentSession);
  const deleteAgentSession = useEditorStore((s) => s.deleteAgentSession);
  const appendAgentMessage = useEditorStore((s) => s.appendAgentMessage);
  const updateAgentMessages = useEditorStore((s) => s.updateAgentMessages);
  const setAgentHistory = useEditorStore((s) => s.setAgentHistory);

  // 编辑器「引用到 AI」暂存的选中文字（发送时拼进 prompt，发送后清空）
  const quotedSelection = useEditorStore((s) => s.aiQuotedSelection);
  const clearAiQuotedSelection = useEditorStore((s) => s.clearAiQuotedSelection);

  // 当前选中的文件对象（含稿件元数据：状态/平台/标签/摘要），供稿件信息区展示
  const activeFile = useMemo(
    () => findNodeById(workspace, selectedId),
    [workspace, selectedId],
  );

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );
  const messages = activeSession?.messages ?? [];

  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  // 刚复制成功的消息下标，用于切换复制按钮的反馈图标
  const [copiedIndex, setCopiedIndex] = useState(null);
  // @文件：弹出选择器 + 已选文件（{id, name, content}）
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [fileFilter, setFileFilter] = useState('');
  const [attachedFiles, setAttachedFiles] = useState([]);

  // 工作区里所有 Markdown 文件（供 @ 选择）
  const mdFiles = useMemo(
    () => flattenFiles(workspace).filter(isMarkdownFile),
    [workspace],
  );
  const filteredFiles = useMemo(() => {
    const q = fileFilter.trim().toLowerCase();
    const list = q ? mdFiles.filter((f) => (f.name ?? '').toLowerCase().includes(q)) : mdFiles;
    return list.slice(0, 20);
  }, [mdFiles, fileFilter]);
  const [showSessions, setShowSessions] = useState(false);
  const [showSettings, setShowSettings] = useState(() => !isAiConfigured());
  const providers = useMemo(() => listProviders(), []);
  const [providerId, setProviderId] = useState(() => getActiveProviderId());
  const [cfg, setCfg] = useState(() => readProviderConfig());
  const isWelcomeMode = messages.length === 0 && !showSettings && !showSessions;
  const isComposerMoreActive = showSessions || showSettings;

  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const isShortcutDisabled = useCallback((item) => {
    return running && (item.type === 'quick' || item.type === 'platform');
  }, [running]);

  const composerMoreMenuItems = useMemo(() => {
    return COMPOSER_MORE_ACTIONS.map((item) => {
      const Icon = item.icon;
      return {
        key: item.id,
        disabled: isShortcutDisabled(item),
        label: item.label,
        icon: <Icon />,
      };
    });
  }, [isShortcutDisabled]);

  // 注入给 agent 的宿主能力：读写当前文档 + 搜索工作区
  const host = useMemo(() => ({
    readActiveDoc: () => {
      const files = flattenFiles(workspace);
      const active = files.find((f) => f.id === selectedId);
      return { title: active?.name ?? '', content: markdown ?? '' };
    },
    // 不直接覆盖：暂存成待确认改动，弹 diff 卡片让用户应用/放弃。
    // 返回结果文案回填给模型，让它知道改动到底有没有生效。
    writeActiveDoc: async (content) => {
      const applied = await stageAgentWrite({ oldText: markdown ?? '', newText: content });
      return applied ? '改动已应用到当前文档。' : '用户放弃了这次改动，文档未变更。';
    },
    createNewDoc: async ({ name, content, targetPlatforms } = {}) => {
      const result = await createGeneratedFile({
        name,
        content,
        contextNodeId: selectedId,
        meta: { targetPlatforms },
      });
      return result?.ok
        ? `已新建文档「${result.name}」，原文未改动。`
        : `新建文档失败：${result?.error || '未知错误'}`;
    },
    searchDocs: async (query) => {
      if (hasElectronSearch()) {
        try {
          const res = await window.electronAPI.db.search(query);
          return (res?.results ?? []).map((r) => ({
            title: r.title ?? r.name ?? '未命名',
            snippet: r.snippet ?? r.excerpt ?? '',
            id: r.id,
          }));
        } catch {
          /* 落到内存兜底 */
        }
      }
      const q = String(query).toLowerCase();
      return flattenFiles(workspace)
        .filter((f) => `${f.name ?? ''}${f.content ?? ''}`.toLowerCase().includes(q))
        .map((f) => ({ title: f.name ?? '未命名', snippet: String(f.content ?? '').slice(0, 200), id: f.id }));
    },
  }), [workspace, selectedId, markdown, stageAgentWrite, createGeneratedFile]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  // 复制某条 AI 回复文本，2 秒内显示「已复制」反馈。
  // 优先用 clipboard API；非安全上下文（如 file:// 下的 Electron）会抛错，
  // 退回 execCommand('copy')，保证「已复制」提示一定能出来。
  const handleCopy = useCallback(async (index, text) => {
    const value = text ?? '';
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        ok = true;
      }
    } catch {
      /* 落到 execCommand 兜底 */
    }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    if (ok) {
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex((cur) => (cur === index ? null : cur)), 2000);
    }
  }, []);

  // 输入变化：检测末尾的 @关键词 → 打开文件选择器并带过滤词
  const handleInputChange = useCallback((value) => {
    setInput(value);
    const match = /(?:^|\s)@([^\s@]*)$/.exec(value);
    if (match) {
      setFileFilter(match[1]);
      setShowFilePicker(true);
    } else {
      setShowFilePicker(false);
    }
  }, []);

  // 选中一个文件：去掉输入里正在打的 @词，加入已选列表（去重）
  const handlePickFile = useCallback((file) => {
    setInput((prev) => prev.replace(/(?:^|\s)@[^\s@]*$/, (m) => (m.startsWith(' ') ? ' ' : '')));
    setAttachedFiles((prev) =>
      prev.some((f) => f.id === file.id) ? prev : [...prev, { id: file.id, name: file.name, content: file.content }]);
    setShowFilePicker(false);
    setFileFilter('');
  }, []);

  const handleRemoveFile = useCallback((fileId) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleNewSession = useCallback(() => {
    createAgentSession();
    setShowSessions(false);
  }, [createAgentSession]);

  const handleDeleteSession = useCallback((e, sessionId) => {
    e.stopPropagation();
    deleteAgentSession(sessionId);
  }, [deleteAgentSession]);

  const handleSwitchSession = useCallback((sessionId) => {
    switchAgentSession(sessionId);
    setShowSessions(false);
  }, [switchAgentSession]);

  // 跑一个 agent 回合：UI 展示 displayText，实际发给模型 promptText。
  // handleSend 和快捷动作共用，避免重复一整套 runAgent 流程。
  const runTurn = useCallback(async ({ promptText, displayText, fileNames = [] }) => {
    if (running) return;
    if (!isAiConfigured()) {
      setShowSettings(true);
      return;
    }
    const sessionId = activeSessionId;
    if (!sessionId) return;

    appendAgentMessage(sessionId, { role: 'user', text: displayText, files: fileNames });
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { history } = await runAgent({
        userInput: promptText,
        history: activeSession?.history ?? [],
        config: readProviderConfig(),
        host,
        signal: controller.signal,
        onEvent: (ev) => {
          if (ev.type === 'tool_start') {
            appendAgentMessage(sessionId, { role: 'tool', label: ev.label, status: 'running' });
          } else if (ev.type === 'tool_done') {
            updateAgentMessages(sessionId, (msgs) => markLastToolDone(msgs, ev.label));
          } else if (ev.type === 'done') {
            if (ev.finalText) appendAgentMessage(sessionId, { role: 'assistant', text: ev.finalText });
          }
        },
      });
      setAgentHistory(sessionId, history);
    } catch (error) {
      appendAgentMessage(sessionId, { role: 'assistant', text: `出错了：${error?.message ?? String(error)}` });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [running, activeSessionId, activeSession, host, appendAgentMessage, updateAgentMessages, setAgentHistory]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || running) return;

    // 引用的选中文字当成一个特殊「附件」，复用文件附件的拼接逻辑
    const selectionAttachment = quotedSelection
      ? { id: 'selection', name: '选中内容', content: quotedSelection }
      : null;
    const files = selectionAttachment ? [selectionAttachment, ...attachedFiles] : attachedFiles;
    const fileNames = files.map((f) => f.name);
    // 拼附件内容给模型；UI 上只展示用户原话 + 附件名标记
    const promptText = buildInputWithAttachments(text, files);

    setInput('');
    setAttachedFiles([]);
    clearAiQuotedSelection();
    await runTurn({ promptText, displayText: text, fileNames });
  }, [input, running, attachedFiles, quotedSelection, clearAiQuotedSelection, runTurn]);

  // 快捷动作：直接走 AI 助手，让 agent 读当前文档并处理。
  // 有引用选区时，改写类动作只处理这段（其余动作内部会忽略选区），触发后清空引用。
  const handleQuickAction = useCallback((actionKey) => {
    if (running) return;
    runTurn({
      promptText: buildQuickActionInstruction(actionKey, { selectionText: quotedSelection }),
      displayText: getAiActionLabel(actionKey),
    });
    if (quotedSelection) clearAiQuotedSelection();
  }, [running, runTurn, quotedSelection, clearAiQuotedSelection]);

  // 平台版本：把当前正文改写成指定平台版（微信/小红书/知乎），另存为新文件。
  const handlePlatformVariant = useCallback((platformValue, platformLabel) => {
    if (running) return;
    runTurn({
      promptText: buildPlatformVariantInstruction(platformValue),
      displayText: `生成${platformLabel}版本`,
    });
  }, [running, runTurn]);

  const handleInsertMention = useCallback(() => {
    setInput((prev) => {
      const next = prev.trimEnd();
      return next ? `${next} @` : '@';
    });
    setFileFilter('');
    setShowFilePicker(true);
    focusInput();
  }, [focusInput]);

  const handleShortcutClick = useCallback((item) => {
    if (item.type === 'quick') {
      handleQuickAction(item.actionKey);
      return;
    }
    if (item.type === 'platform') {
      handlePlatformVariant(
        item.platformValue,
        PLATFORM_VARIANT_LABELS[item.platformValue] || item.label,
      );
      return;
    }
    if (item.type === 'mention') {
      handleInsertMention();
      return;
    }
    if (item.type === 'sessions') {
      setShowSessions((v) => !v);
      return;
    }
    if (item.type === 'settings') {
      setShowSettings((v) => !v);
    }
  }, [handleInsertMention, handlePlatformVariant, handleQuickAction]);

  const handleWelcomeSuggestion = useCallback((item) => {
    handleShortcutClick(item);
  }, [handleShortcutClick]);

  const handleComposerMoreClick = useCallback(({ key }) => {
    const item = COMPOSER_MORE_ACTION_MAP.get(key);
    if (item) handleShortcutClick(item);
  }, [handleShortcutClick]);

  // 召回相关旧文：读当前文档 → 抽关键词 → 搜工作区 → 排序，结果给「参考上下文」区。
  // 复用 host.searchDocs（与 agent 工具同一条召回链路），不重复造轮子。
  const handleRecall = useCallback(async () => {
    const doc = host.readActiveDoc();
    const keywords = extractRecallKeywords({ title: doc.title, content: doc.content });
    if (keywords.length === 0) return [];
    const seen = new Map();
    for (const kw of keywords) {
      const hits = await host.searchDocs(kw);
      hits.forEach((h) => { if (h?.id != null && !seen.has(h.id)) seen.set(h.id, h); });
    }
    return rankRelatedDocs(
      { id: selectedId, title: doc.title, content: doc.content },
      [...seen.values()],
      { limit: 5 },
    );
  }, [host, selectedId]);

  // 一键插入引用：把选中的相关旧文以 Markdown 引用块追加到当前文档末尾。
  const handleInsertReference = useCallback((ref) => {
    const title = ref?.title ?? '未命名';
    const snippet = String(ref?.snippet ?? '').trim();
    const block = snippet
      ? `\n\n> 参考：${title}\n>\n> ${snippet.replace(/\n/g, '\n> ')}\n`
      : `\n\n> 参考：${title}\n`;
    updateSelectedFileContent(`${markdown ?? ''}${block}`);
  }, [markdown, updateSelectedFileContent]);

  // 切换服务商：记住选择并带出该商已存配置（参考 Cursor，每商独立 key）
  const handleProviderChange = useCallback((nextId) => {
    setActiveProvider(nextId);
    setProviderId(nextId);
    setCfg(readProviderConfig(nextId));
  }, []);

  const handleSaveSettings = useCallback(() => {
    setActiveProvider(providerId);
    saveProviderConfig(providerId, { apiKey: cfg.apiKey, model: cfg.model, baseURL: cfg.baseURL });
    setCfg(readProviderConfig(providerId));
    setShowSettings(false);
  }, [providerId, cfg]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  return (
    <div className="agent-panel">
      <div className="agent-panel__header">
        <span className="agent-panel__title"><Bot size={16} /> AI 助手</span>
        <div className="agent-panel__header-actions">
          <button className="agent-panel__icon-btn" onClick={() => setShowSessions((v) => !v)} title="会话列表">
            <MessagesSquare size={16} />
          </button>
          <button className="agent-panel__icon-btn" onClick={handleNewSession} title="新建会话">
            <Plus size={16} />
          </button>
          <button className="agent-panel__icon-btn" onClick={() => setShowSettings((v) => !v)} title="设置">
            <Settings size={16} />
          </button>
        </div>
      </div>

      {!isWelcomeMode && (
        <div hidden>
          <AgentDocMeta
            document={activeFile}
            onRecall={handleRecall}
            onInsertReference={handleInsertReference}
          />
        </div>
      )}

      {showSessions && (
        <div className="agent-panel__sessions">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`agent-panel__session${s.id === activeSessionId ? ' is-active' : ''}`}
              onClick={() => handleSwitchSession(s.id)}
            >
              <span className="agent-panel__session-title">{s.title || '新会话'}</span>
              <button
                className="agent-panel__session-del"
                title="删除会话"
                onClick={(e) => handleDeleteSession(e, s.id)}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}

      {showSettings && (
        <div className="agent-panel__settings">
          <label>服务商
            <select value={providerId} onChange={(e) => handleProviderChange(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          {providerId === 'custom' && (
            <label>Base URL（OpenAI 兼容，完整基址）
              <input value={cfg.baseURL} placeholder="https://xxx/v1"
                onChange={(e) => setCfg({ ...cfg, baseURL: e.target.value })} />
            </label>
          )}
          <label>API Key
            <input type="password" value={cfg.apiKey} placeholder="该服务商的 key"
              onChange={(e) => setCfg({ ...cfg, apiKey: e.target.value })} />
          </label>
          <label>模型
            <input value={cfg.model} placeholder="默认已填，可改"
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
          </label>
          <button className="agent-panel__save-btn" onClick={handleSaveSettings}>保存</button>
        </div>
      )}

      <div className={`agent-panel__messages${isWelcomeMode ? ' is-welcome' : ''}`}>
        {isWelcomeMode && (
          <div className="agent-panel__welcome">
            <h2 className="agent-panel__welcome-title">有什么我能帮你的吗？</h2>
            <p className="agent-panel__welcome-subtitle">直接提需求，或者先从下面这些常用动作开始。</p>
            <div className="agent-panel__welcome-grid">
              {WELCOME_SUGGESTIONS.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  className="agent-panel__welcome-chip"
                  disabled={running}
                  onClick={() => handleWelcomeSuggestion(item)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {!isWelcomeMode && messages.length === 0 && (
          <div className="agent-panel__empty">问我点什么，比如「帮我把当前文档压缩到三段」。</div>
        )}
        {!isWelcomeMode && messages.map((m, i) => {
          if (m.role === 'tool') {
            return (
              <div key={i} className="agent-panel__tool">
                {m.status === 'running'
                  ? <Loader2 size={14} className="agent-panel__spin" />
                  : <Wrench size={14} />}
                <span>{m.label}{m.status === 'done' ? ' ✓' : '…'}</span>
              </div>
            );
          }
          return (
            <div key={i} className={`agent-panel__msg agent-panel__msg--${m.role}`}>
              <span className="agent-panel__avatar">
                {m.role === 'user' ? <User size={14} /> : <Bot size={14} />}
              </span>
              <div className="agent-panel__bubble">
                {m.files?.length > 0 && (
                  <div className="agent-panel__msg-files">
                    {m.files.map((name, k) => (
                      <span key={k} className="agent-panel__msg-file"><FileText size={11} /> {name}</span>
                    ))}
                  </div>
                )}
                {m.text}
                {m.role === 'assistant' && m.text && (
                  <button
                    type="button"
                    className={`agent-panel__copy-btn${copiedIndex === i ? ' is-copied' : ''}`}
                    title={copiedIndex === i ? '已复制' : '复制'}
                    onClick={() => handleCopy(i, m.text)}
                  >
                    {copiedIndex === i ? <Check size={13} /> : <Copy size={13} />}
                    <span className="agent-panel__copy-label">
                      {copiedIndex === i ? '已复制' : '复制'}
                    </span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="agent-panel__composer">
        {showFilePicker && (
          <div className="agent-panel__file-picker">
            {filteredFiles.length === 0 ? (
              <div className="agent-panel__file-empty">没有匹配的 Markdown 文件</div>
            ) : (
              filteredFiles.map((f) => (
                <div key={f.id} className="agent-panel__file-option" onClick={() => handlePickFile(f)}>
                  <FileText size={13} />
                  <span>{f.name}</span>
                </div>
              ))
            )}
          </div>
        )}

        {quotedSelection && (
          <div className="agent-panel__attachments">
            <span className="agent-panel__chip agent-panel__chip--selection" title={quotedSelection}>
              <MessageSquareQuote size={12} />
              <span className="agent-panel__chip-name">
                引用：{quotedSelection.length > 24 ? `${quotedSelection.slice(0, 24)}…` : quotedSelection}
              </span>
              <button className="agent-panel__chip-del" title="移除引用" onClick={clearAiQuotedSelection}>
                <X size={12} />
              </button>
            </span>
          </div>
        )}

        {attachedFiles.length > 0 && (
          <div className="agent-panel__attachments">
            {attachedFiles.map((f) => (
              <span key={f.id} className="agent-panel__chip">
                <FileText size={12} />
                <span className="agent-panel__chip-name">{f.name}</span>
                <button className="agent-panel__chip-del" title="移除" onClick={() => handleRemoveFile(f.id)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="agent-panel__input-row">
          <textarea
            ref={inputRef}
            className="agent-panel__input"
            value={input}
            placeholder="发消息，或输入 @ 引用工作区文件"
            rows={3}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {running ? (
            <button className="agent-panel__send-btn" onClick={handleStop} title="停止">
              <Square size={16} />
            </button>
          ) : (
            <button className="agent-panel__send-btn" onClick={handleSend} title="发送" disabled={!input.trim()}>
              <SendOutlined />
            </button>
          )}
        </div>

        <div className="agent-panel__composer-tools">
          <button
            type="button"
            className="agent-panel__composer-plus"
            title="新建会话"
            onClick={handleNewSession}
          >
            <PlusOutlined />
          </button>
          {COMPOSER_SHORTCUTS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                className={`agent-panel__tool-btn agent-panel__tool-btn--${item.tone}`}
                disabled={isShortcutDisabled(item)}
                onClick={() => handleShortcutClick(item)}
              >
                <span className="agent-panel__tool-btn-icon">
                  <Icon />
                </span>
                {item.label}
              </button>
            );
          })}
          <Dropdown
            trigger={['click']}
            placement="topRight"
            overlayClassName="agent-panel__composer-dropdown"
            menu={{
              items: composerMoreMenuItems,
              onClick: handleComposerMoreClick,
            }}
          >
            <button
              type="button"
              className={`agent-panel__tool-btn agent-panel__tool-btn--gray${isComposerMoreActive ? ' is-active' : ''}`}
            >
              <span className="agent-panel__tool-btn-icon">
                <MoreOutlined />
              </span>
              更多
            </button>
          </Dropdown>
        </div>
      </div>
    </div>
  );
}
