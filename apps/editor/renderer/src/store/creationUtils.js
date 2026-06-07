import { collectFiles, sanitizeStringList } from './workspaceUtils.js';

export const CREATION_STATUSES = Object.freeze({
  IDEA: 'idea',
  COLLECTING: 'collecting',
  DRAFTING: 'drafting',
  REVISING: 'revising',
  READY: 'ready',
  PUBLISHED: 'published',
});

export const CREATION_STATUS_OPTIONS = Object.freeze([
  { value: CREATION_STATUSES.IDEA, label: '选题中' },
  { value: CREATION_STATUSES.COLLECTING, label: '收集中' },
  { value: CREATION_STATUSES.DRAFTING, label: '写作中' },
  { value: CREATION_STATUSES.REVISING, label: '修改中' },
  { value: CREATION_STATUSES.READY, label: '待发布' },
  { value: CREATION_STATUSES.PUBLISHED, label: '已发布' },
]);

export const PLATFORM_OPTIONS = Object.freeze([
  { value: 'wechat', label: '公众号' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'zhihu', label: '知乎' },
  { value: 'juejin', label: '掘金' },
  { value: 'weibo', label: '微博' },
  { value: 'newsletter', label: 'Newsletter' },
  { value: 'website', label: '网站' },
]);

const FILE_TYPE = 'file';
const DEFAULT_LIMIT = 5;
const VALID_PLATFORM_VALUES = new Set(PLATFORM_OPTIONS.map((option) => option.value));

const STATUS_ALIAS_MAP = Object.freeze({
  idea: CREATION_STATUSES.IDEA,
  topic: CREATION_STATUSES.IDEA,
  collecting: CREATION_STATUSES.COLLECTING,
  collect: CREATION_STATUSES.COLLECTING,
  researching: CREATION_STATUSES.COLLECTING,
  research: CREATION_STATUSES.COLLECTING,
  drafting: CREATION_STATUSES.DRAFTING,
  draft: CREATION_STATUSES.DRAFTING,
  writing: CREATION_STATUSES.DRAFTING,
  in_progress: CREATION_STATUSES.DRAFTING,
  revising: CREATION_STATUSES.REVISING,
  revise: CREATION_STATUSES.REVISING,
  revision: CREATION_STATUSES.REVISING,
  editing: CREATION_STATUSES.REVISING,
  ready: CREATION_STATUSES.READY,
  ready_to_publish: CREATION_STATUSES.READY,
  pending_publish: CREATION_STATUSES.READY,
  queued: CREATION_STATUSES.READY,
  scheduled: CREATION_STATUSES.READY,
  published: CREATION_STATUSES.PUBLISHED,
  live: CREATION_STATUSES.PUBLISHED,
  archived: CREATION_STATUSES.PUBLISHED,
  '\u9009\u9898': CREATION_STATUSES.IDEA,
  '\u6536\u96c6\u4e2d': CREATION_STATUSES.COLLECTING,
  '\u8349\u7a3f': CREATION_STATUSES.DRAFTING,
  '\u5199\u4f5c\u4e2d': CREATION_STATUSES.DRAFTING,
  '\u4fee\u6539\u4e2d': CREATION_STATUSES.REVISING,
  '\u5f85\u53d1\u5e03': CREATION_STATUSES.READY,
  '\u5df2\u53d1\u5e03': CREATION_STATUSES.PUBLISHED,
});

const DRAFT_LIKE_STATUSES = new Set([
  CREATION_STATUSES.DRAFTING,
  CREATION_STATUSES.REVISING,
  CREATION_STATUSES.READY,
]);

const ACTIVE_TOPIC_STATUSES = new Set([
  CREATION_STATUSES.IDEA,
  CREATION_STATUSES.COLLECTING,
  CREATION_STATUSES.DRAFTING,
  CREATION_STATUSES.REVISING,
  CREATION_STATUSES.READY,
]);

const MATERIAL_NODE_TYPES = new Set(['bookmark', 'material', 'clip', 'reference']);
const MATERIAL_TYPE_TOKENS = new Set([
  'material',
  'bookmark',
  'reference',
  'clip',
  'source',
  '\u7d20\u6750',
  '\u5f85\u6574\u7406',
  '\u526a\u85cf',
  '\u4e66\u7b7e',
]);
const TOPIC_TYPE_TOKENS = new Set([
  'topic',
  'idea',
  'series',
  'project',
  '\u9009\u9898',
  '\u4e13\u9898',
  '\u7cfb\u5217',
  '\u9879\u76ee',
]);
const DRAFT_TYPE_TOKENS = new Set([
  'draft',
  'article',
  'manuscript',
  'post',
  '\u8349\u7a3f',
  '\u6587\u7ae0',
  '\u7a3f\u4ef6',
]);
const DRAFT_KEYWORDS = new Set([
  'draft',
  'article',
  'manuscript',
  'writing',
  '\u8349\u7a3f',
  '\u6587\u7ae0',
  '\u7a3f\u4ef6',
  '\u5f85\u53d1',
]);
const PENDING_PUBLISH_KEYWORDS = new Set([
  'ready',
  'publish',
  'scheduled',
  'queued',
  '\u5f85\u53d1\u5e03',
  '\u5f85\u53d1',
  '\u9884\u7ea6\u53d1\u5e03',
]);
const TOPIC_KEYWORDS = new Set([
  'topic',
  'idea',
  'outline',
  '\u9009\u9898',
  '\u4e13\u9898',
  '\u7cfb\u5217',
  '\u5927\u7eb2',
]);

const DEFAULT_STATUS_COUNTS = Object.freeze({
  [CREATION_STATUSES.IDEA]: 0,
  [CREATION_STATUSES.COLLECTING]: 0,
  [CREATION_STATUSES.DRAFTING]: 0,
  [CREATION_STATUSES.REVISING]: 0,
  [CREATION_STATUSES.READY]: 0,
  [CREATION_STATUSES.PUBLISHED]: 0,
});

const STATUS_PRIORITY = Object.freeze([
  CREATION_STATUSES.PUBLISHED,
  CREATION_STATUSES.READY,
  CREATION_STATUSES.REVISING,
  CREATION_STATUSES.DRAFTING,
  CREATION_STATUSES.COLLECTING,
  CREATION_STATUSES.IDEA,
]);

const normalizeToken = (value) => {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
};

const toTimestamp = (value) => {
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

const getActivityTimestamp = (file) => {
  return toTimestamp(file?.updatedAt) || toTimestamp(file?.createdAt);
};

const getList = (value) => {
  return Array.isArray(value) ? value : [];
};

const getTextValue = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
};

const getFileSearchTokens = (file) => {
  const platforms = sanitizeStringList([
    ...(getList(file?.targetPlatforms)),
    ...(getList(file?.platforms)),
    ...(getList(file?.publishPlatforms)),
  ]);
  const tags = sanitizeStringList(file?.tags);
  const parts = [
    file?.name,
    file?.summary,
    file?.nodeType,
    file?.creationType,
    file?.kind,
    file?.status,
    file?.creationStatus,
    file?.publishStatus,
    ...tags,
    ...platforms,
  ];

  return parts
    .map(normalizeToken)
    .filter(Boolean);
};

const hasAnyToken = (tokens, candidates) => {
  return tokens.some((token) => candidates.has(token));
};

const normalizeFilesInput = (workspaceOrFiles) => {
  const files = Array.isArray(workspaceOrFiles)
    ? workspaceOrFiles
    : collectFiles(workspaceOrFiles);

  return files.filter((file) => file?.type === FILE_TYPE);
};

const sortByRecent = (items) => {
  return items
    .slice()
    .sort((a, b) => {
      const diff = getActivityTimestamp(b) - getActivityTimestamp(a);
      if (diff !== 0) return diff;
      return String(a?.name ?? '').localeCompare(String(b?.name ?? ''));
    });
};

const sliceLimit = (items, limit = DEFAULT_LIMIT) => {
  return sortByRecent(items).slice(0, Math.max(0, limit));
};

const getStatusCandidates = (file) => {
  return [
    file?.draftStatus,
    file?.creationStatus,
    file?.manuscriptStatus,
    file?.publishStatus,
    file?.status,
    file?.topicStatus,
  ]
    .map(normalizeCreationStatus)
    .filter(Boolean);
};

export const getDocumentStatus = (file) => {
  const statuses = getStatusCandidates(file);
  return STATUS_PRIORITY.find((status) => statuses.includes(status)) ?? null;
};

const getTypeTokens = (file) => {
  return [
    normalizeToken(file?.nodeType),
    normalizeToken(file?.creationType),
    normalizeToken(file?.kind),
    normalizeToken(file?.docType),
  ].filter(Boolean);
};

const getSummaryText = (file) => {
  const summary = getTextValue(file?.summary);
  if (summary) return summary;

  const content = getTextValue(file?.content).replace(/\s+/g, ' ').trim();
  if (!content) return '';
  return content.slice(0, 140);
};

const isPublishedDocument = (file) => {
  return getDocumentStatus(file) === CREATION_STATUSES.PUBLISHED;
};

const isMaterialDocument = (file) => {
  const typeTokens = getTypeTokens(file);
  if (typeTokens.some((token) => MATERIAL_NODE_TYPES.has(token))) return true;

  const tokens = getFileSearchTokens(file);
  return hasAnyToken(typeTokens, MATERIAL_TYPE_TOKENS) || hasAnyToken(tokens, MATERIAL_TYPE_TOKENS);
};

const isTopicDocument = (file) => {
  const typeTokens = getTypeTokens(file);
  if (hasAnyToken(typeTokens, TOPIC_TYPE_TOKENS)) return true;

  const tokens = getFileSearchTokens(file);
  if (hasAnyToken(tokens, TOPIC_KEYWORDS)) return true;

  const status = getDocumentStatus(file);
  return status === CREATION_STATUSES.IDEA || status === CREATION_STATUSES.COLLECTING;
};

const isPendingPublishDocument = (file) => {
  if (isPublishedDocument(file) || isMaterialDocument(file) || isTopicDocument(file)) {
    return false;
  }

  const status = getDocumentStatus(file);
  if (status === CREATION_STATUSES.READY) return true;

  const tokens = getFileSearchTokens(file);
  if (hasAnyToken(tokens, PENDING_PUBLISH_KEYWORDS)) return true;

  return normalizePlatformList(file).length > 0 && isDraftDocument(file);
};

const toTopicSummaryItem = (file) => {
  return {
    id: file.id,
    name: file.name ?? 'Untitled',
    status: getDocumentStatus(file) ?? CREATION_STATUSES.IDEA,
    summary: getSummaryText(file),
    updatedAt: getActivityTimestamp(file),
    tags: sanitizeStringList(file.tags),
  };
};

export const normalizeCreationStatus = (value) => {
  const token = normalizeToken(value);
  return STATUS_ALIAS_MAP[token] ?? null;
};

export const normalizePlatformList = (file) => {
  const values = sanitizeStringList([
    ...(getList(file?.targetPlatforms)),
    ...(getList(file?.platforms)),
    ...(getList(file?.publishPlatforms)),
  ]);

  return values
    .map(normalizeToken)
    .filter((value, index, array) => {
      return VALID_PLATFORM_VALUES.has(value) && array.indexOf(value) === index;
    });
};

export const isDraftDocument = (file) => {
  if (!file || file.type !== FILE_TYPE) return false;
  if (isPublishedDocument(file) || isMaterialDocument(file) || isTopicDocument(file)) {
    return false;
  }

  const status = getDocumentStatus(file);
  if (status && DRAFT_LIKE_STATUSES.has(status)) return true;

  const typeTokens = getTypeTokens(file);
  if (hasAnyToken(typeTokens, DRAFT_TYPE_TOKENS)) return true;

  const tokens = getFileSearchTokens(file);
  if (hasAnyToken(tokens, DRAFT_KEYWORDS)) return true;

  return normalizePlatformList(file).length > 0;
};

export const collectRecentDrafts = (workspaceOrFiles, limit = DEFAULT_LIMIT) => {
  return sliceLimit(
    normalizeFilesInput(workspaceOrFiles).filter((file) => isDraftDocument(file)),
    limit,
  );
};

export const collectPendingPublishDrafts = (workspaceOrFiles, limit = DEFAULT_LIMIT) => {
  return sliceLimit(
    normalizeFilesInput(workspaceOrFiles).filter((file) => isPendingPublishDocument(file)),
    limit,
  );
};

export const collectPendingMaterials = (workspaceOrFiles, limit = DEFAULT_LIMIT) => {
  return sliceLimit(
    normalizeFilesInput(workspaceOrFiles).filter((file) => isMaterialDocument(file)),
    limit,
  );
};

export const buildActiveTopicSummary = (workspaceOrFiles, limit = DEFAULT_LIMIT) => {
  const activeTopics = normalizeFilesInput(workspaceOrFiles).filter((file) => {
    if (!isTopicDocument(file) || isPublishedDocument(file)) return false;
    const status = getDocumentStatus(file) ?? CREATION_STATUSES.IDEA;
    return ACTIVE_TOPIC_STATUSES.has(status);
  });

  const statusCounts = activeTopics.reduce((acc, file) => {
    const status = getDocumentStatus(file) ?? CREATION_STATUSES.IDEA;
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, { ...DEFAULT_STATUS_COUNTS });

  const items = sliceLimit(activeTopics, limit).map(toTopicSummaryItem);

  return {
    total: activeTopics.length,
    statusCounts,
    items,
  };
};
