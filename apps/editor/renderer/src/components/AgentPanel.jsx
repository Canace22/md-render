import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown, message } from 'antd';
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
import { Bot, Settings, Square, Wrench, User, Loader2, Plus, Trash2, MessagesSquare, FileText, X, MessageSquareQuote, Check, Copy } from 'lucide-react';
import { useEditorStore } from '../store/useEditorStore.js';
import {
  collectFiles,
  findNodeById,
} from '../store/workspaceUtils.js';
import AgentDocMeta from './AgentDocMeta.jsx';
import { runAgent } from '../core/agent/agentEngine.js';
import { parseAssistantChoiceCards } from '../core/agent/choiceCards.js';
import { fetchServerTools } from '../core/agent/toolRegistry.js';
import { buildInputWithAttachments } from '../core/agent/sessionUtils.js';
import {
  buildActiveDocMeta,
  buildPinnedContext,
  buildRecentDocPointers,
  buildTaskContextPacket,
  buildWorkspaceToolBrief,
  buildWorkspaceBrief,
} from '../core/agent/taskContext.js';
import { AI_ACTION_KEYS, buildQuickActionInstruction, getAiActionLabel } from '../utils/aiActions.js';
import { PLATFORM_VARIANT_KEYS, buildPlatformVariantInstruction, listPlatformVariants } from '../utils/platformVariant.js';
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
  hasBuiltinKey,
  fetchServerProviders,
  hasAiBridge,
  resolveAiServerBase,
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

const buildRefReason = (ref, keywords) => {
  const haystack = `${ref?.title ?? ''}\n${ref?.snippet ?? ''}`.toLowerCase();
  const hits = keywords.filter((kw) => haystack.includes(kw)).slice(0, 3);
  return hits.length ? `关键词：${hits.join('、')}` : '与当前稿件主题相关';
};

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

const CONTENT_ENTRY_PRESETS = Object.freeze({
  topic: {
    draftStatus: 'idea',
    fallbackName: '新选题',
  },
  draft: {
    draftStatus: 'drafting',
    fallbackName: '新稿件',
  },
  material: {
    draftStatus: 'collecting',
    fallbackName: '新资料单',
  },
  ready: {
    draftStatus: 'ready',
    fallbackName: '待发布稿',
  },
});

// 平台版本：同一正文改写成对应平台版（走 AI 助手，让 agent 读当前文档并写回）
const PLATFORM_VARIANTS = listPlatformVariants();
const PLATFORM_VARIANT_LABELS = Object.freeze(
  PLATFORM_VARIANTS.reduce((acc, item) => {
    acc[item.value] = item.label;
    return acc;
  }, {}),
);
const MAX_SLASH_SKILL_RESULTS = 8;
const SLASH_SKILL_PATTERN = /^\s*\/([^\s/]*)$/;
const TOPIC_SELECTION_SKILL_PROMPT = [
  '帮我整理选题。如果我没有明确想法，请先基于当前工作区、最近稿件、已发布文章或相关旧文，归纳我的内容资产和可延展方向；',
  '如果我提到互联网新闻、热点或最近趋势，请结合我提供的新闻/链接/剪藏材料整理，不要编造没有来源的新闻。',
  '请输出候选选题并简要比较：目标读者、读者问题、核心角度、适合平台、可展开性、风险。',
  '如果信息不足，最多问 2 个关键问题。',
  '当我确认某个选题，或请求直接创建时，请调用 create_content_entry 创建 kind=topic 的选题条目，正文使用结构化选题卡。',
].join('\n');
const TOPIC_SELECTION_SKILL = Object.freeze({
  id: 'topic-entry',
  type: 'insert',
  label: '选题',
  icon: ApartmentOutlined,
  tone: 'teal',
  category: '项目 skill',
  description: '从旧文、素材和趋势整理选题',
  aliases: ['topic', 'idea', '选题库', '旧文', '新闻', '热点', '趋势'],
  insertText: TOPIC_SELECTION_SKILL_PROMPT,
});

const WELCOME_SUGGESTIONS = Object.freeze([
  { type: 'quick', actionKey: AI_ACTION_KEYS.OUTLINE, label: '帮我写一个提纲' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.POLISH, label: '润色一下这段文字' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.SUMMARIZE, label: '帮我总结一下' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.KEY_POINTS, label: '提炼关键要点' },
  { type: 'quick', actionKey: AI_ACTION_KEYS.TITLE_SUGGESTIONS, label: '想几个标题' },
]);

const COMPOSER_SHORTCUTS = Object.freeze([
  {
    id: 'title',
    type: 'quick',
    actionKey: AI_ACTION_KEYS.TITLE_SUGGESTIONS,
    label: '标题建议',
    icon: FileTextOutlined,
    tone: 'cyan',
    description: '给当前内容想几个标题',
    aliases: ['标题', 'title'],
  },
  {
    id: 'wechat',
    type: 'platform',
    platformValue: PLATFORM_VARIANT_KEYS.WECHAT,
    label: '公众号版',
    icon: WechatOutlined,
    tone: 'green',
    description: '生成公众号版本',
    aliases: ['微信', '公众号', 'wechat'],
  },
  {
    id: 'xiaohongshu',
    type: 'platform',
    platformValue: PLATFORM_VARIANT_KEYS.XIAOHONGSHU,
    label: '小红书版',
    icon: CameraOutlined,
    tone: 'magenta',
    description: '生成小红书版本',
    aliases: ['小红书', 'xiaohongshu'],
  },
]);

const COMPOSER_PLUS_SHORTCUTS = Object.freeze([
  TOPIC_SELECTION_SKILL,
  {
    id: 'outline',
    type: 'quick',
    actionKey: AI_ACTION_KEYS.OUTLINE,
    label: '提纲',
    icon: ApartmentOutlined,
    tone: 'teal',
    description: '按当前内容整理结构提纲',
    aliases: ['大纲', 'outline'],
  },
  {
    id: 'expand',
    type: 'quick',
    actionKey: AI_ACTION_KEYS.EXPAND,
    label: '扩写',
    icon: ArrowsAltOutlined,
    tone: 'blue',
    description: '把当前内容扩充展开',
    aliases: ['展开', 'expand'],
  },
  {
    id: 'continue',
    type: 'quick',
    actionKey: AI_ACTION_KEYS.CONTINUE,
    label: '续写',
    icon: ArrowsAltOutlined,
    tone: 'blue',
    description: '基于全文继续往下写',
    aliases: ['继续往下写', 'continue'],
  },
  {
    id: 'polish',
    type: 'quick',
    actionKey: AI_ACTION_KEYS.POLISH,
    label: '润色',
    icon: HighlightOutlined,
    tone: 'rose',
    description: '优化表达和语气',
    aliases: ['改写', '优化', 'polish'],
  },
  {
    id: 'summarize',
    type: 'quick',
    actionKey: AI_ACTION_KEYS.SUMMARIZE,
    label: '压缩',
    icon: CompressOutlined,
    tone: 'amber',
    description: '压缩成更短版本',
    aliases: ['总结', '摘要', 'summarize'],
  },
]);

// 本地脚本工具（不走 AI，直接执行 server 上的脚本），收进 + 下拉菜单。
const COMPOSER_SCRIPT_TOOLS = Object.freeze([
  {
    id: 'pdf_to_docx',
    label: 'PDF→Word',
    icon: FilePdfOutlined,
    tone: 'red',
    toolName: 'pdf_to_docx',
    pickInput: { title: '选择 PDF 文件', extensions: ['pdf'] },
    pickOutput: {
      title: '保存为 Word 文档',
      defaultFromInput: (inputPath) => inputPath.replace(/\.pdf$/i, '.docx'),
      extensions: ['docx'],
    },
    description: '把 PDF 转成 Word 文档',
    aliases: ['pdf', 'word', 'docx'],
  },
  {
    id: 'video_to_audio',
    label: '视频→音频',
    icon: PlayCircleOutlined,
    tone: 'purple',
    toolName: 'video_to_audio',
    pickInput: { title: '选择视频文件', extensions: ['mp4', 'mov', 'mkv', 'avi', 'flv', 'webm', 'm4v'] },
    pickOutput: {
      title: '保存为 MP3',
      defaultFromInput: (inputPath) => inputPath.replace(/\.[^./]+$/, '') + '.mp3',
      extensions: ['mp3'],
    },
    description: '把视频提取成 MP3',
    aliases: ['视频', '音频', 'mp3'],
  },
]);

const EXTRA_PLATFORM_SLASH_SKILLS = Object.freeze([
  {
    id: 'zhihu',
    type: 'platform',
    platformValue: PLATFORM_VARIANT_KEYS.ZHIHU,
    label: '知乎版',
    icon: FileTextOutlined,
    tone: 'slate',
    description: '生成知乎版本',
    aliases: ['知乎', 'zhihu'],
  },
]);

const PROJECT_SLASH_SKILLS = Object.freeze([
  TOPIC_SELECTION_SKILL,
  {
    id: 'draft-entry',
    type: 'insert',
    label: '新稿件',
    icon: FileTextOutlined,
    tone: 'blue',
    category: '项目 skill',
    description: '新建一篇稿件',
    aliases: ['draft', '稿件', '文章'],
    insertText: '帮我新建一篇稿件：',
  },
  {
    id: 'material-entry',
    type: 'insert',
    label: '资料单',
    icon: FileTextOutlined,
    tone: 'amber',
    category: '项目 skill',
    description: '新建一个资料单',
    aliases: ['material', '资料', '素材'],
    insertText: '帮我新建一个资料单：',
  },
  {
    id: 'ready-entry',
    type: 'insert',
    label: '待发布稿',
    icon: FileTextOutlined,
    tone: 'green',
    category: '项目 skill',
    description: '新建一篇待发布稿',
    aliases: ['ready', '发布', '平台稿'],
    insertText: '帮我新建一篇待发布稿：',
  },
  {
    id: 'daily-task',
    type: 'insert',
    label: '今日任务',
    icon: Check,
    tone: 'cyan',
    category: '项目 skill',
    description: '往今日速记添加一条任务',
    aliases: ['daily', 'task', '待办'],
    insertText: '帮我在今日速记里加一条任务：',
  },
  {
    id: 'daily-note',
    type: 'insert',
    label: '今日笔记',
    icon: MessageSquareQuote,
    tone: 'slate',
    category: '项目 skill',
    description: '往今日速记添加一条笔记',
    aliases: ['daily', 'note', '速记'],
    insertText: '帮我在今日速记里记一条笔记：',
  },
  {
    id: 'todo-pool',
    type: 'insert',
    label: '待办池',
    icon: Check,
    tone: 'violet',
    category: '项目 skill',
    description: '往待办池添加一条待办',
    aliases: ['todo', 'pool', '稍后处理'],
    insertText: '帮我往待办池加一条待办：',
  },
  {
    id: 'canvas-flow',
    type: 'insert',
    label: '白板流程图',
    icon: ArrowsAltOutlined,
    tone: 'rose',
    category: '项目 skill',
    description: '切到白板并生成流程图',
    aliases: ['白板', '流程图', 'canvas', 'flow'],
    insertText: '请切到灵感白板，并画一个流程图：',
  },
  {
    id: 'canvas-cards',
    type: 'insert',
    label: '白板卡片',
    icon: PlusOutlined,
    tone: 'teal',
    category: '项目 skill',
    description: '往白板追加几张卡片',
    aliases: ['卡片', '点子', 'brainstorm'],
    insertText: '请切到灵感白板，并追加几张卡片：',
  },
  {
    id: 'related-docs',
    type: 'insert',
    label: '相关旧文',
    icon: FileText,
    tone: 'slate',
    category: '项目 skill',
    description: '召回和当前文档相关的旧文',
    aliases: ['参考', '召回', '旧文', 'related'],
    insertText: '帮我找和当前文档相关的旧文参考',
  },
  {
    id: 'workspace-brief',
    type: 'insert',
    label: '工作区概览',
    icon: Bot,
    tone: 'gray',
    category: '项目 skill',
    description: '先概览当前工作区再继续',
    aliases: ['workspace', 'overview', '概览'],
    insertText: '先帮我概览一下当前工作区，然后再继续：',
  },
  {
    id: 'new-folder',
    type: 'insert',
    label: '新建文件夹',
    icon: Plus,
    tone: 'purple',
    category: '项目 skill',
    description: '在当前位置新建文件夹',
    aliases: ['folder', '目录', '整理'],
    insertText: '帮我在当前位置新建一个文件夹，名字叫：',
  },
]);

const SLASH_SKILLS = Object.freeze([
  ...COMPOSER_SHORTCUTS.map((item) => ({
    ...item,
    category: item.type === 'platform' ? '平台版本' : '快捷动作',
    searchText: [item.label, item.description, ...(item.aliases ?? [])].join(' ').toLowerCase(),
  })),
  ...PROJECT_SLASH_SKILLS.map((item) => ({
    ...item,
    searchText: [item.label, item.description, ...(item.aliases ?? [])].join(' ').toLowerCase(),
  })),
  ...COMPOSER_PLUS_SHORTCUTS.filter((item) => item.id !== TOPIC_SELECTION_SKILL.id).map((item) => ({
    ...item,
    category: item.category ?? '快捷动作',
    searchText: [item.label, item.description, ...(item.aliases ?? [])].join(' ').toLowerCase(),
  })),
  ...EXTRA_PLATFORM_SLASH_SKILLS.map((item) => ({
    ...item,
    category: '平台版本',
    searchText: [item.label, item.description, ...(item.aliases ?? [])].join(' ').toLowerCase(),
  })),
  ...COMPOSER_SCRIPT_TOOLS.map((item) => ({
    ...item,
    type: 'script',
    category: '本地工具',
    searchText: [item.label, item.description, ...(item.aliases ?? [])].join(' ').toLowerCase(),
  })),
]);

const SURFACE_LABELS = Object.freeze({
  overview: '总览',
  daily: '今日速记',
  canvas: '灵感白板',
  'creation-board': '创作看板',
  publishing: '发布队列',
  search: '知识库搜索',
  graph: '关系图谱',
  sync: '同步中心',
  settings: '设置',
  paper: '文档工作区',
  folder: '文件夹',
});

const AGENT_PANEL_TABS = Object.freeze([
  { id: 'chat', label: '对话', icon: MessagesSquare },
  { id: 'context', label: '上下文', icon: MessageSquareQuote },
  { id: 'skills', label: '技能', icon: Wrench },
]);

const getSurfaceLabel = (surface, selectedNode) => {
  if (surface === 'paper') {
    return selectedNode?.type === 'folder' ? '文件夹' : '文档工作区';
  }
  return SURFACE_LABELS[surface] || '当前界面';
};

export default function AgentPanel({ onClose }) {
  const markdown = useEditorStore((s) => s.markdown);
  const workspace = useEditorStore((s) => s.workspace);
  const selectedId = useEditorStore((s) => s.selectedId);
  const surface = useEditorStore((s) => s.surface);
  const dailyWorkspace = useEditorStore((s) => s.dailyWorkspace);

  // AI 待确认写入：stage 暂存改动；diff 对比与应用/放弃由预览区的 DiffOverlay 负责
  const stageAgentWrite = useEditorStore((s) => s.stageAgentWrite);
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
  const [skillTabFilter, setSkillTabFilter] = useState('');

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
  const filteredSkills = useMemo(() => {
    const q = skillFilter.trim().toLowerCase();
    const list = q ? SLASH_SKILLS.filter((item) => item.searchText.includes(q)) : SLASH_SKILLS;
    return list.slice(0, MAX_SLASH_SKILL_RESULTS);
  }, [skillFilter]);
  const skillTabItems = useMemo(() => {
    const q = skillTabFilter.trim().toLowerCase();
    return q ? SLASH_SKILLS.filter((item) => item.searchText.includes(q)) : SLASH_SKILLS;
  }, [skillTabFilter]);
  const skillTabGroups = useMemo(() => {
    const groups = [];
    const groupMap = new Map();
    skillTabItems.forEach((item) => {
      const category = item.category ?? '其他';
      if (!groupMap.has(category)) {
        const group = { category, items: [] };
        groupMap.set(category, group);
        groups.push(group);
      }
      groupMap.get(category).items.push(item);
    });
    return groups;
  }, [skillTabItems]);
  const [showSessions, setShowSessions] = useState(false);
  const [showSettings, setShowSettings] = useState(() => !isAiConfigured());
  const providers = useMemo(() => listProviders(), []);
  const [providerId, setProviderId] = useState(() => getActiveProviderId());
  const [cfg, setCfg] = useState(() => readProviderConfig());
  const [serverProvidersReady, setServerProvidersReady] = useState(false);

  // 启动时从主进程获取内置 provider 列表
  useEffect(() => {
    fetchServerProviders().then(() => setServerProvidersReady(true));
  }, []);
  useEffect(() => {
    setLastContextPacket(null);
  }, [activeSessionId]);
  const isChatTab = activePanelTab === 'chat';
  const isWelcomeMode = isChatTab && messages.length === 0 && !showSettings && !showSessions;

  const abortRef = useRef(null);
  const inputRef = useRef(null);

  const isShortcutDisabled = useCallback((item) => {
    return running && (item.type === 'quick' || item.type === 'platform');
  }, [running]);

  const composerPlusMenuItems = useMemo(() => {
    const shortcuts = COMPOSER_PLUS_SHORTCUTS.map((item) => {
      const Icon = item.icon;
      return {
        key: item.id,
        disabled: isShortcutDisabled(item),
        label: item.label,
        icon: <Icon />,
      };
    });
    const scripts = COMPOSER_SCRIPT_TOOLS.map((tool) => {
      const Icon = tool.icon;
      return {
        key: tool.id,
        disabled: running,
        label: tool.label,
        icon: <Icon />,
      };
    });
    return [...shortcuts, { type: 'divider' }, ...scripts];
  }, [running, isShortcutDisabled]);

  // 注入给 agent 的宿主能力：读写当前文档 + 搜索工作区
  // 全局模式：无文档时 readActiveDoc 返回空，writeActiveDoc 为 no-op
  const host = useMemo(() => ({
    readActiveDoc: () => {
      const files = collectFiles(workspace);
      const active = files.find((f) => f.id === selectedId);
      return { title: active?.name ?? '', content: markdown ?? '' };
    },
    getActiveDocMeta: () => {
      const files = collectFiles(workspace);
      const active = files.find((f) => f.id === selectedId);
      return buildActiveDocMeta(active, markdown ?? '');
    },
    // 不直接覆盖：暂存成待确认改动，弹 diff 卡片让用户应用/放弃。
    // 无文档时返回提示。
    writeActiveDoc: async (content) => {
      if (!selectedId) return '当前没有打开的文档，无法写入。请先打开一个文档。';
      const applied = await stageAgentWrite({ oldText: markdown ?? '', newText: content });
      return applied ? '改动已应用到当前文档。' : '用户放弃了这次改动，文档未变更。';
    },
    createNewDoc: async ({ name, content, targetPlatforms, sourceMaterialIds } = {}) => {
      const result = await createGeneratedFile({
        name,
        content,
        contextNodeId: selectedId,
        meta: { targetPlatforms, sourceMaterialIds },
      });
      return result?.ok
        ? `已新建文档「${result.name}」，原文未改动。`
        : `新建文档失败：${result?.error || '未知错误'}`;
    },
    addDailyEntry: async ({ type = 'task', text = '', dateKey = '' } = {}) => {
      const cleanText = String(text ?? '').trim();
      if (!cleanText) return '添加失败：内容为空。';
      const targetDateKey = normalizeDateKey(
        dateKey || dailyWorkspace?.currentDate || getTodayDateKey(),
      );
      addDailyItem(targetDateKey, type, cleanText);
      setDailyCurrentDate(targetDateKey);
      setSurface('daily');
      return `已添加到 ${targetDateKey}：${type}「${cleanText}」。`;
    },
    addTodoEntry: async ({ text = '' } = {}) => {
      const cleanText = String(text ?? '').trim();
      if (!cleanText) return '添加失败：待办内容为空。';
      addTodoItem(cleanText);
      setSurface('daily');
      return `已加入待办池：${cleanText}。`;
    },
    getDailyOverview: async ({ dateKey = '' } = {}) => {
      return buildDailyOverview(dailyWorkspace, dateKey);
    },
    openCanvas: async () => {
      setSurface('canvas');
      return '已切换到灵感白板。';
    },
    openSurface: async ({ surface: nextSurface = '' } = {}) => {
      const cleanSurface = String(nextSurface ?? '').trim();
      if (!cleanSurface) return '切换失败：目标界面为空。';
      setSurface(cleanSurface);
      return `已切换到${getSurfaceLabel(cleanSurface, activeFile)}。`;
    },
    appendCanvasCards: async ({ cards = [] } = {}) => {
      const currentCanvasState = workspace?.canvasState ?? {};
      const currentExcalidraw = currentCanvasState?.excalidraw ?? {};
      const currentElements = Array.isArray(currentExcalidraw.elements)
        ? currentExcalidraw.elements
        : [];
      const startIndex = countRenderableCanvasCards(currentElements);
      const items = buildCanvasItemsFromAgentCards(cards, { startIndex });
      if (!items.length) return '添加失败：没有有效卡片。';

      const nextElements = [
        ...currentElements,
        ...buildExcalidrawElementsFromItems(items, { startIndex }),
      ];
      setWorkspaceCanvas(buildExcalidrawCanvasState({
        elements: nextElements,
        appState: currentExcalidraw.appState ?? {},
        files: currentExcalidraw.files ?? {},
      }));
      setSurface('canvas');
      return `已在灵感白板添加 ${items.length} 张卡片。`;
    },
    replaceCanvas: async ({ cards = [], edges = [] } = {}) => {
      const currentCanvasState = workspace?.canvasState ?? {};
      const currentExcalidraw = currentCanvasState?.excalidraw ?? {};
      const nextCanvasState = buildCanvasSceneFromAgentGraph({
        cards,
        edges,
        appState: currentExcalidraw.appState ?? {},
        files: currentExcalidraw.files ?? {},
      });
      const nextCount = Array.isArray(cards) ? cards.length : 0;
      if (!nextCount) return '绘制失败：没有有效卡片。';
      setWorkspaceCanvas(nextCanvasState);
      setSurface('canvas');
      return `已重建灵感白板，包含 ${nextCount} 张卡片。`;
    },
    clearCanvas: async () => {
      setWorkspaceCanvas({
        nodes: [],
        edges: [],
        viewport: null,
        excalidraw: null,
      });
      setSurface('canvas');
      return '已清空灵感白板。';
    },
    createContentEntry: async ({
      kind = 'topic',
      name = '',
      summary = '',
      content = '',
      targetPlatforms = [],
    } = {}) => {
      const preset = CONTENT_ENTRY_PRESETS[kind] || CONTENT_ENTRY_PRESETS.topic;
      const finalContent = String(content ?? '').trim()
        || (String(summary ?? '').trim() ? `# ${name || preset.fallbackName}\n\n${String(summary ?? '').trim()}\n` : '');
      const result = await createGeneratedFile({
        name: name || preset.fallbackName,
        content: finalContent,
        contextNodeId: selectedId,
        meta: {
          draftStatus: preset.draftStatus,
          summary,
          targetPlatforms,
        },
      });
      return result?.ok
        ? `已创建${kind === 'topic' ? '选题' : '内容条目'}「${result.name}」。`
        : `创建失败：${result?.error || '未知错误'}`;
    },
    readDocById: async (docId) => {
      const targetId = String(docId ?? '').trim();
      if (!targetId) return null;
      const file = collectFiles(workspace).find((item) => item?.id === targetId);
      if (!file) return null;
      return {
        ...buildActiveDocMeta(file, file.content ?? ''),
        content: file.content ?? '',
      };
    },
    openWorkspaceItem: async ({ id = '' } = {}) => {
      const targetId = String(id ?? '').trim();
      if (!targetId) return '打开失败：条目 id 为空。';
      const node = findNodeById(workspace, targetId);
      if (!node) return `打开失败：未找到 id 为「${targetId}」的条目。`;
      selectNode(targetId);
      return node.type === 'folder'
        ? `已打开文件夹「${node.name || '未命名'}」。`
        : `已打开文档「${node.name || '未命名'}」。`;
    },
    createFolder: async ({ name = '' } = {}) => {
      const ok = addFolder(selectedId);
      if (!ok) return '新建失败：当前位置不支持创建文件夹。';
      const nextState = useEditorStore.getState();
      const folder = findNodeById(nextState.workspace, nextState.selectedId);
      const desiredName = String(name ?? '').trim();
      if (desiredName && folder?.id) {
        const renamed = applyRename(folder.id, desiredName);
        if (renamed) {
          return `已创建文件夹「${desiredName}」。`;
        }
      }
      return `已创建文件夹「${folder?.name || '新建文件夹'}」。`;
    },
    listRecentDocs: async (limit = 4) => {
      return buildRecentDocPointers(workspace, selectedId, limit);
    },
    getWorkspaceBrief: async () => {
      return buildWorkspaceToolBrief(workspace, selectedId);
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
      return collectFiles(workspace)
        .filter((f) => `${f.name ?? ''}${f.content ?? ''}`.toLowerCase().includes(q))
        .map((f) => ({ title: f.name ?? '未命名', snippet: String(f.content ?? '').slice(0, 200), id: f.id }));
    },
    /**
     * 执行 server 端注册的脚本工具（pdf_to_docx / video_to_audio 等）。
     * 走 IPC → ai-proxy server → spawn 脚本。
     * 返回结构化结果给模型，模型可以从中解析出文件路径告诉用户。
     */
    execServerTool: async (toolName, args) => {
      if (!window.electronAPI?.ai?.execTool) {
        return JSON.stringify({ ok: false, error: 'server 工具通道不可用（需要 Electron 环境）' });
      }
      try {
        const res = await window.electronAPI.ai.execTool({ toolName, args });
        if (!res) return JSON.stringify({ ok: false, error: 'server 无响应' });
        // 把 stdout/stderr 合并成一段摘要，避免超长
        const summary = [];
        if (res.stdout) summary.push(String(res.stdout).slice(0, 2000));
        if (res.stderr) summary.push(`[stderr] ${String(res.stderr).slice(0, 500)}`);
        return JSON.stringify({
          ok: Boolean(res.ok),
          exitCode: res.exitCode,
          error: res.error || null,
          summary: summary.join('\n'),
        });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err?.message ?? String(err) });
      }
    },
  }), [
    workspace,
    selectedId,
    markdown,
    stageAgentWrite,
    createGeneratedFile,
    dailyWorkspace,
    addDailyItem,
    addTodoItem,
    setWorkspaceCanvas,
    setDailyCurrentDate,
    setSurface,
  ]);

  // 加载 server 端脚本工具的 schema（pdf_to_docx 等），传给 runAgent
  const [serverTools, setServerTools] = useState([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!hasAiBridge()) return;
      try {
        const tools = await fetchServerTools(async (path) => {
          const res = await fetch(`${resolveAiServerBase() || 'http://localhost:8788'}${path}`);
          return res.json();
        });
        if (!cancelled) setServerTools(tools);
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, []);

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
    const relatedRefs = activeDoc?.title
      ? await recallDocsForContext({
        doc: { title: activeDoc.title, content: markdown ?? '' },
        selectedId,
        searchDocs: host.searchDocs,
        limit: 3,
      })
      : [];

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
  }) => {
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
      const taskContext = await buildTurnContext({ selectionText, pinnedFiles });
      setLastContextPacket(taskContext);
      const { history } = await runAgent({
        userInput: promptText,
        history: activeSession?.history ?? [],
        config: readProviderConfig(),
        host,
        signal: controller.signal,
        serverTools,
        taskContext,
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
      appendAgentMessage(sessionId, { role: 'assistant', text: `出错了：${formatAgentError(error)}` });
    } finally {
      setRunning(false);
      abortRef.current = null;
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

  // 快捷动作：直接走 AI 助手，让 agent 读当前文档并处理。
  // 有引用选区时，改写类动作只处理这段（其余动作内部会忽略选区），触发后清空引用。
  const handleQuickAction = useCallback((actionKey) => {
    if (running) return;
    runTurn({
      promptText: buildQuickActionInstruction(actionKey, { selectionText: quotedSelection }),
      displayText: getAiActionLabel(actionKey),
      selectionText: quotedSelection,
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
    setActivePanelTab('chat');
    if (item.type === 'insert') {
      setInput(item.insertText ?? '');
      focusInput();
      return;
    }
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
  }, [focusInput, handleInsertMention, handlePlatformVariant, handleQuickAction]);

  const handleWelcomeSuggestion = useCallback((item) => {
    handleShortcutClick(item);
  }, [handleShortcutClick]);

  // 执行本地脚本工具：弹文件选择 → 调 ai-proxy server → 反馈结果。
  // 不需要 AI、不会进入对话流，结果用 antd message 提示。
  const handleScriptTool = useCallback(async (tool) => {
    if (!hasAiBridge()) {
      message.warning('本地脚本工具需要连接 ai-proxy server');
      return;
    }
    if (running) return; // AI 跑任务时不让叠加

    try {
      // 1) 选输入文件
      const inputPick = await window.electronAPI.pickFile(tool.pickInput);
      if (inputPick?.canceled) return;
      const inputPath = inputPick.filePath;

      // 2) 选输出路径
      const outputPick = await window.electronAPI.pickSavePath({
        title: tool.pickOutput.title,
        defaultName: tool.pickOutput.defaultFromInput(inputPath),
        extensions: tool.pickOutput.extensions,
      });
      if (outputPick?.canceled) return;
      const outputPath = outputPick.filePath;

      // 3) 执行
      const hide = message.loading(`正在执行 ${tool.label}...`, 0);
      const res = await window.electronAPI.ai.execTool({
        toolName: tool.toolName,
        args: { input: inputPath, output: outputPath },
      });
      hide();

      if (res?.ok) {
        message.success(`${tool.label} 完成：${outputPath}`, 5);
      } else {
        const errMsg = res?.error || `退出码 ${res?.exitCode}`;
        message.error(`${tool.label} 失败：${errMsg}`, 8);
      }
    } catch (err) {
      message.error(`${tool.label} 出错：${err?.message ?? String(err)}`);
    }
  }, [running]);

  const handlePickSkill = useCallback((item) => {
    closeSkillPicker();
    setActivePanelTab('chat');
    if (item.type === 'insert') {
      setInput(item.insertText ?? '');
      focusInput();
      return;
    }

    setInput('');
    focusInput();

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
    if (item.type === 'script') {
      handleScriptTool(item);
    }
  }, [closeSkillPicker, focusInput, handlePlatformVariant, handleQuickAction, handleScriptTool]);

  const handlePanelTabChange = useCallback((tabId) => {
    setActivePanelTab(tabId);
    setShowFilePicker(false);
    setShowSkillPicker(false);
  }, []);

  const handleComposerPlusClick = useCallback(({ key }) => {
    const shortcut = COMPOSER_PLUS_SHORTCUTS.find((item) => item.id === key);
    if (shortcut) {
      handleShortcutClick(shortcut);
      return;
    }
    const tool = COMPOSER_SCRIPT_TOOLS.find((t) => t.id === key);
    if (tool) handleScriptTool(tool);
  }, [handleShortcutClick, handleScriptTool]);

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
    setCfg(readProviderConfig(providerId));
    setShowSettings(false);
  }, [providerId, cfg]);

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
          <button className="agent-panel__save-btn" onClick={handleSaveSettings}>保存</button>
        </div>
      )}

      {isChatTab && (
        <div
          className={`agent-panel__messages${isWelcomeMode ? ' is-welcome' : ''}`}
          role="tabpanel"
          aria-label="对话"
        >
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
            const parsed = m.role === 'assistant'
              ? parseAssistantChoiceCards(m.text)
              : { displayText: m.text, choices: [] };
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
                  {parsed.displayText}
                  {parsed.choices.length > 0 && (
                    <div className="agent-panel__choice-cards">
                      {parsed.choices.map((choice) => (
                        <button
                          key={`${choice.label}-${choice.title}`}
                          type="button"
                          className="agent-panel__choice-card"
                          disabled={running}
                          onClick={() => handleChoiceCardClick(choice)}
                        >
                          <span className="agent-panel__choice-label">{choice.label}</span>
                          <span className="agent-panel__choice-main">
                            {choice.title && <span className="agent-panel__choice-title">{choice.title}</span>}
                            {choice.description && (
                              <span className="agent-panel__choice-desc">{choice.description}</span>
                            )}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {m.role === 'assistant' && parsed.displayText && (
                    <button
                      type="button"
                      className={`agent-panel__copy-btn${copiedIndex === i ? ' is-copied' : ''}`}
                      title={copiedIndex === i ? '已复制' : '复制'}
                      onClick={() => handleCopy(i, parsed.displayText)}
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
        <div className="agent-panel__tab-panel agent-panel__tab-panel--skills" role="tabpanel" aria-label="技能">
          <div className="agent-panel__skill-tab-head">
            <input
              className="agent-panel__skill-tab-search"
              value={skillTabFilter}
              placeholder="搜索 skill、平台版本或本地工具"
              onChange={(e) => setSkillTabFilter(e.target.value)}
            />
          </div>
          {skillTabGroups.length === 0 ? (
            <div className="agent-panel__empty">没有匹配的 skill。</div>
          ) : (
            skillTabGroups.map((group) => (
              <section key={group.category} className="agent-panel__skill-group">
                <div className="agent-panel__skill-group-title">{group.category}</div>
                <div className="agent-panel__skill-grid">
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className="agent-panel__skill-card"
                        disabled={isShortcutDisabled(item)}
                        onClick={() => handlePickSkill(item)}
                      >
                        <span className={`agent-panel__skill-option-icon agent-panel__tool-btn--${item.tone}`}>
                          <Icon />
                        </span>
                        <span className="agent-panel__skill-option-main">
                          <span className="agent-panel__skill-option-label">{item.label}</span>
                          <span className="agent-panel__skill-option-desc">{item.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
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
            placeholder="发消息，输入 / 选 skill，或输入 @ 引用工作区文件"
            rows={1}
            onInput={(e) => {
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
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
