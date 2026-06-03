import { findNodeById } from '../store/workspaceUtils.js';
import { normalizeMarkdown } from './markdownUtils.js';

function findDiskFileContentInNode(node, relativePath) {
  if (!node || !relativePath) return undefined;
  if (node.type === 'file' && node.relativePath === relativePath) {
    return node.content ?? '';
  }
  if (node.type === 'folder' && Array.isArray(node.children)) {
    for (const child of node.children) {
      const found = findDiskFileContentInNode(child, relativePath);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

export function getDiskFileContent(diskPayload, relativePath, isTreeMount) {
  if (!diskPayload || !relativePath) return undefined;
  if (isTreeMount && diskPayload.workspace) {
    return findDiskFileContentInNode(diskPayload.workspace, relativePath);
  }
  if (Array.isArray(diskPayload.projectsChildren)) {
    for (const child of diskPayload.projectsChildren) {
      const found = findDiskFileContentInNode(child, relativePath);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/**
 * 检测「待写入磁盘」的文件是否与外部磁盘内容冲突
 * @returns {Array<{ fileId, fileName, relativePath, localContent, diskContent, deletedOnDisk }>}
 */
export function detectLocalProjectConflicts(state, diskPayload, projectRootPath, isTreeMount) {
  const pendingIds = Object.keys(state.diskSavePendingFileIds ?? {});
  if (pendingIds.length === 0) return [];

  const conflicts = [];
  for (const fileId of pendingIds) {
    const localNode = findNodeById(state.workspace, fileId);
    if (!localNode || localNode.type !== 'file') continue;
    if (localNode.projectRootPath && localNode.projectRootPath !== projectRootPath) continue;

    const relativePath = localNode.relativePath;
    if (!relativePath) continue;

    const localContent = fileId === state.selectedId
      ? state.markdown
      : (localNode.content ?? '');
    const diskContent = getDiskFileContent(diskPayload, relativePath, isTreeMount);
    const deletedOnDisk = diskContent === undefined;

    if (!deletedOnDisk
      && normalizeMarkdown(localContent) === normalizeMarkdown(diskContent)) {
      continue;
    }

    conflicts.push({
      fileId,
      fileName: localNode.name,
      relativePath,
      localContent,
      diskContent: deletedOnDisk ? '' : diskContent,
      deletedOnDisk,
    });
  }

  return conflicts;
}
