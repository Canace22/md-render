import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, DatePicker } from 'antd';
import dayjs from 'dayjs';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import DailyEntryList, { ALL_TYPES_FILTER } from './daily/DailyEntryList.jsx';
import DailyTodoColumn from './daily/DailyTodoColumn.jsx';
import { compareDailyItems } from './daily/dailyOptions.jsx';
import { useCopyText } from '../hooks/useCopyText.js';
import {
  formatDailyHeading,
  getDailyEntry,
  getTodayDateKey,
  shiftDateKey,
} from '../utils/dailyWorkspace.js';

const DEFAULT_PRIORITY = 'medium';

const createPendingInlineId = () =>
  `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function DailyNotebook({
  dailyWorkspace,
  onSetCurrentDate,
  onAddItem,
  onToggleTaskDone,
  onDeleteItem,
  onUpdateItem,
  onMoveItem,
  onMoveItems,
  onMoveTaskToTodo,
  onAddTodo,
  onPromoteTodo,
  onRemoveTodo,
  onUpdateItemPriority,
  onUpdateItemCategory,
  onUpdateTodoCategory,
}) {
  const [editingItem, setEditingItem] = useState(null);
  const [pendingInlineItems, setPendingInlineItems] = useState([]);
  const [pendingTodos, setPendingTodos] = useState([]);
  const [typeFilter, setTypeFilter] = useState(ALL_TYPES_FILTER);
  const { copiedId, copy: handleCopy } = useCopyText();
  const currentDate = dailyWorkspace?.currentDate || getTodayDateKey();
  const dailyEntry = useMemo(() => getDailyEntry(dailyWorkspace, currentDate), [currentDate, dailyWorkspace]);
  const todoPool = useMemo(() => {
    return [...(dailyWorkspace?.todoPool ?? [])].sort((left, right) => right.updatedAt - left.updatedAt);
  }, [dailyWorkspace]);

  // 待保存的行内新建条目排在最前，已保存条目按「未完成任务 → 事件 → 笔记 → 已完成」统一排序
  const allItems = useMemo(() => {
    const pending = pendingInlineItems.map((item) => ({
      id: item.id,
      type: item.type,
      text: '',
      category: item.category,
      priority: item.priority ?? DEFAULT_PRIORITY,
      done: false,
      isPending: true,
    }));
    return [...pending, ...[...dailyEntry.items].sort(compareDailyItems)];
  }, [dailyEntry.items, pendingInlineItems]);

  const countByType = useMemo(() => {
    return allItems.reduce((counts, item) => {
      counts[item.type] = (counts[item.type] ?? 0) + 1;
      return counts;
    }, {});
  }, [allItems]);

  const visibleItems = useMemo(() => {
    if (typeFilter === ALL_TYPES_FILTER) return allItems;
    return allItems.filter((item) => item.type === typeFilter);
  }, [allItems, typeFilter]);

  const removePendingInline = useCallback((itemId) => {
    setPendingInlineItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const handleStartInlineAdd = useCallback((type) => {
    const id = createPendingInlineId();
    setPendingInlineItems((current) => [
      { id, type, priority: type === 'task' ? DEFAULT_PRIORITY : undefined },
      ...current,
    ]);
    setEditingItem({ id, value: '', richText: [], isPending: true });
    // 当前筛选如果会把新条目挡住，就切到它所属的类型
    setTypeFilter((current) => (current === ALL_TYPES_FILTER || current === type ? current : type));
  }, []);

  const handleUpdatePendingInline = useCallback((itemId, patch) => {
    setPendingInlineItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  }, []);

  const handleStartInlineAddTodo = useCallback(() => {
    const id = createPendingInlineId();
    setPendingTodos((current) => [{ id }, ...current]);
    setEditingItem({ id, value: '', richText: [], isPending: true, isTodo: true });
  }, []);

  const todoItems = useMemo(() => {
    const pending = pendingTodos.map((item) => ({ id: item.id, text: '', isPending: true }));
    return [...pending, ...todoPool];
  }, [pendingTodos, todoPool]);

  const handleStartEdit = useCallback((item) => {
    setEditingItem({
      id: item.id,
      value: item.text,
      richText: item.richText,
      isPending: Boolean(item.isPending),
    });
  }, []);

  // 富文本编辑器抛上来的是 { text, richText }：text 是纯文本投影，
  // 仍然用它判断「空内容 → 删除」，richText 才是保存用的正文
  const handleEditDraftChange = useCallback(({ text, richText }) => {
    setEditingItem((current) => (current ? { ...current, value: text, richText } : current));
  }, []);

  const handleCancelEdit = useCallback(() => {
    if (!editingItem?.id) {
      setEditingItem(null);
      return;
    }

    const nextValue = editingItem.value?.trim();
    if (editingItem.isPending) {
      if (editingItem.isTodo) {
        setPendingTodos((current) => current.filter((item) => item.id !== editingItem.id));
      } else {
        removePendingInline(editingItem.id);
      }
    } else if (!nextValue) {
      onDeleteItem(currentDate, editingItem.id);
    }
    setEditingItem(null);
  }, [currentDate, editingItem, onDeleteItem, removePendingInline]);

  const handleSaveEdit = useCallback(() => {
    const nextValue = editingItem?.value?.trim();
    if (!editingItem?.id) return;

    if (editingItem.isPending) {
      if (!nextValue) {
        handleCancelEdit();
        return;
      }
      if (editingItem.isTodo) {
        onAddTodo(nextValue, undefined, editingItem.richText);
        setPendingTodos((current) => current.filter((item) => item.id !== editingItem.id));
        setEditingItem(null);
        return;
      }
      const pendingItem = pendingInlineItems.find((item) => item.id === editingItem.id);
      const type = pendingItem?.type ?? 'note';
      onAddItem(
        currentDate,
        type,
        nextValue,
        pendingItem?.category,
        pendingItem?.priority,
        editingItem.richText,
      );
      removePendingInline(editingItem.id);
      setEditingItem(null);
      return;
    }

    if (!nextValue) {
      onDeleteItem(currentDate, editingItem.id);
      setEditingItem(null);
      return;
    }

    onUpdateItem(currentDate, editingItem.id, nextValue, editingItem.richText);
    setEditingItem(null);
  }, [
    currentDate,
    editingItem,
    handleCancelEdit,
    onAddItem,
    onAddTodo,
    onDeleteItem,
    onUpdateItem,
    pendingInlineItems,
    removePendingInline,
  ]);

  useEffect(() => {
    setEditingItem(null);
    setPendingInlineItems([]);
    setPendingTodos([]);
  }, [currentDate]);

  const handleDeleteItem = useCallback((itemId) => {
    if (pendingInlineItems.some((item) => item.id === itemId)) {
      removePendingInline(itemId);
      if (editingItem?.id === itemId) setEditingItem(null);
      return;
    }
    onDeleteItem(currentDate, itemId);
  }, [currentDate, editingItem?.id, onDeleteItem, pendingInlineItems, removePendingInline]);

  const handleDeleteTodoItem = useCallback((itemId) => {
    if (pendingTodos.some((item) => item.id === itemId)) {
      setPendingTodos((current) => current.filter((item) => item.id !== itemId));
      if (editingItem?.id === itemId) setEditingItem(null);
      return;
    }
    onRemoveTodo(itemId);
  }, [editingItem?.id, onRemoveTodo, pendingTodos]);

  const editingDraft = useMemo(
    () => ({ text: editingItem?.value ?? '', richText: editingItem?.richText }),
    [editingItem?.value, editingItem?.richText],
  );

  return (
    <div className="daily-notebook" data-testid="daily-surface">
      <section className="daily-notebook-hero">
        <div className="daily-notebook-hero-copy">
          <h1>{formatDailyHeading(currentDate)}</h1>
          <p>把今天真正要处理的任务、事件和笔记放在一页里；做不完的再沉到待办池，明天手动带回来。</p>
        </div>

        <div className="daily-notebook-date-panel">
          <div className="daily-notebook-date-actions">
            <Button icon={<ChevronLeft size={14} strokeWidth={1.8} />} onClick={() => onSetCurrentDate(shiftDateKey(currentDate, -1))} />
            <DatePicker
              value={dayjs(currentDate)}
              format="YYYY-MM-DD"
              allowClear={false}
              className="daily-notebook-date-picker"
              onChange={(date) => {
                if (date) onSetCurrentDate(date.format('YYYY-MM-DD'));
              }}
            />
            <Button icon={<ChevronRight size={14} strokeWidth={1.8} />} onClick={() => onSetCurrentDate(shiftDateKey(currentDate, 1))} />
          </div>
        </div>
      </section>

      <section className="daily-notebook-grid">
        <div className="daily-notebook-main-column">
          <DailyEntryList
            items={visibleItems}
            countByType={countByType}
            totalCount={allItems.length}
            typeFilter={typeFilter}
            onTypeFilterChange={setTypeFilter}
            onStartInlineAdd={handleStartInlineAdd}
            currentDate={currentDate}
            editingItemId={editingItem?.isTodo ? null : editingItem?.id ?? null}
            editingDraft={editingDraft}
            copiedId={copiedId}
            onStartEdit={handleStartEdit}
            onEditDraftChange={handleEditDraftChange}
            onSaveEdit={handleSaveEdit}
            onCancelEdit={handleCancelEdit}
            onToggleTask={(itemId) => onToggleTaskDone(currentDate, itemId)}
            onMoveTaskToTodo={(itemId) => onMoveTaskToTodo(currentDate, itemId)}
            onMoveItem={(itemId, toDate) => onMoveItem(currentDate, itemId, toDate)}
            onMoveItems={(itemIds, toDate) => onMoveItems(currentDate, itemIds, toDate)}
            onDeleteItem={handleDeleteItem}
            onUpdatePriority={(itemId, priority) => onUpdateItemPriority(currentDate, itemId, priority)}
            onUpdateCategory={(itemId, category) => onUpdateItemCategory(currentDate, itemId, category)}
            onUpdatePendingItem={handleUpdatePendingInline}
            onCopy={handleCopy}
          />
        </div>

        <DailyTodoColumn
          items={todoItems}
          totalCount={todoPool.length}
          editingItem={editingItem}
          onStartInlineAdd={handleStartInlineAddTodo}
          onEditDraftChange={handleEditDraftChange}
          onSaveEdit={handleSaveEdit}
          onCancelEdit={handleCancelEdit}
          onPromoteTodo={(todoId) => onPromoteTodo(todoId, currentDate)}
          onDeleteTodo={handleDeleteTodoItem}
          onUpdateTodoCategory={onUpdateTodoCategory}
        />
      </section>
    </div>
  );
}

export default memo(DailyNotebook);
