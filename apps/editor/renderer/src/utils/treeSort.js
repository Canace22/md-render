/**
 * 目录树排序（纯函数）。
 * 规则：置顶节点永远在前；同组内按选定方式排；值相同时保持原顺序（Array#sort 是稳定排序）。
 */

export const TREE_SORT_UPDATED_DESC = 'updated-desc';
export const TREE_SORT_UPDATED_ASC = 'updated-asc';
export const TREE_SORT_CREATED_DESC = 'created-desc';
export const TREE_SORT_CREATED_ASC = 'created-asc';
export const TREE_SORT_NAME_ASC = 'name-asc';
export const TREE_SORT_NAME_DESC = 'name-desc';

/** 默认沿用原来的行为：最近修改在前 */
export const DEFAULT_TREE_SORT_MODE = TREE_SORT_UPDATED_DESC;

export const TREE_SORT_OPTIONS = [
  { value: TREE_SORT_UPDATED_DESC, label: '修改时间（新 → 旧）' },
  { value: TREE_SORT_UPDATED_ASC, label: '修改时间（旧 → 新）' },
  { value: TREE_SORT_CREATED_DESC, label: '创建时间（新 → 旧）' },
  { value: TREE_SORT_CREATED_ASC, label: '创建时间（旧 → 新）' },
  { value: TREE_SORT_NAME_ASC, label: '文件名（A → Z）' },
  { value: TREE_SORT_NAME_DESC, label: '文件名（Z → A）' },
];

const VALID_MODES = new Set(TREE_SORT_OPTIONS.map((item) => item.value));

export const normalizeTreeSortMode = (value) =>
  (VALID_MODES.has(value) ? value : DEFAULT_TREE_SORT_MODE);

const toTime = (value) => {
  const ts = Number(value);
  return Number.isFinite(ts) && ts > 0 ? ts : 0;
};

// 缺失时互相回退，避免老数据全挤到末尾
const getUpdatedTime = (node) => toTime(node?.updatedAt) || toTime(node?.createdAt);
const getCreatedTime = (node) => toTime(node?.createdAt) || toTime(node?.updatedAt);

// numeric：「第2章」排在「第10章」前；zh：中文按拼音
const nameCollator = new Intl.Collator('zh-Hans-CN', { numeric: true, sensitivity: 'base' });

const COMPARATORS = {
  [TREE_SORT_UPDATED_DESC]: (a, b) => getUpdatedTime(b) - getUpdatedTime(a),
  [TREE_SORT_UPDATED_ASC]: (a, b) => getUpdatedTime(a) - getUpdatedTime(b),
  [TREE_SORT_CREATED_DESC]: (a, b) => getCreatedTime(b) - getCreatedTime(a),
  [TREE_SORT_CREATED_ASC]: (a, b) => getCreatedTime(a) - getCreatedTime(b),
  [TREE_SORT_NAME_ASC]: (a, b) => nameCollator.compare(a?.name ?? '', b?.name ?? ''),
  [TREE_SORT_NAME_DESC]: (a, b) => nameCollator.compare(b?.name ?? '', a?.name ?? ''),
};

/** 返回排好序的新数组，不改原数组 */
export function sortTreeNodes(nodes, mode = DEFAULT_TREE_SORT_MODE) {
  const list = Array.isArray(nodes) ? nodes : [];
  const compare = COMPARATORS[normalizeTreeSortMode(mode)];
  const pinned = list.filter((node) => node?.pinned).sort(compare);
  const unpinned = list.filter((node) => !node?.pinned).sort(compare);
  return [...pinned, ...unpinned];
}
