/**
 * 外部（Obsidian、Claude Code、Hermes）新建的 Markdown 没有稳定 id：补写 frontmatter `id`。
 * 只处理 Projects/ 下的 .md，frontmatter 解析失败的文件不碰（交给 U7 提示）。
 */

import fsp from 'fs/promises';
import path from 'path';
import { parseFrontmatterDocument, updateFrontmatterInMarkdown } from '../../shared/frontmatterDocument.js';

const PROJECTS_DIR = 'Projects';
const MARKDOWN_RE = /\.(md|markdown)$/i;
const ID_RADIX = 36;
const ID_RANDOM_LENGTH = 6;

export const createDocId = (now = Date.now(), random = Math.random) =>
  `doc-${now.toString(ID_RADIX)}-${random().toString(ID_RADIX).slice(2, 2 + ID_RANDOM_LENGTH)}`;

const FRONTMATTER_BLOCK_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** 开头有成对的 --- 块、里面有内容，却一个 key 都解析不出来：认为 frontmatter 格式坏了 */
export const isBrokenFrontmatter = (raw) => {
  const match = String(raw ?? '').match(FRONTMATTER_BLOCK_RE);
  if (!match || !match[1].trim()) return false;
  return !parseFrontmatterDocument(String(raw)).hasFrontmatter;
};

/** 给缺 id 的 Markdown 补 id；返回新内容，不需要改时返回 null */
export const withEnsuredId = (raw, createId = createDocId) => {
  if (isBrokenFrontmatter(raw)) return null;
  const doc = parseFrontmatterDocument(raw);
  if (typeof doc.frontmatter.id === 'string' && doc.frontmatter.id.trim()) return null;
  return updateFrontmatterInMarkdown(raw, { id: createId() });
};

/**
 * @returns {Promise<string[]>} 补了 id 的相对路径
 */
export async function ensureFrontmatterIds(vaultRoot, { markIgnored = () => {}, createId = createDocId } = {}) {
  const fixed = [];
  const walk = async (dir) => {
    let entries = [];
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (entry.isFile() && MARKDOWN_RE.test(entry.name)) {
        const next = withEnsuredId(await fsp.readFile(full, 'utf8'), createId);
        if (next == null) continue;
        markIgnored(full);
        await fsp.writeFile(full, next, 'utf8');
        fixed.push(path.relative(vaultRoot, full).split(path.sep).join('/'));
      }
    }
  };
  await walk(path.join(vaultRoot, PROJECTS_DIR));
  return fixed;
}
