import { useCallback, useMemo, useRef, useState } from 'react';
import { Bot, Send, Settings, Square, Wrench, User, Loader2, Plus, Trash2, MessagesSquare, FileText, X, Sparkles, MessageSquareQuote } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import { runAgent } from '../core/agent/agentEngine.js';
import { buildInputWithAttachments } from '../core/agent/sessionUtils.js';
import { buildQuickActionInstruction, getAiActionLabel } from '../utils/aiActions.js';
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

// 快捷 AI 动作：key 与 aiActions 别名一致，点一下直接走 AI 助手处理当前文档
const AI_QUICK_ACTIONS = [
  { key: 'compress', label: '压缩' },
  { key: 'expand', label: '扩写' },
  { key: 'title', label: '标题' },
];

export default function AgentPanel() {
  const markdown = useEditorStore((s) => s.markdown);
  const workspace = useEditorStore((s) => s.workspace);
  const selectedId = useEditorStore((s) => s.selectedId);
  const updateSelectedFileContent = useEditorStore((s) => s.updateSelectedFileContent);

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

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) || null,
    [sessions, activeSessionId],
  );
  const messages = activeSession?.messages ?? [];

  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
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

  const abortRef = useRef(null);

  // 注入给 agent 的宿主能力：读写当前文档 + 搜索工作区
  const host = useMemo(() => ({
    readActiveDoc: () => {
      const files = flattenFiles(workspace);
      const active = files.find((f) => f.id === selectedId);
      return { title: active?.name ?? '', content: markdown ?? '' };
    },
    writeActiveDoc: (content) => {
      updateSelectedFileContent(content);
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
  }), [workspace, selectedId, markdown, updateSelectedFileContent]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
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

  // 快捷动作（压缩/扩写/标题）：直接走 AI 助手，让 agent 读当前文档并处理
  const handleQuickAction = useCallback((actionKey) => {
    if (running) return;
    runTurn({
      promptText: buildQuickActionInstruction(actionKey),
      displayText: getAiActionLabel(actionKey),
    });
  }, [running, runTurn]);

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

      <div className="agent-panel__quick-actions">
        {AI_QUICK_ACTIONS.map((a) => (
          <button
            key={a.key}
            type="button"
            className="agent-panel__quick-btn"
            title={`AI ${a.label}（处理当前文档）`}
            disabled={running}
            onClick={() => handleQuickAction(a.key)}
          >
            <Sparkles size={14} />
            {a.label}
          </button>
        ))}
      </div>

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

      <div className="agent-panel__messages">
        {messages.length === 0 && (
          <div className="agent-panel__empty">问我点什么，比如「帮我把当前文档压缩到三段」。</div>
        )}
        {messages.map((m, i) => {
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
              </div>
            </div>
          );
        })}
      </div>

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
          className="agent-panel__input"
          value={input}
          placeholder="输入需求；输入 @ 可引用工作区文件"
          rows={2}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        {running ? (
          <button className="agent-panel__send-btn" onClick={handleStop} title="停止">
            <Square size={16} />
          </button>
        ) : (
          <button className="agent-panel__send-btn" onClick={handleSend} title="发送" disabled={!input.trim()}>
            <Send size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
