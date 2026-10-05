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
import { Activity, Bot, PackageCheck, Settings, ShieldCheck, Square, Wrench, Plus, Trash2, MessagesSquare, FileText, X, MessageSquareQuote, Check } from 'lucide-react';
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
import { runAgent } from '../core/agent/agentEngine.js';
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
import { buildInputWithAttachments } from '../core/agent/sessionUtils.js';
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
const SLASH_SKILL_PATTERN = /^\s*\/([^\s/]*)$/;

const AGENT_PANEL_TABS = Object.freeze([
  { id: 'chat', label: '对话', icon: MessagesSquare },
  { id: 'context', label: '上下文', icon: MessageSquareQuote },
  { id: 'skills', label: '技能', icon: Wrench },
]);

export default function AgentPanel({ onClose }) {
  const markdown = useEditorStore((s) => s.markdown);
  const workspace = useEditorStore((s) => s.workspace);
  const selectedId = useEditorStore((s) => s.selectedId);
  const surface = useEditorStore((s) => s.surface);
  const dailyWorkspace = useEditorStore((s) => s.dailyWorkspace);

  // AI 待确认写入：stage 暂存改动；diff 对比与应用/放弃由预览区的 DiffOverlay 负责
  // 直接写当前文档（插入引用用，无需 diff 确认）
  const updateSelectedFileContent = useEditorStore((s) => s.updateSelectedFileContent);
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
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [plusMenuOpen, setPlusMenuOpen] = useState(false);
  const [fileFilter, setFileFilter] = useState('');
  const [skillFilter, setSkillFilter] = useState('');
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [lastContextPacket, setLastContextPacket] = useState(null);
  const [activePanelTab, setActivePanelTab] = useState('chat');
  const [assistantActivity, setAssistantActivity] = useState(null);
  const [runningSessionId, setRunningSessionId] = useState(null);

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
  const welcomeItems = useMemo(() => pickSkillItems(skillItems, 'welcome'), [skillItems]);
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
  const [showSettings, setShowSettings] = useState(() => !isAiConfigured());
  const providers = useMemo(() => listProviders(), []);
  const [providerId, setProviderId] = useState(() => getActiveProviderId());
  const [cfg, setCfg] = useState(() => readProviderConfig());
  const [aiServerBase, setAiServerBase] = useState(() => readAiServerBase());
  const [knowledgeSources, setKnowledgeSources] = useState(() => loadKnowledgeSources());
  const [serverProvidersReady, setServerProvidersReady] = useState(false);
  const abortRef = useRef(null);
  const activeRunIdRef = useRef(0);
  const runLockRef = useRef(false);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
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
    setLastContextPacket(null);
    shouldFollowMessagesRef.current = true;
    forceScrollToBottomRef.current = true;
  }, [activeSessionId]);
  const isChatTab = activePanelTab === 'chat';
  const isWelcomeMode = isChatTab && messages.length === 0 && !showSettings && !showSessions;
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
      updateAgentMessages(runningSessionId, (items) => finishRunningTools(items, 'interrupted'));
    }
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
    setAttachedFiles((prev) => prev.filter((f) => f.id !== fileId));
  }, []);

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
  } = {}) => {
    const inDocumentSurface = surface === 'paper';
    const activeDoc = inDocumentSurface ? host.getActiveDocMeta?.() : null;
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
  }) => {
    if (running || runLockRef.current) return;
    if (!isAiConfigured()) {
      setShowSettings(true);
      return;
    }
    const sessionId = activeSessionId;
    if (!sessionId) return;

    runLockRef.current = true;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const ownsRun = () => activeRunIdRef.current === runId;
    forceScrollToBottomRef.current = true;
    shouldFollowMessagesRef.current = true;
    appendAgentMessage(sessionId, { role: 'user', text: displayText, files: fileNames });
    setRunning(true);
    setAssistantActivity('thinking');
    setRunningSessionId(sessionId);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const taskContext = await buildTurnContext({ selectionText, pinnedFiles });
      if (!ownsRun() || controller.signal.aborted) return;
      setLastContextPacket(taskContext);
      const { finalText, history } = await runAgent({
        userInput: promptText,
        history: activeSession?.history ?? [],
        config: readProviderConfig(),
        host,
        signal: controller.signal,
        serverTools,
        taskContext,
        allowedTools,
        onEvent: (ev) => {
          // 工具已经执行了就要留痕，不管这一轮后来是否被取消或切走
          if (ev.type === 'tool_done') recordToolActivity({ who: 'app', name: ev.name, args: ev.args, result: ev.result });
          if (!ownsRun() || controller.signal.aborted) return;
          if (ev.type === 'tool_start') {
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
        },
      });
      if (!ownsRun() || controller.signal.aborted) return;
      setAgentHistory(sessionId, history);
      if (finalText) {
        setAssistantActivity(null);
        appendAgentMessage(sessionId, { role: 'assistant', text: finalText });
      }
    } catch (error) {
      if (!ownsRun()) return;
      if (String(error?.message ?? '') !== '已取消') {
        updateAgentMessages(sessionId, (items) => finishRunningTools(items, 'error'));
        appendAgentMessage(sessionId, { role: 'assistant', text: `出错了：${formatAgentError(error)}` });
      }
    } finally {
      if (ownsRun()) {
        runLockRef.current = false;
        setAssistantActivity(null);
        setRunningSessionId(null);
        setRunning(false);
        if (abortRef.current === controller) abortRef.current = null;
      }
    }
  }, [running, activeSessionId, activeSession, host, appendAgentMessage, updateAgentMessages, setAgentHistory, serverTools, buildTurnContext]);

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
    setActivePanelTab('chat');
    await runTurn({
      promptText,
      displayText: text,
      fileNames,
      selectionText: quotedSelection,
      pinnedFiles: attachedFiles,
    });
  }, [input, running, attachedFiles, quotedSelection, clearAiQuotedSelection, runTurn]);

  const handleChoiceCardClick = useCallback((choice) => {
    if (running) return;
    const label = [choice.label, choice.title].filter(Boolean).join(' ');
    runTurn({
      promptText: choice.prompt,
      displayText: label || choice.prompt,
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

  const handlePickSkill = useCallback((item) => {
    closeSkillPicker();
    setActivePanelTab('chat');
    runSkill(item.skillId);
  }, [closeSkillPicker, runSkill]);

  const handlePanelTabChange = useCallback((tabId) => {
    setActivePanelTab(tabId);
    setShowFilePicker(false);
    setShowSkillPicker(false);
  }, []);

  const handleComposerPlusClick = useCallback(({ key }) => {
    const shortcut = composerItems.find((item) => item.id === key);
    if (shortcut) handleShortcutClick(shortcut);
  }, [composerItems, handleShortcutClick]);

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
    if (!isChatTab) return;
    const el = messagesRef.current;
    if (!el) return;
    const forceScroll = forceScrollToBottomRef.current;
    forceScrollToBottomRef.current = false;
    if (!forceScroll && !shouldFollowMessagesRef.current) return;
    const frame = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [messages, assistantActivity, isChatTab]);

  return (
    <div className="agent-panel">
      <div className="agent-panel__header">
        <span className="agent-panel__title"><Bot size={16} /> MD Render Agent</span>
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
          {onClose && (
            <button className="agent-panel__icon-btn" onClick={onClose} title="关闭">
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <div className="agent-panel__tabs" role="tablist" aria-label="AI 助手面板">
        {AGENT_PANEL_TABS.map((tab) => {
          const Icon = tab.icon;
          const selected = activePanelTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={`agent-panel__tab${selected ? ' is-active' : ''}`}
              onClick={() => handlePanelTabChange(tab.id)}
            >
              <Icon size={14} />
              <span>{tab.label}</span>
            </button>
          );
        })}
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
          {hasBuiltinKey(providerId) ? (
            <div className="agent-panel__builtin-hint">
              
            </div>
          ) : (
            <>
              <label>Base URL
                <input value={cfg.baseURL} placeholder="https://xxx/v1"
                  onChange={(e) => setCfg({ ...cfg, baseURL: e.target.value })} />
              </label>
            </>
          )}
          <label>模型
            <input value={cfg.model} placeholder="默认已填，可改"
              onChange={(e) => setCfg({ ...cfg, model: e.target.value })} />
          </label>
          <label>AI 代理地址
            <input value={aiServerBase} placeholder="http://你的服务器:8788"
              onChange={(e) => setAiServerBase(e.target.value)} />
          </label>
          <AgentKnowledgeSources
            sources={knowledgeSources}
            onChange={setKnowledgeSources}
          />
          <button className="agent-panel__save-btn" onClick={handleSaveSettings}>保存</button>
        </div>
      )}

      {isChatTab && (
        <div
          className={`agent-panel__messages${isWelcomeMode ? ' is-welcome' : ''}`}
          ref={messagesRef}
          role="tabpanel"
          aria-label="对话"
          onScroll={handleMessagesScroll}
        >
          {isWelcomeMode && (
            <div className="agent-panel__welcome">
              <h2 className="agent-panel__welcome-title">我会先理解你的工作，再动手</h2>
              <p className="agent-panel__welcome-subtitle">我懂当前稿件、工作区和应用状态；改文有 diff 确认，交付物默认保留原稿。</p>
              <div className="agent-panel__expert-badges">
                <span><ShieldCheck size={13} /> 可审计操作</span>
                <span><Activity size={13} /> 可体检运行状态</span>
                <span><PackageCheck size={13} /> 产出物留来源</span>
              </div>
              <div className="agent-panel__welcome-grid">
                {welcomeItems.map((item) => (
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
            <div className="agent-panel__empty">问我点什么，比如「帮我把当前文档压缩到三段」。</div>
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
              onOpenArtifact={(fileId) => host.openWorkspaceItem({ id: fileId })}
            />
          )}
        </div>
      )}

      {activePanelTab === 'context' && (
        <div className="agent-panel__tab-panel agent-panel__tab-panel--context" role="tabpanel" aria-label="上下文">
          <AgentDocMeta
            document={activeFile}
            contextPacket={lastContextPacket}
            onRecall={handleRecall}
            onInsertReference={handleInsertReference}
          />
        </div>
      )}

      {activePanelTab === 'skills' && (
        <AgentSkillsTab
          items={skillTabItems}
          skills={registrySkills}
          warnings={skillWarnings}
          isDisabled={isShortcutDisabled}
          onRun={handlePickSkill}
        />
      )}

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
            placeholder={isActiveSessionRunning
              ? '正在处理，可继续编辑下一条消息'
              : isOtherSessionRunning
                ? '另一会话正在处理，请先停止或切回查看'
                : '发消息，输入 / 选 skill，或输入 @ 引用工作区文件'}
            rows={1}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
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
            <button type="button" className="agent-panel__send-btn" onClick={handleSend} title="发送" disabled={!input.trim()}>
              <SendOutlined />
            </button>
          )}
        </div>

        <div className="agent-panel__composer-tools">
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
        </div>
      </div>
    </div>
  );
}
