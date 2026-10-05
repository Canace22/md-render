import { getPublishingPlatformLabel } from './publishingPlatforms.js';
import { BUILTIN_SKILL_ENTRIES } from '../core/agent/builtinSkills.js';
import { buildSkillRegistry, findSkillById } from '../core/agent/skillRegistry.js';

const DEFAULT_MAX_CONTEXT_CHARS = 2200;
const DEFAULT_SUMMARY_LENGTH = 240;

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

// 改写类动作的指令单一事实源是内置 skill（resources/skills/<id>/SKILL.md），这里只做 key → skill 映射。
const ACTION_SKILL_IDS = Object.freeze({
  [AI_ACTION_KEYS.SUMMARIZE]: 'compress',
  [AI_ACTION_KEYS.EXPAND]: 'expand',
  [AI_ACTION_KEYS.POLISH]: 'polish',
  [AI_ACTION_KEYS.TITLE_SUGGESTIONS]: 'title-suggestions',
  [AI_ACTION_KEYS.TONE]: 'tone',
  [AI_ACTION_KEYS.KEY_POINTS]: 'key-points',
  [AI_ACTION_KEYS.SUBHEADINGS]: 'subheadings',
  [AI_ACTION_KEYS.CONTINUE]: 'continue-writing',
  [AI_ACTION_KEYS.OUTLINE]: 'outline',
});

const { skills: BUILTIN_SKILLS } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });

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

const getActionSkill = (actionKey) => {
  const normalized = normalizeAiActionKey(actionKey);
  const skillId = ACTION_SKILL_IDS[normalized] || ACTION_SKILL_IDS[AI_ACTION_KEYS.SUMMARIZE];
  return findSkillById(BUILTIN_SKILLS, skillId);
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

/**
 * 给 AI 助手用的「快捷指令」：开场一句 + 对应 skill 正文（任务、输出要求、写回方式）。
 * 不内嵌整篇正文——交给 agent 通过「读取当前文档」工具自行获取，避免重复拼正文。
 * @param {string} actionKey 动作 key/别名
 * @param {object} [options]
 * @param {string} [options.selectionText] 选区原文，仅对 input=selection 的 skill 生效（只改这段）
 */
export const buildQuickActionInstruction = (actionKey, options = {}) => {
  const skill = getActionSkill(actionKey);
  const selectionText = skill?.input === 'selection'
    ? normalizeMultilineText(options.selectionText)
    : '';
  const intro = selectionText
    ? '请先理解上下文，然后只处理下面这段选中文本。'
    : '请先读取当前文档，然后处理整篇正文。';
  return [
    intro,
    skill?.prompt || '',
    selectionText ? `选中原文：\n${selectionText}` : '',
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

export const getAIAction = getAiAction;
export const getAIActionLabel = getAiActionLabel;
export const getAIActionPromptLabel = getAiActionPromptLabel;
export const buildAIActionContext = buildAiContextSummary;
