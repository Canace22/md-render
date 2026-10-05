/**
 * 读取内容库里的产品 skill 文件（MdRender/.agents/skills/<name>/），并监听变化。
 *
 * 只读原始文本，不解析：解析在 renderer 的 core/agent/skillRegistry.js（纯函数，和内置 skill 共用）。
 * 内置 skill 在 renderer 构建期内联，这里不管。
 */

import fs from 'fs';
import fsp from 'fs/promises';
import path from 'path';

export const SKILL_FILE_NAME = 'SKILL.md';
export const SKILL_MANIFEST_PATH = path.join('agents', 'md-render.yaml');
export const VAULT_SKILLS_DIR = path.join('.agents', 'skills');
const WATCH_DEBOUNCE_MS = 300;
const MISSING_CODES = new Set(['ENOENT', 'ENOTDIR']);

export const getVaultSkillsDir = (vaultRootPath) => path.join(vaultRootPath, VAULT_SKILLS_DIR);

const readTextIfExists = async (filePath) => {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (MISSING_CODES.has(error.code)) return null;
    throw error;
  }
};

/** 读一个 skill 目录；没有 SKILL.md 返回 null，读失败返回带 error 的记录 */
const readSkillEntry = async (skillsDir, dirName) => {
  const skillDir = path.join(skillsDir, dirName);
  const skillPath = path.join(skillDir, SKILL_FILE_NAME);
  try {
    const skillMarkdown = await readTextIfExists(skillPath);
    if (skillMarkdown == null) return null;
    const manifestYaml = await readTextIfExists(path.join(skillDir, SKILL_MANIFEST_PATH));
    return { dirName, skillPath, skillMarkdown, manifestYaml };
  } catch (error) {
    return { dirName, skillPath, error: error.message };
  }
};

/**
 * 列出目录下所有 skill 的原始文本，按目录名排序。目录不存在返回空数组。
 * @returns {Promise<Array<{ dirName, skillPath, skillMarkdown?, manifestYaml?, error? }>>}
 */
export async function readSkillEntries(skillsDir) {
  let names;
  try {
    names = await fsp.readdir(skillsDir);
  } catch (error) {
    if (MISSING_CODES.has(error.code)) return [];
    throw error;
  }
  const visible = names.filter((name) => !name.startsWith('.')).sort((a, b) => a.localeCompare(b));
  const entries = await Promise.all(visible.map((name) => readSkillEntry(skillsDir, name)));
  return entries.filter(Boolean);
}

/**
 * 监听 skill 目录（含子目录），变化后防抖回调。目录不存在时先建好。
 * @returns {() => void} 停止监听
 */
export function watchSkillsDir(skillsDir, onChanged) {
  let timer = null;
  let watcher = null;
  try {
    fs.mkdirSync(skillsDir, { recursive: true });
    watcher = fs.watch(skillsDir, { recursive: true }, () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        onChanged();
      }, WATCH_DEBOUNCE_MS);
    });
    watcher.on('error', (error) => console.error('[skills-watch] watcher error:', skillsDir, error));
  } catch (error) {
    console.error('[skills-watch] failed to watch:', skillsDir, error);
  }

  return () => {
    if (timer) clearTimeout(timer);
    watcher?.close();
  };
}

const SKILL_DIR_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

const pathExists = async (target) => {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
};

/**
 * 在 skill 目录下写一个 skill（SKILL.md + 可选 agents/md-render.yaml）。
 * 已存在且不允许覆盖时不改动，直接返回已有路径（existed=true）。
 * @returns {Promise<{ skillPath: string, existed: boolean }>}
 */
export async function writeSkillFiles(skillsDir, { dirName, skillMarkdown, manifestYaml }, { overwrite = false } = {}) {
  if (!SKILL_DIR_NAME_RE.test(String(dirName ?? ''))) throw new Error(`skill 目录名不合法：${dirName}`);
  if (!String(skillMarkdown ?? '').trim()) throw new Error('SKILL.md 内容为空');

  const skillDir = path.join(skillsDir, dirName);
  const skillPath = path.join(skillDir, SKILL_FILE_NAME);
  if (!overwrite && await pathExists(skillPath)) return { skillPath, existed: true };

  await fsp.mkdir(path.join(skillDir, path.dirname(SKILL_MANIFEST_PATH)), { recursive: true });
  await fsp.writeFile(skillPath, skillMarkdown, 'utf8');
  if (manifestYaml) await fsp.writeFile(path.join(skillDir, SKILL_MANIFEST_PATH), manifestYaml, 'utf8');
  return { skillPath, existed: false };
}

/** 目标路径是否在 skill 目录内（防止打开任意文件） */
export const isInsideSkillsDir = (skillsDir, targetPath) => {
  const relative = path.relative(path.resolve(skillsDir), path.resolve(String(targetPath ?? '')));
  return Boolean(relative) && !relative.startsWith('..') && !path.isAbsolute(relative);
};
