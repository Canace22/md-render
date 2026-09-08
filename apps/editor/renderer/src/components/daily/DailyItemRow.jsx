import { Button, Checkbox, DatePicker, Dropdown, Tag } from 'antd';
import dayjs from 'dayjs';
import { Check, Copy, MoreHorizontal, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import DailyContentEditor from './DailyContentEditor.jsx';
import DailyRichContent from './DailyRichContent.jsx';
import {
  buildCategoryMenuItems,
  buildPriorityMenuItems,
  getCategoryOption,
  getPriorityColor,
  getPriorityOption,
  getTypeOption,
  supportsCategory,
} from './dailyOptions.jsx';

const MENU_ICON_SIZE = 14;

export function DailyTypeTag({ type }) {
  const option = getTypeOption(type);
  return (
    <Tag className="daily-notebook-type-tag" style={{ '--type-color': option.color }}>
      <span className="daily-notebook-type-icon">{option.icon}</span>
      {option.label}
    </Tag>
  );
}

export function DailyCategoryControl({ category, onSelect }) {
  const option = getCategoryOption(category);
  return (
    <Dropdown menu={{ items: buildCategoryMenuItems(category ?? '', onSelect) }} trigger={['click']}>
      {option ? (
        <Tag className="daily-notebook-category-tag" style={{ '--category-color': option.color }}>
          {option.label}
        </Tag>
      ) : (
        <button type="button" className="daily-notebook-category-placeholder">
          类别
        </button>
      )}
    </Dropdown>
  );
}

function DailyPriorityControl({ priority, onSelect }) {
  return (
    <Dropdown menu={{ items: buildPriorityMenuItems(priority, onSelect) }} trigger={['click']}>
      <button
        type="button"
        className="daily-notebook-priority-dot daily-notebook-priority-trigger"
        style={{ backgroundColor: getPriorityColor(priority) }}
        aria-label={`优先级: ${getPriorityOption(priority)?.label ?? '中'}`}
      />
    </Dropdown>
  );
}

const buildItemMenuItems = ({ item, copied, onStartEdit, onCopy, onMoveTaskToTodo, onDeleteItem }) => [
  {
    key: 'edit',
    label: '编辑',
    icon: <Pencil size={MENU_ICON_SIZE} strokeWidth={1.8} />,
    onClick: () => onStartEdit(item),
  },
  {
    key: 'copy',
    label: copied ? '已复制' : '复制',
    icon: copied
      ? <Check size={MENU_ICON_SIZE} strokeWidth={2.4} />
      : <Copy size={MENU_ICON_SIZE} strokeWidth={1.8} />,
    onClick: () => onCopy(item.id, item.text),
  },
  ...(item.type === 'task' && !item.done
    ? [
        {
          key: 'toTodo',
          label: '移到待办',
          icon: <RotateCcw size={MENU_ICON_SIZE} strokeWidth={1.8} />,
          onClick: () => onMoveTaskToTodo(item.id),
        },
      ]
    : []),
  { type: 'divider' },
  {
    key: 'delete',
    label: '删除',
    danger: true,
    icon: <Trash2 size={MENU_ICON_SIZE} strokeWidth={1.8} />,
    onClick: () => onDeleteItem(item.id),
  },
];

function DailyItemRow({
  item,
  currentDate,
  isEditing,
  editingDraft,
  batchMode,
  isSelected,
  copied,
  onToggleSelect,
  onStartEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onToggleTask,
  onMoveTaskToTodo,
  onMoveItem,
  onDeleteItem,
  onUpdatePriority,
  onUpdateCategory,
  onUpdatePendingItem,
  onCopy,
}) {
  const typeOption = getTypeOption(item.type);
  const isTask = item.type === 'task';
  const isEmptyItem = !item.text?.trim();

  return (
    <div className={`daily-notebook-item ${item.done ? 'is-done' : ''} ${isEmptyItem ? 'is-empty' : ''}`}>
      <div className="daily-notebook-item-main">
        <div className="daily-notebook-item-text-row">
          {batchMode && !item.isPending && (
            <Checkbox
              checked={isSelected}
              onChange={() => onToggleSelect(item.id)}
              className="daily-notebook-batch-checkbox"
            />
          )}
          {isTask && (
            <div className="daily-notebook-item-priority-wrapper">
              <button
                type="button"
                className={`daily-notebook-check ${item.done ? 'is-done' : ''}`}
                onClick={() => onToggleTask(item.id)}
                aria-label={item.done ? '标记为未完成' : '标记为已完成'}
              >
                {item.done && <Check size={13} strokeWidth={2.4} />}
              </button>
              {!isEditing && (
                <DailyPriorityControl
                  priority={item.priority}
                  onSelect={(value) => onUpdatePriority(item.id, value)}
                />
              )}
            </div>
          )}
          {isEditing && !item.isPending && <DailyTypeTag type={item.type} />}
          {isEditing ? (
            <div className="daily-notebook-item-editor">
              {item.isPending && (
                <div className="daily-notebook-item-editor-meta">
                  <DailyTypeTag type={item.type} />
                  {isTask && (
                    <DailyPriorityControl
                      priority={item.priority}
                      onSelect={(value) => onUpdatePendingItem(item.id, { priority: value })}
                    />
                  )}
                  {supportsCategory(item.type) && (
                    <DailyCategoryControl
                      category={item.category}
                      onSelect={(value) => onUpdatePendingItem(item.id, { category: value })}
                    />
                  )}
                </div>
              )}
              <DailyContentEditor
                editorKey={item.id}
                text={editingDraft?.text ?? ''}
                richText={editingDraft?.richText}
                placeholder={typeOption.placeholder}
                onChange={onEditDraftChange}
                onSave={onSaveEdit}
                onCancel={onCancelEdit}
              />
            </div>
          ) : (
            <>
              <DailyTypeTag type={item.type} />
              <div
                className={`daily-notebook-item-text ${isEmptyItem ? 'is-placeholder' : ''}`}
                onDoubleClick={() => onStartEdit(item)}
              >
                <DailyRichContent
                  richText={item.richText}
                  text={item.text}
                  placeholder={typeOption.placeholder}
                />
              </div>
              {supportsCategory(item.type) && (
                <DailyCategoryControl
                  category={item.category}
                  onSelect={(value) => onUpdateCategory(item.id, value)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {!isEditing && !batchMode && (
        <div className="daily-notebook-item-actions">
          <DatePicker
            size="small"
            value={dayjs(currentDate)}
            format="MM-DD"
            allowClear={false}
            suffixIcon={null}
            className="daily-notebook-item-date-picker"
            onChange={(date) => {
              if (date) onMoveItem(item.id, date.format('YYYY-MM-DD'));
            }}
          />
          <Dropdown
            menu={{
              items: buildItemMenuItems({
                item,
                copied,
                onStartEdit,
                onCopy,
                onMoveTaskToTodo,
                onDeleteItem,
              }),
            }}
            trigger={['click']}
          >
            <Button type="text" size="small" icon={<MoreHorizontal size={16} strokeWidth={1.8} />} />
          </Dropdown>
        </div>
      )}
    </div>
  );
}

export default DailyItemRow;
