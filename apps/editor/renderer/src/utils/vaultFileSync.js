/**
 * 迁移后 Daily / 白板「写回文件」的增量计算：只写内容变了的文件，消失的日记写成空记录（不删文件）。
 * 纯函数，方便单测；真正的读写在 hooks/useVaultStorage.js。
 */

import { DAILY_DIR_NAME, TODO_FILE_NAME, serializeDailyEntry, serializeDailyWorkspace } from '@shared/migration/dailyFormat.js';
import { serializeCanvasState } from '@shared/migration/canvasFormat.js';

const DAILY_PATH_RE = /^Daily\/(\d{4}-\d{2}-\d{2})\.md$/;

const toMap = (files) => new Map(files.map((file) => [file.relativePath, file.content]));

/** dailyWorkspace → { 相对路径: 内容 } */
export const buildDailyFileMap = (dailyWorkspace) => toMap(serializeDailyWorkspace(dailyWorkspace));

/**
 * 读完文件后的「已写过」缓存：以当前状态为准，避免一加载就把所有文件重写一遍；
 * 但 Todo.md 记磁盘原样——旧待办已并进今天，下次写回时要把它改成「已并入」说明，否则会被反复并入。
 */
export const buildLoadedDailyCache = (dailyWorkspace, diskMap) => {
  const cache = buildDailyFileMap(dailyWorkspace);
  cache.set(TODO_FILE_NAME, diskMap.get(TODO_FILE_NAME) ?? '');
  return cache;
};

export const buildCanvasFileMap = (canvasState) => toMap(serializeCanvasState(canvasState ?? {}));

/**
 * 对比上次写过的内容，返回要写的文件。
 * 上次有、这次没有的日记：写成空记录，保留文件（不删用户数据）。
 */
export const diffFileMaps = (previous, next) => {
  const writes = [];
  next.forEach((content, relativePath) => {
    if (previous.get(relativePath) !== content) writes.push({ relativePath, content });
  });
  previous.forEach((_content, relativePath) => {
    if (next.has(relativePath)) return;
    const dateKey = relativePath.match(DAILY_PATH_RE)?.[1];
    if (dateKey) writes.push({ relativePath, content: serializeDailyEntry({ date: dateKey, blocks: [] }) });
  });
  return writes;
};

/** 读回来的文件内容 → 和 buildDailyFileMap 同形状的 map，用于判断外部有没有改 */
export const dailyFilesToMap = ({ dailyFiles = [], todoContent = '' }) => new Map([
  ...dailyFiles.map(({ fileName, content }) => [`${DAILY_DIR_NAME}/${fileName}`, content]),
  [TODO_FILE_NAME, todoContent],
]);
