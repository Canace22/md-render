import { findWikilinks } from '@narrative/blocknote-core';
import { isHiddenWorkspaceNode } from '../store/workspaceUtils.js';

/**
 * 「@ 引用文档」菜单的数据整理（纯函数，便于单测）。
 * 插入的是 [[双链]]，和 database.js 的 WIKILINK_RE / 反向链接保持一致。
 *
 * 排序规则：离当前文档越近越靠前 —— 同目录 → 子目录 → 上一层 → 再上一层……
 * 菜单按所在目录分组展示。
 */

export const MENTION_TRIGGER = '@';
export const CURRENT_FOLDER_LABEL = '当前目录';
export const ROOT_FOLDER_LABEL = '根目录';
const FOLDER_SEPARATOR = ' / ';

const stripMd = (name) => String(name ?? '').replace(/\.md$/i, '');

export const toWikilink = (file) => `[[${stripMd(file?.name)}]]`;

export const docTitle = (file) => stripMd(file?.name) || '未命名';

/** 文档在磁盘上的绝对路径；内置文档等不在磁盘上的返回空串 */
export const docFilePath = (file) => {
  const root = String(file?.projectRootPath ?? '').replace(/[\\/]+$/, '');
  const rel = String(file?.relativePath ?? '').replace(/^[\\/]+/, '');
  return root && rel ? `${root}/${rel}` : '';
};

/**
 * 工作区里所有可见文档，附带所在目录链（不含工作区根）：
 * [{ file, folders: [{ id, name }] }]，.agent 等隐藏目录整枝跳过
 */
export const listWorkspaceDocs = (workspace) => {
  const entries = [];
  const walk = (node, folders, isRoot) => {
    if (!node || (!isRoot && isHiddenWorkspaceNode(node))) return;
    if (node.type === 'file') {
      entries.push({ file: node, folders });
      return;
    }
    if (node.type !== 'folder' || !Array.isArray(node.children)) return;
    const nextFolders = isRoot ? folders : [...folders, { id: node.id, name: node.name }];
    node.children.forEach((child) => walk(child, nextFolders, false));
  };
  walk(workspace, [], true);
  return entries;
};

const sharedPrefixLength = (a, b) => {
  let i = 0;
  while (i < a.length && i < b.length && a[i].id === b[i].id) i += 1;
  return i;
};

/** 距离：先比往上退几层才到共同目录（up），再比往下走几层（down） */
const proximity = (currentFolders, folders) => {
  const common = sharedPrefixLength(currentFolders, folders);
  return { up: currentFolders.length - common, down: folders.length - common };
};

const folderKey = (folders) => folders.map((f) => f.name).join(FOLDER_SEPARATOR);

const folderLabel = (folders, isCurrent) => {
  if (isCurrent) return CURRENT_FOLDER_LABEL;
  return folderKey(folders) || ROOT_FOLDER_LABEL;
};

const compareEntries = (a, b) => (
  a.up - b.up
  || a.down - b.down
  || a.key.localeCompare(b.key)
  || (b.file.updatedAt ?? 0) - (a.file.updatedAt ?? 0)
);

/**
 * 可引用的文档：排除当前文档和已引用的文档，按离当前文档的远近排序。
 * 返回 [{ file, group }]，同一目录的文档挨在一起，group 是目录名。
 */
export const rankLinkableDocs = (entries, currentFileId, linkedNames = new Set()) => {
  const current = entries.find((entry) => entry.file.id === currentFileId);
  const currentFolders = current?.folders ?? [];
  return entries
    .filter(({ file }) => file.id !== currentFileId && !linkedNames.has(stripMd(file.name)))
    .map(({ file, folders }) => {
      const { up, down } = proximity(currentFolders, folders);
      return { file, up, down, key: folderKey(folders), group: folderLabel(folders, up === 0 && down === 0) };
    })
    .sort(compareEntries)
    .map(({ file, group }) => ({ file, group }));
};

/** 正文里已经 [[引用]] 过的文档名（去掉 .md，便于和文件名比较） */
export const collectLinkedNames = (text) => new Set(findWikilinks(String(text ?? '')).map((m) => stripMd(m.name)));

/** 空查询列出全部；有查询时按标题或目录匹配（不区分大小写），保持原有排序 */
export const matchDocs = (items, query) => {
  const q = String(query ?? '').trim().toLowerCase();
  if (!q) return items;
  return items.filter(({ file, group }) => (
    docTitle(file).toLowerCase().includes(q) || group.toLowerCase().includes(q)
  ));
};

/** 按 [[名称]] 找文档：名称和文件名（带或不带 .md）完全一致，与反向链接解析规则相同 */
export const findDocByWikiName = (entries, name) => {
  const target = String(name ?? '').trim();
  if (!target) return null;
  const hit = entries.find(({ file }) => file.name === target || stripMd(file.name) === target);
  return hit?.file ?? null;
};
