/**
 * 编辑器显示用 local-media://，磁盘 Markdown 用相对路径（Obsidian 可识别）。
 * 打开时把 Obsidian 图片嵌入 ![[file.png]] 转成标准 ![]()，普通 wikilink 不动。
 * renderer 不能用 Node path，这里只用 POSIX 字符串运算。
 */

const LOCAL_MEDIA_SCHEME = 'local-media:';
const REMOTE_OR_EMBEDDED_RE = /^(https?:|data:|blob:)/i;
const MARKDOWN_IMAGE_RE = /!\[([^\]]*)\]\(\s*(<[^>\n]+>|[^\s)]+)((?:\s+"[^"]*")?)\s*\)/g;
const STANDALONE_MARKDOWN_IMAGE_RE = /^!\[([^\]\n]*)\]\(\s*(?:<([^>\n]+)>|([^\s)\n]+))(?:\s+"[^"\n]*")?\s*\)$/;
const WIKI_IMAGE_EMBED_RE = /!\[\[([^\]\n]+?)\]\]/g;
const IMAGE_EXT_RE = /\.(?:png|jpe?g|gif|svg|webp|bmp|ico)$/i;
const WIKI_SIZE_ALIAS_RE = /^\d+(?:x\d+)?$/i;

export const encodeLocalMediaPath = (value) => String(value ?? '')
  .replace(/\\/g, '/')
  .split('/')
  .map((segment) => encodeURIComponent(segment))
  .join('/');

export const isLocalMediaUrl = (url = '') => String(url).toLowerCase().startsWith(LOCAL_MEDIA_SCHEME);

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

const getInlineText = (content) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((item) => (item?.type === 'text' ? item.text ?? '' : '')).join('');
};

const parseStandaloneMarkdownImage = (content) => {
  const match = getInlineText(content).trim().match(STANDALONE_MARKDOWN_IMAGE_RE);
  if (!match) return null;
  return { name: match[1], url: match[2] || match[3] };
};

export const convertStandaloneMarkdownImageParagraphs = (blocks) => {
  if (!Array.isArray(blocks)) return blocks;
  let changed = false;
  const converted = blocks.map((block) => {
    const children = convertStandaloneMarkdownImageParagraphs(block?.children);
    const image = block?.type === 'paragraph'
      ? parseStandaloneMarkdownImage(block.content)
      : null;

    if (image) {
      changed = true;
      return {
        id: block.id,
        type: 'image',
        props: {
          textAlignment: block.props?.textAlignment,
          backgroundColor: block.props?.backgroundColor,
          ...image,
        },
        children: children ?? [],
      };
    }
    if (children !== block?.children) {
      changed = true;
      return { ...block, children };
    }
    return block;
  });
  return changed ? converted : blocks;
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

const toProjectRelativePath = (absPath, projectRootPath) => {
  const abs = stripTrailingSlash(toPosix(absPath));
  const root = stripTrailingSlash(toPosix(projectRootPath));
  if (!abs || !root) return '';
  if (abs.toLowerCase() === root.toLowerCase()) return '';
  if (!abs.toLowerCase().startsWith(`${root.toLowerCase()}/`)) return '';
  return abs.slice(root.length + 1);
};

const toLocalMediaUrl = (projectRootPath, projectRelativePath) => (
  `${LOCAL_MEDIA_SCHEME}//${encodeLocalMediaPath(posixJoin(projectRootPath, projectRelativePath))}`
);

const absolutePathToLocalMediaUrl = (absPath) => (
  `${LOCAL_MEDIA_SCHEME}//${encodeLocalMediaPath(absPath)}`
);

const resolveSrcToAbsPath = (src, projectRootPath, noteRelativePath) => {
  if (isLocalMediaUrl(src)) return decodeLocalMediaUrl(src);
  const posixSrc = toPosix(src);
  if (posixSrc.startsWith('/') || /^[A-Za-z]:/.test(posixSrc)) return posixSrc;
  const noteDir = posixDirname(noteRelativePath);
  return posixJoin(projectRootPath, noteDir, posixSrc);
};

export const toDiskImageSrc = (src, projectRootPath, noteRelativePath) => {
  if (!src || REMOTE_OR_EMBEDDED_RE.test(src) || !projectRootPath) return src;
  if (toPosix(src).startsWith('/') && !isLocalMediaUrl(src)) return src;
  const absPath = resolveSrcToAbsPath(src, projectRootPath, noteRelativePath);
  const projectRelativePath = toProjectRelativePath(absPath, projectRootPath);
  if (!projectRelativePath) return src;
  const fromDir = posixJoin(projectRootPath, posixDirname(noteRelativePath));
  const toPath = posixJoin(projectRootPath, projectRelativePath);
  return posixRelative(fromDir, toPath);
};

export const toEditorImageSrc = (src, projectRootPath, noteRelativePath) => {
  if (!src || REMOTE_OR_EMBEDDED_RE.test(src)) return src;
  if (!projectRootPath) {
    const posixSrc = toPosix(src);
    return posixSrc.startsWith('/') ? absolutePathToLocalMediaUrl(posixSrc) : src;
  }
  const absPath = resolveSrcToAbsPath(src, projectRootPath, noteRelativePath);
  const projectRelativePath = toProjectRelativePath(absPath, projectRootPath);
  if (!projectRelativePath) return src;
  return toLocalMediaUrl(projectRootPath, projectRelativePath);
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
  const absPath = resolveWikiImageAbsPath(target, projectRootPath, noteRelativePath);
  const projectRelativePath = toProjectRelativePath(absPath, projectRootPath);
  if (!projectRelativePath) return '';
  if (forEditor) return toLocalMediaUrl(projectRootPath, projectRelativePath);
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
  let inFence = false;
  return lines.map((line) => {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return line;
    }
    return inFence ? line : mapText(line);
  }).join('\n');
};

const separateAdjacentImages = (text) => text.replace(/\)[ \t]*!\[/g, ')\n\n![');

const rewriteMarkdownImages = (markdown, context, forEditor) => {
  const { projectRootPath = '', noteRelativePath = '' } = context;
  return mapOutsideCodeFences(markdown ?? '', (text) => {
    const withWiki = convertWikiImageEmbeds(text, (target) => (
      toWikiImageSrc(target, projectRootPath, noteRelativePath, forEditor)
    ));
    const withUrls = replaceMarkdownImageUrls(withWiki, (src) => (
      forEditor
        ? (toPosix(src).startsWith('/') ? src : toEditorImageSrc(src, projectRootPath, noteRelativePath))
        : toDiskImageSrc(src, projectRootPath, noteRelativePath)
    ));
    return separateAdjacentImages(withUrls);
  });
};

export const rewriteMarkdownImagesForDisk = (markdown, context = {}) => (
  rewriteMarkdownImages(markdown, context, false)
);

export const rewriteMarkdownImagesForEditor = (markdown, context = {}) => {
  const { projectRootPath = '' } = context;
  if (!projectRootPath) return markdown ?? '';
  return rewriteMarkdownImages(markdown, context, true);
};
