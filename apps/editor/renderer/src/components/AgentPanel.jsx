import { useCallback, useMemo, useRef, useState } from 'react';
import { Bot, Send, Settings, Square, Wrench, User, Loader2 } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import { runAgent } from '../core/agent/agentEngine.js';
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

export default function AgentPanel() {
  const markdown = useEditorStore((s) => s.markdown);
  const workspace = useEditorStore((s) => s.workspace);
  const selectedId = useEditorStore((s) => s.selectedId);
  const updateSelectedFileContent = useEditorStore((s) => s.updateSelectedFileContent);

  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]); // { role, text } | { role:'tool', label, status }
  const [running, setRunning] = useState(false);
  const [showSettings, setShowSettings] = useState(() => !isAiConfigured());
  const providers = useMemo(() => listProviders(), []);
  const [providerId, setProviderId] = useState(() => getActiveProviderId());
  const [cfg, setCfg] = useState(() => readProviderConfig());

  const historyRef = useRef([]); // OpenAI 格式对话历史，跨轮复用
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

  const pushMessage = useCallback((msg) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    setRunning(false);
  }, []);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || running) return;
    if (!isAiConfigured()) {
      setShowSettings(true);
      return;
    }

    setInput('');
    pushMessage({ role: 'user', text });
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { history } = await runAgent({
        userInput: text,
        history: historyRef.current,
        config: readProviderConfig(),
        host,
        signal: controller.signal,
        onEvent: (ev) => {
          if (ev.type === 'tool_start') {
            pushMessage({ role: 'tool', label: ev.label, status: 'running' });
          } else if (ev.type === 'tool_done') {
            setMessages((prev) => {
              const next = [...prev];
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === 'tool' && next[i].label === ev.label && next[i].status === 'running') {
                  next[i] = { ...next[i], status: 'done' };
                  break;
                }
              }
              return next;
            });
          } else if (ev.type === 'done') {
            if (ev.finalText) pushMessage({ role: 'assistant', text: ev.finalText });
          }
        },
      });
      historyRef.current = history;
    } catch (error) {
      pushMessage({ role: 'assistant', text: `出错了：${error?.message ?? String(error)}` });
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }, [input, running, host, pushMessage]);

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
        <button className="agent-panel__icon-btn" onClick={() => setShowSettings((v) => !v)} title="设置">
          <Settings size={16} />
        </button>
      </div>

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
              <div className="agent-panel__bubble">{m.text}</div>
            </div>
          );
        })}
      </div>

      <div className="agent-panel__input-row">
        <textarea
          className="agent-panel__input"
          value={input}
          placeholder="输入需求，Enter 发送 / Shift+Enter 换行"
          rows={2}
          onChange={(e) => setInput(e.target.value)}
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
