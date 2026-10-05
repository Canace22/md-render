/**
 * 主进程里缓存的迁移状态：db:save 每次都要判断「内置文档是否已迁到文件」，不能每次读盘。
 */

import { createEmptyMigrationState, isStepOnFiles, readMigrationState } from './vaultFiles.js';

let cached = createEmptyMigrationState();

export async function refreshMigrationStateCache(vaultRoot) {
  try {
    cached = await readMigrationState(vaultRoot);
  } catch {
    cached = createEmptyMigrationState();
  }
  return cached;
}

export const setMigrationStateCache = (state) => {
  cached = state ?? createEmptyMigrationState();
};

export const getMigrationStateCache = () => cached;

export const isStepOnFilesCached = (step) => isStepOnFiles(cached, step);
