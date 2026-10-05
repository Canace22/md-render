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
