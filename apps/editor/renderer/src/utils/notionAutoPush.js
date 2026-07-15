/**
 * 保存后自动推送 Notion
 *
 * 编辑器把文件写盘成功后调用 scheduler.schedule(fileSnapshot)，
 * 同一文件在防抖窗口内的多次保存合并为一次推送（推最后一份内容）。
 *
 * 设计：调度器与推送实现分离，副作用（Notion API、store 读写）由调用方注入，
 * 本模块的调度和路径推导都是可单测的纯逻辑。
 */

import {
  updatePageBlocks,
  createDatabasePage,
  fetchDatabaseSchema,
  ensureDatabaseSelectProperty,
  filterPropertiesToSchema,
  cleanPageId,
} from './notionService.js';
import { markdownToNotionPayload } from './notionConverter.js';
import { DIR_PROPERTY_NAME } from './notionBatchSync.js';

export const AUTO_PUSH_DEBOUNCE_MS = 30000;

/**
 * 从 relativePath 推导「目录」属性值：取最近一层父文件夹名。
 * 顶层文件（无父目录）返回空字符串。
 */
export function deriveParentDirFromRelativePath(relativePath) {
  const segments = String(relativePath ?? '').split('/').filter(Boolean);
  return segments.length >= 2 ? segments[segments.length - 2] : '';
}

/**
 * 每个文件独立防抖的推送调度器。
 * @param {object} options
 * @param {Function} options.pushFile - async (snapshot) => void，真正执行推送
 * @param {number} [options.debounceMs]
 * @param {Function} [options.setTimeoutFn] / [options.clearTimeoutFn] - 测试注入
 */
export function createAutoPushScheduler({
  pushFile,
  debounceMs = AUTO_PUSH_DEBOUNCE_MS,
  setTimeoutFn = (...args) => setTimeout(...args),
  clearTimeoutFn = (id) => clearTimeout(id),
}) {
  const timers = new Map();
  const pending = new Map();

  const fire = async (key) => {
    const snapshot = pending.get(key);
    timers.delete(key);
    pending.delete(key);
    if (!snapshot) return;
    await pushFile(snapshot);
  };

  return {
    /** snapshot 需含 fileId；同 fileId 的旧任务会被新内容覆盖并重新计时 */
    schedule(snapshot) {
      const key = snapshot?.fileId;
      if (!key) return;
      const existing = timers.get(key);
      if (existing) clearTimeoutFn(existing);
      pending.set(key, snapshot);
      timers.set(key, setTimeoutFn(() => fire(key), debounceMs));
    },
    /** 取消某个文件的待推送（文件被删除/移除项目时用） */
    cancel(fileId) {
      const existing = timers.get(fileId);
      if (existing) clearTimeoutFn(existing);
      timers.delete(fileId);
      pending.delete(fileId);
    },
    /** 待推送数量（测试/状态展示用） */
    pendingCount() {
      return pending.size;
    },
    dispose() {
      for (const id of timers.values()) clearTimeoutFn(id);
      timers.clear();
      pending.clear();
    },
  };
}

// 数据库 schema 缓存：自动推送高频触发，避免每次保存都多打一次 API
const schemaCache = new Map();

export function clearNotionSchemaCache() {
  schemaCache.clear();
}

async function getCachedSchema(databaseId, token) {
  const key = cleanPageId(databaseId);
  if (schemaCache.has(key)) return schemaCache.get(key);
  const { titlePropName, propertyTypes } = await fetchDatabaseSchema(key, token);
  await ensureDatabaseSelectProperty(
    key,
    DIR_PROPERTY_NAME,
    token,
    propertyTypes[DIR_PROPERTY_NAME] || '',
  );
  const schema = {
    titlePropName,
    propertyTypes: {
      ...propertyTypes,
      [DIR_PROPERTY_NAME]: propertyTypes[DIR_PROPERTY_NAME] || 'select',
    },
  };
  schemaCache.set(key, schema);
  return schema;
}

/**
 * 把 Markdown 直接写回某个 Notion 页面（不依赖数据库 schema）。
 * Web 端「Notion 即工作区」：从数据库拉下来的页面编辑后原地写回。
 */
export async function pushMarkdownToNotionPage({ pageId, markdown, token }) {
  const { blocks } = markdownToNotionPayload(markdown ?? '');
  await updatePageBlocks(pageId, blocks, token);
  return { pageId, created: false };
}

/**
 * 推送单个文件到 Notion 数据库：已有 pageId 则更新，否则新建。
 * @returns {{ pageId: string, created: boolean }}
 */
export async function pushFileToNotionDatabase({
  databaseId,
  token,
  fileName,
  relativePath,
  markdown,
  pageId,
}) {
  const { titlePropName, propertyTypes } = await getCachedSchema(databaseId, token);
  const { blocks, properties, title } = markdownToNotionPayload(markdown ?? '');

  const fileTitle = String(fileName ?? '').replace(/\.md$/i, '').trim() || '未命名';
  const pageTitle = title || fileTitle;
  const parentDir = deriveParentDirFromRelativePath(relativePath);
  const dirProps = parentDir && propertyTypes[DIR_PROPERTY_NAME] === 'select'
    ? { [DIR_PROPERTY_NAME]: { select: { name: parentDir } } }
    : {};
  const safeProps = filterPropertiesToSchema({ ...properties, ...dirProps }, propertyTypes);

  if (pageId) {
    await updatePageBlocks(pageId, blocks, token, { properties: safeProps });
    return { pageId, created: false };
  }

  const page = await createDatabasePage(
    databaseId,
    pageTitle,
    blocks,
    token,
    titlePropName,
    safeProps,
  );
  return { pageId: page.id, created: true };
}
