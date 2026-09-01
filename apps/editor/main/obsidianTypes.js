/**
 * 同步 Obsidian 的属性类型定义（<vault>/.obsidian/types.json）。
 * Obsidian 自己就用这个文件记录每个属性是 date / tags / checkbox …，
 * 写进去以后在 Obsidian 的属性面板里类型也对得上。
 *
 * 原则：只增量合并我们管的 key，别人写的条目一律不动；解析失败就跳过，
 * 绝不覆盖用户的配置文件。
 */

import fs from 'fs/promises';
import path from 'path';
import { buildObsidianTypeMap } from '../shared/properties.js';

const OBSIDIAN_DIR_NAME = '.obsidian';
const TYPES_FILENAME = 'types.json';

const readTypesFile = async (filePath) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    if (error?.code === 'ENOENT') return { types: {} };
    return null; // 文件坏了或不是 JSON：不碰
  }
};

/**
 * @param {string} projectRootPath vault 根目录
 * @param {string[]} keys 本次实际写入的属性 key，只同步这些
 */
export async function syncObsidianPropertyTypes(projectRootPath, keys = []) {
  if (!projectRootPath || keys.length === 0) return { ok: false, skipped: true };

  const filePath = path.join(projectRootPath, OBSIDIAN_DIR_NAME, TYPES_FILENAME);
  const existing = await readTypesFile(filePath);
  if (!existing) return { ok: false, skipped: true };

  const known = buildObsidianTypeMap();
  const currentTypes = existing.types && typeof existing.types === 'object' ? existing.types : {};
  const nextTypes = { ...currentTypes };

  let changed = false;
  keys.forEach((key) => {
    const type = known[key];
    // 用户已经手动指定过类型的属性，尊重用户的选择
    if (!type || nextTypes[key] === type || nextTypes[key]) return;
    nextTypes[key] = type;
    changed = true;
  });

  if (!changed) return { ok: true, changed: false };

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify({ ...existing, types: nextTypes }, null, 2)}\n`, 'utf8');
  return { ok: true, changed: true };
}
