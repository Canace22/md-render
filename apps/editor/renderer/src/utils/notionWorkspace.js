/**
 * Notion 即工作区（Web 端为主）
 *
 * 与 batchPull（整库拉正文）不同：这里只查数据库页面清单，秒开成一棵
 * 「懒加载」文件树——每个页面一个空内容文件节点，点开时才拉正文。
 * 编辑后的写回由自动推送（notionAutoPush）按已有映射原地更新页面。
 */

import { queryDatabase, fetchBlocks, extractPageTitle, cleanPageId } from './notionService.js';
import { blocksToMarkdown } from './notionConverter.js';
import { createId } from '../store/workspaceUtils.js';
import { DIR_PROPERTY_NAME } from './notionBatchSync.js';

export const NOTION_WORKSPACE_FOLDER_NAME = 'Notion 数据库';

/** 文件名清洗 + 去重（与 batchSync 同规则） */
function uniqueMarkdownName(title, usedNames) {
  const base = String(title || '无标题')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.(md|markdown)$/i, '')
    || '无标题';
  let name = `${base}.md`;
  let i = 1;
  while (usedNames.has(name)) {
    name = `${base} ${i}.md`;
    i += 1;
  }
  usedNames.add(name);
  return name;
}

/** 读取页面「目录」Select 属性值（没有则空字符串） */
function extractDirProperty(page) {
  const prop = page?.properties?.[DIR_PROPERTY_NAME];
  return prop?.type === 'select' ? (prop.select?.name ?? '') : '';
}

/**
 * 把数据库页面清单变成懒加载文件树（纯组装，网络调用可注入替换）。
 * @param {Array} pages - Notion 页面原始对象数组
 * @returns {{ folder, mappings }} folder 可直接挂进工作区；mappings: { fileId: pageId }
 */
export function buildLazyNotionTree(pages, databaseId) {
  const mappings = {};
  const dirFolders = new Map();
  const topChildren = [];
  const usedNamesByDir = new Map();

  const getUsedNames = (dir) => {
    if (!usedNamesByDir.has(dir)) usedNamesByDir.set(dir, new Set());
    return usedNamesByDir.get(dir);
  };

  for (const page of pages ?? []) {
    const title = extractPageTitle(page);
    const dir = extractDirProperty(page);
    const fileId = createId('file');
    const fileNode = {
      id: fileId,
      type: 'file',
      name: uniqueMarkdownName(title, getUsedNames(dir)),
      content: '',
      notionLazy: true,
      updatedAt: Date.parse(page.last_edited_time ?? '') || Date.now(),
    };
    mappings[fileId] = page.id;

    if (!dir) {
      topChildren.push(fileNode);
      continue;
    }
    if (!dirFolders.has(dir)) {
      dirFolders.set(dir, {
        id: createId('folder'),
        type: 'folder',
        name: dir,
        children: [],
      });
    }
    dirFolders.get(dir).children.push(fileNode);
  }

  return {
    folder: {
      id: createId('folder'),
      type: 'folder',
      name: NOTION_WORKSPACE_FOLDER_NAME,
      children: [...dirFolders.values(), ...topChildren],
      notionSyncRoot: true,
      notionDatabaseId: databaseId,
    },
    mappings,
  };
}

/**
 * 打开 Notion 数据库为懒加载工作区：只查页面清单，不拉正文。
 */
export async function openNotionDatabaseWorkspace(databaseId, token) {
  const dbId = cleanPageId(databaseId);
  if (!dbId) throw new Error('无效的数据库 ID');
  const pages = await queryDatabase(dbId, token);
  if (!pages.length) throw new Error('数据库中没有页面');
  return buildLazyNotionTree(pages, dbId);
}

/** 拉取单个页面正文为 Markdown（懒加载文件点开时调用） */
export async function fetchNotionPageMarkdown(pageId, token) {
  const blocks = await fetchBlocks(pageId, token);
  return blocksToMarkdown(blocks.filter((b) => b.type !== 'child_page'));
}
