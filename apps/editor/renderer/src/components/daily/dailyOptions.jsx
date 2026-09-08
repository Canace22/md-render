import { CalendarClock, FileText, ListTodo } from 'lucide-react';
import { DAILY_TASK_CATEGORY_OPTIONS } from '../../utils/dailyWorkspace.js';

export const PRIORITY_OPTIONS = Object.freeze([
  { value: 'high', label: '高', color: '#ef4444' },
  { value: 'medium', label: '中', color: '#f59e0b' },
  { value: 'low', label: '低', color: '#22c55e' },
]);

const DEFAULT_PRIORITY = 'medium';
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const TYPE_ICON_SIZE = 13;

export const DAILY_TYPE_OPTIONS = Object.freeze([
  {
    value: 'task',
    label: '任务',
    color: '#3b82f6',
    placeholder: '写下一件今天要推进的事',
    icon: <ListTodo size={TYPE_ICON_SIZE} strokeWidth={1.8} />,
  },
  {
    value: 'note',
    label: '笔记',
    color: '#a855f7',
    placeholder: '记一条今天的想法或观察',
    icon: <FileText size={TYPE_ICON_SIZE} strokeWidth={1.8} />,
  },
  {
    value: 'event',
    label: '事件',
    color: '#f97316',
    placeholder: '记一条今天发生的事件',
    icon: <CalendarClock size={TYPE_ICON_SIZE} strokeWidth={1.8} />,
  },
]);

// 同一个列表里的展示顺序：未完成任务 → 事件 → 笔记，已完成任务沉底
const TYPE_SORT_WEIGHT = { task: 0, event: 1, note: 2 };
const CATEGORY_TYPES = new Set(['task', 'note']);

export const getTypeOption = (type) =>
  DAILY_TYPE_OPTIONS.find((option) => option.value === type) ?? DAILY_TYPE_OPTIONS[0];

export const getPriorityOption = (priority) => PRIORITY_OPTIONS.find((option) => option.value === priority);

export const getPriorityColor = (priority) =>
  getPriorityOption(priority)?.color ?? getPriorityOption(DEFAULT_PRIORITY).color;

export const getCategoryOption = (category) =>
  DAILY_TASK_CATEGORY_OPTIONS.find((option) => option.value === category);

export const supportsCategory = (type) => CATEGORY_TYPES.has(type);

export const compareDailyItems = (left, right) => {
  // 笔记 / 事件没有 done 字段，必须先转 Boolean 再转 Number，
  // 否则 Number(undefined) 得到 NaN，比较器返回 NaN 会被 sort 当成「相等」，已完成任务沉不下去
  const doneDiff = Number(Boolean(left.done)) - Number(Boolean(right.done));
  if (doneDiff !== 0) return doneDiff;
  const weightDiff = (TYPE_SORT_WEIGHT[left.type] ?? 0) - (TYPE_SORT_WEIGHT[right.type] ?? 0);
  if (weightDiff !== 0) return weightDiff;
  const priorityDiff =
    (PRIORITY_ORDER[left.priority] ?? PRIORITY_ORDER[DEFAULT_PRIORITY])
    - (PRIORITY_ORDER[right.priority] ?? PRIORITY_ORDER[DEFAULT_PRIORITY]);
  if (priorityDiff !== 0) return priorityDiff;
  return (left.createdAt ?? 0) - (right.createdAt ?? 0);
};

export const buildPriorityMenuItems = (currentPriority, onSelect) =>
  PRIORITY_OPTIONS.map((option) => ({
    key: option.value,
    label: (
      <span className="daily-notebook-category-menu-item">
        <span className="daily-notebook-category-dot" style={{ backgroundColor: option.color }} />
        {option.label}
      </span>
    ),
    onClick: () => onSelect(option.value),
    disabled: currentPriority === option.value,
  }));

export const buildCategoryMenuItems = (currentCategory, onSelect) => [
  {
    key: 'none',
    label: '未分类',
    onClick: () => onSelect(''),
  },
  { type: 'divider' },
  ...DAILY_TASK_CATEGORY_OPTIONS.map((option) => ({
    key: option.value,
    label: (
      <span className="daily-notebook-category-menu-item">
        <span className="daily-notebook-category-dot" style={{ backgroundColor: option.color }} />
        {option.label}
      </span>
    ),
    onClick: () => onSelect(option.value),
    disabled: currentCategory === option.value,
  })),
];

export const buildTypeMenuItems = (onSelect) =>
  DAILY_TYPE_OPTIONS.map((option) => ({
    key: option.value,
    label: (
      <span className="daily-notebook-category-menu-item">
        <span className="daily-notebook-type-icon" style={{ '--type-color': option.color }}>
          {option.icon}
        </span>
        {option.label}
      </span>
    ),
    onClick: () => onSelect(option.value),
  }));
