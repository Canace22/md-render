import { getPublishingPlatformLabel } from './publishingPlatforms.js';

const DEFAULT_MAX_CONTEXT_CHARS = 2200;
const DEFAULT_SUMMARY_LENGTH = 240;
const DEFAULT_TITLE_SUGGESTION_COUNT = 5;

export const AI_ACTION_KEYS = Object.freeze({
  SUMMARIZE: 'summarize',
  EXPAND: 'expand',
  POLISH: 'polish',
  TITLE_SUGGESTIONS: 'title_suggestions',
  TONE: 'tone',
  KEY_POINTS: 'key_points',
  SUBHEADINGS: 'subheadings',
  CONTINUE: 'continue',
  OUTLINE: 'outline',
});

export const AI_ACTION_OPTIONS = Object.freeze([
  { key: AI_ACTION_KEYS.SUMMARIZE, value: AI_ACTION_KEYS.SUMMARIZE, label: '压缩', promptLabel: '压缩这段内容' },
  { key: AI_ACTION_KEYS.EXPAND, value: AI_ACTION_KEYS.EXPAND, label: '扩写', promptLabel: '扩写这段内容' },
  { key: AI_ACTION_KEYS.POLISH, value: AI_ACTION_KEYS.POLISH, label: '润色', promptLabel: '润色这段内容' },
  { key: AI_ACTION_KEYS.TITLE_SUGGESTIONS, value: AI_ACTION_KEYS.TITLE_SUGGESTIONS, label: '标题建议', promptLabel: '给这篇内容提标题' },
  { key: AI_ACTION_KEYS.TONE, value: AI_ACTION_KEYS.TONE, label: '改语气', promptLabel: '调整这段内容的语气' },
  { key: AI_ACTION_KEYS.KEY_POINTS, value: AI_ACTION_KEYS.KEY_POINTS, label: '提炼要点', promptLabel: '提炼这段内容的要点' },
  { key: AI_ACTION_KEYS.SUBHEADINGS, value: AI_ACTION_KEYS.SUBHEADINGS, label: '小标题', promptLabel: '给这段内容拟小标题' },
  { key: AI_ACTION_KEYS.CONTINUE, value: AI_ACTION_KEYS.CONTINUE, label: '续写', promptLabel: '基于全文续写下一段' },
  { key: AI_ACTION_KEYS.OUTLINE, value: AI_ACTION_KEYS.OUTLINE, label: '提纲', promptLabel: '基于标题或主题出提纲' },
]);

export const AI_ACTIONS = AI_ACTION_OPTIONS;

const ACTION_ALIASES = Object.freeze({
  compress: AI_ACTION_KEYS.SUMMARIZE,
  summarize: AI_ACTION_KEYS.SUMMARIZE,
  summary: AI_ACTION_KEYS.SUMMARIZE,
  '压缩': AI_ACTION_KEYS.SUMMARIZE,
  expand: AI_ACTION_KEYS.EXPAND,
  expansion: AI_ACTION_KEYS.EXPAND,
  '扩写': AI_ACTION_KEYS.EXPAND,
  polish: AI_ACTION_KEYS.POLISH,
  refine: AI_ACTION_KEYS.POLISH,
  '润色': AI_ACTION_KEYS.POLISH,
  title: AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  titles: AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  title_suggestions: AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  '标题': AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  '标题建议': AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  tone: AI_ACTION_KEYS.TONE,
  '改语气': AI_ACTION_KEYS.TONE,
  '语气': AI_ACTION_KEYS.TONE,
  key_points: AI_ACTION_KEYS.KEY_POINTS,
  keypoints: AI_ACTION_KEYS.KEY_POINTS,
  '提炼要点': AI_ACTION_KEYS.KEY_POINTS,
  '要点': AI_ACTION_KEYS.KEY_POINTS,
  subheadings: AI_ACTION_KEYS.SUBHEADINGS,
  subheading: AI_ACTION_KEYS.SUBHEADINGS,
  '小标题': AI_ACTION_KEYS.SUBHEADINGS,
  continue: AI_ACTION_KEYS.CONTINUE,
  continuation: AI_ACTION_KEYS.CONTINUE,
  '续写': AI_ACTION_KEYS.CONTINUE,
  outline: AI_ACTION_KEYS.OUTLINE,
  outlines: AI_ACTION_KEYS.OUTLINE,
  '提纲': AI_ACTION_KEYS.OUTLINE,
  '大纲': AI_ACTION_KEYS.OUTLINE,
});

const ACTION_META_MAP = new Map(AI_ACTION_OPTIONS.map((item) => [item.key, item]));

const STATUS_LABEL_MAP = Object.freeze({
  idea: '选题中',
  collecting: '收集中',
  draft: '草稿',
  drafting: '写作中',
  revising: '修改中',
  ready: '待发布',
  published: '已发布',
});

const ACTION_PROMPT_CONFIG = Object.freeze({
  [AI_ACTION_KEYS.SUMMARIZE]: {
    task: '请压缩内容，保留核心信息、关键论点和必要事实。',
    outputRules: [
      '直接输出压缩后的中文正文，不要解释你的做法。',
      '优先删掉重复表达、空泛铺垫和冗余转折。',
      '尽量保留原文语气、结构和观点顺序。',
      '如果原文信息不足，不要擅自补充事实。',
    ],
  },
  [AI_ACTION_KEYS.EXPAND]: {
    task: '请在不跑题的前提下扩写内容，让信息更完整、表达更饱满。',
    outputRules: [
      '直接输出扩写后的中文正文，不要解释你的做法。',
      '优先补充论证、细节、例子、过渡句和读者收益。',
      '尽量延续原文语气、叙述视角和段落节奏。',
      '如果上下文不够，不要乱编具体事实，用稳妥方式补足。',
    ],
  },
  [AI_ACTION_KEYS.POLISH]: {
    task: '请润色内容，提升表达流畅度和可读性，不改变原意和信息量。',
    outputRules: [
      '直接输出润色后的中文正文，不要解释你的做法。',
      '优先修顺病句、错别字、标点和生硬的衔接。',
      '保留原文观点、结构、语气和段落顺序，不增删事实。',
      '不要过度堆砌辞藻，以清晰自然为准。',
    ],
  },
  [AI_ACTION_KEYS.TITLE_SUGGESTIONS]: {
    task: '请基于内容给出一组中文标题建议。',
    outputRules: [
      `输出 ${DEFAULT_TITLE_SUGGESTION_COUNT} 个标题候选，每个标题单独一行。`,
      '标题要具体、可用，避免空泛鸡汤或强行标题党。',
      '优先体现主题、角度、读者收益或冲突点。',
      '不要附加分析说明。',
    ],
  },
  [AI_ACTION_KEYS.TONE]: {
    task: '请调整内容的语气，在更口语和更专业之间，按上下文选更合适的一种。',
    outputRules: [
      '直接输出调整语气后的中文正文，不要解释你的做法。',
      '只改语气和措辞，不增删事实、不改变核心信息和结构。',
      '保持段落顺序和篇幅大体一致。',
    ],
  },
  [AI_ACTION_KEYS.KEY_POINTS]: {
    task: '请提炼内容的核心要点。',
    outputRules: [
      '用要点列表输出，每条单独一行、以「- 」开头。',
      '每条简明扼要，覆盖主要论点和关键信息。',
      '不要附加分析说明，只给要点。',
    ],
  },
  [AI_ACTION_KEYS.SUBHEADINGS]: {
    task: '请为内容的各段落拟小标题，帮助梳理结构。',
    outputRules: [
      '为正文中的主要段落各给一个小标题，每条单独一行。',
      '小标题要概括该段主旨，简短具体。',
      '只给小标题建议，不要改写或重排正文。',
    ],
  },
  [AI_ACTION_KEYS.CONTINUE]: {
    task: '请基于全文在末尾续写下一段，承接上文、延续语气与脉络。',
    outputRules: [
      '只输出新续写的一段中文正文，不要重复已有内容。',
      '延续原文语气、视角和叙述节奏，不要跑题。',
      '上下文不够时用稳妥方式承接，不要乱编具体事实。',
    ],
  },
  [AI_ACTION_KEYS.OUTLINE]: {
    task: '请基于标题或主题给出可直接动笔的写作提纲，并指出结构上的问题。',
    outputRules: [
      '给出 3 种不同切入角度的提纲，每种用一个小标题标明角度，下面用分级列表列出章节顺序。',
      '提纲要具体到每节大致写什么，避免空泛的「引言/正文/结尾」。',
      '若已有正文，额外提醒：缺失的关键论点、以及内容重复或啰嗦之处。',
      '只输出提纲与提醒，不要改写正文，不要附加无关说明。',
    ],
  },
});

const normalizeWhitespace = (value) => {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const normalizeMultilineText = (value) => {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\u00a0/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .trim();
};

const truncateText = (value, maxLength) => {
  const text = normalizeWhitespace(value);
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
};

const sanitizeStringList = (values) => {
  const list = Array.isArray(values) ? values : [values];
  return Array.from(new Set(list.map((item) => normalizeWhitespace(item)).filter(Boolean)));
};

export const normalizeAiActionKey = (actionKey) => {
  const normalized = normalizeWhitespace(actionKey).toLowerCase();
  return ACTION_ALIASES[normalized] || '';
};

const getActionMeta = (actionKey) => {
  const normalized = normalizeAiActionKey(actionKey);
  return ACTION_META_MAP.get(normalized) || ACTION_META_MAP.get(AI_ACTION_KEYS.SUMMARIZE);
};

const getActionConfig = (actionKey) => {
  const normalized = normalizeAiActionKey(actionKey);
  return ACTION_PROMPT_CONFIG[normalized] || ACTION_PROMPT_CONFIG[AI_ACTION_KEYS.SUMMARIZE];
};

const getDocumentTitle = (document, fallbackTitle = '') => {
  return normalizeWhitespace(
    document?.title || document?.name || document?.filename || fallbackTitle,
  );
};

const getDocumentSummary = (document, fallbackSummary = '') => {
  return truncateText(
    document?.summary || document?.description || document?.excerpt || fallbackSummary,
    DEFAULT_SUMMARY_LENGTH,
  );
};

const getDocumentContent = (document, fallbackContent = '') => {
  return normalizeMultilineText(
    document?.content || document?.body || document?.markdown || fallbackContent,
  );
};

const getDocumentStatus = (document) => {
  const status = normalizeWhitespace(
    document?.draftStatus
      || document?.creationStatus
      || document?.manuscriptStatus
      || document?.publishStatus
      || document?.status
      || document?.topicStatus,
  ).toLowerCase();

  return status || '';
};

const getStatusLabel = (status) => {
  return STATUS_LABEL_MAP[status] || status || '未设置';
};

const getDocumentPlatforms = (document) => {
  return sanitizeStringList(
    document?.targetPlatforms || document?.platforms || document?.publishPlatforms || [],
  );
};

const getPlatformLabels = (platforms, platformOptions) => {
  return platforms.map((platform) => getPublishingPlatformLabel(platform, platformOptions) || platform);
};

const getDocumentTags = (document) => {
  return sanitizeStringList(document?.tags || document?.aliases || []);
};

const getSourceMaterialCount = (document) => {
  const value = document?.sourceMaterialIds || document?.sourceMaterials || [];
  return Array.isArray(value) ? value.length : 0;
};

const getRelatedDocCount = (document) => {
  const value = document?.relatedIds || document?.relatedDocs || [];
  return Array.isArray(value) ? value.length : 0;
};

const buildMetadataLines = (document) => {
  if (!document || typeof document !== 'object') return [];

  const status = getDocumentStatus(document);
  const platforms = getPlatformLabels(
    getDocumentPlatforms(document),
    document?.platformOptions,
  );
  const tags = getDocumentTags(document);
  const scheduledPublishAt = normalizeWhitespace(document?.scheduledPublishAt || document?.publishAt || '');
  const sourceMaterialCount = getSourceMaterialCount(document);
  const relatedDocCount = getRelatedDocCount(document);

  return [
    status ? `稿件状态：${getStatusLabel(status)}` : '',
    platforms.length ? `目标平台：${platforms.join('、')}` : '',
    tags.length ? `标签：${tags.join('、')}` : '',
    scheduledPublishAt ? `发布时间占位：${scheduledPublishAt}` : '',
    sourceMaterialCount ? `来源素材数：${sourceMaterialCount}` : '',
    relatedDocCount ? `关联文档数：${relatedDocCount}` : '',
  ].filter(Boolean);
};

export const getAiAction = (actionKey) => {
  return getActionMeta(actionKey);
};

export const getAiActionLabel = (actionKey) => {
  return getActionMeta(actionKey).label || 'AI 动作';
};

export const getAiActionPromptLabel = (actionKey) => {
  return getActionMeta(actionKey).promptLabel || '处理这段内容';
};

// 写回方式分类：覆盖整篇 / 末尾追加 / 不写回（只在对话里输出）。
const WRITE_MODES = Object.freeze({
  OVERWRITE: 'overwrite',
  APPEND: 'append',
  NONE: 'none',
});

// 每个动作对应的写回方式；未列出的默认覆盖（改写类）。
const ACTION_WRITE_MODE = Object.freeze({
  [AI_ACTION_KEYS.TITLE_SUGGESTIONS]: WRITE_MODES.NONE,
  [AI_ACTION_KEYS.KEY_POINTS]: WRITE_MODES.NONE,
  [AI_ACTION_KEYS.SUBHEADINGS]: WRITE_MODES.NONE,
  [AI_ACTION_KEYS.OUTLINE]: WRITE_MODES.NONE,
  [AI_ACTION_KEYS.CONTINUE]: WRITE_MODES.APPEND,
});

const getActionWriteMode = (normalized) =>
  ACTION_WRITE_MODE[normalized] || WRITE_MODES.OVERWRITE;

// 覆盖类动作的写回引导：有选区时只替换那段，否则整篇覆盖。
const buildOverwriteWriteBack = (selectionText) => {
  if (selectionText) {
    return [
      '只改写下面这段选中文本，不要动文档其它部分。',
      `选中原文：\n${selectionText}`,
      '处理完后，调用 read_active_doc 拿到整篇，把这段原文 replace 成新结果，'
        + '再调用 write_active_doc 写回整篇（会弹 diff 让用户确认）。',
    ].join('\n\n');
  }
  return '处理完成后，调用 write_active_doc 把结果写回当前文档（会弹 diff 让用户确认）。';
};

const WRITE_BACK_BUILDERS = Object.freeze({
  [WRITE_MODES.OVERWRITE]: buildOverwriteWriteBack,
  [WRITE_MODES.APPEND]: () =>
    '调用 read_active_doc 拿到整篇，把续写内容追加到原文末尾，'
      + '再调用 write_active_doc 写回整篇（会弹 diff 让用户确认）。',
  [WRITE_MODES.NONE]: () => '',
});

/**
 * 给 AI 助手用的「快捷指令」：一句任务 + 几条输出要求 + 写回引导。
 * 不内嵌整篇正文——交给 agent 通过「读取当前文档」工具自行获取，避免重复拼正文。
 * @param {string} actionKey 动作 key/别名
 * @param {object} [options]
 * @param {string} [options.selectionText] 选区原文，仅对「覆盖类」动作生效（只改这段）
 */
export const buildQuickActionInstruction = (actionKey, options = {}) => {
  const normalized = normalizeAiActionKey(actionKey);
  const { task, outputRules } = getActionConfig(normalized);
  const rules = (outputRules || []).map((rule) => `- ${rule}`).join('\n');
  const mode = getActionWriteMode(normalized);
  const selectionText = mode === WRITE_MODES.OVERWRITE
    ? normalizeMultilineText(options.selectionText)
    : '';
  const intro = selectionText
    ? '请先理解上下文，然后只处理下面这段选中文本。'
    : '请先读取当前文档，然后处理整篇正文。';
  const writeBackLine = WRITE_BACK_BUILDERS[mode](selectionText);
  return [
    intro,
    task,
    rules ? `输出要求：\n${rules}` : '',
    writeBackLine,
  ].filter(Boolean).join('\n\n');
};

export const buildAiContextSummary = ({
  actionKey = '',
  selectedText = '',
  selectionText = '',
  document = null,
  documentTitle = '',
  documentSummary = '',
  documentContent = '',
  maxContextChars = DEFAULT_MAX_CONTEXT_CHARS,
} = {}) => {
  const pickedSelection = normalizeMultilineText(selectedText || selectionText);
  const resolvedDocument = document && typeof document === 'object'
    ? document
    : {
      title: documentTitle,
      summary: documentSummary,
      content: documentContent,
      platformOptions: [],
    };
  const resolvedTitle = getDocumentTitle(resolvedDocument, documentTitle);
  const resolvedSummary = getDocumentSummary(resolvedDocument, documentSummary);
  const fullContent = getDocumentContent(resolvedDocument, documentContent);
  const sourceText = pickedSelection || fullContent;

  return {
    actionKey: normalizeAiActionKey(actionKey) || AI_ACTION_KEYS.SUMMARIZE,
    actionLabel: getAiActionLabel(actionKey),
    promptLabel: getAiActionPromptLabel(actionKey),
    scope: pickedSelection ? 'selection' : 'document',
    scopeLabel: pickedSelection ? '当前选中文本' : '整篇文稿',
    title: resolvedTitle || '未命名稿件',
    summary: resolvedSummary || truncateText(fullContent, DEFAULT_SUMMARY_LENGTH) || '暂无摘要',
    sourceText: truncateText(sourceText, maxContextChars),
    selectedText: pickedSelection,
    metadataLines: buildMetadataLines(resolvedDocument),
    contentLength: sourceText.length,
  };
};

export const buildAiPrompt = ({
  actionKey = '',
  selectedText = '',
  selectionText = '',
  document = null,
  documentTitle = '',
  documentSummary = '',
  documentContent = '',
  audience = '',
  tone = '',
  extraRequirements = '',
  titleSuggestionCount = DEFAULT_TITLE_SUGGESTION_COUNT,
  maxContextChars = DEFAULT_MAX_CONTEXT_CHARS,
} = {}) => {
  const normalizedAction = normalizeAiActionKey(actionKey) || AI_ACTION_KEYS.SUMMARIZE;
  const context = buildAiContextSummary({
    actionKey: normalizedAction,
    selectedText,
    selectionText,
    document,
    documentTitle,
    documentSummary,
    documentContent,
    maxContextChars,
  });
  const config = getActionConfig(normalizedAction);
  const cleanAudience = normalizeWhitespace(audience);
  const cleanTone = normalizeWhitespace(tone);
  const cleanRequirements = normalizeMultilineText(extraRequirements);
  const titleCountLine = normalizedAction === AI_ACTION_KEYS.TITLE_SUGGESTIONS
    ? `标题数量：${Math.max(1, Number(titleSuggestionCount) || DEFAULT_TITLE_SUGGESTION_COUNT)} 个`
    : '';

  return [
    '你是一个中文内容创作助手，请直接给出可用结果，不要解释思路。',
    '',
    `当前动作：${getAiActionLabel(normalizedAction)}`,
    `处理范围：${context.scopeLabel}`,
    `任务目标：${config.task}`,
    titleCountLine,
    cleanAudience ? `目标读者：${cleanAudience}` : '',
    cleanTone ? `风格倾向：${cleanTone}` : '',
    context.title ? `稿件标题：${context.title}` : '',
    context.summary ? `稿件摘要：${context.summary}` : '',
    context.metadataLines.length ? `稿件信息：\n- ${context.metadataLines.join('\n- ')}` : '',
    `输出要求：\n- ${config.outputRules.join('\n- ')}`,
    cleanRequirements ? `额外要求：\n${cleanRequirements}` : '',
    `参考内容：\n${context.sourceText || '（当前没有可用正文，请先写一点内容再触发这个动作）'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
};

export const createAiActionPrompt = (actionKey, options = {}) => {
  return buildAiPrompt({ ...options, actionKey });
};

export const getAIAction = getAiAction;
export const getAIActionLabel = getAiActionLabel;
export const getAIActionPromptLabel = getAiActionPromptLabel;
export const buildAIActionContext = buildAiContextSummary;
export const buildAIActionPrompt = buildAiPrompt;
