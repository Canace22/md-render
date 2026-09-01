import { formatObsidianDate } from './frontmatter.js';

/**
 * 属性 schema 层：内部字段 ↔ frontmatter 属性的映射、控件类型、值编解码。
 *
 * - key          落盘时的 frontmatter 键名（英文，Obsidian 里可见）
 * - field        应用内部字段名（workspace 节点上的属性）
 * - widget       md-render 面板用什么控件渲染
 * - obsidianType 写进 .obsidian/types.json 的类型，Obsidian 只认这 8 种：
 *                text / multitext / tags / aliases / number / checkbox / date / datetime
 */

export const OBSIDIAN_TYPES = Object.freeze([
  'text', 'multitext', 'tags', 'aliases', 'number', 'checkbox', 'date', 'datetime',
]);

export const NODE_TYPE_OPTIONS = Object.freeze([
  { value: 'concept', label: '概念' },
  { value: 'method', label: '方法' },
  { value: 'tech', label: '技术' },
  { value: 'component', label: '组件' },
  { value: 'document', label: '文档' },
  { value: 'bookmark', label: '书签' },
]);

export const DRAFT_STATUS_OPTIONS = Object.freeze([
  { value: 'idea', label: '选题中' },
  { value: 'collecting', label: '收集中' },
  { value: 'draft', label: '草稿' },
  { value: 'drafting', label: '写作中' },
  { value: 'revising', label: '修改中' },
  { value: 'ready', label: '待发布' },
  { value: 'published', label: '已发布' },
]);

export const PROPERTY_DEFINITIONS = Object.freeze([
  { key: 'title', field: 'title', label: '标题', widget: 'text', obsidianType: 'text' },
  { key: 'source', field: 'url', label: '来源链接', widget: 'url', obsidianType: 'text' },
  { key: 'author', field: 'sourceAuthor', label: '作者', widget: 'text', obsidianType: 'text' },
  { key: 'published', field: 'sourcePublishedAt', label: '发布日期', widget: 'date', obsidianType: 'date' },
  { key: 'created', field: 'createdAt', label: '创建日期', widget: 'date', obsidianType: 'date' },
  { key: 'description', field: 'summary', label: '摘要', widget: 'textarea', obsidianType: 'text' },
  { key: 'tags', field: 'tags', label: '标签', widget: 'tags', obsidianType: 'tags' },
  { key: 'cover', field: 'cover', label: '封面图片', widget: 'image', obsidianType: 'text' },
  { key: 'status', field: 'draftStatus', label: '状态', widget: 'select', obsidianType: 'text', options: DRAFT_STATUS_OPTIONS },
  { key: 'type', field: 'nodeType', label: '类型', widget: 'select', obsidianType: 'text', options: NODE_TYPE_OPTIONS },
  { key: 'platforms', field: 'targetPlatforms', label: '平台', widget: 'multi-select', obsidianType: 'multitext' },
  { key: 'publish', field: 'scheduledPublishAt', label: '排期', widget: 'datetime', obsidianType: 'datetime' },
  { key: 'aliases', field: 'aliases', label: '别名', widget: 'list', obsidianType: 'aliases' },
  { key: 'sources', field: 'sourceMaterialIds', label: '来源素材', widget: 'relation', obsidianType: 'multitext' },
  { key: 'related', field: 'relatedIds', label: '关联文档', widget: 'relation', obsidianType: 'multitext' },
]);

/** 不同文档类型的默认属性模板（面板里即使为空也显示） */
export const PROPERTY_TEMPLATES = Object.freeze({
  draft: ['status', 'type', 'title', 'author', 'published', 'created', 'description', 'cover', 'tags', 'platforms', 'publish', 'sources', 'related'],
  bookmark: ['type', 'title', 'source', 'author', 'published', 'created', 'description', 'tags', 'cover', 'related'],
  platformArticle: ['title', 'source', 'author', 'published', 'created', 'description', 'tags'],
  default: ['status', 'type', 'title', 'author', 'published', 'created', 'description', 'tags', 'related'],
});

/** 常见属性的展示兜底；内置 key 也保留，兼容独立的属性推断调用。 */
export const EXTRA_PROPERTY_DEFINITIONS = Object.freeze({
  title: { label: '标题', widget: 'text', obsidianType: 'text' },
  author: { label: '作者', widget: 'text', obsidianType: 'text' },
  published: { label: '发布日期', widget: 'date', obsidianType: 'date' },
  created: { label: '创建日期', widget: 'date', obsidianType: 'date' },
  updated: { label: '更新日期', widget: 'date', obsidianType: 'date' },
  category: { label: '分类', widget: 'text', obsidianType: 'text' },
  categories: { label: '分类', widget: 'list', obsidianType: 'multitext' },
});

export const EXTRA_PROPERTY_LABELS = Object.freeze(Object.fromEntries(
  Object.entries(EXTRA_PROPERTY_DEFINITIONS).map(([key, def]) => [key, def.label]),
));

const FRONTMATTER_DISPLAY_ORDER = Object.freeze([
  'title', 'source', 'author', 'published', 'created', 'description', 'tags',
]);

const DEF_BY_KEY = new Map(PROPERTY_DEFINITIONS.map((def) => [def.key, def]));
const DEF_BY_FIELD = new Map(PROPERTY_DEFINITIONS.map((def) => [def.field, def]));

export const getPropertyDefByKey = (key) => DEF_BY_KEY.get(key) ?? null;
export const getPropertyDefByField = (field) => DEF_BY_FIELD.get(field) ?? null;

/* ── 类型推断（用于 frontmatter 里我们没定义过的 key）────────── */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/;

export const inferWidget = (value) => {
  if (Array.isArray(value)) return 'list';
  if (typeof value === 'boolean') return 'checkbox';
  if (typeof value === 'number') return 'number';
  const text = String(value ?? '').trim();
  if (DATETIME_RE.test(text)) return 'datetime';
  if (DATE_RE.test(text)) return 'date';
  if (/^https?:\/\//i.test(text)) return 'url';
  if (text.includes('\n')) return 'textarea';
  return 'text';
};

const WIDGET_TO_OBSIDIAN_TYPE = Object.freeze({
  select: 'text',
  text: 'text',
  textarea: 'text',
  url: 'text',
  image: 'text',
  number: 'number',
  checkbox: 'checkbox',
  date: 'date',
  datetime: 'datetime',
  tags: 'tags',
  list: 'multitext',
  'multi-select': 'multitext',
  relation: 'multitext',
});

export const widgetToObsidianType = (widget) => WIDGET_TO_OBSIDIAN_TYPE[widget] ?? 'text';

/** 面板要显示的属性：模板 ∪ 文件里实际存在的 key，模板顺序在前 */
export const resolveVisibleProperties = (frontmatter = {}, templateKeys = PROPERTY_TEMPLATES.default) => {
  const seen = new Set();
  const result = [];

  const push = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const def = getPropertyDefByKey(key);
    const extraDef = EXTRA_PROPERTY_DEFINITIONS[key];
    const value = frontmatter?.[key];
    result.push(def
      ? { ...def, value: value ?? null }
      : extraDef
        ? {
          key,
          field: key,
          ...extraDef,
          custom: true,
          value: value ?? null,
        }
      : {
        key,
        field: key,
        label: EXTRA_PROPERTY_LABELS[key] ?? key,
        widget: inferWidget(value),
        obsidianType: widgetToObsidianType(inferWidget(value)),
        custom: true,
        value: value ?? null,
      });
  };

  (templateKeys ?? []).forEach(push);
  Object.keys(frontmatter ?? {}).forEach(push);
  return result;
};

/* ── 值编解码 ─────────────────────────────────────────────── */

const toList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item ?? '').trim()).filter(Boolean);
  const text = String(value ?? '').trim();
  return text ? [text] : [];
};

/** 日期属性只保留日历日；日期时间输入取日期部分，时间戳复用 frontmatter 的 UTC 规则 */
export const normalizeDate = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  const datePrefix = text.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T ])/);
  if (datePrefix) return datePrefix[1];
  return formatObsidianDate(value, text);
};

/** '2026-09-03 20:00' / Date → '2026-09-03T20:00'；纯日期保持 'YYYY-MM-DD' */
export const normalizeDateTime = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (DATE_RE.test(text)) return text;
  const isoLike = text.replace(' ', 'T');
  if (DATETIME_RE.test(isoLike)) return isoLike.slice(0, 16);
  const timestamp = Number.isFinite(value) ? Number(value) : Date.parse(text);
  if (!Number.isFinite(timestamp)) return text;
  const date = new Date(timestamp);
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export const encodeWikilink = (relativePath) => {
  const text = String(relativePath ?? '').trim();
  if (!text) return '';
  if (/^\[\[.*\]\]$/.test(text) || /^https?:\/\//i.test(text)) return text;
  return `[[${text.replace(/\.md$/i, '')}]]`;
};

export const decodeWikilink = (value) => {
  const text = String(value ?? '').trim();
  const match = text.match(/^\[\[([^\]|]+)(?:\|.*)?\]\]$/);
  return match ? match[1].trim() : text;
};

const IDENTITY_RELATION = Object.freeze({
  idToPath: (id) => String(id ?? '').replace(/^file:/, ''),
  // wikilink 里习惯省略 .md，补回来才能对上 workspace 的节点 id
  pathToId: (path) => {
    const text = String(path ?? '').trim();
    if (!text) return '';
    return `file:${/\.[a-z0-9]+$/i.test(text) ? text : `${text}.md`}`;
  },
});

/** 内部值 → frontmatter 值 */
export const encodePropertyValue = (widget, value, relation = IDENTITY_RELATION) => {
  switch (widget) {
    case 'tags':
    case 'list':
    case 'multi-select':
      return toList(value);
    case 'relation':
      return toList(value).map((id) => encodeWikilink(relation.idToPath(id))).filter(Boolean);
    case 'date':
      return normalizeDate(value);
    case 'datetime':
      return normalizeDateTime(value);
    case 'checkbox':
      return Boolean(value);
    case 'number': {
      const num = Number(value);
      return Number.isFinite(num) ? num : '';
    }
    default:
      return String(value ?? '').trim();
  }
};

/** frontmatter 值 → 内部值 */
export const decodePropertyValue = (widget, value, relation = IDENTITY_RELATION) => {
  switch (widget) {
    case 'tags':
    case 'list':
    case 'multi-select':
      return toList(value);
    case 'relation':
      return toList(value).map((item) => relation.pathToId(decodeWikilink(item)));
    case 'date':
      return normalizeDate(value);
    case 'datetime':
      return normalizeDateTime(value);
    case 'checkbox':
      return value === true || value === 'true';
    case 'number': {
      const num = Number(value);
      return Number.isFinite(num) ? num : null;
    }
    default:
      return typeof value === 'string' ? value : String(value ?? '');
  }
};

/* ── metadata ⇄ frontmatter ───────────────────────────────── */

/** 应用内部 metadata → 待写入的 frontmatter patch（值为空表示删除该属性） */
export const metadataToFrontmatterPatch = (metadata = {}, relation = IDENTITY_RELATION) => {
  const patch = {};
  PROPERTY_DEFINITIONS.forEach((def) => {
    if (!Object.prototype.hasOwnProperty.call(metadata, def.field)) return;
    patch[def.key] = encodePropertyValue(def.widget, metadata[def.field], relation);
  });

  // 用户自己加的属性：原样透传（值为空即删除该属性）
  Object.entries(metadata?.customProperties ?? {}).forEach(([key, value]) => {
    if (DEF_BY_KEY.has(key)) return;
    patch[key] = value;
  });

  const ordered = {};
  FRONTMATTER_DISPLAY_ORDER.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(patch, key)) ordered[key] = patch[key];
  });
  Object.entries(patch).forEach(([key, value]) => {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) ordered[key] = value;
  });
  return ordered;
};

/** 从 frontmatter 里挑出「不属于内置定义」的属性 */
export const pickCustomProperties = (frontmatter = {}) => {
  const custom = {};
  Object.entries(frontmatter ?? {}).forEach(([key, value]) => {
    if (!DEF_BY_KEY.has(key)) custom[key] = value;
  });
  return custom;
};

/** frontmatter → 应用内部 metadata（只取认识的 key，未知 key 由面板另行展示） */
export const frontmatterToMetadata = (frontmatter = {}, relation = IDENTITY_RELATION) => {
  const metadata = {};
  PROPERTY_DEFINITIONS.forEach((def) => {
    if (!Object.prototype.hasOwnProperty.call(frontmatter ?? {}, def.key)) return;
    let decoded = decodePropertyValue(def.widget, frontmatter[def.key], relation);
    if (def.field === 'createdAt') {
      const timestamp = decoded ? Date.parse(decoded) : NaN;
      decoded = Number.isFinite(timestamp) ? timestamp : null;
    }
    const isEmpty = decoded === '' || decoded === null
      || (Array.isArray(decoded) && decoded.length === 0);
    if (!isEmpty) metadata[def.field] = decoded;
  });
  return metadata;
};

/** 生成 .obsidian/types.json 的 types 片段 */
export const buildObsidianTypeMap = (extraProperties = {}) => {
  const types = {};
  PROPERTY_DEFINITIONS.forEach((def) => { types[def.key] = def.obsidianType; });
  Object.entries(EXTRA_PROPERTY_DEFINITIONS).forEach(([key, def]) => {
    types[key] = def.obsidianType;
  });
  Object.entries(extraProperties ?? {}).forEach(([key, def]) => {
    types[key] = def?.obsidianType ?? widgetToObsidianType(def?.widget);
  });
  return types;
};
