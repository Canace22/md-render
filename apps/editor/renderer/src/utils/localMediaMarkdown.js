/**
 * 编辑器显示用 local-media://，磁盘 Markdown 用相对路径（Obsidian 可识别）。
 * 打开时把 Obsidian 图片嵌入 ![[file.png]] 转成标准 ![]()，普通 wikilink 不动。
 * renderer 不能用 Node path，这里只用 POSIX 字符串运算。
 */

import { getDesktopPlatform } from '../services/desktopBridge.js';

const LOCAL_MEDIA_SCHEME = 'local-media:';
const TAURI_WINDOWS_LOCAL_MEDIA_ORIGIN = 'http://local-media.localhost';
const TAURI_MOUNT_ID_RE = /^tauri-(?:ro|rw):v1:[^/\\]+$/;
const TAURI_LOCAL_MEDIA_RE = /^(?:local-media:\/\/localhost|https?:\/\/local-media\.localhost)\/tauri\/v1\/([A-Za-z0-9_-]+)\/([A-Za-z0-9_-]+)$/i;
const LOCAL_MEDIA_CAPABILITY_URL_RE = /^(?:local-media:\/\/|https?:\/\/local-media\.localhost\/)/i;
const TAURI_MOUNT_TOKEN_RE = /tauri-(?:ro|rw):v1:[A-Za-z0-9_-]+/i;
const REMOTE_OR_EMBEDDED_RE = /^(https?:|data:|blob:)/i;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>\n]+>|[^\s)]+)((?:\s+"[^"]*")?)\s*\)/g;
const WIKI_IMAGE_EMBED_RE = /!\[\[([^\]\n]+?)\]\]/g;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const WIKI_SIZE_ALIAS_RE = /^\d+(?:x\d+)?$/i;
const LEGACY_SHARED_ASSETS_DIR = 'assets';

export const encodeLocalMediaPath = (value) => String(value ?? '')
  .replace(/\\/g, '/')
  .split('/')
  .map((segment) => encodeURIComponent(segment))
  .join('/');

export const isLocalMediaUrl = (url = '') => String(url).toLowerCase().startsWith(LOCAL_MEDIA_SCHEME);

const isTauriMountId = (value) => TAURI_MOUNT_ID_RE.test(String(value ?? ''));

const getTauriLocalMediaOrigin = () => (
  getDesktopPlatform() === 'win32'
    ? TAURI_WINDOWS_LOCAL_MEDIA_ORIGIN
    : `${LOCAL_MEDIA_SCHEME}//localhost`
);

const encodeOpaqueToken = (value) => {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const decodeOpaqueToken = (token) => {
  if (!token || !/^[A-Za-z0-9_-]+$/.test(token)) return '';
  const base64 = token.replace(/-/g, '+').replace(/_/g, '/');
  const padded = `${base64}${'='.repeat((4 - (base64.length % 4)) % 4)}`;
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return '';
  }
};

const parseCurrentTauriLocalMediaUrl = (url) => {
  const match = TAURI_LOCAL_MEDIA_RE.exec(String(url ?? '').trim());
  if (!match) return null;
  const mountId = decodeOpaqueToken(match[1]);
  const relativePath = decodeOpaqueToken(match[2]);
  if (!isTauriMountId(mountId) || !relativePath) return null;
  return { mountId, relativePath };
};

// 兼容早期 Tauri 预览产生过的 local-media://<mount-id>/<relative-path> 内存地址。
const parseLegacyTauriLocalMediaUrl = (url) => {
  const text = String(url ?? '').trim();
  if (!/^local-media:\/\//i.test(text)) return null;
  const payload = text.replace(/^local-media:\/\//i, '');
  const separator = payload.indexOf('/');
  if (separator <= 0) return null;
  try {
    const mountId = decodeURIComponent(payload.slice(0, separator));
    const relativePath = payload.slice(separator + 1)
      .split('/')
      .map((segment) => decodeURIComponent(segment))
      .join('/');
    if (!isTauriMountId(mountId) || !relativePath) return null;
    return { mountId, relativePath };
  } catch {
    return null;
  }
};

const parseTauriLocalMediaUrl = (url) => (
  parseCurrentTauriLocalMediaUrl(url) ?? parseLegacyTauriLocalMediaUrl(url)
);

const unwrapUrl = (value) => {
  let text = String(value ?? '').trim();
  const hasWrappingPair = (start, end) => text.startsWith(start) && text.endsWith(end);
  if (hasWrappingPair('<', '>')) text = text.slice(1, -1).trim();
  if (hasWrappingPair('"', '"') || hasWrappingPair("'", "'")) {
    text = text.slice(1, -1).trim();
  }
  return text;
};

export const assertNoLocalMediaCapabilityUrl = (value) => {
  if (LOCAL_MEDIA_CAPABILITY_URL_RE.test(unwrapUrl(value))) {
    throw new Error('内容仍引用临时本地媒体授权地址，请先将素材复制到当前项目后再保存。');
  }
  return value;
};

export const assertNoTauriMountTokens = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (TAURI_MOUNT_TOKEN_RE.test(text ?? '')) {
    throw new Error('本地项目快照仍包含临时目录授权，已阻止持久化。');
  }
  return value;
};

export const decodeLocalMediaUrl = (url = '') => {
  const text = String(url).trim();
  if (!isLocalMediaUrl(text)) return '';
  const rest = text.replace(/^local-media:\/*/i, '');
  const decoded = rest.split('/').map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  }).join('/');
  if (!decoded) return '';
  if (/^[A-Za-z]:/.test(decoded)) return decoded;
  return decoded.startsWith('/') ? decoded : `/${decoded}`;
};

const toPosix = (value) => String(value ?? '').replace(/\\/g, '/');

const stripTrailingSlash = (value) => {
  const text = toPosix(value);
  if (!text || text === '/') return text;
  return text.replace(/\/+$/, '');
};

const posixJoin = (...parts) => {
  const tokens = parts.filter((part) => part != null && part !== '');
  if (tokens.length === 0) return '';
  const isAbs = toPosix(tokens[0]).startsWith('/');
  const stack = [];
  tokens.forEach((token) => {
    toPosix(token).split('/').forEach((segment) => {
      if (!segment || segment === '.') return;
      if (segment === '..') {
        if (stack.length > 0) stack.pop();
        return;
      }
      stack.push(segment);
    });
  });
  const joined = stack.join('/');
  if (isAbs) return joined ? `/${joined}` : '/';
  return joined;
};

const posixDirname = (filePath) => {
  const posix = stripTrailingSlash(toPosix(filePath));
  const index = posix.lastIndexOf('/');
  if (index < 0) return '';
  if (index === 0) return '/';
  return posix.slice(0, index);
};

const posixRelative = (fromDir, toPath) => {
  const fromSegs = toPosix(fromDir).split('/').filter(Boolean);
  const toSegs = toPosix(toPath).split('/').filter(Boolean);
  let index = 0;
  while (index < fromSegs.length && index < toSegs.length && fromSegs[index] === toSegs[index]) {
    index += 1;
  }
  const ups = fromSegs.slice(index).map(() => '..');
  const downs = toSegs.slice(index);
  return [...ups, ...downs].join('/') || toSegs[toSegs.length - 1] || '';
};

const normalizeProjectRelativePath = (baseDir, targetPath) => {
  const target = toPosix(targetPath);
  if (!target || target.startsWith('/') || /^[A-Za-z]:/.test(target)) return '';
  const stack = toPosix(baseDir).split('/').filter(Boolean);
  for (const segment of target.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      if (stack.length === 0) return '';
      stack.pop();
      continue;
    }
    stack.push(segment);
  }
  return stack.join('/');
};

const toProjectRelativePath = (absPath, projectRootPath) => {
  const abs = stripTrailingSlash(toPosix(absPath));
  const root = stripTrailingSlash(toPosix(projectRootPath));
  if (!abs || !root) return '';
  if (abs.toLowerCase() === root.toLowerCase()) return '';
  if (!abs.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return '';
  return abs.slice(root.length + 1);
};

export const createLocalMediaUrl = (projectRootPath, projectRelativePath) => {
  if (isTauriMountId(projectRootPath)) {
    const relativePath = normalizeProjectRelativePath('', projectRelativePath);
    if (!relativePath) return '';
    return `${getTauriLocalMediaOrigin()}/tauri/v1/${encodeOpaqueToken(projectRootPath)}/${encodeOpaqueToken(relativePath)}`;
  }
  return `${LOCAL_MEDIA_SCHEME}//${encodeLocalMediaPath(posixJoin(projectRootPath, projectRelativePath))}`;
};

const resolveTauriProjectRelativePath = (src, projectRootPath, noteRelativePath) => {
  const parsed = parseTauriLocalMediaUrl(src);
  if (parsed) {
    if (parsed.mountId !== projectRootPath) return '';
    return normalizeProjectRelativePath('', parsed.relativePath);
  }
  if (isLocalMediaUrl(src) || REMOTE_OR_EMBEDDED_RE.test(src)) return '';
  return normalizeProjectRelativePath(posixDirname(noteRelativePath), src);
};

const resolveLegacySharedAssetPath = (src, noteRelativePath) => {
  if (isLocalMediaUrl(src) || REMOTE_OR_EMBEDDED_RE.test(src)) return '';
  const virtualNoteDir = posixJoin(
    'Projects',
    'project',
    posixDirname(noteRelativePath),
  );
  const virtualTarget = normalizeProjectRelativePath(virtualNoteDir, src);
  const assetsPrefix = `${LEGACY_SHARED_ASSETS_DIR}/`;
  return virtualTarget.startsWith(assetsPrefix)
    ? virtualTarget.slice(assetsPrefix.length)
    : '';
};

const legacySharedAssetDiskSrc = (assetRelativePath, noteRelativePath) => (
  posixRelative(
    posixJoin('Projects', 'project', posixDirname(noteRelativePath)),
    posixJoin(LEGACY_SHARED_ASSETS_DIR, assetRelativePath),
  )
);

const resolveSrcToAbsPath = (src, projectRootPath, noteRelativePath) => {
  if (isLocalMediaUrl(src)) return decodeLocalMediaUrl(src);
  const posixSrc = toPosix(src);
  if (posixSrc.startsWith('/') || /^[A-Za-z]:/.test(posixSrc)) return posixSrc;
  const noteDir = posixDirname(noteRelativePath);
  return posixJoin(projectRootPath, noteDir, posixSrc);
};

export const toDiskImageSrc = (
  src,
  projectRootPath,
  noteRelativePath,
  sharedAssetsMountId = '',
) => {
  if (!src || !projectRootPath) return src;
  if (isTauriMountId(projectRootPath)) {
    const parsed = parseTauriLocalMediaUrl(src);
    if (parsed && sharedAssetsMountId && parsed.mountId === sharedAssetsMountId) {
      return legacySharedAssetDiskSrc(parsed.relativePath, noteRelativePath);
    }
    if (parsed && parsed.mountId !== projectRootPath) {
      throw new Error('图片来自另一个本地项目，请先将素材复制到当前项目后再保存。');
    }
    const projectRelativePath = resolveTauriProjectRelativePath(
      src,
      projectRootPath,
      noteRelativePath,
    );
    if (projectRelativePath) {
      return posixRelative(posixDirname(noteRelativePath), projectRelativePath);
    }
    assertNoLocalMediaCapabilityUrl(src);
    return src;
  }
  if (REMOTE_OR_EMBEDDED_RE.test(src)) return src;
  const absPath = resolveSrcToAbsPath(src, projectRootPath, noteRelativePath);
  const projectRelativePath = toProjectRelativePath(absPath, projectRootPath);
  if (!projectRelativePath) return src;
  const fromDir = posixJoin(projectRootPath, posixDirname(noteRelativePath));
  const toPath = posixJoin(projectRootPath, projectRelativePath);
  return posixRelative(fromDir, toPath);
};

export const toEditorImageSrc = (
  src,
  projectRootPath,
  noteRelativePath,
  sharedAssetsMountId = '',
) => {
  if (!src || !projectRootPath) return src;
  if (isTauriMountId(projectRootPath)) {
    const sharedAssetPath = sharedAssetsMountId
      ? resolveLegacySharedAssetPath(src, noteRelativePath)
      : '';
    if (sharedAssetPath) {
      return createLocalMediaUrl(sharedAssetsMountId, sharedAssetPath);
    }
    const projectRelativePath = resolveTauriProjectRelativePath(
      src,
      projectRootPath,
      noteRelativePath,
    );
    return projectRelativePath
      ? createLocalMediaUrl(projectRootPath, projectRelativePath)
      : src;
  }
  if (REMOTE_OR_EMBEDDED_RE.test(src)) return src;
  const absPath = resolveSrcToAbsPath(src, projectRootPath, noteRelativePath);
  const projectRelativePath = toProjectRelativePath(absPath, projectRootPath);
  if (!projectRelativePath) return src;
  return createLocalMediaUrl(projectRootPath, projectRelativePath);
};

const posixBasename = (filePath) => {
  const posix = toPosix(filePath);
  const index = posix.lastIndexOf('/');
  return index < 0 ? posix : posix.slice(index + 1);
};

const formatMarkdownImage = (alt, src) => {
  const nextRaw = /[\s()]/.test(src) ? `<${src}>` : src;
  return `![${alt}](${nextRaw})`;
};

const parseWikiImageEmbed = (inner) => {
  const text = String(inner ?? '').trim();
  const pipeIndex = text.indexOf('|');
  const target = (pipeIndex >= 0 ? text.slice(0, pipeIndex) : text).trim();
  const alias = pipeIndex >= 0 ? text.slice(pipeIndex + 1).trim() : '';
  return {
    pathPart: target.split('#')[0].trim(),
    alias,
  };
};

const wikiImageAlt = (pathPart, alias) => {
  if (alias && !WIKI_SIZE_ALIAS_RE.test(alias)) return alias;
  return posixBasename(pathPart);
};

const resolveWikiImageAbsPath = (target, projectRootPath, noteRelativePath) => {
  const posixSrc = toPosix(target).replace(/^\/+/, '');
  if (!posixSrc || !projectRootPath) return '';
  if (posixSrc.includes('/')) return posixJoin(projectRootPath, posixSrc);
  return posixJoin(projectRootPath, posixDirname(noteRelativePath), posixSrc);
};

const toWikiImageSrc = (target, projectRootPath, noteRelativePath, forEditor) => {
  if (isTauriMountId(projectRootPath)) {
    const posixSrc = toPosix(target).replace(/^\/+/, '');
    const projectRelativePath = posixSrc.includes('/')
      ? normalizeProjectRelativePath('', posixSrc)
      : normalizeProjectRelativePath(posixDirname(noteRelativePath), posixSrc);
    if (!projectRelativePath) return '';
    if (forEditor) return createLocalMediaUrl(projectRootPath, projectRelativePath);
    return posixRelative(posixDirname(noteRelativePath), projectRelativePath);
  }
  const absPath = resolveWikiImageAbsPath(target, projectRootPath, noteRelativePath);
  const projectRelativePath = toProjectRelativePath(absPath, projectRootPath);
  if (!projectRelativePath) return '';
  if (forEditor) return createLocalMediaUrl(projectRootPath, projectRelativePath);
  const fromDir = posixJoin(projectRootPath, posixDirname(noteRelativePath));
  const toPath = posixJoin(projectRootPath, projectRelativePath);
  return posixRelative(fromDir, toPath);
};

const convertWikiImageEmbeds = (text, mapTarget) => text.replace(
  WIKI_IMAGE_EMBED_RE,
  (full, inner) => {
    const { pathPart, alias } = parseWikiImageEmbed(inner);
    if (!IMAGE_EXT_RE.test(pathPart)) return full;
    const nextSrc = mapTarget(pathPart);
    if (!nextSrc) return full;
    return formatMarkdownImage(wikiImageAlt(pathPart, alias), nextSrc);
  },
);

const replaceMarkdownImageUrls = (text, mapSrc) => text.replace(
  MARKDOWN_IMAGE_RE,
  (full, alt, rawSrc, titlePart = '') => {
    const wrapped = rawSrc.startsWith('<') && rawSrc.endsWith('>');
    const src = wrapped ? rawSrc.slice(1, -1) : rawSrc;
    const nextSrc = mapSrc(src);
    if (!nextSrc || nextSrc === src) return full;
    const nextRaw = /[\s()]/.test(nextSrc) ? `<${nextSrc}>` : nextSrc;
    return `![${alt}](${nextRaw}${titlePart})`;
  },
);

const mapOutsideCodeFences = (markdown, mapText) => {
  const lines = String(markdown ?? '').split('\n');
  let activeFence = null;
  return lines.map((line) => {
    const fenceMatch = line.match(/^\s*(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      if (!activeFence) {
        activeFence = { character: marker[0], length: marker.length };
      } else if (
        activeFence.character === marker[0]
        && marker.length >= activeFence.length
      ) {
        activeFence = null;
      }
      return line;
    }
    return activeFence ? line : mapText(line);
  }).join('\n');
};

const assertMarkdownDestinationsSafe = (text) => {
  const scannable = text.replace(/(`+)(.*?)\1/g, '');
  scannable.replace(
    /!?\[[^\]\n]*\]\(\s*(<[^>\n]+>|[^\s)]+)/g,
    (_full, destination) => {
      assertNoLocalMediaCapabilityUrl(destination);
      return _full;
    },
  );
  scannable.replace(
    /\b(?:src|href|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (_full, doubleQuoted, singleQuoted, unquoted) => {
      assertNoLocalMediaCapabilityUrl(doubleQuoted ?? singleQuoted ?? unquoted);
      return _full;
    },
  );
  scannable.replace(
    /<((?:local-media:\/\/|https?:\/\/local-media\.localhost\/)[^>\s]+)>/gi,
    (_full, destination) => {
      assertNoLocalMediaCapabilityUrl(destination);
      return _full;
    },
  );
  scannable.replace(
    /^\s{0,3}\[[^\]\n]+\]:\s*(<[^>\n]+>|\S+)/g,
    (_full, destination) => {
      assertNoLocalMediaCapabilityUrl(destination);
      return _full;
    },
  );
  scannable.replace(
    /\burl\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/gi,
    (_full, doubleQuoted, singleQuoted, unquoted) => {
      assertNoLocalMediaCapabilityUrl(doubleQuoted ?? singleQuoted ?? unquoted);
      return _full;
    },
  );
  return text;
};

const assertFrontmatterUrlsSafe = (markdown) => {
  const text = String(markdown ?? '');
  if (!/^---\r?\n/.test(text)) return;
  const endMatch = /\r?\n---(?:\r?\n|$)/.exec(text.slice(4));
  if (!endMatch) return;
  const frontmatter = text.slice(4, endMatch.index + 4);
  frontmatter.replace(
    /^\s*(?:cover|url|href|src|poster)\s*:\s*(.+?)\s*$/gim,
    (_full, destination) => {
      assertNoLocalMediaCapabilityUrl(destination);
      return _full;
    },
  );
};

export const assertNoLocalMediaCapabilityUrlsInMarkdown = (markdown) => {
  const text = String(markdown ?? '');
  mapOutsideCodeFences(text, assertMarkdownDestinationsSafe);
  assertFrontmatterUrlsSafe(text);
  return markdown;
};

const STRUCTURED_URL_KEYS = new Set(['cover', 'href', 'poster', 'src', 'url']);

export const assertNoLocalMediaCapabilityUrlsInObject = (value) => {
  if (Array.isArray(value)) {
    value.forEach(assertNoLocalMediaCapabilityUrlsInObject);
    return value;
  }
  if (!value || typeof value !== 'object') return value;
  Object.entries(value).forEach(([key, nestedValue]) => {
    if (typeof nestedValue === 'string' && STRUCTURED_URL_KEYS.has(key.toLowerCase())) {
      assertNoLocalMediaCapabilityUrl(nestedValue);
      return;
    }
    assertNoLocalMediaCapabilityUrlsInObject(nestedValue);
  });
  return value;
};

export const assertNoLocalMediaCapabilityUrlsInBlockNote = (content) => {
  if (typeof content !== 'string') return content;
  try {
    const blocks = JSON.parse(content);
    if (Array.isArray(blocks)) {
      assertNoLocalMediaCapabilityUrlsInObject(blocks);
      return content;
    }
  } catch {
    // 普通 Markdown 继续走链接目标校验。
  }
  return assertNoLocalMediaCapabilityUrlsInMarkdown(content);
};

const separateAdjacentImages = (text) => text.replace(/\)[ \t]*!\[/g, ')\n\n![');

const rewriteMarkdownImages = (markdown, context, forEditor) => {
  const {
    projectRootPath = '',
    noteRelativePath = '',
    sharedAssetsMountId = '',
  } = context;
  return mapOutsideCodeFences(markdown ?? '', (text) => {
    const withWiki = convertWikiImageEmbeds(text, (target) => (
      toWikiImageSrc(target, projectRootPath, noteRelativePath, forEditor)
    ));
    const withUrls = replaceMarkdownImageUrls(withWiki, (src) => (
      forEditor
        ? toEditorImageSrc(src, projectRootPath, noteRelativePath, sharedAssetsMountId)
        : toDiskImageSrc(src, projectRootPath, noteRelativePath, sharedAssetsMountId)
    ));
    return separateAdjacentImages(withUrls);
  });
};

export const rewriteMarkdownImagesForDisk = (markdown, context = {}) => {
  const rewritten = rewriteMarkdownImages(markdown, context, false);
  return isTauriMountId(context.projectRootPath)
    ? assertNoLocalMediaCapabilityUrlsInMarkdown(rewritten)
    : rewritten;
};

export const rewriteMarkdownImagesForEditor = (markdown, context = {}) => {
  const { projectRootPath = '' } = context;
  if (!projectRootPath) return markdown ?? '';
  return rewriteMarkdownImages(markdown, context, true);
};

const rewriteBlockNoteImageNodes = (blocks, context, forEditor) => blocks.map((block) => {
  const children = Array.isArray(block?.children)
    ? rewriteBlockNoteImageNodes(block.children, context, forEditor)
    : block?.children;
  if (block?.type !== 'image' || typeof block.props?.url !== 'string') {
    return children === block?.children ? block : { ...block, children };
  }
  const url = forEditor
    ? toEditorImageSrc(
        block.props.url,
        context.projectRootPath,
        context.noteRelativePath,
        context.sharedAssetsMountId,
      )
    : toDiskImageSrc(
        block.props.url,
        context.projectRootPath,
        context.noteRelativePath,
        context.sharedAssetsMountId,
      );
  return {
    ...block,
    props: { ...block.props, url },
    ...(children === block.children ? {} : { children }),
  };
});

const rewriteBlockNoteImages = (content, context, forEditor) => {
  if (typeof content !== 'string' || !content.trim().startsWith('[')) return content;
  try {
    const blocks = JSON.parse(content);
    if (!Array.isArray(blocks)) return content;
    return JSON.stringify(rewriteBlockNoteImageNodes(blocks, context, forEditor));
  } catch {
    return content;
  }
};

export const rewriteBlockNoteImagesForDisk = (content, context = {}) => {
  const rewritten = rewriteBlockNoteImages(content, context, false);
  return isTauriMountId(context.projectRootPath)
    ? assertNoLocalMediaCapabilityUrlsInBlockNote(rewritten)
    : rewritten;
};

export const rewriteBlockNoteImagesForEditor = (content, context = {}) => (
  rewriteBlockNoteImages(content, context, true)
);
