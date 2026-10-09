/**
 * 今日速记「块菜单」（点每行左侧拖拽手柄弹出）用到的纯函数：
 * 改块类型、整行加粗/斜体等、切换待办、行首图标。不依赖 DOM / BlockNote，方便单测。
 */

/** 顶部「H1 / H2 / H3 / 正文」四个按钮 */
export const BLOCK_TYPE_OPTIONS = Object.freeze([
  { key: 'h1', label: '一级标题', type: 'heading', level: 1 },
  { key: 'h2', label: '二级标题', type: 'heading', level: 2 },
  { key: 'h3', label: '三级标题', type: 'heading', level: 3 },
  { key: 'text', label: '正文', type: 'text' },
]);

/** 顶部「B / I / U / S」四个按钮对应的 BlockNote 样式名 */
export const TEXT_STYLE_KEYS = Object.freeze(['bold', 'italic', 'underline', 'strike']);

/** 「添加图标」可选的行首图标 */
export const BLOCK_ICONS = Object.freeze(['📌', '⭐', '🔥', '❗', '✅', '💡', '📝', '🎯']);

const TODO_TYPE = 'checkListItem';
const PLAIN_ITEM_TYPE = 'bulletListItem';
const ICON_SEPARATOR = ' ';

/** 有行内文字的块（图片、分割线之类没有） */
export const isTextBlock = (block) => Array.isArray(block?.content);

export const isTodoBlock = (block) => block?.type === TODO_TYPE;

const isHeading = (block) => block?.type === 'heading';

/** 「正文」= 非标题（普通条目、待办、段落都算），不会把待办冲掉 */
export const isBlockTypeActive = (block, option) => (
  option.type === 'heading'
    ? isHeading(block) && block?.props?.level === option.level
    : !isHeading(block)
);

/** 点「H1/H2/H3/正文」时传给 editor.updateBlock 的内容；已经是这个类型返回 null */
export const getBlockTypeUpdate = (block, option) => {
  if (isBlockTypeActive(block, option)) return null;
  return option.type === 'heading'
    ? { type: 'heading', props: { level: option.level } }
    : { type: PLAIN_ITEM_TYPE };
};

/** 待办 ↔ 普通条目 */
export const getTodoToggleUpdate = (block) => (
  isTodoBlock(block)
    ? { type: PLAIN_ITEM_TYPE }
    : { type: TODO_TYPE, props: { checked: false } }
);

const collectTextNodes = (content) => content.flatMap((node) => (
  node?.type === 'link' ? collectTextNodes(node.content ?? []) : [node]
)).filter((node) => node?.type === 'text' && node.text);

const mapTextNodes = (content, fn) => content.map((node) => {
  if (node?.type === 'link') return { ...node, content: mapTextNodes(node.content ?? [], fn) };
  return node?.type === 'text' ? fn(node) : node;
});

/** 整行文字是否都带某个样式（空行算没有） */
export const hasStyleOnAll = (content, style) => {
  const textNodes = collectTextNodes(Array.isArray(content) ? content : []);
  return textNodes.length > 0 && textNodes.every((node) => node.styles?.[style]);
};

/** 整行切换样式：都有就全去掉，否则全加上 */
export const toggleStyleOnContent = (content, style) => {
  const list = Array.isArray(content) ? content : [];
  const enable = !hasStyleOnAll(list, style);
  return mapTextNodes(list, (node) => {
    const { [style]: _removed, ...rest } = node.styles ?? {};
    return { ...node, styles: enable ? { ...rest, [style]: true } : rest };
  });
};

const getLeadingIcon = (text) => BLOCK_ICONS.find((icon) => text.startsWith(`${icon}${ICON_SEPARATOR}`)) ?? '';

/** 当前行首图标（没有返回空串） */
export const getBlockIcon = (content) => {
  const first = Array.isArray(content) ? content[0] : null;
  return first?.type === 'text' ? getLeadingIcon(first.text) : '';
};

/** 设置 / 替换行首图标；icon 为空串时去掉 */
export const setLeadingIcon = (content, icon) => {
  const list = Array.isArray(content) ? content : [];
  const first = list[0];
  const prefix = icon ? `${icon}${ICON_SEPARATOR}` : '';
  if (first?.type !== 'text') {
    return prefix ? [{ type: 'text', text: prefix, styles: {} }, ...list] : list;
  }
  const oldIcon = getLeadingIcon(first.text);
  const rest = oldIcon ? first.text.slice(oldIcon.length + ICON_SEPARATOR.length) : first.text;
  const text = `${prefix}${rest}`;
  return text ? [{ ...first, text }, ...list.slice(1)] : list.slice(1);
};
