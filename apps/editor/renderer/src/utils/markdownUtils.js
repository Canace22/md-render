/**
 * Markdown 文本处理工具
 */

export const normalizeMarkdown = (value) => {
  const str = value ?? '';
  return str.replace(/\r\n/g, '\n').replace(/\u00a0/g, ' ').trimEnd();
};

const CODE_FENCE_OPEN_REGEX = /^```([\w-]+)?\s*$/;

const MARKDOWN_PASTE_PATTERNS = [
  /(^|\n) {0,3}#{1,6}\s+\S+/,
  /(^|\n) {0,3}>\s+\S+/,
  /(^|\n) {0,3}[-*+]\s+\S+/,
  /(^|\n) {0,3}\d+\.\s+\S+/,
  /(^|\n)```[\s\S]*?```/,
  /(^|\n)\|.+\|\n\|[\s:|-]+\|/,
];

/**
 * 判断剪贴板文本是否像 Markdown（用于粘贴时优先按 Markdown 解析）
 */
export const looksLikeMarkdownClipboardText = (value = '') => {
  const text = normalizeMarkdown(value);
  if (!text) return false;
  return MARKDOWN_PASTE_PATTERNS.some((pattern) => pattern.test(text));
};

/**
 * 判断剪贴板文本是否是 fenced code markdown
 */
export const looksLikeMarkdownCodeFenceClipboardText = (value = '') => {
  const text = normalizeMarkdown(value);
  if (!text) return false;
  return /(^|\n) {0,3}```[\s\S]*?```(?:\n|$)/.test(text);
};

const IGNORED_CLIPBOARD_ELEMENT_TAGS = new Set(['META']);
const PLAIN_TEXT_HTML_TAGS = new Set(['BR', 'DIV', 'P']);
const SAFARI_PLAIN_TEXT_BREAK_CLASS = 'Apple-interchange-newline';

const getMeaningfulChildNodes = (node) => Array.from(node?.childNodes ?? []).filter((child) => {
  if (child.nodeType === Node.ELEMENT_NODE) {
    return !IGNORED_CLIPBOARD_ELEMENT_TAGS.has(child.tagName);
  }
  return child.nodeType === Node.TEXT_NODE && child.textContent?.trim();
});

/**
 * 判断剪贴板 HTML 是否只有一个代码块。
 * 混合内容必须交回 BlockNote 默认 HTML 粘贴，不能只截取第一个 <pre>。
 */
export const looksLikeCodeBlockClipboardHtml = (value = '') => {
  const html = value.trim();
  if (!html || typeof window === 'undefined') return false;

  const container = window.document.createElement('div');
  container.innerHTML = html;
  const preBlocks = container.querySelectorAll('pre');
  if (preBlocks.length !== 1) return false;

  const pre = preBlocks[0];
  const directCode = pre.querySelector(':scope > code');
  if (directCode) {
    const preChildren = getMeaningfulChildNodes(pre);
    if (preChildren.length !== 1 || preChildren[0] !== directCode) return false;
  }

  let onlyChild = pre;
  while (onlyChild.parentNode && onlyChild.parentNode !== container) {
    const parent = onlyChild.parentNode;
    const siblings = getMeaningfulChildNodes(parent);
    if (siblings.length !== 1 || siblings[0] !== onlyChild) return false;
    onlyChild = parent;
  }

  const rootChildren = getMeaningfulChildNodes(container);
  return rootChildren.length === 1 && rootChildren[0] === onlyChild;
};

/**
 * 判断剪贴板 HTML 是否只是纯文本 + <br> 结构（无富文本标签）。
 * 用于避免 <br><br> 被 BlockNote 默认粘贴器转成多余的空段落 block。
 */
export const looksLikePlainTextHtml = (value = '') => {
  const html = value.trim();
  if (!html || typeof window === 'undefined') return false;

  const container = window.document.createElement('div');
  container.innerHTML = html;
  return Array.from(container.querySelectorAll('*')).every((element) => {
    if (IGNORED_CLIPBOARD_ELEMENT_TAGS.has(element.tagName)) return true;
    if (!PLAIN_TEXT_HTML_TAGS.has(element.tagName)) return false;
    if (element.attributes.length === 0) return true;
    return element.tagName === 'BR'
      && element.attributes.length === 1
      && element.getAttribute('class') === SAFARI_PLAIN_TEXT_BREAK_CLASS;
  });
};

/**
 * 从剪贴板 HTML 中提取代码块内容
 */
export const extractCodeBlockFromClipboardHtml = (value = '') => {
  const html = value.trim();
  if (!html || typeof window === 'undefined') return null;

  const container = window.document.createElement('div');
  container.innerHTML = html;

  const pre = container.querySelector('pre');
  if (!pre) return null;

  const code = pre.querySelector(':scope > code');
  const contentNode = code ?? pre;
  const languageNode = code ?? pre;

  const classLanguage = Array.from(languageNode.classList)
    .find((name) => name.startsWith('language-'))
    ?.replace('language-', '');

  return {
    content: contentNode.textContent ?? '',
    language:
      languageNode.getAttribute('data-language')
      || pre.getAttribute('data-language')
      || classLanguage
      || 'text',
  };
};

/** 将提取后的单代码块重建为安全 HTML，交给 ProseMirror 按当前选区粘贴。 */
export const buildCodeBlockClipboardHtml = ({ content = '', language = 'text' } = {}) => {
  if (typeof window === 'undefined') return '';
  const pre = window.document.createElement('pre');
  const code = window.document.createElement('code');
  const normalizedLanguage = String(language || 'text');
  code.className = `language-${normalizedLanguage}`;
  code.setAttribute('data-language', normalizedLanguage);
  code.textContent = String(content);
  pre.appendChild(code);
  return pre.outerHTML;
};

export const getBlockTextContent = (content = []) => {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    if (typeof content?.text === 'string') return content.text;
    if (content?.content) return getBlockTextContent(content.content);
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') return item;
      if (typeof item?.text === 'string') return item.text;
      if (item?.content) return getBlockTextContent(item.content);
      return '';
    })
    .join('');
};

export const getMarkdownCodeFenceLanguage = (value = '') => {
  const text = normalizeMarkdown(value).trim();
  const match = text.match(CODE_FENCE_OPEN_REGEX);
  if (!match) return null;
  return match[1] || 'text';
};

/**
 * BlockNote 空文档结构
 */
export const createEmptyDocument = () => [{ type: 'paragraph', content: '' }];

/** BlockNote JSON 内容的前缀标识 */
const BN_PREFIX = '__bn:';

/**
 * 判断 content 字段是否是 BlockNote JSON 格式（以 __bn: 开头）
 */
export const isBlockNoteContent = (value) => {
  return typeof value === 'string' && value.startsWith(BN_PREFIX);
};

/**
 * 将 BlockNote blocks 数组序列化为带前缀的字符串，用于存入 content 字段
 */
export const serializeBlockNoteContent = (blocks) => {
  return BN_PREFIX + JSON.stringify(blocks);
};

/**
 * 解析 __bn: 前缀的 content 字符串，返回 blocks 数组；失败返回 null
 */
export const parseBlockNoteContent = (value) => {
  if (!isBlockNoteContent(value)) return null;
  try {
    const parsed = JSON.parse(value.slice(BN_PREFIX.length));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * 在已序列化的 BlockNote 正文中精确结算异步图片占位块。
 * 成功时回填最终 URL，失败时移除占位，且不覆盖用户后续替换的图片。
 */
export const resolvePendingImagesInContent = (value, resolutions = []) => {
  const blocks = parseBlockNoteContent(value);
  if (!blocks || resolutions.length === 0) return null;

  const byBlockId = new Map(
    resolutions
      .filter((item) => item?.blockId)
      .map((item) => [item.blockId, item]),
  );
  let changed = false;

  const visit = (items = []) => items.map((block) => {
    const resolution = byBlockId.get(block.id)
      ?? resolutions.find((item) => item?.pendingUrl === block.props?.url);
    const matchesPendingImage = block.type === 'image'
      && resolution
      && block.props?.url === resolution.pendingUrl;
    const children = Array.isArray(block.children) ? visit(block.children) : block.children;

    if (matchesPendingImage) {
      changed = true;
      if (resolution.failed) return null;
      return {
        ...block,
        props: {
          ...block.props,
          url: resolution.url,
          name: resolution.name,
        },
        ...(children === block.children ? {} : { children }),
      };
    }
    if (children !== block.children) return { ...block, children };
    return block;
  }).filter(Boolean);

  const settledBlocks = visit(blocks);
  const nextBlocks = settledBlocks.length > 0 ? settledBlocks : createEmptyDocument();
  return changed ? serializeBlockNoteContent(nextBlocks) : null;
};

/**
 * 从 content 字段提取纯 Markdown 字符串（供导出/预览使用）。
 * 若是 BlockNote JSON 格式，需由调用方先用 editor 转换；
 * 此函数仅处理普通 Markdown 字符串（原样返回）。
 */
export const extractMarkdownFromContent = (value) => {
  if (!isBlockNoteContent(value)) return normalizeMarkdown(value);
  return ''; // BlockNote JSON 需通过 editor.blocksToMarkdownLossy 转换
};
