/**
 * Notion 数据库批量同步逻辑
 *
 * batchPull：从数据库拉取所有页面 → 构建本地工作区树
 * batchPush：将本地文件树推送到数据库（已有映射的更新，无映射的新建）
 */

import {
  queryDatabase,
  fetchBlocks,
  updatePageBlocks,
  createDatabasePage,
  createChildPage,
  fetchDatabaseSchema,
  ensureDatabaseSelectProperty,
  filterPropertiesToSchema,
  extractPageTitle,
  cleanPageId,
} from './notionService.js';
import { blocksToMarkdown, markdownToNotionPayload } from './notionConverter.js';
import { createId, collectFiles } from '../store/workspaceUtils.js';

function ensureMarkdownName(title, usedNames) {
  const base = String(title || '无标题')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.(md|markdown)$/i, '')
    || '无标题';
  let name = `${base}.md`;
  let index = 1;

  while (usedNames.has(name)) {
    name = `${base} ${index}.md`;
    index += 1;
  }

  usedNames.add(name);
  return name;
}

function ensureFolderName(title, usedNames) {
  const base = String(title || '无标题')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    || '无标题';
  let name = base;
  let index = 1;

  while (usedNames.has(name)) {
    name = `${base} ${index}`;
    index += 1;
  }

  usedNames.add(name);
  return name;
}

function getPageContentBlocks(blocks, includeChildPages) {
  if (includeChildPages) return blocks;
  return blocks.filter((block) => block.type !== 'child_page');
}

/**
 * 递归拉取一个页面及其子页面，构建树节点
 * @returns {{ node, mappings }} node 是工作区树节点, mappings 是 { localFileId: notionPageId } 映射
 */
async function pullPageRecursive(pageId, title, token, depth = 0, maxDepth = 3) {
  const blocks = await fetchBlocks(pageId, token);

  // 查找子页面
  const childPageBlocks = blocks.filter((b) => b.type === 'child_page');
  const shouldPullChildPages = childPageBlocks.length > 0 && depth < maxDepth;
  const contentBlocks = getPageContentBlocks(blocks, !shouldPullChildPages);
  const md = blocksToMarkdown(contentBlocks);
  const mappings = {};

  if (shouldPullChildPages) {
    // 有子页面 → 该页面变成文件夹，内容放为 index 文件
    const folderId = createId('folder');
    const children = [];
    const usedNames = new Set();

    // 父页面本身的内容作为一个 index 文件
    if (md.trim()) {
      const indexFileId = createId('file');
      children.push({
        id: indexFileId,
        type: 'file',
        name: ensureMarkdownName(title, usedNames),
        content: md,
        updatedAt: Date.now(),
      });
      mappings[indexFileId] = pageId;
    }

    // 递归拉取子页面
    for (const cpBlock of childPageBlocks) {
      const cpTitle = cpBlock.child_page?.title ?? '无标题';
      const result = await pullPageRecursive(cpBlock.id, cpTitle, token, depth + 1, maxDepth);
      children.push(result.node);
      Object.assign(mappings, result.mappings);
    }

    return {
      node: { id: folderId, type: 'folder', name: ensureFolderName(title, usedNames), children },
      mappings,
    };
  }

  // 无子页面 → 普通文件
  const fileId = createId('file');
  mappings[fileId] = pageId;
  return {
    node: {
      id: fileId,
      type: 'file',
      name: ensureMarkdownName(title, new Set()),
      content: md,
      updatedAt: Date.now(),
    },
    mappings,
  };
}

/**
 * 从 Notion 数据库批量拉取所有页面到本地
 *
 * @param {string} databaseId - 数据库 ID
 * @param {string} token - Notion Integration Token
 * @param {Function} onProgress - 进度回调 (current, total, pageTitle)
 * @returns {{ folder, mappings, databaseId }}
 *   folder: 可直接插入工作区的文件夹节点
 *   mappings: { localFileId: notionPageId }
 */
export async function batchPull(databaseId, token, onProgress) {
  const dbId = cleanPageId(databaseId);
  if (!dbId) throw new Error('无效的数据库 ID');

  const pages = await queryDatabase(dbId, token);
  if (!pages.length) throw new Error('数据库中没有页面');

  const children = [];
  const allMappings = {};
  const failed = [];
  const usedNames = new Set();
  let done = 0;

  for (const page of pages) {
    const title = extractPageTitle(page);
    onProgress?.(done, pages.length, title);

    try {
      const result = await pullPageRecursive(page.id, title, token);
      result.node.name = result.node.type === 'folder'
        ? ensureFolderName(result.node.name, usedNames)
        : ensureMarkdownName(result.node.name.replace(/\.md$/i, ''), usedNames);
      children.push(result.node);
      Object.assign(allMappings, result.mappings);
    } catch (err) {
      // 单页失败不阻断，记入一个错误占位文件
      const errFileId = createId('file');
      failed.push({ title, error: err.message });
      children.push({
        id: errFileId,
        type: 'file',
        name: ensureMarkdownName(`${title} (拉取失败)`, usedNames),
        content: `> 拉取失败：${err.message}`,
        updatedAt: Date.now(),
      });
    }
    done++;
  }

  onProgress?.(done, pages.length, '完成');

  const folderId = createId('folder');
  return {
    folder: {
      id: folderId,
      type: 'folder',
      name: 'Notion 同步',
      children,
      notionSyncRoot: true,
    },
    mappings: allMappings,
    databaseId: dbId,
    failed,
  };
}

// 写入文件所在父文件夹名的 Select 属性名，供 Notion 端按目录筛选
export const DIR_PROPERTY_NAME = '目录';

/**
 * 收集文件并附带其直接父文件夹名（不改动公共 collectFiles）。
 * 顶层文件（直接挂在推送根下）的 parentDir 为空字符串。
 *
 * @returns {Array<{ file, parentDir }>}
 */
function collectFilesWithParent(node, parentDir = '', acc = []) {
  if (!node) return acc;
  if (node.type === 'file') {
    acc.push({ file: node, parentDir });
  } else if (node.type === 'folder' && Array.isArray(node.children)) {
    // 推送根（最外层）本身不算一层目录；其余文件夹始终用「最近一层」文件夹名作为父目录
    const dir = node.notionSyncRoot ? parentDir : (node.name || parentDir || '');
    node.children.forEach((child) => collectFilesWithParent(child, dir, acc));
  }
  return acc;
}

/**
 * 将本地文件批量推送到 Notion 数据库
 *
 * 已有映射（notionFilePages）的文件 → 更新对应 Notion 页面内容
 * 无映射的文件 → 在数据库中新建页面
 * 同时把文件的父文件夹名写入「目录」Select 属性，供 Notion 端按目录筛选。
 *
 * @param {string} databaseId - 数据库 ID
 * @param {object} folderNode - 要推送的本地文件夹节点
 * @param {object} notionFilePages - 现有的 { fileId: notionPageId } 映射
 * @param {string} token
 * @param {Function} onProgress - (current, total, fileName)
 * @returns {{ newMappings }} 新创建页面的映射
 */
export async function batchPush(databaseId, folderNode, notionFilePages, token, onProgress) {
  const dbId = cleanPageId(databaseId);
  if (!dbId) throw new Error('无效的数据库 ID');

  const entries = collectFilesWithParent(folderNode);
  if (!entries.length) throw new Error('没有可推送的文件');

  const { titlePropName, propertyTypes } = await fetchDatabaseSchema(dbId, token);
  // 确保「目录」Select 属性存在（已有同名属性则不动）
  await ensureDatabaseSelectProperty(dbId, DIR_PROPERTY_NAME, token, propertyTypes[DIR_PROPERTY_NAME] || '');
  // 让后续 filterPropertiesToSchema 认得这个属性
  const schemaTypes = { ...propertyTypes, [DIR_PROPERTY_NAME]: propertyTypes[DIR_PROPERTY_NAME] || 'select' };
  const newMappings = {};
  const failed = [];
  let updated = 0;
  let created = 0;
  let done = 0;

  for (const { file, parentDir } of entries) {
    const fileTitle = file.name.replace(/\.md$/i, '').trim() || '未命名';
    onProgress?.(done, entries.length, file.name);

    try {
      const { blocks, properties, title } = markdownToNotionPayload(file.content ?? '');
      // 标题优先用 frontmatter.title，回退文件名
      const pageTitle = title || fileTitle;
      // 把父文件夹名作为「目录」Select 值注入（仅当属性是 select 且有父目录）
      const dirProps =
        parentDir && schemaTypes[DIR_PROPERTY_NAME] === 'select'
          ? { [DIR_PROPERTY_NAME]: { select: { name: parentDir } } }
          : {};
      // 只写数据库里真实存在且类型匹配的属性，避免整请求被 Notion 拒绝
      const safeProps = filterPropertiesToSchema({ ...properties, ...dirProps }, schemaTypes);
      const existingPageId = notionFilePages[file.id];

      if (existingPageId) {
        // 已有映射 → 更新（含属性）
        await updatePageBlocks(existingPageId, blocks, token, { properties: safeProps });
        updated++;
      } else {
        // 无映射 → 新建
        const page = await createDatabasePage(dbId, pageTitle, blocks, token, titlePropName, safeProps);
        newMappings[file.id] = page.id;
        created++;
      }
    } catch (err) {
      console.error(`推送 "${file.name}" 失败:`, err);
      failed.push({ fileId: file.id, fileName: file.name, error: err.message });
      // 继续处理其余文件
    }
    done++;
  }

  onProgress?.(done, entries.length, '完成');
  return { newMappings, updated, created, failed };
}

// ─── 保留层级推送（推到一个父页面下的子页面树）─────────────────────────────────

const stripMdExt = (name) => String(name ?? '').replace(/\.(md|markdown)$/i, '').trim();

/**
 * 递归把一个工作区节点推送到 Notion 某个父页面下，保留文件夹/文件层级。
 *
 * 文件夹 → 在父页面下建一个“文件夹页”（只有标题），其 children 继续递归进去；
 * 文件   → 在父页面下建子页面，正文 = 元数据卡片 + 目录 + 正文块；
 * 已有映射的文件 → 走 updatePageBlocks 原地更新，不重复建页。
 *
 * @param {object} node - 工作区节点（file 或 folder）
 * @param {string} parentPageId - Notion 父页面 ID
 * @param {object} ctx - { token, notionFilePages, newMappings, counters, onProgress, total }
 */
async function pushNodeToPage(node, parentPageId, ctx) {
  if (!node) return;

  if (node.type === 'folder') {
    // 文件夹本身建成一个空内容的“容器页”
    const folderPage = await createChildPage(parentPageId, stripMdExt(node.name) || '未命名文件夹', [], ctx.token);
    for (const child of node.children ?? []) {
      await pushNodeToPage(child, folderPage.id, ctx);
    }
    return;
  }

  if (node.type !== 'file') return;

  const title = stripMdExt(node.name) || '未命名';
  ctx.onProgress?.(ctx.counters.done, ctx.total, node.name);

  try {
    const { blocks, title: fmTitle } = markdownToNotionPayload(node.content ?? '');
    const existingPageId = ctx.notionFilePages[node.id];

    if (existingPageId) {
      await updatePageBlocks(existingPageId, blocks, ctx.token);
      ctx.counters.updated++;
    } else {
      const page = await createChildPage(parentPageId, fmTitle || title, blocks, ctx.token);
      ctx.newMappings[node.id] = page.id;
      ctx.counters.created++;
    }
  } catch (err) {
    console.error(`推送 "${node.name}" 失败:`, err);
    ctx.failed.push({ fileId: node.id, fileName: node.name, error: err.message });
  }
  ctx.counters.done++;
}

/**
 * 把本地文件夹（或整个工作区）推送到 Notion 的某个父页面下，保留目录层级。
 *
 * @param {string} parentPageId - 目标父页面 ID 或 URL
 * @param {object} rootNode - 要推送的根节点（folder 或 workspace 根）
 * @param {object} notionFilePages - 现有 { fileId: notionPageId } 映射
 * @param {string} token
 * @param {Function} onProgress - (current, total, name)
 * @returns {{ newMappings, updated, created, failed }}
 */
export async function pushTreeToPage(parentPageId, rootNode, notionFilePages, token, onProgress) {
  const parent = cleanPageId(parentPageId);
  if (!parent) throw new Error('无效的父页面 ID');

  const total = collectFiles(rootNode).length;
  if (!total) throw new Error('没有可推送的文件');

  const ctx = {
    token,
    notionFilePages: notionFilePages ?? {},
    newMappings: {},
    failed: [],
    counters: { done: 0, updated: 0, created: 0 },
    onProgress,
    total,
  };

  // 根节点的直接子节点逐个推到父页面下（根节点本身不再多包一层）
  const topNodes = rootNode?.type === 'folder' ? (rootNode.children ?? []) : [rootNode];
  for (const child of topNodes) {
    await pushNodeToPage(child, parent, ctx);
  }

  onProgress?.(ctx.counters.done, total, '完成');
  return {
    newMappings: ctx.newMappings,
    updated: ctx.counters.updated,
    created: ctx.counters.created,
    failed: ctx.failed,
  };
}
