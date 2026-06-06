const DEFAULT_MAX_CONTEXT_CHARS = 2200;
const DEFAULT_SUMMARY_LENGTH = 240;
const DEFAULT_TITLE_SUGGESTION_COUNT = 5;

export const AI_ACTION_KEYS = Object.freeze({
  SUMMARIZE: 'summarize',
  EXPAND: 'expand',
  TITLE_SUGGESTIONS: 'title_suggestions',
});

export const AI_ACTION_OPTIONS = Object.freeze([
  { key: AI_ACTION_KEYS.SUMMARIZE, value: AI_ACTION_KEYS.SUMMARIZE, label: '压缩', promptLabel: '压缩这段内容' },
  { key: AI_ACTION_KEYS.EXPAND, value: AI_ACTION_KEYS.EXPAND, label: '扩写', promptLabel: '扩写这段内容' },
  { key: AI_ACTION_KEYS.TITLE_SUGGESTIONS, value: AI_ACTION_KEYS.TITLE_SUGGESTIONS, label: '标题建议', promptLabel: '给这篇内容提标题' },
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
  title: AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  titles: AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  title_suggestions: AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  '标题': AI_ACTION_KEYS.TITLE_SUGGESTIONS,
  '标题建议': AI_ACTION_KEYS.TITLE_SUGGESTIONS,
});

const ACTION_META_MAP = new Map(AI_ACTION_OPTIONS.map((item) => [item.key, item]));

const PLATFORM_LABEL_MAP = Object.freeze({
  wechat: '公众号',
  xiaohongshu: '小红书',
  zhihu: '知乎',
  juejin: '掘金',
  weibo: '微博',
  jike: '即刻',
  newsletter: 'Newsletter',
  website: '网站',
});

const STATUS_LABEL_MAP = Object.freeze({
  idea: '选题中',
  collecting: '收集中',
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
  [AI_ACTION_KEYS.TITLE_SUGGESTIONS]: {
    task: '请基于内容给出一组中文标题建议。',
    outputRules: [
      `输出 ${DEFAULT_TITLE_SUGGESTION_COUNT} 个标题候选，每个标题单独一行。`,
      '标题要具体、可用，避免空泛鸡汤或强行标题党。',
      '优先体现主题、角度、读者收益或冲突点。',
      '不要附加分析说明。',
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

const getPlatformLabels = (platforms) => {
  return platforms.map((platform) => PLATFORM_LABEL_MAP[platform] || platform);
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
  const platforms = getPlatformLabels(getDocumentPlatforms(document));
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
