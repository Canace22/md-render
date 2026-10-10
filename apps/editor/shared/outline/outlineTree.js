/**
 * 大纲页面 / 思维导图的纯函数（主进程和 renderer 共用，不依赖 DOM / BlockNote）。
 *
 * - 页面类型存在 frontmatter 的 `layout` 里：`outline` = 大纲页，`script` = 剧本页（见 shared/script），没写或其他值 = 普通文档页。
 * - 导图树：块的 children 是子节点；标题额外「管住」它后面的兄弟块，直到遇到同级或更高级的标题
 *   （今日速记的分区就是这么组织的：标题和条目是平级的）。
 */
import { inlineToPlainText } from '../daily/dailyMarkdown.js';

export const PAGE_LAYOUT_KEY = 'layout';
export const PAGE_LAYOUT_OUTLINE = 'outline';
export const PAGE_LAYOUT_DOCUMENT = 'document';
export const PAGE_LAYOUT_SCRIPT = 'script';

export const PAGE_LAYOUT_OPTIONS = Object.freeze([
  { value: PAGE_LAYOUT_DOCUMENT, label: '文档' },
  { value: PAGE_LAYOUT_OUTLINE, label: '大纲' },
  { value: PAGE_LAYOUT_SCRIPT, label: '剧本' },
]);

export const isOutlinePage = (file) => file?.frontmatter?.[PAGE_LAYOUT_KEY] === PAGE_LAYOUT_OUTLINE;

/** 复制给 AI 用的 Markdown：标题（文件名）放第一行，不然粘过去只剩一堆圆点，看不出在讲什么 */
export const withTitleHeading = (title, markdown) => {
  const body = String(markdown ?? '').trim();
  const head = String(title ?? '').trim();
  if (!body) return '';
  // 正文自己第一行就是一级标题时不重复加
  if (!head || body.startsWith('# ')) return `${body}\n`;
  return `# ${head}\n\n${body}\n`;
};

const IMAGE_TYPE = 'image';
const SKIPPED_TYPES = new Set(['divider']);
const TYPE_PLACEHOLDERS = { table: '[表格]', video: '[视频]', audio: '[音频]', file: '[附件]' };
const MAX_CODE_PREVIEW = 60;

/** 块本身显示的文字：代码块只取第一行，表格等给个占位 */
const blockText = (block) => {
  if (TYPE_PLACEHOLDERS[block.type]) return TYPE_PLACEHOLDERS[block.type];
  const text = inlineToPlainText(block.content).trim();
  if (block.type !== 'codeBlock') return text;
  const firstLine = text.split('\n')[0] ?? '';
  return firstLine.length > MAX_CODE_PREVIEW ? `${firstLine.slice(0, MAX_CODE_PREVIEW)}…` : firstLine;
};

const toNode = (block) => ({
  id: block.id,
  text: blockText(block),
  kind: block.type === 'heading' ? 'heading' : block.type === 'checkListItem' ? 'task' : block.type === IMAGE_TYPE ? 'image' : 'item',
  checked: block.type === 'checkListItem' ? Boolean(block.props?.checked) : undefined,
  imageUrl: block.type === IMAGE_TYPE ? String(block.props?.url ?? '') : undefined,
  children: [],
});

/** 空行（没字、不是图片、子级也全空）不进导图 */
const isEmptyNode = (node) => !node.text && node.kind !== 'image' && node.children.length === 0;

/** 一组兄弟块 → 节点数组；标题按级别把后面的兄弟收为子节点 */
const convertSiblings = (blocks) => {
  const roots = [];
  const headingStack = []; // [{ level, node }]

  (Array.isArray(blocks) ? blocks : []).forEach((block) => {
    if (!block || SKIPPED_TYPES.has(block.type)) return;
    const node = toNode(block);
    node.children = convertSiblings(block.children);
    const level = block.type === 'heading' ? Number(block.props?.level) || 1 : null;

    if (level !== null) {
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) headingStack.pop();
    } else if (isEmptyNode(node)) {
      return;
    }

    const parent = headingStack[headingStack.length - 1]?.node;
    (parent ? parent.children : roots).push(node);
    if (level !== null) headingStack.push({ level, node });
  });

  return roots;
};

/** 整篇块 → 导图树，根节点是页面标题 / 日期 */
export const blocksToMindTree = (blocks, rootLabel = '') => ({
  id: '__root__',
  text: String(rootLabel ?? '').trim() || '未命名',
  kind: 'root',
  children: convertSiblings(blocks),
});

/** 子孙节点总数（折叠后显示在收起按钮上） */
export const countDescendants = (node) => (node?.children ?? [])
  .reduce((sum, child) => sum + 1 + countDescendants(child), 0);
