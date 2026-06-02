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
  fetchDatabaseTitlePropertyName,
  extractPageTitle,
  cleanPageId,
} from './notionService.js';
import { blocksToMarkdown, markdownToBlocks } from './notionConverter.js';
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

/**
 * 将本地文件批量推送到 Notion 数据库
 *
 * 已有映射（notionFilePages）的文件 → 更新对应 Notion 页面内容
 * 无映射的文件 → 在数据库中新建页面
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

  const files = collectFiles(folderNode);
  if (!files.length) throw new Error('没有可推送的文件');

  const titlePropName = await fetchDatabaseTitlePropertyName(dbId, token);
  const newMappings = {};
  const failed = [];
  let updated = 0;
  let created = 0;
  let done = 0;

  for (const file of files) {
    const title = file.name.replace(/\.md$/i, '').trim() || '未命名';
    onProgress?.(done, files.length, file.name);

    try {
      const blocks = markdownToBlocks(file.content ?? '');
      const existingPageId = notionFilePages[file.id];

      if (existingPageId) {
        // 已有映射 → 更新
        await updatePageBlocks(existingPageId, blocks, token);
        updated++;
      } else {
        // 无映射 → 新建
        const page = await createDatabasePage(dbId, title, blocks, token, titlePropName);
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

  onProgress?.(done, files.length, '完成');
  return { newMappings, updated, created, failed };
}
