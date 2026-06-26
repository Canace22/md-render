import { normalizeDailyWorkspace } from './dailyWorkspace.js';
import { sanitizePublishingPlatforms } from './publishingPlatforms.js';

const CLOUD_SYNC_SCHEMA_VERSION = 1;
const LOCAL_MEDIA_PLACEHOLDER = '[本地媒体未同步]';
const LOCAL_MEDIA_RE = /local-media:\/\/[^\s)"']+/g;
const MARKDOWN_EXTENSION_RE = /\.(md|markdown)$/i;

const trimSlash = (value) => String(value ?? '').trim().replace(/\/+$/, '');

export const normalizeCloudSyncBaseUrl = (value) => trimSlash(value);

export const getDefaultCloudSyncBaseUrl = () => normalizeCloudSyncBaseUrl(
  import.meta.env?.VITE_CLOUD_SYNC_API
    || import.meta.env?.VITE_CLOUD_SYNC_BASE_URL
    || (import.meta.env?.DEV ? '/cloud-sync-api' : ''),
);

export const resolveCloudSyncBaseUrl = (runtimeBaseUrl) => (
  normalizeCloudSyncBaseUrl(runtimeBaseUrl) || getDefaultCloudSyncBaseUrl()
);

const getCloudSyncHeaders = () => {
  const token = String(import.meta.env?.VITE_CLOUD_SYNC_TOKEN ?? '').trim();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const normalizeWorkspaceId = (workspaceId) => String(workspaceId ?? '').trim();

const assertCloudConfig = ({ baseUrl, workspaceId }) => {
  const cleanBaseUrl = resolveCloudSyncBaseUrl(baseUrl);
  const cleanWorkspaceId = normalizeWorkspaceId(workspaceId);
  if (!cleanBaseUrl) throw new Error('请在 .env 配置 VITE_CLOUD_SYNC_API，或在面板填写覆盖地址。');
  if (!cleanWorkspaceId) throw new Error('请先填写云端工作区 ID。');
  return { baseUrl: cleanBaseUrl, workspaceId: cleanWorkspaceId };
};

async function parseResponse(res) {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = body?.message || body?.error || `HTTP ${res.status}`;
    const error = new Error(message);
    error.status = res.status;
    error.body = body;
    throw error;
  }
  return body;
}

const sanitizeCloudString = (value) => String(value ?? '').replace(LOCAL_MEDIA_RE, LOCAL_MEDIA_PLACEHOLDER);

const isMarkdownNode = (node) => {
  if (!node || node.type !== 'file') return false;
  if (node.needsConversion) return false;
  return !node.name || MARKDOWN_EXTENSION_RE.test(node.name);
};

const buildCloudNodeId = (node) => {
  if (!node?.projectRootPath) return String(node?.id ?? '');
  const relativePath = String(node.relativePath ?? node.name ?? node.id ?? '').trim();
  return `local-snapshot:${node.type}:${relativePath}`;
};

const sanitizeCloudReference = (value) => {
  const text = sanitizeCloudString(value).trim();
  if (!text.startsWith('project:')) return text;
  const fileMarker = ':file:';
  const folderMarker = ':folder:';
  const fileIndex = text.lastIndexOf(fileMarker);
  if (fileIndex >= 0) return `local-snapshot:file:${text.slice(fileIndex + fileMarker.length)}`;
  const folderIndex = text.lastIndexOf(folderMarker);
  if (folderIndex >= 0) return `local-snapshot:folder:${text.slice(folderIndex + folderMarker.length)}`;
  return 'local-snapshot:root';
};

const copyStringList = (values) => (
  Array.isArray(values)
    ? values.map((item) => sanitizeCloudReference(item)).filter(Boolean)
    : []
);

const pickSafeNodeFields = (node, isLocalProjectNode) => {
  const safe = {
    id: buildCloudNodeId(node),
    type: node.type,
    name: sanitizeCloudString(node.name ?? ''),
  };

  if (node.createdAt != null) safe.createdAt = node.createdAt;
  if (node.updatedAt != null) safe.updatedAt = node.updatedAt;
  if (node.pinned != null) safe.pinned = Boolean(node.pinned);
  if (node.nodeType) safe.nodeType = sanitizeCloudString(node.nodeType).trim();
  if (node.summary) safe.summary = sanitizeCloudString(node.summary).trim();
  if (node.draftStatus) safe.draftStatus = sanitizeCloudString(node.draftStatus).trim();
  if (node.scheduledPublishAt) safe.scheduledPublishAt = sanitizeCloudString(node.scheduledPublishAt).trim();
  if (node.url) safe.url = sanitizeCloudString(node.url).trim();

  const listFields = ['aliases', 'tags', 'relatedIds', 'targetPlatforms', 'sourceMaterialIds'];
  listFields.forEach((field) => {
    const next = copyStringList(node[field]);
    if (next.length > 0) safe[field] = next;
  });

  if (node.cover && !String(node.cover).includes('local-media://')) {
    safe.cover = sanitizeCloudString(node.cover).trim();
  }
  if (node.relativePath) safe.relativePath = sanitizeCloudString(node.relativePath).trim();
  if (isLocalProjectNode) {
    safe.readOnly = true;
    safe.source = 'local-project-snapshot';
  }
  return safe;
};

export function buildCloudWorkspaceTree(node, insideLocalProject = false) {
  if (!node || typeof node !== 'object') return null;
  const isLocalProjectNode = insideLocalProject || Boolean(
    node.projectRootPath || node.localProjectRoot || node.readOnly || node.source === 'local-project-snapshot',
  );
  const safe = pickSafeNodeFields(node, isLocalProjectNode);

  if (node.type === 'file') {
    if (isLocalProjectNode && !isMarkdownNode(node)) return null;
    safe.content = sanitizeCloudString(node.content ?? '');
    return safe;
  }

  if (node.type === 'folder') {
    safe.children = (node.children ?? [])
      .map((child) => buildCloudWorkspaceTree(child, isLocalProjectNode))
      .filter(Boolean);
    if (isLocalProjectNode) safe.localProjectSnapshot = true;
    return safe;
  }

  return null;
}

function findCloudNodeIdByOriginalId(node, selectedId, insideLocalProject = false) {
  if (!node || !selectedId) return '';
  const isLocalProjectNode = insideLocalProject || Boolean(
    node.projectRootPath || node.localProjectRoot || node.readOnly || node.source === 'local-project-snapshot',
  );
  if (node.id === selectedId) return isLocalProjectNode ? buildCloudNodeId(node) : String(node.id);
  if (node.type !== 'folder' || !Array.isArray(node.children)) return '';
  for (const child of node.children) {
    const found = findCloudNodeIdByOriginalId(child, selectedId, isLocalProjectNode);
    if (found) return found;
  }
  return '';
}

export function buildCloudWorkspacePayload({
  workspace,
  dailyWorkspace,
  publishingPlatforms,
  selectedId,
} = {}) {
  const safeSelectedId = findCloudNodeIdByOriginalId(workspace, selectedId);
  return {
    schemaVersion: CLOUD_SYNC_SCHEMA_VERSION,
    workspace: buildCloudWorkspaceTree(workspace),
    dailyWorkspace: normalizeDailyWorkspace(dailyWorkspace, null),
    publishingPlatforms: sanitizePublishingPlatforms(publishingPlatforms),
    selectedId: safeSelectedId,
  };
}

const stableStringify = (value) => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${stableStringify(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
};

export function getCloudPayloadHash(payload) {
  return stableStringify(payload);
}

export async function fetchCloudWorkspaceSnapshot({ baseUrl, workspaceId }) {
  const config = assertCloudConfig({ baseUrl, workspaceId });
  const res = await fetch(
    `${config.baseUrl}/workspaces/${encodeURIComponent(config.workspaceId)}/snapshot`,
    { headers: { Accept: 'application/json', ...getCloudSyncHeaders() } },
  );
  return parseResponse(res);
}

export async function uploadCloudWorkspaceSnapshot({
  baseUrl,
  workspaceId,
  payload,
  baseRevision,
  clientId,
}) {
  const config = assertCloudConfig({ baseUrl, workspaceId });
  const res = await fetch(
    `${config.baseUrl}/workspaces/${encodeURIComponent(config.workspaceId)}/snapshot`,
    {
      method: 'PUT',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...getCloudSyncHeaders(),
      },
      body: JSON.stringify({
        payload,
        baseRevision: Number.isFinite(Number(baseRevision)) ? Number(baseRevision) : 0,
        clientId: String(clientId ?? ''),
      }),
    },
  );
  return parseResponse(res);
}
