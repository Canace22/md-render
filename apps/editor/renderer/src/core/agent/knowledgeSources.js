const KNOWLEDGE_SOURCES_STORAGE_KEY = 'md-renderer-agent-knowledge-sources';
const MAX_USER_KNOWLEDGE_SOURCES = 8;

export const BUILT_IN_KNOWLEDGE_SOURCES = Object.freeze([
  Object.freeze({
    id: 'canace-wiki',
    name: 'Canace Wiki',
    url: 'https://canace.site/wiki/',
    repositoryUrl: 'https://github.com/Canace22/blog/tree/develop',
    builtIn: true,
    enabled: true,
  }),
]);

const normalizeUrl = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.toString();
  } catch {
    return '';
  }
};

const normalizeUserSource = (source, index = 0) => {
  const url = normalizeUrl(source?.url);
  if (!url) return null;
  let fallbackName = '外挂知识库';
  try {
    fallbackName = new URL(url).hostname;
  } catch {
    /* normalizeUrl 已校验，这里只做兜底 */
  }
  return {
    id: String(source?.id ?? `external-${index + 1}`).trim() || `external-${index + 1}`,
    name: String(source?.name ?? '').trim() || fallbackName,
    url,
    builtIn: false,
    enabled: source?.enabled !== false,
  };
};

const readStoredSources = () => {
  try {
    if (typeof window === 'undefined') return [];
    const parsed = JSON.parse(window.localStorage.getItem(KNOWLEDGE_SOURCES_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, MAX_USER_KNOWLEDGE_SOURCES)
      .map(normalizeUserSource)
      .filter(Boolean);
  } catch {
    return [];
  }
};

export const loadKnowledgeSources = () => [
  ...BUILT_IN_KNOWLEDGE_SOURCES,
  ...readStoredSources(),
];

export const saveKnowledgeSources = (sources) => {
  const userSources = (Array.isArray(sources) ? sources : [])
    .filter((source) => !source?.builtIn)
    .slice(0, MAX_USER_KNOWLEDGE_SOURCES)
    .map(normalizeUserSource)
    .filter(Boolean);
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(KNOWLEDGE_SOURCES_STORAGE_KEY, JSON.stringify(userSources));
    }
  } catch {
    return false;
  }
  return true;
};

export const createUserKnowledgeSource = ({ name, url, id } = {}) => {
  const normalizedUrl = normalizeUrl(url);
  if (!normalizedUrl) return { ok: false, error: '请输入有效的 http/https 知识库地址。' };
  const source = normalizeUserSource({
    id: id || `external-${Date.now().toString(36)}`,
    name,
    url: normalizedUrl,
    enabled: true,
  });
  return { ok: true, source };
};

export const canAddKnowledgeSource = (sources) => (
  (Array.isArray(sources) ? sources : []).filter((source) => !source?.builtIn).length
  < MAX_USER_KNOWLEDGE_SOURCES
);
