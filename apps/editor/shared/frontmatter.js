const FRONTMATTER_OPEN = '---';
const FRONTMATTER_CLOSE = '---';
const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n)?/;
const KNOWN_FRONTMATTER_ORDER = [
  'title',
  'cover',
  'source',
  'author',
  'published',
  'created',
  'description',
  'tags',
];

const cleanString = (value = '') => String(value ?? '').replace(/\r\n/g, '\n').trim();

const isSafeBareYamlString = (value) => /^[\p{L}\p{N}_@./:-]+$/u.test(value);

const unquoteYamlString = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';

  if (text.startsWith('"') && text.endsWith('"')) {
    try {
      return JSON.parse(text);
    } catch {
      return text.slice(1, -1);
    }
  }

  if (text.startsWith('\'') && text.endsWith('\'')) {
    return text.slice(1, -1).replace(/''/g, '\'');
  }

  return text;
};

const parseInlineYamlList = (value) => {
  const inner = String(value ?? '').slice(1, -1).trim();
  if (!inner) return [];
  return inner
    .split(',')
    .map((item) => unquoteYamlString(item))
    .map((item) => cleanString(item))
    .filter(Boolean);
};

const parseYamlScalar = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.startsWith('[') && text.endsWith(']')) {
    return parseInlineYamlList(text);
  }
  return unquoteYamlString(text);
};

const serializeYamlScalar = (value, { preserveDate = false } = {}) => {
  const text = cleanString(value);
  if (!text) return '""';
  if (preserveDate && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  return isSafeBareYamlString(text) ? text : JSON.stringify(text);
};

const normalizeStringArray = (value) => {
  const list = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];

  return Array.from(new Set(list.map((item) => cleanString(item)).filter(Boolean)));
};

const parseFrontmatterObject = (rawFrontmatter = '') => {
  const result = {};
  const lines = String(rawFrontmatter ?? '').replace(/\r\n/g, '\n').split('\n');
  let currentKey = null;

  lines.forEach((line) => {
    const listMatch = line.match(/^\s*-\s*(.+)\s*$/);
    if (listMatch && currentKey) {
      const nextItem = cleanString(parseYamlScalar(listMatch[1]));
      if (!Array.isArray(result[currentKey])) {
        result[currentKey] = result[currentKey] ? [result[currentKey]] : [];
      }
      if (nextItem) {
        result[currentKey].push(nextItem);
      }
      return;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):(?:\s*(.*))?$/);
    if (!keyMatch) {
      if (currentKey && typeof result[currentKey] === 'string') {
        const continuation = cleanString(line);
        if (continuation) {
          result[currentKey] = [result[currentKey], continuation].filter(Boolean).join('\n');
        }
      }
      return;
    }

    currentKey = keyMatch[1];
    const rawValue = keyMatch[2] ?? '';
    result[currentKey] = parseYamlScalar(rawValue);
  });

  return result;
};

const mergeKnownKeysFirst = (frontmatter = {}) => {
  const ordered = {};
  const source = frontmatter && typeof frontmatter === 'object' ? frontmatter : {};
  KNOWN_FRONTMATTER_ORDER.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      ordered[key] = source[key];
    }
  });
  Object.keys(source).forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      ordered[key] = source[key];
    }
  });
  return ordered;
};

export const formatObsidianDate = (value, fallback = '') => {
  if (value == null || value === '') return fallback;
  const text = cleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }
  const timestamp = Number.isFinite(value) ? Number(value) : Date.parse(text);
  if (!Number.isFinite(timestamp)) return fallback;
  return new Date(timestamp).toISOString().slice(0, 10);
};

export const normalizeFrontmatterTags = (value) => normalizeStringArray(value);

export const buildClippingTags = (tags = []) => {
  return normalizeStringArray(['clippings', ...normalizeStringArray(tags)]);
};

export const parseMarkdownFrontmatter = (rawContent = '') => {
  const text = String(rawContent ?? '').replace(/\r\n/g, '\n');
  const match = text.match(FRONTMATTER_RE);
  if (!match) {
    return {
      hasFrontmatter: false,
      frontmatter: null,
      content: text,
    };
  }

  const frontmatter = parseFrontmatterObject(match[1]);
  if (Object.keys(frontmatter).length === 0) {
    return {
      hasFrontmatter: false,
      frontmatter: null,
      content: text,
    };
  }
  const content = text.slice(match[0].length).replace(/^\n/, '');

  return {
    hasFrontmatter: true,
    frontmatter,
    content,
  };
};

export const serializeMarkdownFrontmatter = (frontmatter = {}, content = '') => {
  const ordered = mergeKnownKeysFirst(frontmatter);
  const lines = [];

  Object.entries(ordered).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      const items = normalizeStringArray(value);
      if (items.length === 0) return;
      if (items.length === 1) {
        lines.push(`${key}: ${serializeYamlScalar(items[0])}`);
        return;
      }
      lines.push(`${key}:`);
      items.forEach((item) => {
        lines.push(`  - ${serializeYamlScalar(item)}`);
      });
      return;
    }

    const text = cleanString(value);
    if (!text) return;
    lines.push(`${key}: ${serializeYamlScalar(text, { preserveDate: key === 'published' || key === 'created' })}`);
  });

  const body = String(content ?? '').replace(/\r\n/g, '\n').replace(/^\n+/, '');
  if (lines.length === 0) return body;

  const prefix = `${FRONTMATTER_OPEN}\n${lines.join('\n')}\n${FRONTMATTER_CLOSE}`;
  return body ? `${prefix}\n\n${body}` : `${prefix}\n`;
};

export const extractKnowledgeMetadataFromFrontmatter = (frontmatter = {}) => {
  if (!frontmatter || typeof frontmatter !== 'object') {
    return {};
  }

  const url = cleanString(frontmatter.source || frontmatter.url);
  const summary = cleanString(frontmatter.description || frontmatter.summary);
  const tags = normalizeFrontmatterTags(frontmatter.tags);
  const hasClippingTag = tags.some((tag) => ['clipping', 'clippings'].includes(tag.toLowerCase()));
  const createdAtText = formatObsidianDate(frontmatter.created);
  const createdAt = createdAtText ? Date.parse(createdAtText) : NaN;

  const cover = cleanString(frontmatter.cover);

  return {
    ...(cover ? { cover } : {}),
    ...(url ? { url } : {}),
    ...(summary ? { summary } : {}),
    ...(tags.length ? { tags } : {}),
    ...(hasClippingTag && url ? { nodeType: 'bookmark' } : {}),
    ...(Number.isFinite(createdAt) ? { createdAt } : {}),
    ...(cleanString(frontmatter.author) ? { sourceAuthor: cleanString(frontmatter.author) } : {}),
    ...(formatObsidianDate(frontmatter.published) ? { sourcePublishedAt: formatObsidianDate(frontmatter.published) } : {}),
  };
};

export const applyKnowledgeMetadataToFrontmatter = (frontmatter = {}, metadata = {}) => {
  const next = {
    ...(frontmatter && typeof frontmatter === 'object' ? frontmatter : {}),
  };

  if (Object.prototype.hasOwnProperty.call(metadata ?? {}, 'cover')) {
    const cover = cleanString(metadata.cover);
    if (cover) next.cover = cover;
    else delete next.cover;
  }

  if (Object.prototype.hasOwnProperty.call(metadata ?? {}, 'url')) {
    const url = cleanString(metadata.url);
    if (url) next.source = url;
    else delete next.source;
  }

  if (Object.prototype.hasOwnProperty.call(metadata ?? {}, 'summary')) {
    const description = cleanString(metadata.summary);
    if (description) next.description = description;
    else delete next.description;
  }

  if (Object.prototype.hasOwnProperty.call(metadata ?? {}, 'tags')) {
    const tags = normalizeFrontmatterTags(metadata.tags);
    if (tags.length > 0) next.tags = tags;
    else delete next.tags;
  }

  return next;
};

export const buildObsidianClippingMarkdown = ({
  title,
  sourceUrl,
  author = '',
  publishedAt = '',
  createdAt = '',
  description = '',
  tags = [],
  bodyMarkdown = '',
  error = '',
} = {}) => {
  const frontmatter = {
    title: cleanString(title) || '未命名剪藏',
    source: cleanString(sourceUrl),
    author: cleanString(author),
    published: formatObsidianDate(publishedAt),
    created: formatObsidianDate(createdAt, formatObsidianDate(Date.now())),
    description: cleanString(description || error),
    tags: buildClippingTags(tags),
  };

  const body = cleanString(bodyMarkdown) || cleanString(error) || '未抓取到可预览正文，已保留原链接。';
  return serializeMarkdownFrontmatter(frontmatter, body);
};
