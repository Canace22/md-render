/**
 * 主编辑器斜杠菜单的条目整理（纯函数，便于单测）。
 * 只保留写文章常用的块，按使用频率排序；其余默认块（四~六级标题、折叠块、音视频、表情等）不再出现。
 * 引用工作区文档改走「@」菜单，见 docMentionItems.js。
 */

/** 常用块：按顺序展示，key 对应 BlockNote 默认斜杠菜单的 key */
export const SLASH_GROUPS = [
  { name: '常用', keys: ['heading_2', 'heading_3', 'bullet_list', 'numbered_list', 'check_list', 'quote', 'image', 'code_block'] },
  { name: '更多', keys: ['heading', 'paragraph', 'divider', 'table'] },
];

/** 从默认条目里按 SLASH_GROUPS 挑出并排序，group 改成我们的分组名 */
export const pickCommonBlockItems = (defaultItems) => {
  const byKey = new Map(defaultItems.map((item) => [item.key, item]));
  return SLASH_GROUPS.flatMap(({ name, keys }) => keys
    .filter((key) => byKey.has(key))
    .map((key) => ({ ...byKey.get(key), group: name })));
};
