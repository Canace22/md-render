import { getDocumentStatus } from '../../store/creationUtils.js';
import {
  collectFiles,
  collectRecentFiles,
  collectTags,
  getKnowledgeNodeTypeLabel,
  sanitizeStringList,
} from '../../store/workspaceUtils.js';

const STATUS_LABEL_MAP = Object.freeze({
  idea: '选题中',
  collecting: '收集中',
  draft: '草稿',
  drafting: '写作中',
  revising: '修改中',
  ready: '待发布',
  published: '已发布',
});

const DEFAULT_RECENT_DOCS_LIMIT = 4;
const DEFAULT_REF_DOCS_LIMIT = 3;
const DEFAULT_TOP_TAGS_LIMIT = 3;
const MAX_SUMMARY_CHARS = 140;
const MAX_SELECTION_CHARS = 180;
const MAX_SNIPPET_CHARS = 90;
const MAX_TITLE_CHARS = 96;
const MAX_URL_CHARS = 240;
const MAX_META_VALUE_CHARS = 48;
const MAX_REASON_CHARS = 90;
const MAX_POINTER_LIST_ITEMS = 8;
const MAX_POINTER_ID_ITEMS = 12;

const toList = (value) => {
  if (Array.isArray(value)) return value;
  if (value == null || value === '') return [];
  return [value];
};

const truncate = (value, max) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max)}…`;
};

const getStatusLabel = (status) => STATUS_LABEL_MAP[status] || status || '';

const pickSummary = (summary, content) => {
  const text = String(summary ?? '').trim();
  if (text) return truncate(text, MAX_SUMMARY_CHARS);
  return truncate(content, MAX_SUMMARY_CHARS);
};

const getFirstText = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return '';
};

const sanitizePointerList = (values, maxItems = MAX_POINTER_LIST_ITEMS) => {
  return sanitizeStringList(toList(values))
    .slice(0, maxItems)
    .map((item) => truncate(item, MAX_META_VALUE_CHARS));
};

// 文档 id 需要保持完整才能继续调用 read_doc_by_id；这里只限制条数，不截断 id 本身。
const sanitizePointerIds = (values) => {
  return sanitizeStringList(toList(values)).slice(0, MAX_POINTER_ID_ITEMS);
};

const sanitizeTimestamp = (value) => {
  if (Number.isFinite(value)) return value;
  return truncate(value, MAX_META_VALUE_CHARS);
};

/**
 * 把工作区文件或搜索结果规整成统一的内容资产指针。
 * 指针只携带定位和摘要元数据，不暴露正文；文本和列表都有明确上限。
 */
export const buildContentAssetPointer = (file, { content } = {}) => {
  if (!file) return null;

  const status = getDocumentStatus(file);
  const explicitSummary = getFirstText(file.summary, file.snippet, file.excerpt);
  const summaryFallback = content ?? file.content;
  const title = truncate(getFirstText(file.name, file.title) || '未命名', MAX_TITLE_CHARS);

  return {
    id: String(file.id ?? '').trim(),
    title: title || '未命名',
    summary: pickSummary(explicitSummary, summaryFallback),
    snippet: truncate(getFirstText(file.snippet, file.excerpt), MAX_SNIPPET_CHARS),
    status,
    statusLabel: truncate(file.statusLabel || getStatusLabel(status), MAX_META_VALUE_CHARS),
    nodeType: truncate(file.nodeType ?? file.node_type ?? 'document', MAX_META_VALUE_CHARS),
    nodeTypeLabel: truncate(
      file.nodeTypeLabel || getKnowledgeNodeTypeLabel(file.nodeType ?? file.node_type),
      MAX_META_VALUE_CHARS,
    ),
    aliases: sanitizePointerList(file.aliases),
    tags: sanitizePointerList(file.tags),
    targetPlatforms: sanitizePointerList(
      file.targetPlatforms ?? file.platforms ?? file.publishPlatforms,
    ),
    scheduledPublishAt: truncate(
      file.scheduledPublishAt ?? file.publishAt,
      MAX_META_VALUE_CHARS,
    ),
    sourceMaterialIds: sanitizePointerIds(
      file.sourceMaterialIds ?? file.sourceMaterials,
    ),
    relatedIds: sanitizePointerIds(file.relatedIds),
    url: truncate(file.url, MAX_URL_CHARS),
    createdAt: sanitizeTimestamp(file.createdAt),
    updatedAt: sanitizeTimestamp(file.updatedAt),
    reason: truncate(file.reason, MAX_REASON_CHARS),
  };
};

export const buildActiveDocMeta = (file, content) => {
  if (!file) return null;

  const cleanContent = String(content ?? file?.content ?? '');
  const pointer = buildContentAssetPointer(file, { content: cleanContent });

  return {
    ...pointer,
    relatedDocCount: sanitizeStringList(toList(file.relatedIds)).length,
    sourceMaterialCount: sanitizeStringList(
      toList(file.sourceMaterialIds ?? file.sourceMaterials),
    ).length,
    contentLength: cleanContent.trim().length,
  };
};

export const buildWorkspaceBrief = (workspace, selectedId, { recentLimit = DEFAULT_RECENT_DOCS_LIMIT } = {}) => {
  const allFiles = collectFiles(workspace);
  const selectedFileId = String(selectedId ?? '');
  const recentDocs = collectRecentFiles(workspace, recentLimit + 1)
    .filter((file) => file?.id !== selectedFileId)
    .slice(0, recentLimit)
    .map((file) => buildContentAssetPointer(file));
  const topTags = collectTags(workspace)
    .slice(0, DEFAULT_TOP_TAGS_LIMIT)
    .map((item) => item.tag);

  return {
    totalDocs: allFiles.length,
    recentDocs,
    topTags,
  };
};

export const buildPinnedContext = (attachedFiles = []) => {
  return attachedFiles.map((file) => ({
    id: file?.id ?? '',
    title: file?.name ?? '未命名附件',
    snippet: truncate(file?.content, MAX_SNIPPET_CHARS),
  }));
};

export const buildTaskContextPacket = ({
  activeDoc = null,
  currentSurface = '',
  selectionText = '',
  workspaceBrief = null,
  relatedRefs = [],
  userPinnedContext = [],
} = {}) => {
  const normalizePointer = (item) => {
    const pointer = buildContentAssetPointer(item);
    if (!pointer) return null;
    return {
      ...pointer,
      ...(Number.isFinite(item?.contentLength) ? { contentLength: item.contentLength } : {}),
      ...(Number.isFinite(item?.relatedDocCount)
        ? { relatedDocCount: item.relatedDocCount }
        : {}),
      ...(Number.isFinite(item?.sourceMaterialCount)
        ? { sourceMaterialCount: item.sourceMaterialCount }
        : {}),
    };
  };

  return {
    activeDoc: normalizePointer(activeDoc),
    currentSurface: String(currentSurface ?? '').trim(),
    selection: truncate(selectionText, MAX_SELECTION_CHARS),
    workspace: workspaceBrief
      ? {
        totalDocs: workspaceBrief.totalDocs ?? 0,
        topTags: sanitizePointerList(workspaceBrief.topTags, DEFAULT_TOP_TAGS_LIMIT),
      }
      : null,
    recentDocs: (workspaceBrief?.recentDocs ?? [])
      .slice(0, DEFAULT_RECENT_DOCS_LIMIT)
      .map(normalizePointer)
      .filter(Boolean),
    relatedRefs: (relatedRefs ?? [])
      .slice(0, DEFAULT_REF_DOCS_LIMIT)
      .map(normalizePointer)
      .filter(Boolean),
    userPinnedContext: (userPinnedContext ?? []).map((item) => ({
      id: String(item?.id ?? '').trim(),
      title: truncate(item?.title, MAX_TITLE_CHARS) || '未命名附件',
      snippet: truncate(item?.snippet, MAX_SNIPPET_CHARS),
    })),
  };
};

const formatPointerForModel = (item, { includeReason = false } = {}) => {
  const pointer = buildContentAssetPointer(item);
  if (!pointer) return '';

  const identity = pointer.id
    ? `${pointer.title} [id: ${pointer.id}]`
    : pointer.title;
  const details = [];
  if (pointer.statusLabel) details.push(`状态 ${pointer.statusLabel}`);
  if (pointer.summary) details.push(`摘要 ${pointer.summary}`);
  if (includeReason && pointer.reason) details.push(pointer.reason);
  return details.length ? `${identity}（${details.join('；')}）` : identity;
};

export const formatTaskContextPacket = (packet) => {
  if (!packet) return '';

  const lines = ['当前轮任务简报：以下都是摘要，需要细节时再调用工具读取全文。'];

  const activeDoc = buildContentAssetPointer(packet.activeDoc);
  if (activeDoc?.title) {
    const docLine = [
      `当前稿件：${activeDoc.title}${activeDoc.id ? ` [id: ${activeDoc.id}]` : ''}`,
      activeDoc.statusLabel ? `状态 ${activeDoc.statusLabel}` : '',
      activeDoc.nodeTypeLabel ? `类型 ${activeDoc.nodeTypeLabel}` : '',
    ].filter(Boolean).join('；');
    lines.push(docLine);
  } else {
    lines.push('当前稿件：暂无打开文档。');
  }

  if (packet.currentSurface) {
    lines.push(`当前界面：${packet.currentSurface}`);
  }

  if (activeDoc?.summary) lines.push(`稿件摘要：${activeDoc.summary}`);
  if (activeDoc?.tags?.length) lines.push(`稿件标签：${activeDoc.tags.join('、')}`);
  if (activeDoc?.targetPlatforms?.length) {
    lines.push(`目标平台：${activeDoc.targetPlatforms.join('、')}`);
  }
  if (packet.selection) lines.push(`当前选区：${packet.selection}`);

  if (packet.workspace) {
    lines.push(`工作区概况：共 ${packet.workspace.totalDocs} 篇文档`);
    if (packet.workspace.topTags?.length) {
      lines.push(`高频标签：${packet.workspace.topTags.join('、')}`);
    }
  }

  if (packet.recentDocs?.length) {
    lines.push(
      `最近稿件：${packet.recentDocs.map((item) => formatPointerForModel(item)).filter(Boolean).join(' | ')}`,
    );
  }

  if (packet.relatedRefs?.length) {
    lines.push(
      `相关旧文：${packet.relatedRefs.map((item) => (
        formatPointerForModel(item, { includeReason: true })
      )).filter(Boolean).join(' | ')}`,
    );
  }

  if (packet.userPinnedContext?.length) {
    lines.push(`用户指定资料：${packet.userPinnedContext.map((item) => item.title).join('、')}`);
  }

  return lines.join('\n');
};

export const buildTaskContextPreviewLines = (packet) => {
  if (!packet) return [];

  const lines = [];
  if (packet.activeDoc?.title) {
    lines.push(`当前稿件：${packet.activeDoc.title}`);
  }
  if (packet.selection) {
    lines.push(`当前选区：${packet.selection}`);
  }
  if (packet.userPinnedContext?.length) {
    lines.push(`用户指定资料：${packet.userPinnedContext.map((item) => item.title).join('、')}`);
  }
  if (packet.relatedRefs?.length) {
    lines.push(`相关旧文：${packet.relatedRefs.map((item) => item.title).join('、')}`);
  }
  if (packet.recentDocs?.length) {
    lines.push(`最近稿件：${packet.recentDocs.map((item) => item.title).join('、')}`);
  }

  return lines;
};

export const buildWorkspaceToolBrief = (workspace, selectedId, options = {}) => {
  const brief = buildWorkspaceBrief(workspace, selectedId, options);
  return {
    totalDocs: brief.totalDocs,
    topTags: brief.topTags,
    recentDocs: brief.recentDocs,
  };
};

export const buildRecentDocPointers = (workspace, selectedId, limit = DEFAULT_RECENT_DOCS_LIMIT) => {
  return buildWorkspaceBrief(workspace, selectedId, { recentLimit: limit }).recentDocs;
};

export const buildDocPointerById = (workspace, docId) => {
  const file = collectFiles(workspace).find((item) => item?.id === docId);
  return file ? buildContentAssetPointer(file) : null;
};
