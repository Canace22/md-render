/**
 * 内容库（~/Documents/MdRender）里「文件为真相」的数据文件读写：
 * Daily/*.md、Todo.md、Canvas/白板.*、.agent/memory/editorial.md、.agent/migration/state.json。
 *
 * 只允许白名单里的相对路径，防止 renderer 借这个通道读写任意文件。
 */

import fsp from 'fs/promises';
import path from 'path';
import { DAILY_DIR_NAME, TODO_FILE_NAME, parseDailyFileName } from '@shared/migration/dailyFormat.js';
import { CARD_CANVAS_PATH, EXCALIDRAW_CANVAS_PATH } from '@shared/migration/canvasFormat.js';
import { EDITORIAL_MEMORY_PATH } from '@shared/migration/memoryMerge.js';

export const MIGRATION_DIR = '.agent/migration';
export const VAULT_STATE_PATH = `${MIGRATION_DIR}/state.json`;
export const MIGRATION_STATE_VERSION = 1;
export const MIGRATION_STEPS = Object.freeze(['memory', 'daily', 'canvas', 'docs', 'artifacts']);

const DAILY_PATH_RE = /^Daily\/\d{4}-\d{2}-\d{2}\.md$/;
const FIXED_TEXT_PATHS = new Set([TODO_FILE_NAME, CARD_CANVAS_PATH, EXCALIDRAW_CANVAS_PATH, EDITORIAL_MEMORY_PATH]);
const MISSING = 'ENOENT';

export const isAllowedVaultTextPath = (relativePath) => {
  const rel = String(relativePath ?? '');
  return FIXED_TEXT_PATHS.has(rel) || DAILY_PATH_RE.test(rel);
};

/** 相对路径 → 绝对路径，确保不越出内容库 */
export const resolveVaultPath = (vaultRoot, relativePath) => {
  const root = path.resolve(vaultRoot);
  const target = path.resolve(root, relativePath);
  const rel = path.relative(root, target);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) throw new Error(`路径不在内容库内：${relativePath}`);
  return target;
};

export async function readTextIfExists(filePath) {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === MISSING) return null;
    throw error;
  }
}

export async function writeTextFile(filePath, content) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, content, 'utf8');
}

/* ── 迁移状态 ─────────────────────────────────────────────── */

export const createEmptyMigrationState = () => ({ version: MIGRATION_STATE_VERSION, storageSource: 'legacy', steps: {} });

export async function readMigrationState(vaultRoot) {
  const raw = await readTextIfExists(resolveVaultPath(vaultRoot, VAULT_STATE_PATH));
  if (!raw) return createEmptyMigrationState();
  try {
    const parsed = JSON.parse(raw);
    return { ...createEmptyMigrationState(), ...parsed, steps: parsed?.steps ?? {} };
  } catch {
    return createEmptyMigrationState();
  }
}

export async function writeMigrationState(vaultRoot, state) {
  await writeTextFile(resolveVaultPath(vaultRoot, VAULT_STATE_PATH), `${JSON.stringify(state, null, 2)}\n`);
  return state;
}

/** 某一步是否已切到文件存储（回滚后为 false） */
export const isStepOnFiles = (state, step) => state?.storageSource === 'files' && Boolean(state?.steps?.[step]?.done);

/* ── 白名单文本读写 ──────────────────────────────────────── */

export async function readVaultText(vaultRoot, relativePath) {
  if (!isAllowedVaultTextPath(relativePath)) throw new Error(`不允许读取：${relativePath}`);
  return readTextIfExists(resolveVaultPath(vaultRoot, relativePath));
}

export async function writeVaultText(vaultRoot, relativePath, content, { onBeforeWrite } = {}) {
  if (!isAllowedVaultTextPath(relativePath)) throw new Error(`不允许写入：${relativePath}`);
  const filePath = resolveVaultPath(vaultRoot, relativePath);
  onBeforeWrite?.(filePath);
  await writeTextFile(filePath, String(content ?? ''));
  return filePath;
}

/** Daily 目录下所有日记 + Todo.md */
export async function readDailyFiles(vaultRoot) {
  const dir = resolveVaultPath(vaultRoot, DAILY_DIR_NAME);
  let names = [];
  try {
    names = await fsp.readdir(dir);
  } catch (error) {
    if (error.code !== MISSING) throw error;
  }
  const dailyFiles = await Promise.all(names.filter((name) => parseDailyFileName(name)).map(async (fileName) => ({
    fileName,
    content: await fsp.readFile(path.join(dir, fileName), 'utf8'),
  })));
  const todoContent = (await readTextIfExists(resolveVaultPath(vaultRoot, TODO_FILE_NAME))) ?? '';
  return { dailyFiles, todoContent };
}

export async function readCanvasFiles(vaultRoot) {
  return {
    canvasContent: (await readTextIfExists(resolveVaultPath(vaultRoot, CARD_CANVAS_PATH))) ?? '',
    excalidrawContent: (await readTextIfExists(resolveVaultPath(vaultRoot, EXCALIDRAW_CANVAS_PATH))) ?? '',
  };
}
