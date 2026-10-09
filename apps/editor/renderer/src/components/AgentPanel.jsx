import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, Modal, message } from 'antd';
import {
  ApartmentOutlined,
  ArrowsAltOutlined,
  CameraOutlined,
  CompressOutlined,
  FileTextOutlined,
  HighlightOutlined,
  PlusOutlined,
  SendOutlined,
  WechatOutlined,
  FilePdfOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons';
import { Bot, ChevronDown, FileText, History, Link2, MessageSquareQuote, Paperclip, Plus, Search, Settings, Square, Trash2, Wrench, X } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import {
  collectFiles,
  collectHiddenFileIds,
  findAgentMetaFile,
  findNodeById,
  getFileKnowledgeSearchText,
  AGENT_META_FOLDER_NAME,
} from '../store/workspaceUtils.js';
import AgentDocMeta from './AgentDocMeta.jsx';
import AgentConversation from './AgentConversation.jsx';
import AgentKnowledgeSources from './AgentKnowledgeSources.jsx';
import AgentSkillsTab from './AgentSkillsTab.jsx';
import AgentActivityTab from './AgentActivityTab.jsx';
import { runAgent } from '../core/agent/agentEngine.js';
import { pickAgentProjectRoot, runLocalAgent } from '../core/agent/localAgentClient.js';
import { useAiSource } from '../hooks/useAiSource.js';
import AgentSourcePicker from './AgentSourcePicker.jsx';
import AgentLocalSources from './AgentLocalSources.jsx';
import {
  EDITORIAL_MEMORY_DOC_NAME,
  MEMORY_CATEGORIES,
  appendMemoryEntry,
  findEditorialMemoryFile,
} from '../core/agent/editorialMemory.js';
import { fetchServerTools, executeTool, TOOL_DEFINITIONS } from '../core/agent/toolRegistry.js';
import { createHost } from '../core/agent/createHost.js';
import { recordToolActivity } from '../core/agent/activityLog.js';
import { getSurfaceLabel } from '../core/agent/surfaceLabels.js';
import { AGENT_HOST_DIALOGS } from './agentHostDialogs.jsx';
import { buildInputWithAttachments, resolveLocalAgentSession } from '../core/agent/sessionUtils.js';
import {
  AGENT_ATTACHMENT_ACCEPT,
  createAttachmentId,
  extractAgentAttachment,
  isSupportedAgentAttachment,
} from '../core/agent/agentAttachments.js';
import {
  createUrlAttachment,
  extractPublicUrls,
  resolveUrlAttachment,
} from '../core/agent/urlAttachments.js';
import {
  AGENT_SESSION_MODES,
  appendModeSystemMessage,
  normalizeAgentSessionMode,
  resolveAgentTurnMode,
} from '../core/agent/chatMode.js';
import {
  appendStreamDelta,
  buildErrorMessage,
  endStreamMessage,
  finalizeAssistantReply,
  removeMessageAt,
  stopTypingMessages,
} from '../core/agent/streamMessages.js';
import {
  buildActiveDocMeta,
  buildContentAssetPointer,
  buildPinnedContext,
  buildRecentDocPointers,
  buildTaskContextPacket,
  buildWorkspaceToolBrief,
  buildWorkspaceBrief,
  buildWorkspaceRelatedRefs,
} from '../core/agent/taskContext.js';
import { buildSkillTurn } from '../core/agent/skillRunner.js';
import { findSkillById } from '../core/agent/skillRegistry.js';
import { useSkillRegistry } from '../hooks/useSkillRegistry.js';
import { pickSkillItems, toSkillItem } from './agentSkillItems.js';
import { extractRecallKeywords, rankRelatedDocs } from '../core/agent/contextRecall.js';
import { appendReferenceToContent } from '../core/agent/referenceBlock.js';
import {
  buildCanvasItemsFromAgentCards,
  buildCanvasSceneFromAgentGraph,
  buildExcalidrawCanvasState,
  buildExcalidrawElementsFromItems,
  countRenderableCanvasCards,
} from '../utils/excalidrawCanvas.js';
import {
  formatDailyHeading,
  getDailyEntry,
  getTodayDateKey,
  normalizeDateKey,
} from '../utils/dailyWorkspace.js';
import {
  getActiveSource,
  isAiConfigured,
  listProviders,
  getActiveProviderId,
  readProviderConfig,
  setActiveProvider,
  saveProviderConfig,
  readAiServerBase,
  saveAiServerBase,
  clearAiServerOverride,
  getAiServerConfiguration,
  hasBuiltinKey,
  fetchServerProviders,
  hasAiBridge,
} from '../core/agent/aiClient.js';
import {
  aiExecTool,
  aiListTools,
  dbSearch,
  getDiagnosticsSnapshot,
  hasAiToolBridge,
  hasDbBridge,
  hasDiagnosticsBridge,
  pickFile,
  pickSavePath,
} from '../services/electronBridge.js';
import { buildAgentArtifactPayload, parseAgentArtifactResult } from '../core/agent/artifactUtils.js';
import { buildAgentHealthSnapshot, runSafeRepair } from '../core/agent/appSupport.js';
import {
  loadKnowledgeSources,
  saveKnowledgeSources,
} from '../core/agent/knowledgeSources.js';
import { searchExternalKnowledge } from '../services/externalKnowledgeService.js';
import { extractPdfAttachmentText } from '../services/attachmentTextService.js';
import { readUrl as readPublicUrl } from '../services/urlReaderService.js';

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

const buildRefReason = (ref, keywords) => {
  const haystack = `${ref?.title ?? ''}\n${ref?.snippet ?? ''}`.toLowerCase();
  const hits = keywords.filter((kw) => haystack.includes(kw)).slice(0, 3);
  return hits.length ? `关键词：${hits.join('、')}` : '与当前稿件主题相关';
};

const getArtifactResultForMessage = (result) => {
  const artifact = parseAgentArtifactResult(result);
  if (!artifact) return '';
  return JSON.stringify({
    kind: 'agent_artifact',
    ok: true,
    artifactType: artifact.artifactType,
    artifactLabel: artifact.artifactLabel,
    fileId: artifact.fileId,
    name: artifact.name,
  });
};

const TOOL_ERROR_RESULT_PATTERN = /^\s*(?:工具「[^」]+」(?:执行出错|不可用)|[^\n：:]{0,24}(?:失败|出错|错误|不可用|拒绝)[：:]|server 工具通道不可用|未知工具|当前工作区不可用|当前环境不支持|当前没有.*无法)/i;

const getToolCompletionStatus = (result) => {
  const text = String(result ?? '').trim();
  if (!text) return 'done';
  try {
    const parsed = JSON.parse(text);
    if (parsed?.ok === false) return 'error';
  } catch {
    /* 普通文本结果继续按前缀判断 */
  }
  return TOOL_ERROR_RESULT_PATTERN.test(text) ? 'error' : 'done';
};

/** 用 callId 精确收口工具步骤，兼容旧事件的 label 匹配。 */
const finishToolMessage = (messages, { callId, label, status, result = '' }) => {
  const next = [...messages];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const item = next[i];
    const matchesCall = callId ? item.callId === callId : item.label === label;
    if (item.role === 'tool' && matchesCall && item.status === 'running') {
      next[i] = { ...item, status, result };
      break;
    }
  }
  return next;
};

const finishRunningTools = (messages, status) => messages.map((item) => (
  item.role === 'tool' && item.status === 'running'
    ? { ...item, status }
    : item
));

const formatAgentError = (error) => {
  const raw = String(error?.message ?? error ?? '').trim();
  if (!raw) return 'AI 请求失败，请稍后再试。';
  if (raw === 'fetch failed') {
    return 'AI 服务连接失败：请检查 ai-proxy 是否已启动，或在设置里确认 AI 服务器地址。';
  }
  return raw;
};

const recallDocsForContext = async ({
  doc,
  selectedId,
  searchDocs,
  limit = 5,
}) => {
  const keywords = extractRecallKeywords({ title: doc?.title, content: doc?.content });
  if (keywords.length === 0) return [];

  const seen = new Map();
  for (const kw of keywords) {
    const hits = await searchDocs(kw);
    hits.forEach((hit) => {
      if (hit?.id != null && !seen.has(hit.id)) seen.set(hit.id, hit);
    });
  }

  return rankRelatedDocs(
    { id: selectedId, title: doc?.title, content: doc?.content },
    [...seen.values()],
    { limit, keywords },
  ).map((ref) => ({
    ...ref,
    reason: buildRefReason(ref, keywords),
  }));
};

const MAX_SLASH_SKILL_RESULTS = 8;
// 流式片段合并刷新的间隔：太频繁会让长回复的 Markdown 反复重渲染
const STREAM_FLUSH_INTERVAL_MS = 60;
const SLASH_SKILL_PATTERN = /^\s*\/([^\s/]*)$/;

const AGENT_PANEL_WIDTH_KEY = 'md-renderer-agent-panel-width';
const AGENT_PANEL_MIN_WIDTH = 340;
const AGENT_PANEL_MAX_WIDTH = 720;
const AGENT_PANEL_DEFAULT_WIDTH = 460;

const clampAgentPanelWidth = (width) => Math.min(
  AGENT_PANEL_MAX_WIDTH,
  Math.max(AGENT_PANEL_MIN_WIDTH, Number(width) || AGENT_PANEL_DEFAULT_WIDTH),
);

const readAgentPanelWidth = () => {
  try {
    return clampAgentPanelWidth(localStorage.getItem(AGENT_PANEL_WIDTH_KEY));
  } catch {
    return AGENT_PANEL_DEFAULT_WIDTH;
  }
};

const formatSessionDate = (timestamp) => {
  if (!Number.isFinite(timestamp)) return '';
  return new Intl.DateTimeFormat('zh-CN', { month: '2-digit', day: '2-digit' })
    .format(new Date(timestamp));
};

const CHAT_WELCOME_SUGGESTIONS = Object.freeze([
  '帮我围绕这个话题发散几个角度',
  '我贴一段资料，你先帮我梳理重点',
  '问我几个问题，把这个想法聊清楚',
]);

export default function AgentPanel({ open = true, onClose }) {
  const markdown = useEditorStore((s) => s.markdown);
  const workspace = useEditorStore((s) => s.workspace);
  const selectedId = useEditorStore((s) => s.selectedId);
  const surface = useEditorStore((s) => s.surface);
  const dailyWorkspace = useEditorStore((s) => s.dailyWorkspace);

  // AI 待确认写入：stage 暂存改动；diff 对比与应用/放弃由预览区的 DiffOverlay 负责
  // 直接写当前文档（插入引用用，无需 diff 确认）
  const applyContentFromOutside = useEditorStore((s) => s.applyContentFromOutside);
  const createGeneratedFile = useEditorStore((s) => s.createGeneratedFile);
  const addDailyItem = useEditorStore((s) => s.addDailyItem);
  const addTodoItem = useEditorStore((s) => s.addTodoItem);
  const setWorkspaceCanvas = useEditorStore((s) => s.setWorkspaceCanvas);
  const setDailyCurrentDate = useEditorStore((s) => s.setDailyCurrentDate);
  const setSurface = useEditorStore((s) => s.setSurface);
  const selectNode = useEditorStore((s) => s.selectNode);
  const addFolder = useEditorStore((s) => s.addFolder);
  const applyRename = useEditorStore((s) => s.applyRename);

  // 全局会话状态（切页不丢）
  const sessions = useEditorStore((s) => s.agentSessions);
  const activeSessionId = useEditorStore((s) => s.getActiveAgentSessionId());
  const createAgentSession = useEditorStore((s) => s.createAgentSession);
  const switchAgentSession = useEditorStore((s) => s.switchAgentSession);
  const deleteAgentSession = useEditorStore((s) => s.deleteAgentSession);
  const appendAgentMessage = useEditorStore((s) => s.appendAgentMessage);
  const updateAgentMessages = useEditorStore((s) => s.updateAgentMessages);
  const setAgentHistory = useEditorStore((s) => s.setAgentHistory);
  const setAgentExternalSession = useEditorStore((s) => s.setAgentExternalSession);
  const setAgentSessionMode = useEditorStore((s) => s.setAgentSessionMode);

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
  const sessionMode = normalizeAgentSessionMode(activeSession?.mode);

  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  // 刚复制成功的消息下标，用于切换复制按钮的反馈图标
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [pinnedIndex, setPinnedIndex] = useState(null);
  // @文件：弹出选择器 + 已选文件（{id, name, content}）
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [panelMenuOpen, setPanelMenuOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [lastContextPacket, setLastContextPacket] = useState(null);
  const [activePanelTab, setActivePanelTab] = useState('chat');
  const [sessionSearch, setSessionSearch] = useState('');
  const [assistantActivity, setAssistantActivity] = useState(null);
  const [runningSessionId, setRunningSessionId] = useState(null);
  // 运行中回车发送的消息先排队，本轮结束后按顺序自动发送
  const [queuedTurns, setQueuedTurns] = useState([]);

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
  // 产品 skill：内置 + 内容库（MdRender/.agents/skills），改文件后自动刷新
  const { skills: registrySkills, warnings: skillWarnings, loaded: skillsLoaded } = useSkillRegistry();
  const agentSkillRequest = useEditorStore((s) => s.agentSkillRequest);
  const clearAgentSkillRequest = useEditorStore((s) => s.clearAgentSkillRequest);
  const skillItems = useMemo(() => registrySkills.map(toSkillItem), [registrySkills]);
  const writeWelcomeItems = useMemo(() => {
    const welcomeIds = new Set(pickSkillItems(skillItems, 'welcome').map((item) => item.skillId));
    const preferredIds = ['polish', 'title-suggestions', 'outline', 'related-docs'];
    return preferredIds
      .map((id) => skillItems.find((item) => item.skillId === id))
      .filter((item) => item && (item.skillId === 'polish' || welcomeIds.has(item.skillId)));
  }, [skillItems]);
  const composerItems = useMemo(() => pickSkillItems(skillItems, 'composer'), [skillItems]);
  const slashItems = useMemo(() => pickSkillItems(skillItems, 'slash'), [skillItems]);
  const filteredSkills = useMemo(() => {
    const q = skillFilter.trim().toLowerCase();
    const list = q ? slashItems.filter((item) => item.searchText.includes(q)) : slashItems;
    return list.slice(0, MAX_SLASH_SKILL_RESULTS);
  }, [skillFilter, slashItems]);
  // 技能页：所有在界面露出的 skill，加上内容库里的全部 skill
  const skillTabItems = useMemo(
    () => skillItems.filter((item) => item.entry.length > 0 || item.source === 'vault'),
    [skillItems],
  );
  const [showSessions, setShowSessions] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [panelWidth, setPanelWidth] = useState(readAgentPanelWidth);
  const providers = useMemo(() => listProviders(), []);
  const [providerId, setProviderId] = useState(() => getActiveProviderId());
  const [cfg, setCfg] = useState(() => readProviderConfig());
  const [aiServerBase, setAiServerBase] = useState(() => readAiServerBase());
  const [knowledgeSources, setKnowledgeSources] = useState(() => loadKnowledgeSources());
  const [serverProvidersReady, setServerProvidersReady] = useState(false);
  // AI 来源：本机 agent（Codex / Claude Code / Cursor）或 API 服务商
  const aiSource = useAiSource({ providersReady: serverProvidersReady });
  const abortRef = useRef(null);
  const activeRunIdRef = useRef(0);
  const runLockRef = useRef(false);
  const inputRef = useRef(null);
  const panelRef = useRef(null);
  const previousOpenRef = useRef(false);
  const fileInputRef = useRef(null);
  const messagesRef = useRef(null);
  const pendingAttachmentIdsRef = useRef(new Set());
  const ignoredUrlIdsRef = useRef(new Set());
  const shouldFollowMessagesRef = useRef(true);
  const forceScrollToBottomRef = useRef(false);

  // 启动时从主进程获取内置 provider 列表
  useEffect(() => {
    fetchServerProviders().then(() => setServerProvidersReady(true));
  }, []);
  useEffect(() => () => {
    activeRunIdRef.current += 1;
    runLockRef.current = false;
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);
  useEffect(() => {
    setInput('');
    setAttachedFiles([]);
    setLastContextPacket(null);
    setQueuedTurns([]);
    setPinnedIndex(null);
    ignoredUrlIdsRef.current.clear();
    shouldFollowMessagesRef.current = true;
    forceScrollToBottomRef.current = true;
  }, [activeSessionId]);
  useEffect(() => {
    const wasOpen = previousOpenRef.current;
    previousOpenRef.current = open;
    if (open) {
      if (!wasOpen && !isAiConfigured()) setShowSettings(true);
      return;
    }
    setShowSessions(false);
    setShowSettings(false);
    setPanelMenuOpen(false);
    setActivePanelTab('chat');
    setShowFilePicker(false);
    setShowSkillPicker(false);
  }, [open]);
  const isWelcomeMode = messages.length === 0 && !showSettings;
  const isActiveSessionRunning = running && runningSessionId === activeSessionId;
  const isOtherSessionRunning = running && runningSessionId !== activeSessionId;

  const isShortcutDisabled = useCallback((item) => {
    return running && item.type === 'skill';
  }, [running]);

  const composerPlusMenuItems = useMemo(() => {
    const shortcuts = composerItems.map((item) => {
      const Icon = item.icon;
      return {
        key: item.id,
        disabled: isShortcutDisabled(item),
        label: item.label,
        icon: <Icon />,
      };
    });
    return shortcuts;
  }, [isShortcutDisabled, composerItems]);
  const modeMenuItems = useMemo(() => ([
    { key: AGENT_SESSION_MODES.CHAT, label: '💡 聊天' },
    { key: AGENT_SESSION_MODES.WRITE, label: '✏️ 写作' },
  ]), []);
  const panelMenuItems = useMemo(() => ([
    { key: 'context', label: '上下文', icon: <MessageSquareQuote size={14} /> },
    { key: 'skills', label: '技能', icon: <Wrench size={14} /> },
    { key: 'activity', label: '活动', icon: <History size={14} /> },
    { type: 'divider' },
    { key: 'settings', label: '设置', icon: <Settings size={14} /> },
  ]), []);
  const filteredSessions = useMemo(() => {
    const query = sessionSearch.trim().toLowerCase();
    if (!query) return sessions;
    return sessions.filter((session) => {
      const firstMessage = session.messages?.find((item) => item.role === 'user')?.text ?? '';
      return `${session.title ?? ''}\n${firstMessage}`.toLowerCase().includes(query);
    });
  }, [sessions, sessionSearch]);

  // 输入里的公开链接会先读取成附件；发送时模型直接拿到正文。
  useEffect(() => {
    const urls = extractPublicUrls(input);
    const visibleIds = new Set(urls.map((url) => `url:${url}`));
    setAttachedFiles((prev) => {
      const next = prev.filter((item) => item.kind !== 'url' || visibleIds.has(item.id));
      return next.length === prev.length ? prev : next;
    });
    ignoredUrlIdsRef.current.forEach((id) => {
      if (!visibleIds.has(id)) ignoredUrlIdsRef.current.delete(id);
    });

    urls.forEach((url) => {
      const attachment = createUrlAttachment(url);
      if (ignoredUrlIdsRef.current.has(attachment.id)
        || pendingAttachmentIdsRef.current.has(attachment.id)
        || attachedFiles.some((item) => item.id === attachment.id)) return;

      pendingAttachmentIdsRef.current.add(attachment.id);
      setAttachedFiles((prev) => (
        prev.some((item) => item.id === attachment.id) ? prev : [...prev, attachment]
      ));
      readPublicUrl({ url, aiProxyBase: aiServerBase })
        .then((result) => {
          setAttachedFiles((prev) => prev.map((item) => (
            item.id === attachment.id ? resolveUrlAttachment(item, result) : item
          )));
        })
        .catch((error) => {
          setAttachedFiles((prev) => prev.map((item) => (
            item.id === attachment.id
              ? { ...item, status: 'error', error: error?.message || '链接读取失败' }
              : item
          )));
        })
        .finally(() => pendingAttachmentIdsRef.current.delete(attachment.id));
    });
  }, [input, attachedFiles, aiServerBase]);

  // 注入给 agent 的宿主能力：和 MCP 控制桥共用 createHost，每次调用读实时状态
  const knowledgeSourcesRef = useRef(knowledgeSources);
  knowledgeSourcesRef.current = knowledgeSources;
  const host = useMemo(() => createHost({
    getState: useEditorStore.getState,
    ...AGENT_HOST_DIALOGS,
    getKnowledgeSources: () => knowledgeSourcesRef.current,
    onAiServerBaseChange: setAiServerBase,
  }), []);

  // 加载 server 端脚本工具的 schema（pdf_to_docx 等），传给 runAgent
  const [serverTools, setServerTools] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasAiBridge()) return;
      try {
        const tools = await fetchServerTools(
          () => aiListTools({ aiProxyBase: aiServerBase }),
          { force: true },
        );
        if (!cancelled) setServerTools(tools);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [aiServerBase]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
    activeRunIdRef.current += 1;
    runLockRef.current = false;
    abortRef.current = null;
    if (runningSessionId) {
      updateAgentMessages(runningSessionId, (items) => stopTypingMessages(finishRunningTools(items, 'interrupted')));
    }
    // 停止 = 这一串都不要了，排队的也一起清掉
    setQueuedTurns([]);
    setAssistantActivity(null);
    setRunningSessionId(null);
    setRunning(false);
  }, [runningSessionId, updateAgentMessages]);

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

  const handlePinInspiration = useCallback(async (index, text) => {
    const sourceMessage = [...messages.slice(0, index)]
      .reverse()
      .find((item) => item.role === 'user');
    try {
      const result = await host.pinInspiration({
        text,
        title: activeSession?.title || '新会话',
        dateKey: getTodayDateKey(),
        sources: sourceMessage?.files ?? [],
      });
      if (!result?.ok) throw new Error(result?.error || '写入灵感笔记失败');
      setPinnedIndex(index);
      message.success(`已记到「${result.name || '灵感.md'}」`);
    } catch (error) {
      message.error(error?.message || '写入灵感笔记失败');
    }
  }, [messages, host, activeSession?.title]);

  // 输入变化：检测末尾的 @关键词 → 打开文件选择器并带过滤词
  const handleInputChange = useCallback((value) => {
    setInput(value);
    const mentionMatch = /(?:^|\s)@([^\s@]*)$/.exec(value);
    const skillMatch = SLASH_SKILL_PATTERN.exec(value);
    if (mentionMatch) {
      setFileFilter(mentionMatch[1]);
      setShowFilePicker(true);
      setShowSkillPicker(false);
    } else if (skillMatch) {
      setSkillFilter(skillMatch[1]);
      setShowSkillPicker(true);
      setShowFilePicker(false);
    } else {
      setShowFilePicker(false);
      setShowSkillPicker(false);
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
    if (String(fileId).startsWith('url:')) ignoredUrlIdsRef.current.add(fileId);
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

  const handleAttachmentFiles = useCallback((fileList) => {
    const files = Array.from(fileList ?? []);
    if (!files.length) return;

    files.forEach((file) => {
      if (!isSupportedAgentAttachment(file)) {
        message.warning(`不支持附件「${file.name || '未命名'}」`);
        return;
      }
      const id = createAttachmentId(file);
      if (pendingAttachmentIdsRef.current.has(id)
        || attachedFiles.some((item) => item.id === id)) return;

      pendingAttachmentIdsRef.current.add(id);
      const pending = {
        id,
        name: file.name,
        kind: 'file',
        content: '',
        status: 'loading',
      };
      setAttachedFiles((prev) => (
        prev.some((item) => item.id === id) ? prev : [...prev, pending]
      ));
      extractAgentAttachment(file, {
        extractPdfText: (pdfFile) => extractPdfAttachmentText(
          pdfFile,
          { aiProxyBase: aiServerBase },
        ),
      })
        .then((attachment) => {
          setAttachedFiles((prev) => prev.map((item) => (
            item.id === id ? attachment : item
          )));
        })
        .catch((error) => {
          setAttachedFiles((prev) => prev.map((item) => (
            item.id === id
              ? { ...item, status: 'error', error: error?.message || '附件读取失败' }
              : item
          )));
        })
        .finally(() => pendingAttachmentIdsRef.current.delete(id));
    });
  }, [attachedFiles, aiServerBase]);

  const handleAttachmentInput = useCallback((event) => {
    handleAttachmentFiles(event.target.files);
    event.target.value = '';
  }, [handleAttachmentFiles]);

  const handleComposerPaste = useCallback((event) => {
    if (!event.clipboardData?.files?.length) return;
    event.preventDefault();
    handleAttachmentFiles(event.clipboardData.files);
  }, [handleAttachmentFiles]);

  const handleComposerDrop = useCallback((event) => {
    event.preventDefault();
    handleAttachmentFiles(event.dataTransfer?.files);
  }, [handleAttachmentFiles]);

  const closeSkillPicker = useCallback(() => {
    setShowSkillPicker(false);
    setSkillFilter('');
    setActiveSkillIndex(0);
  }, []);

  const focusInput = useCallback(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  const handleNewSession = useCallback(() => {
    createAgentSession();
    setActivePanelTab('chat');
    setShowSessions(false);
  }, [createAgentSession]);

  const handleDeleteSession = useCallback((e, sessionId) => {
    e.stopPropagation();
    deleteAgentSession(sessionId);
  }, [deleteAgentSession]);

  const handleSwitchSession = useCallback((sessionId) => {
    switchAgentSession(sessionId);
    setActivePanelTab('chat');
    setShowSessions(false);
  }, [switchAgentSession]);

  const buildTurnContext = useCallback(async ({
    selectionText = '',
    pinnedFiles = [],
    includeActiveDoc = true,
  } = {}) => {
    const inDocumentSurface = surface === 'paper';
    const activeDoc = includeActiveDoc && inDocumentSurface ? host.getActiveDocMeta?.() : null;
    const workspaceBrief = buildWorkspaceBrief(workspace, selectedId);
    // 发送前只匹配已有的文档指针；全文检索留给显式召回，不能阻塞普通写作请求。
    const relatedRefs = buildWorkspaceRelatedRefs(activeDoc, workspaceBrief);

    return buildTaskContextPacket({
      activeDoc,
      currentSurface: getSurfaceLabel(surface, activeFile),
      selectionText,
      workspaceBrief,
      relatedRefs,
      userPinnedContext: buildPinnedContext(pinnedFiles),
    });
  }, [host, workspace, selectedId, markdown, surface, activeFile]);

  // 跑一个 agent 回合：UI 展示 displayText，实际发给模型 promptText。
  // handleSend 和快捷动作共用，避免重复一整套 runAgent 流程。
  const runTurn = useCallback(async ({
    promptText,
    displayText,
    fileNames = [],
    selectionText = '',
    pinnedFiles = [],
    allowedTools = null,
    mode = sessionMode,
    isSkillRun = false,
    skipUserMessage = false,
  }) => {
    if (running || runLockRef.current) return;
    const retryParams = {
      promptText,
      displayText,
      fileNames,
      selectionText,
      pinnedFiles,
      allowedTools,
      mode,
      isSkillRun,
    };
    if (!isAiConfigured()) {
      setShowSettings(true);
      return;
    }
    const sessionId = activeSessionId;
    if (!sessionId) return;
    const source = getActiveSource();
    const isLocalRun = source.kind === 'local';
    const modeConfig = resolveAgentTurnMode({ mode, allowedTools, isSkillRun });
    const localSession = isLocalRun
      ? resolveLocalAgentSession(activeSession, source.agentId, modeConfig.mode)
      : null;
    if (localSession?.switched) {
      appendAgentMessage(sessionId, { role: 'assistant', text: `已切换到 ${source.label}，新会话开始。` });
    }

    runLockRef.current = true;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const ownsRun = () => activeRunIdRef.current === runId;
    forceScrollToBottomRef.current = true;
    shouldFollowMessagesRef.current = true;
    if (!skipUserMessage) appendAgentMessage(sessionId, { role: 'user', text: displayText, files: fileNames });
    setRunning(true);
    setAssistantActivity('thinking');
    setRunningSessionId(sessionId);
    const controller = new AbortController();
    abortRef.current = controller;

    // 流式片段先攒着，定时合并写进同一条消息
    let pendingDelta = { streamId: '', text: '' };
    let flushTimer = null;
    let finalStreamId = '';
    const toStreamId = (step) => (step ? `${runId}:${step}` : '');
    const flushDelta = () => {
      clearTimeout(flushTimer);
      flushTimer = null;
      const { streamId, text } = pendingDelta;
      pendingDelta = { streamId, text: '' };
      if (!text || !ownsRun() || controller.signal.aborted) return;
      setAssistantActivity(null);
      updateAgentMessages(sessionId, (items) => appendStreamDelta(items, streamId, text));
    };
    const queueDelta = (streamId, text) => {
      if (pendingDelta.streamId !== streamId) flushDelta();
      pendingDelta = { streamId, text: pendingDelta.text + text };
      if (!flushTimer) flushTimer = setTimeout(flushDelta, STREAM_FLUSH_INTERVAL_MS);
    };

    try {
      const taskContext = await buildTurnContext({
        selectionText,
        pinnedFiles,
        includeActiveDoc: modeConfig.includeActiveDoc,
      });
      if (!ownsRun() || controller.signal.aborted) return;
      setLastContextPacket(taskContext);
      const onEvent = (ev) => {
        // 工具已经执行了就要留痕，不管这一轮后来是否被取消或切走（本机 agent 的改动由 localAgentClient 自己记）
        if (ev.type === 'tool_done' && !isLocalRun) recordToolActivity({ who: 'app', name: ev.name, args: ev.args, result: ev.result });
        if (!ownsRun() || controller.signal.aborted) return;
        if (ev.type === 'assistant_delta') {
          queueDelta(toStreamId(ev.step), ev.text);
          return;
        }
        if (ev.type === 'assistant_text') {
          finalStreamId = toStreamId(ev.step);
          return;
        }
        if (ev.type === 'tool_start') {
          // 调工具前模型说的话到此为止，收掉打字光标
          flushDelta();
          updateAgentMessages(sessionId, (items) => endStreamMessage(items, toStreamId(ev.step)));
          setAssistantActivity('working');
          appendAgentMessage(sessionId, {
            role: 'tool',
            callId: ev.callId,
            label: ev.label,
            status: 'running',
          });
        } else if (ev.type === 'tool_done') {
          setAssistantActivity('finalizing');
          updateAgentMessages(sessionId, (items) => finishToolMessage(items, {
            callId: ev.callId,
            label: ev.label,
            status: getToolCompletionStatus(ev.result),
            result: getArtifactResultForMessage(ev.result),
          }));
        }
      };
      const turnParams = {
        userInput: promptText,
        history: isLocalRun
          ? activeSession?.history ?? []
          : appendModeSystemMessage(activeSession?.history ?? [], modeConfig.systemPrompt),
        modeSystemPrompt: modeConfig.systemPrompt,
        host,
        signal: controller.signal,
        taskContext,
        allowedTools: modeConfig.allowedTools,
        onEvent,
      };
      const result = isLocalRun
        ? await runLocalAgent({
          ...turnParams,
          config: {
            ...source,
            externalSessionId: localSession.externalSessionId,
            readOnly: modeConfig.mode === AGENT_SESSION_MODES.CHAT,
            projectRoot: pickAgentProjectRoot(workspace, selectedId),
          },
        })
        : await runAgent({ ...turnParams, config: readProviderConfig(source.providerId), serverTools, stream: true });
      const { finalText, history } = result;
      // 会话续接：同一个 agent 下一轮 resume；走 API 服务商时清空
      setAgentExternalSession(sessionId, isLocalRun
        ? {
          agentId: source.agentId,
          externalSessionId: result.externalSessionId || localSession.externalSessionId,
          mode: modeConfig.mode,
        }
        : {});
      if (!ownsRun() || controller.signal.aborted) return;
      setAgentHistory(sessionId, history);
      flushDelta();
      if (finalText) {
        setAssistantActivity(null);
        updateAgentMessages(sessionId, (items) => finalizeAssistantReply(items, finalStreamId, finalText));
      }
    } catch (error) {
      if (!ownsRun()) return;
      if (String(error?.message ?? '') !== '已取消') {
        flushDelta();
        updateAgentMessages(sessionId, (items) => stopTypingMessages(finishRunningTools(items, 'error')));
        appendAgentMessage(sessionId, buildErrorMessage(formatAgentError(error), retryParams));
      }
    } finally {
      clearTimeout(flushTimer);
      if (ownsRun()) {
        runLockRef.current = false;
        setAssistantActivity(null);
        setRunningSessionId(null);
        setRunning(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }, [running, activeSessionId, activeSession, sessionMode, host, appendAgentMessage, updateAgentMessages, setAgentHistory, setAgentExternalSession, serverTools, buildTurnContext, workspace, selectedId]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text && attachedFiles.length === 0) return;
    if (attachedFiles.some((item) => item.status === 'loading')) {
      message.info('附件还在读取，请稍候');
      return;
    }
    const displayText = text || '请阅读这些附件';

    // 引用的选中文字当成一个特殊「附件」，复用文件附件的拼接逻辑
    const selectionAttachment = quotedSelection
      ? { id: 'selection', name: '选中内容', content: quotedSelection }
      : null;
    const files = selectionAttachment ? [selectionAttachment, ...attachedFiles] : attachedFiles;
    const fileNames = files.map((f) => f.name);
    // 拼附件内容给模型；UI 上只展示用户原话 + 附件名标记
    const promptText = buildInputWithAttachments(displayText, files);

    setInput('');
    setAttachedFiles([]);
    clearAiQuotedSelection();
    setActivePanelTab('chat');
    const turn = {
      promptText,
      displayText,
      fileNames,
      selectionText: quotedSelection,
      pinnedFiles: attachedFiles,
      mode: sessionMode,
    };
    if (running) {
      setQueuedTurns((prev) => [...prev, turn]);
      return;
    }
    await runTurn(turn);
  }, [input, running, attachedFiles, quotedSelection, sessionMode, clearAiQuotedSelection, runTurn]);

  // 本轮结束后自动发送排队的下一条
  useEffect(() => {
    if (running || runLockRef.current || queuedTurns.length === 0) return;
    const [next, ...rest] = queuedTurns;
    setQueuedTurns(rest);
    runTurn(next);
  }, [running, queuedTurns, runTurn]);

  const handleCancelQueue = useCallback(() => setQueuedTurns([]), []);

  // 出错重试：移走出错消息，用原参数再跑一轮（不重复显示用户消息）
  const handleRetry = useCallback((index) => {
    if (running || !activeSessionId) return;
    const retry = messages[index]?.retry;
    if (!retry) return;
    updateAgentMessages(activeSessionId, (items) => removeMessageAt(items, index));
    runTurn({ ...retry, skipUserMessage: true });
  }, [running, activeSessionId, messages, updateAgentMessages, runTurn]);

  const handleOpenSettings = useCallback(() => setShowSettings(true), []);

  const handleChoiceCardClick = useCallback((choice) => {
    if (running) return;
    const label = [choice.label, choice.title].filter(Boolean).join(' ');
    runTurn({
      promptText: choice.prompt,
      displayText: label || choice.prompt,
      mode: sessionMode,
    });
  }, [running, sessionMode, runTurn]);

  const handleInsertMention = useCallback(() => {
    setInput((prev) => {
      const next = prev.trimEnd();
      return next ? `${next} @` : '@';
    });
    setFileFilter('');
    setShowFilePicker(true);
    focusInput();
  }, [focusInput]);

  // 统一的 skill 入口：按 skill 声明拼 prompt、带上附件/选区、只开放白名单里的工具。
  const runSkill = useCallback((skillId) => {
    if (running) return;
    const skill = findSkillById(registrySkills, skillId);
    if (!skill) return;

    const turn = buildSkillTurn(skill, { skills: registrySkills, selectionText: quotedSelection });
    // 选区没被 skill 当作处理对象时，作为参考附件带上
    const selectionAttachment = quotedSelection && !turn.consumesSelection
      ? { id: 'selection', name: '选中内容', content: quotedSelection }
      : null;
    const files = selectionAttachment ? [selectionAttachment, ...attachedFiles] : attachedFiles;

    setInput('');
    setAttachedFiles([]);
    if (quotedSelection) clearAiQuotedSelection();
    setActivePanelTab('chat');
    runTurn({
      promptText: buildInputWithAttachments(turn.promptText, files),
      displayText: turn.displayText,
      fileNames: files.map((file) => file.name),
      selectionText: quotedSelection,
      pinnedFiles: attachedFiles,
      allowedTools: turn.allowedTools,
      mode: AGENT_SESSION_MODES.WRITE,
      isSkillRun: true,
    });
  }, [running, registrySkills, quotedSelection, attachedFiles, clearAiQuotedSelection, runTurn]);

  // 文档工具栏等外部入口请求运行 skill：内容库 skill 读完后再找，找到就跑，跑不了就提示
  useEffect(() => {
    if (!agentSkillRequest) return;
    const skill = findSkillById(registrySkills, agentSkillRequest.skillId);
    if (!skill && !skillsLoaded) return;
    clearAgentSkillRequest();
    if (!skill) {
      message.warning(`找不到 skill「${agentSkillRequest.skillId}」`);
      return;
    }
    if (running) {
      message.info('AI 正在处理上一个任务，稍后再试');
      return;
    }
    runSkill(skill.id);
  }, [agentSkillRequest, registrySkills, skillsLoaded, running, runSkill, clearAgentSkillRequest]);

  const handleShortcutClick = useCallback((item) => {
    setActivePanelTab('chat');
    if (item.type === 'skill') {
      runSkill(item.skillId);
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
  }, [runSkill, handleInsertMention]);

  const handleWelcomeSuggestion = useCallback((item) => {
    handleShortcutClick(item);
  }, [handleShortcutClick]);

  const handleChatWelcomeSuggestion = useCallback((text) => {
    setInput(text);
    focusInput();
  }, [focusInput]);

  const handlePickSkill = useCallback((item) => {
    closeSkillPicker();
    setActivePanelTab('chat');
    runSkill(item.skillId);
  }, [closeSkillPicker, runSkill]);

  const handleComposerPlusClick = useCallback(({ key }) => {
    const shortcut = composerItems.find((item) => item.id === key);
    if (shortcut) handleShortcutClick(shortcut);
  }, [composerItems, handleShortcutClick]);

  const handleModeChange = useCallback(({ key }) => {
    if (!activeSessionId) return;
    setAgentSessionMode(activeSessionId, key);
  }, [activeSessionId, setAgentSessionMode]);

  const handlePanelMenuClick = useCallback(({ key }) => {
    setPanelMenuOpen(false);
    if (key === 'settings') {
      setActivePanelTab('chat');
      setShowSettings(true);
      return;
    }
    setActivePanelTab(key);
  }, []);

  const handleResizeStart = useCallback((event) => {
    event.preventDefault();
    const dock = panelRef.current?.parentElement;
    if (!dock) return;
    const startX = event.clientX;
    const startWidth = dock.getBoundingClientRect().width;
    const handleMove = (moveEvent) => {
      setPanelWidth(clampAgentPanelWidth(startWidth + startX - moveEvent.clientX));
    };
    const handleUp = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
      document.body.classList.remove('is-resizing-agent-panel');
    };
    document.body.classList.add('is-resizing-agent-panel');
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp, { once: true });
    window.addEventListener('pointercancel', handleUp, { once: true });
  }, []);

  // 召回相关旧文：读当前文档 → 抽关键词 → 搜工作区 → 排序，结果给「参考上下文」区。
  // 复用 host.searchDocs（与 agent 工具同一条召回链路），不重复造轮子。
  const handleRecall = useCallback(async () => {
    const doc = host.readActiveDoc();
    return recallDocsForContext({
      doc,
      selectedId,
      searchDocs: host.searchDocs,
      limit: 5,
    });
  }, [host, selectedId]);

  // 一键插入引用：把选中的相关旧文以引用块追加到当前文档末尾（编辑器同步刷新并落盘）。
  const handleInsertReference = useCallback((ref) => {
    applyContentFromOutside(selectedId, appendReferenceToContent(markdown, ref));
  }, [applyContentFromOutside, markdown, selectedId]);

  // 切换服务商：记住选择并带出该商已存配置（参考 Cursor，每商独立 key）
  const handleProviderChange = useCallback((nextId) => {
    setActiveProvider(nextId);
    setProviderId(nextId);
    setCfg(readProviderConfig(nextId));
    // 当前用的是 API 服务商时，改服务商就是改来源
    if (!aiSource.isLocal) aiSource.selectSource(nextId);
  }, [aiSource]);

  // 设置页里选来源：选 API 服务商时同步下方的服务商配置
  const handleSourceChange = useCallback((nextSourceId) => {
    aiSource.selectSource(nextSourceId);
    const next = getActiveSource(nextSourceId);
    if (next.kind === 'api') {
      setProviderId(next.providerId);
      setCfg(readProviderConfig(next.providerId));
    }
  }, [aiSource]);

  const handleSaveSettings = useCallback(() => {
    setActiveProvider(providerId);
    saveProviderConfig(providerId, { model: cfg.model });
    saveAiServerBase(aiServerBase);
    if (!saveKnowledgeSources(knowledgeSources)) {
      message.error('外挂知识库配置保存失败');
      return;
    }
    setCfg(readProviderConfig(providerId));
    setAiServerBase(readAiServerBase());
    setShowSettings(false);
  }, [providerId, cfg, aiServerBase, knowledgeSources]);

  const handleKeyDown = useCallback((e) => {
    if (showSkillPicker && filteredSkills.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveSkillIndex((prev) => (prev + 1) % filteredSkills.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveSkillIndex((prev) => (prev - 1 + filteredSkills.length) % filteredSkills.length);
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handlePickSkill(filteredSkills[activeSkillIndex] || filteredSkills[0]);
        return;
      }
    }
    if (showSkillPicker && e.key === 'Escape') {
      e.preventDefault();
      closeSkillPicker();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [showSkillPicker, filteredSkills, activeSkillIndex, handlePickSkill, closeSkillPicker, handleSend]);

  useEffect(() => {
    if (!showSkillPicker) {
      setActiveSkillIndex(0);
      return;
    }
    setActiveSkillIndex((prev) => Math.min(prev, Math.max(filteredSkills.length - 1, 0)));
  }, [showSkillPicker, filteredSkills]);

  const handleMessagesScroll = useCallback(() => {
    const el = messagesRef.current;
    if (!el) return;
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    shouldFollowMessagesRef.current = distanceToBottom <= 64;
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    const forceScroll = forceScrollToBottomRef.current;
    forceScrollToBottomRef.current = false;
    if (!forceScroll && !shouldFollowMessagesRef.current) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, assistantActivity]);

  useEffect(() => {
    const dock = panelRef.current?.parentElement;
    dock?.style.setProperty('--agent-panel-width', `${panelWidth}px`);
    try {
      localStorage.setItem(AGENT_PANEL_WIDTH_KEY, String(panelWidth));
    } catch {
      /* localStorage 不可用时仍保留当前会话的拖拽结果 */
    }
  }, [panelWidth]);

  return (
    <div className="agent-panel" ref={panelRef}>
      <div
        className="agent-panel__resize-handle"
        role="separator"
        aria-label="调整 AI 助手宽度"
        aria-orientation="vertical"
        onPointerDown={handleResizeStart}
      />
      <div className="agent-panel__header">
        <Dropdown
          trigger={['click']}
          placement="bottomLeft"
          open={open && showSessions}
          onOpenChange={(open) => {
            setShowSessions(open);
            if (!open) setSessionSearch('');
          }}
          dropdownRender={() => (
            <div className="agent-panel__session-menu">
              <label className="agent-panel__session-search">
                <Search size={14} />
                <input
                  value={sessionSearch}
                  placeholder="搜索会话"
                  onChange={(event) => setSessionSearch(event.target.value)}
                />
              </label>
              <div className="agent-panel__sessions">
                {filteredSessions.length === 0 ? (
                  <div className="agent-panel__session-empty">没有匹配的会话</div>
                ) : filteredSessions.map((session) => (
                  <div
                    key={session.id}
                    className={`agent-panel__session${session.id === activeSessionId ? ' is-active' : ''}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleSwitchSession(session.id)}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return;
                      event.preventDefault();
                      handleSwitchSession(session.id);
                    }}
                  >
                    <span className="agent-panel__session-mode" aria-hidden="true">
                      {normalizeAgentSessionMode(session.mode) === AGENT_SESSION_MODES.CHAT ? '💡' : '✏️'}
                    </span>
                    <span className="agent-panel__session-main">
                      <span className="agent-panel__session-title">{session.title || '新会话'}</span>
                      <span className="agent-panel__session-date">{formatSessionDate(session.createdAt)}</span>
                    </span>
                    <button
                      type="button"
                      className="agent-panel__session-del"
                      title="删除会话"
                      onClick={(event) => handleDeleteSession(event, session.id)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        >
          <button type="button" className="agent-panel__title" title="切换会话">
            <Bot size={16} />
            <span>{activeSession?.title || '新会话'}</span>
            <ChevronDown size={14} />
          </button>
        </Dropdown>
        <div className="agent-panel__header-actions">
          <button className="agent-panel__icon-btn" onClick={handleNewSession} title="新建会话">
            <Plus size={16} />
          </button>
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            open={open && panelMenuOpen}
            onOpenChange={setPanelMenuOpen}
            menu={{ items: panelMenuItems, onClick: handlePanelMenuClick }}
          >
            <button className="agent-panel__icon-btn" title="更多">
              <Settings size={16} />
            </button>
          </Dropdown>
          {onClose && (
            <button className="agent-panel__icon-btn" onClick={onClose} title="关闭">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <Modal
        className="agent-panel__settings-modal"
        open={open && showSettings}
        title="AI 助手设置"
        footer={null}
        width={560}
        onCancel={() => setShowSettings(false)}
      >
        <div className="agent-panel__settings">
          <AgentLocalSources
            sources={aiSource.sources}
            activeSource={aiSource.activeSource}
            detected={aiSource.detected}
            detecting={aiSource.detecting}
            safeMode={aiSource.safeMode}
            onSelectSource={handleSourceChange}
            onSelectModel={aiSource.selectModel}
            onRedetect={aiSource.redetect}
            onSafeModeChange={aiSource.setSafeMode}
          />
          <label>API 服务商
            <select value={providerId} onChange={(e) => handleProviderChange(e.target.value)}>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          {hasBuiltinKey(providerId) ? (
            <div className="agent-panel__builtin-hint">
              正在使用内置服务配置，无需填写 Base URL。
            </div>
          ) : null}
          <label>模型
            <input value={cfg.model} placeholder="默认已填，可改"
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
          </label>
          <details className="agent-panel__advanced-settings">
            <summary>高级</summary>
            <label>Base URL
              <input value={cfg.baseURL} placeholder="由 AI 代理服务配置" readOnly />
            </label>
            <div className="agent-panel__advanced-hint">服务地址与密钥由 AI 代理服务统一管理。</div>
            <label>AI 代理地址
              <input value={aiServerBase} placeholder="http://你的服务器:8788"
                onChange={(e) => setAiServerBase(e.target.value)} />
            </label>
          </details>
          <AgentKnowledgeSources
            sources={knowledgeSources}
            onChange={setKnowledgeSources}
          />
          <button className="agent-panel__save-btn" onClick={handleSaveSettings}>保存</button>
        </div>
      </Modal>

      <div
        className={`agent-panel__messages${isWelcomeMode ? ' is-welcome' : ''}`}
        ref={messagesRef}
        aria-label="对话"
        onScroll={handleMessagesScroll}
      >
        {isWelcomeMode && (
          <div className="agent-panel__welcome">
            <h2 className="agent-panel__welcome-title">
              {sessionMode === AGENT_SESSION_MODES.CHAT
                ? '随便聊聊，先不急着写成稿'
                : '一起把内容写清楚'}
            </h2>
            <p className="agent-panel__welcome-subtitle">
              {sessionMode === AGENT_SESSION_MODES.CHAT
                ? '丢个链接、文档进来，或者随便聊聊。'
                : '可以从润色、标题或提纲开始。'}
            </p>
            <div className="agent-panel__welcome-grid">
              {sessionMode === AGENT_SESSION_MODES.CHAT
                ? CHAT_WELCOME_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="agent-panel__welcome-chip"
                    disabled={running}
                    onClick={() => handleChatWelcomeSuggestion(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))
                : writeWelcomeItems.map((item) => (
                  <button
                    key={item.id}
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
          <div className="agent-panel__empty">问我点什么，比如「帮我把这个想法聊清楚」。</div>
        )}
        {!isWelcomeMode && (
          <AgentConversation
            messages={messages}
            running={running}
            showActivity={isActiveSessionRunning}
            activity={assistantActivity}
            copiedIndex={copiedIndex}
            onChoice={handleChoiceCardClick}
            onCopy={handleCopy}
            onPin={sessionMode === AGENT_SESSION_MODES.CHAT ? handlePinInspiration : null}
            pinnedIndex={pinnedIndex}
            onRetry={handleRetry}
            onOpenSettings={handleOpenSettings}
            onOpenArtifact={(fileId) => host.openWorkspaceItem({ id: fileId })}
          />
        )}
      </div>

      <Modal
        className="agent-panel__utility-modal"
        open={open && activePanelTab !== 'chat'}
        title={{ context: '上下文', skills: '技能', activity: '活动' }[activePanelTab]}
        footer={null}
        width={560}
        onCancel={() => setActivePanelTab('chat')}
      >
        {activePanelTab === 'context' && (
          <div className="agent-panel__tab-panel agent-panel__tab-panel--context" aria-label="上下文">
            <AgentDocMeta
              document={activeFile}
              contextPacket={lastContextPacket}
              onRecall={handleRecall}
              onInsertReference={handleInsertReference}
            />
          </div>
        )}
        {activePanelTab === 'activity' && <AgentActivityTab />}
        {activePanelTab === 'skills' && (
          <AgentSkillsTab
            items={skillTabItems}
            skills={registrySkills}
            warnings={skillWarnings}
            isDisabled={isShortcutDisabled}
            onRun={handlePickSkill}
          />
        )}
      </Modal>

      <div className="agent-panel__composer">
        {showSkillPicker && (
          <div className="agent-panel__skill-picker">
            {filteredSkills.length === 0 ? (
              <div className="agent-panel__file-empty">没有匹配的 skill</div>
            ) : (
              filteredSkills.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`agent-panel__skill-option${index === activeSkillIndex ? ' is-active' : ''}`}
                    onMouseEnter={() => setActiveSkillIndex(index)}
                    onClick={() => handlePickSkill(item)}
                  >
                    <span className={`agent-panel__skill-option-icon agent-panel__tool-btn--${item.tone}`}>
                      <Icon />
                    </span>
                    <span className="agent-panel__skill-option-main">
                      <span className="agent-panel__skill-option-label">{item.label}</span>
                      <span className="agent-panel__skill-option-desc">{item.description}</span>
                    </span>
                    <span className="agent-panel__skill-option-kind">{item.category}</span>
                  </button>
                );
              })
            )}
          </div>
        )}

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
              <span
                key={f.id}
                className={`agent-panel__chip agent-panel__chip--${f.status || 'ready'}`}
                title={f.status === 'error' ? f.error : f.name}
              >
                {f.kind === 'url' ? <Link2 size={12} /> : <FileText size={12} />}
                <span className="agent-panel__chip-name">
                  {f.status === 'loading' ? `正在读取：${f.name}` : f.name}
                </span>
                <button className="agent-panel__chip-del" title="移除" onClick={() => handleRemoveFile(f.id)}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        {queuedTurns.length > 0 && (
          <div className="agent-panel__queue-notice" aria-live="polite">
            <span>已排队 {queuedTurns.length} 条，这一轮结束后自动发送</span>
            <button type="button" onClick={handleCancelQueue}>取消</button>
          </div>
        )}

        {aiSource.defaultNotice && (
          <div className="agent-panel__source-notice">
            <span>{aiSource.defaultNotice}</span>
            <button type="button" onClick={aiSource.dismissDefaultNotice}>知道了</button>
          </div>
        )}

        <div className="agent-panel__input-row">
          <textarea
            ref={inputRef}
            className="agent-panel__input"
            value={input}
            placeholder={isActiveSessionRunning
              ? '正在处理，回车把下一条排进队列'
              : isOtherSessionRunning
                ? '另一会话正在处理，请先停止或切回查看'
                : '发消息，输入 / 选 skill，或输入 @ 引用工作区文件'}
            rows={1}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handleComposerPaste}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleComposerDrop}
          />
          {running ? (
            <button
              type="button"
              className="agent-panel__send-btn is-stop"
              onClick={handleStop}
              title={isActiveSessionRunning ? '停止当前任务' : '停止运行中的会话'}
            >
              <Square size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="agent-panel__send-btn"
              onClick={handleSend}
              title="发送"
              disabled={(!input.trim() && attachedFiles.length === 0)
                || attachedFiles.some((item) => item.status === 'loading')}
            >
              <SendOutlined />
            </button>
          )}
        </div>

        <div className="agent-panel__composer-tools">
          <Dropdown
            trigger={['click']}
            placement="topLeft"
            overlayClassName="agent-panel__composer-dropdown"
            menu={{ items: modeMenuItems, onClick: handleModeChange }}
          >
            <button
              type="button"
              className="agent-panel__composer-plus"
              style={{ width: 'auto' }}
              title="切换会话模式"
              disabled={running}
            >
              {sessionMode === AGENT_SESSION_MODES.CHAT ? '💡 聊天' : '✏️ 写作'}
            </button>
          </Dropdown>
          <Dropdown
            trigger={['click']}
            placement="topLeft"
            overlayClassName="agent-panel__composer-dropdown"
            onOpenChange={setPlusMenuOpen}
            menu={{
              items: composerPlusMenuItems,
              onClick: handleComposerPlusClick,
            }}
          >
            <button
              type="button"
              className={`agent-panel__composer-plus${plusMenuOpen ? ' is-active' : ''}`}
              title="更多"
            >
              <PlusOutlined />
            </button>
          </Dropdown>
          <button
            type="button"
            className={`agent-panel__composer-at${showFilePicker ? ' is-active' : ''}`}
            title="引用工作区文件"
            onClick={handleInsertMention}
          >
            @
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={AGENT_ATTACHMENT_ACCEPT}
            multiple
            hidden
            onChange={handleAttachmentInput}
          />
          <button
            type="button"
            className="agent-panel__composer-at"
            title="添加附件"
            onClick={() => fileInputRef.current?.click()}
          >
            <Paperclip size={14} />
          </button>
          <AgentSourcePicker
            sources={aiSource.sources}
            activeSource={aiSource.activeSource}
            modelOptions={aiSource.modelOptions}
            onSelectSource={handleSourceChange}
            onSelectModel={aiSource.selectModel}
            onSelectEffort={aiSource.selectEffort}
            disabled={running}
          />
        </div>
      </div>
    </div>
  );
}
