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

const toDocPointer = (file) => {
  const status = getDocumentStatus(file);
  return {
    id: file?.id ?? '',
    title: file?.name ?? '未命名',
    summary: pickSummary(file?.summary, file?.content),
    status,
    statusLabel: getStatusLabel(status),
    nodeType: file?.nodeType ?? 'document',
    nodeTypeLabel: getKnowledgeNodeTypeLabel(file?.nodeType),
  };
};

export const buildActiveDocMeta = (file, content = '') => {
  if (!file) return null;

  const status = getDocumentStatus(file);
  const cleanContent = String(content ?? file?.content ?? '');

  return {
    id: file.id ?? '',
    title: file.name ?? '未命名',
    summary: pickSummary(file.summary, cleanContent),
    status,
    statusLabel: getStatusLabel(status),
    nodeType: file.nodeType ?? 'document',
    nodeTypeLabel: getKnowledgeNodeTypeLabel(file.nodeType),
    tags: sanitizeStringList(toList(file.tags)),
    targetPlatforms: sanitizeStringList(toList(file.targetPlatforms ?? file.platforms ?? file.publishPlatforms)),
    relatedDocCount: Array.isArray(file.relatedIds) ? file.relatedIds.length : 0,
    sourceMaterialCount: Array.isArray(file.sourceMaterialIds) ? file.sourceMaterialIds.length : 0,
    contentLength: cleanContent.trim().length,
  };
};

export const buildWorkspaceBrief = (workspace, selectedId, { recentLimit = DEFAULT_RECENT_DOCS_LIMIT } = {}) => {
  const allFiles = collectFiles(workspace);
  const selectedFileId = String(selectedId ?? '');
  const recentDocs = collectRecentFiles(workspace, recentLimit + 1)
    .filter((file) => file?.id !== selectedFileId)
    .slice(0, recentLimit)
    .map(toDocPointer);
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
  return {
    activeDoc,
    currentSurface: String(currentSurface ?? '').trim(),
    selection: truncate(selectionText, MAX_SELECTION_CHARS),
    workspace: workspaceBrief
      ? {
        totalDocs: workspaceBrief.totalDocs ?? 0,
        topTags: workspaceBrief.topTags ?? [],
      }
      : null,
    recentDocs: workspaceBrief?.recentDocs?.slice(0, DEFAULT_RECENT_DOCS_LIMIT) ?? [],
    relatedRefs: relatedRefs.slice(0, DEFAULT_REF_DOCS_LIMIT),
    userPinnedContext,
  };
};

export const formatTaskContextPacket = (packet) => {
  if (!packet) return '';

  const lines = ['当前轮任务简报：以下都是摘要，需要细节时再调用工具读取全文。'];

  if (packet.activeDoc?.title) {
    const docLine = [
      `当前稿件：${packet.activeDoc.title}`,
      packet.activeDoc.statusLabel ? `状态 ${packet.activeDoc.statusLabel}` : '',
      packet.activeDoc.nodeTypeLabel ? `类型 ${packet.activeDoc.nodeTypeLabel}` : '',
    ].filter(Boolean).join('；');
    lines.push(docLine);
  } else {
    lines.push('当前稿件：暂无打开文档。');
  }

  if (packet.currentSurface) {
    lines.push(`当前界面：${packet.currentSurface}`);
  }

  if (packet.activeDoc?.summary) lines.push(`稿件摘要：${packet.activeDoc.summary}`);
  if (packet.activeDoc?.tags?.length) lines.push(`稿件标签：${packet.activeDoc.tags.join('、')}`);
  if (packet.activeDoc?.targetPlatforms?.length) {
    lines.push(`目标平台：${packet.activeDoc.targetPlatforms.join('、')}`);
  }
  if (packet.selection) lines.push(`当前选区：${packet.selection}`);

  if (packet.workspace) {
    lines.push(`工作区概况：共 ${packet.workspace.totalDocs} 篇文档`);
    if (packet.workspace.topTags?.length) {
      lines.push(`高频标签：${packet.workspace.topTags.join('、')}`);
    }
  }

  if (packet.recentDocs?.length) {
    lines.push(`最近稿件：${packet.recentDocs.map((item) => item.title).join('、')}`);
  }

  if (packet.relatedRefs?.length) {
    lines.push(
      `相关旧文：${packet.relatedRefs.map((item) => (
        item.reason ? `${item.title}（${item.reason}）` : item.title
      )).join('、')}`,
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
  return file ? toDocPointer(file) : null;
};
