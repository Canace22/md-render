/**
 * 内置文档 → 内容库真文件的迁移计划（纯函数，预演和正式执行共用）。
 *
 * - 落点：Projects/内置文档/<原目录结构>/<文件名>.md
 * - 文件名清洗沿用 mdSync 的规则；全库重名（不分大小写）加 ` (2)`、` (3)`，和磁盘已有文件撞名也一样处理
 * - 改了名的文档：原名写进 aliases，全库 `[[旧名]]` 改写成 `[[新名|旧名]]`，显示文字不变
 * - 原 id 写进 frontmatter `id`；元数据全部进 frontmatter；关联字段写成指向新路径的 wikilink
 * - 正文里的 base64 图片抽到同目录 assets/，同一张图只存一份
 */

import { metadataToFrontmatterPatch, pickCustomProperties } from '../properties.js';
import { parseFrontmatterDocument, updateFrontmatterInMarkdown } from '../frontmatterDocument.js';
import { hashContent } from '../capabilities/contentHash.js';

export const BUILTIN_DOCS_DIR = 'Projects/内置文档';
const MAX_NAME_LENGTH = 100;
const UNTITLED = 'untitled';
const MARKDOWN_EXT_RE = /\.(md|markdown)$/i;
const WIKILINK_RE = /\[\[([^\]|#]+)(#[^\]|]*)?(?:\|([^\]]*))?\]\]/g;
const DATA_IMAGE_RE = /data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)/gi;
const IMAGE_EXTENSIONS = Object.freeze({ png: 'png', jpeg: 'jpg', jpg: 'jpg', gif: 'gif', webp: 'webp', 'svg+xml': 'svg', svg: 'svg' });
const ASSETS_DIR = 'assets';

export const sanitizeFileName = (name) => String(name ?? '')
  .replace(/[/\\:*?"<>|]/g, '_')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, MAX_NAME_LENGTH) || UNTITLED;

const stripMarkdownExt = (name) => String(name ?? '').replace(MARKDOWN_EXT_RE, '');

const isBuiltinNode = (node) => node && !node.projectRootPath && !node.relativePath;
const isHiddenNode = (node) => node?.agentMetaFolder === true || String(node?.name ?? '').startsWith('.');

/** 深度优先收集内置文档与文件夹（跳过磁盘挂载节点、隐藏目录） */
const collectBuiltinNodes = (root) => {
  const files = [];
  const folders = [];
  const walk = (node, dirSegments) => {
    (node?.children ?? []).forEach((child) => {
      if (!isBuiltinNode(child) || isHiddenNode(child)) return;
      if (child.type === 'folder') {
        const segments = [...dirSegments, sanitizeFileName(child.name)];
        folders.push({ id: child.id, segments });
        walk(child, segments);
      } else if (child.type === 'file') {
        files.push({ node: child, dirSegments });
      }
    });
  };
  walk(root, []);
  return { files, folders };
};

/** 全库唯一文件名：撞名（含磁盘已有）加 (n) */
const createNameAllocator = (existingNames = []) => {
  const taken = new Set(existingNames.map((name) => name.toLowerCase()));
  return (base) => {
    let candidate = base;
    for (let index = 2; taken.has(candidate.toLowerCase()); index += 1) candidate = `${base} (${index})`;
    taken.add(candidate.toLowerCase());
    return candidate;
  };
};

/** 和 syncAllLinks 一致：同名后出现的覆盖先出现的，带不带 .md 都能查到 */
const buildNameResolver = (files) => {
  const nameToId = new Map();
  files.forEach(({ node }) => {
    nameToId.set(node.name, node.id);
    if (MARKDOWN_EXT_RE.test(node.name)) nameToId.set(stripMarkdownExt(node.name), node.id);
  });
  return (name) => nameToId.get(name) ?? nameToId.get(`${name}.md`);
};

/**
 * 改写 wikilink：目标改了名就换成 [[新名|原显示文字]]
 * @returns {{ content: string, rewrites: Array<{ from: string, to: string }> }}
 */
export const rewriteWikilinks = (content, resolveTargetName) => {
  const rewrites = [];
  const next = String(content ?? '').replace(WIKILINK_RE, (whole, rawName, heading = '', alias) => {
    const name = rawName.trim();
    const newName = resolveTargetName(name);
    if (!newName || newName === name) return whole;
    rewrites.push({ from: name, to: newName });
    return `[[${newName}${heading}|${alias ?? name}]]`;
  });
  return { content: next, rewrites };
};

/**
 * 抽出 base64 图片
 * @returns {{ content: string, assets: Array<{ fileName: string, base64: string, bytes: number }> }}
 */
export const extractBase64Images = (content) => {
  const assets = new Map();
  const next = String(content ?? '').replace(DATA_IMAGE_RE, (whole, mime, data) => {
    const ext = IMAGE_EXTENSIONS[mime.toLowerCase()];
    if (!ext) return whole;
    const base64 = data.replace(/\s+/g, '');
    const fileName = `img-${hashContent(base64).replace('-', '')}.${ext}`;
    if (!assets.has(fileName)) assets.set(fileName, { fileName, base64, bytes: Math.floor((base64.length * 3) / 4) });
    return `${ASSETS_DIR}/${fileName}`;
  });
  return { content: next, assets: [...assets.values()] };
};

/** 节点上的元数据（和 store 写本地项目元数据时取的字段一致） */
const pickNodeMetadata = (node) => {
  const frontmatter = node.frontmatter ?? {};
  const pick = (field, key) => (Object.prototype.hasOwnProperty.call(frontmatter, key)
    ? { [field]: frontmatter[key] }
    : (node[field] != null ? { [field]: node[field] } : {}));
  return {
    ...pick('title', 'title'),
    ...pick('sourceAuthor', 'author'),
    ...pick('sourcePublishedAt', 'published'),
    ...pick('createdAt', 'created'),
    nodeType: node.nodeType,
    summary: node.summary,
    cover: node.cover,
    url: node.url,
    aliases: node.aliases,
    relatedIds: node.relatedIds,
    draftStatus: node.draftStatus,
    targetPlatforms: node.targetPlatforms,
    scheduledPublishAt: node.scheduledPublishAt,
    sourceMaterialIds: node.sourceMaterialIds,
    tags: node.tags,
    customProperties: pickCustomProperties(frontmatter),
  };
};

const withoutEmpty = (patch) => Object.fromEntries(Object.entries(patch).filter(([, value]) => (
  value != null && value !== '' && !(Array.isArray(value) && value.length === 0)
)));

/**
 * 生成整份迁移计划。
 * @param {object} workspace 工作区树（BlockNote 旧格式正文须已由调用方转成 Markdown）
 * @param {{ existingNames?: string[] }} [options] 内容库里已有的 Markdown 文件名（不含扩展名），用于避让
 */
export const planBuiltinDocsMigration = (workspace, { existingNames = [] } = {}) => {
  const { files, folders } = collectBuiltinNodes(workspace);
  const allocate = createNameAllocator(existingNames);
  const resolveName = buildNameResolver(files);

  // 第一遍：定文件名和路径
  const targets = new Map();
  files.forEach(({ node, dirSegments }) => {
    const originalBase = stripMarkdownExt(node.name) || UNTITLED;
    const base = allocate(sanitizeFileName(originalBase));
    const dir = [BUILTIN_DOCS_DIR, ...dirSegments].join('/');
    targets.set(node.id, { node, dir, base, originalBase, relativePath: `${dir}/${base}.md` });
  });

  const idToPath = Object.fromEntries([...targets].map(([id, target]) => [id, target.relativePath]));
  const relation = { idToPath: (id) => idToPath[id] ?? String(id ?? '') };
  const resolveTargetName = (name) => targets.get(resolveName(name))?.base;

  // 第二遍：生成正文
  const docs = [];
  const linkRewrites = [];
  targets.forEach((target) => {
    const { node } = target;
    const renamed = target.base !== target.originalBase;
    const parsed = parseFrontmatterDocument(String(node.content ?? ''));
    const links = rewriteWikilinks(parsed.content, resolveTargetName);
    const images = extractBase64Images(links.content);
    const metadata = pickNodeMetadata(node);
    if (renamed) metadata.aliases = [...new Set([...(metadata.aliases ?? []), target.originalBase])];

    const patch = {
      id: node.id,
      ...parsed.frontmatter,
      ...withoutEmpty(metadataToFrontmatterPatch(metadata, relation)),
    };
    const content = updateFrontmatterInMarkdown(images.content, patch);
    docs.push({
      legacyId: node.id,
      originalName: node.name,
      relativePath: target.relativePath,
      renamed,
      content,
      contentHash: hashContent(content),
      assets: images.assets.map((asset) => ({ ...asset, relativePath: `${target.dir}/${ASSETS_DIR}/${asset.fileName}` })),
    });
    if (links.rewrites.length) linkRewrites.push({ relativePath: target.relativePath, rewrites: links.rewrites });
  });

  const assets = docs.flatMap((doc) => doc.assets);
  return {
    docs,
    folders: folders.map((folder) => [BUILTIN_DOCS_DIR, ...folder.segments].join('/')),
    renames: docs.filter((doc) => doc.renamed).map((doc) => ({ legacyId: doc.legacyId, from: doc.originalName, to: doc.relativePath })),
    linkRewrites,
    assetStats: {
      count: new Set(assets.map((asset) => asset.relativePath)).size,
      bytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    },
    idToPath,
  };
};
