import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Dropdown, Empty, Input, Tag } from 'antd';
import dayjs from 'dayjs';
import {
  CalendarClock,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  Inbox,
  ListTodo,
  RotateCcw,
  Trash2,
  Pencil,
  Plus,
  MoreHorizontal,
} from 'lucide-react';
import {
  DAILY_TASK_CATEGORY_OPTIONS,
  formatDailyHeading,
  formatDailyMetaDate,
  getDailyEntry,
  getTodayDateKey,
  shiftDateKey,
} from '../utils/dailyWorkspace.js';

const PRIORITY_OPTIONS = [
  { value: 'high', label: '高', color: '#ef4444' },
  { value: 'medium', label: '中', color: '#f59e0b' },
  { value: 'low', label: '低', color: '#22c55e' },
];

const getPriorityOption = (priority) => PRIORITY_OPTIONS.find((opt) => opt.value === priority);

const getPriorityColor = (priority) => getPriorityOption(priority)?.color ?? '#f59e0b';

const createPendingInlineId = () =>
  `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const getCategoryOption = (category) => DAILY_TASK_CATEGORY_OPTIONS.find((opt) => opt.value === category);

const buildPriorityMenuItems = (currentPriority, onSelect) =>
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

const buildCategoryMenuItems = (currentCategory, onSelect) => [
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

function useCopyText() {
  const [copiedId, setCopiedId] = useState(null);
  const copy = useCallback((id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    });
  }, []);
  return { copiedId, copy };
}

const DAILY_SECTIONS = [
  {
    type: 'task',
    title: '今日任务',
    description: '只放今天要推进的事，做不完再移去待办池。',
    placeholder: '写下一件今天要推进的事',
    icon: <ListTodo size={16} strokeWidth={1.8} />,
    emptyText: '今天的任务先留白，需要时再加。',
  },
  {
    type: 'note',
    title: '笔记',
    description: '随手写想法、观察和一闪而过的结论。',
    placeholder: '记一条今天的想法或观察',
    icon: <FileText size={16} strokeWidth={1.8} />,
    emptyText: '还没有留下任何笔记。',
  },
  {
    type: 'event',
    title: '事件',
    description: '记录约定、会议、临时插入的安排。',
    placeholder: '记一条今天发生的事件',
    icon: <CalendarClock size={16} strokeWidth={1.8} />,
    emptyText: '今天还没有记录事件。',
  },
];

function useBatchSelect(items) {
  const [batchMode, setBatchMode] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const toggleBatchMode = useCallback(() => {
    setBatchMode((prev) => !prev);
    setSelected(new Set());
  }, []);

  const toggleItem = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const allIds = useMemo(() => items.map((item) => item.id), [items]);
  const isAllSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggleAll = useCallback(() => {
    setSelected(isAllSelected ? new Set() : new Set(allIds));
  }, [allIds, isAllSelected]);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  // 切换日期后退出批量模式
  const exitBatch = useCallback(() => {
    setBatchMode(false);
    setSelected(new Set());
  }, []);

  return { batchMode, selected, toggleBatchMode, toggleItem, isAllSelected, toggleAll, clearSelection, exitBatch };
}

function DailySection({
  section,
  items,
  currentDate,
  editingItemId,
  editingDraftValue,
  onStartEdit,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onToggleTask,
  onMoveTaskToTodo,
  onMoveItem,
  onMoveItems,
  onDeleteItem,
  onUpdatePriority,
  onUpdateCategory,
  onUpdatePendingItem,
  copiedId,
  onCopy,
  onStartInlineAdd,
}) {
  const isNote = section.type === 'note';
  const { batchMode, selected, toggleBatchMode, toggleItem, isAllSelected, toggleAll, exitBatch } =
    useBatchSelect(items);
  const [batchDate, setBatchDate] = useState(null);

  const handleBatchMove = useCallback(() => {
    if (!batchDate || selected.size === 0) return;
    const toDate = batchDate.format('YYYY-MM-DD');
    onMoveItems([...selected], toDate);
    setBatchDate(null);
    exitBatch();
  }, [batchDate, selected, onMoveItems, exitBatch]);

  return (
    <Card className="daily-notebook-card daily-notebook-section">
      <div className="daily-notebook-section-head">
        <div>
          <div className="daily-notebook-section-title">
            <span className="daily-notebook-section-icon">{section.icon}</span>
            <strong>{section.title}</strong>
            {items.length > 0 && <Tag className="daily-notebook-section-count">{items.length} 条</Tag>}
          </div>
          <p>{section.description}</p>
        </div>
        <div className="daily-notebook-section-head-actions">
          {isNote && items.length > 0 && (
            <Button size="small" type={batchMode ? 'primary' : 'default'} onClick={toggleBatchMode}>
              {batchMode ? '取消批量' : '批量改日期'}
            </Button>
          )}
          <Button
            type="text"
            size="small"
            className="daily-notebook-add-trigger"
            icon={<Plus size={16} strokeWidth={1.8} />}
            onClick={() => onStartInlineAdd(section.type)}
            aria-label={`添加${section.title}`}
          />
        </div>
      </div>

      {items.length ? (
        <>
          {isNote && batchMode && (
            <div className="daily-notebook-batch-bar">
              <Checkbox
                checked={isAllSelected}
                indeterminate={selected.size > 0 && !isAllSelected}
                onChange={toggleAll}
              >
                全选
              </Checkbox>
              <span className="daily-notebook-batch-count">已选 {selected.size} 条</span>
              <DatePicker
                size="small"
                value={batchDate}
                format="MM-DD"
                allowClear={false}
                placeholder="选择目标日期"
                onChange={setBatchDate}
              />
              <Button
                type="primary"
                size="small"
                disabled={selected.size === 0 || !batchDate}
                onClick={handleBatchMove}
              >
                移到该日期
              </Button>
            </div>
          )}
          <div className="daily-notebook-list">
            {items.map((item) => {
              const isEditing = editingItemId === item.id;
              const canSaveEdit = Boolean(editingDraftValue?.trim());
              const isEmptyItem = !item.text?.trim();

              return (
                <div
                  key={item.id}
                  className={`daily-notebook-item ${item.done ? 'is-done' : ''} ${isEmptyItem ? 'is-empty' : ''}`}
                >
                  <div className="daily-notebook-item-main">
                    <div className="daily-notebook-item-text-row">
                      {isNote && batchMode && (
                        <Checkbox
                          checked={selected.has(item.id)}
                          onChange={() => toggleItem(item.id)}
                          className="daily-notebook-batch-checkbox"
                        />
                      )}
                      {section.type === 'task' && (
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
                            <Dropdown
                              menu={{
                                items: buildPriorityMenuItems(item.priority, (value) => onUpdatePriority(item.id, value)),
                              }}
                              trigger={['click']}
                            >
                              <button
                                type="button"
                                className="daily-notebook-priority-dot daily-notebook-priority-trigger"
                                style={{ backgroundColor: getPriorityColor(item.priority) }}
                                aria-label={`优先级: ${getPriorityOption(item.priority)?.label ?? '中'}`}
                              />
                            </Dropdown>
                          )}
                        </div>
                      )}
                      {isEditing ? (
                        <div className={`daily-notebook-item-editor ${section.type === 'task' && item.isPending ? 'has-meta' : ''}`}>
                          {section.type === 'task' && item.isPending && (
                            <div className="daily-notebook-item-editor-meta">
                              <Dropdown
                                menu={{
                                  items: buildPriorityMenuItems(item.priority, (value) =>
                                    onUpdatePendingItem(item.id, { priority: value }),
                                  ),
                                }}
                                trigger={['click']}
                              >
                                <button
                                  type="button"
                                  className="daily-notebook-priority-dot daily-notebook-priority-trigger"
                                  style={{ backgroundColor: getPriorityColor(item.priority) }}
                                  aria-label={`优先级: ${getPriorityOption(item.priority)?.label ?? '中'}`}
                                />
                              </Dropdown>
                              <Dropdown
                                menu={{
                                  items: buildCategoryMenuItems(item.category ?? '', (value) =>
                                    onUpdatePendingItem(item.id, { category: value }),
                                  ),
                                }}
                                trigger={['click']}
                              >
                                {item.category ? (
                                  <Tag
                                    className="daily-notebook-category-tag"
                                    style={{ '--category-color': getCategoryOption(item.category)?.color }}
                                  >
                                    {getCategoryOption(item.category)?.label}
                                  </Tag>
                                ) : (
                                  <button type="button" className="daily-notebook-category-placeholder">
                                    类别
                                  </button>
                                )}
                              </Dropdown>
                            </div>
                          )}
                          <div className="daily-notebook-item-editor-row">
                            <Input
                              autoFocus
                              value={editingDraftValue}
                              placeholder={section.placeholder}
                              onChange={(event) => onEditDraftChange(event.target.value)}
                              onPressEnter={() => {
                                if (canSaveEdit) onSaveEdit();
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Escape') {
                                  event.preventDefault();
                                  onCancelEdit();
                                }
                              }}
                            />
                            <Button type="primary" size="small" disabled={!canSaveEdit} onClick={onSaveEdit}>
                              save
                            </Button>
                            {canSaveEdit ? (
                              <Button size="small" onClick={onCancelEdit}>
                                cancel
                              </Button>
                            ) : (
                              <Button size="small" danger onClick={onCancelEdit}>
                                delete
                              </Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <>
                          <span
                            className={`daily-notebook-item-text ${isEmptyItem ? 'is-placeholder' : ''}`}
                            onDoubleClick={() => onStartEdit(item)}
                          >
                            {item.text || section.placeholder}
                          </span>
                          {(section.type === 'task' || section.type === 'note') && (
                            <Dropdown
                              menu={{ items: buildCategoryMenuItems(item.category ?? '', (value) => onUpdateCategory(item.id, value)) }}
                              trigger={['click']}
                            >
                              {item.category ? (
                                <Tag
                                  className="daily-notebook-category-tag"
                                  style={{ '--category-color': getCategoryOption(item.category)?.color }}
                                >
                                  {getCategoryOption(item.category)?.label}
                                </Tag>
                              ) : (
                                <button type="button" className="daily-notebook-category-placeholder">
                                  类别
                                </button>
                              )}
                            </Dropdown>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {!isEditing && !batchMode && (
                    <div className="daily-notebook-item-actions">
                      {(section.type === 'note' || section.type === 'task') && (
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
                      )}
                      <Dropdown
                        menu={{
                          items: [
                            {
                              key: 'edit',
                              label: '编辑',
                              icon: <Pencil size={14} strokeWidth={1.8} />,
                              onClick: () => onStartEdit(item),
                            },
                            ...(section.type === 'task' || section.type === 'note'
                              ? [
                                  {
                                    key: 'copy',
                                    label: copiedId === item.id ? '已复制' : '复制',
                                    icon: copiedId === item.id
                                      ? <Check size={14} strokeWidth={2.4} />
                                      : <Copy size={14} strokeWidth={1.8} />,
                                    onClick: () => onCopy(item.id, item.text),
                                  },
                                ]
                              : []),
                            ...(section.type === 'task' && !item.done
                              ? [
                                  {
                                    key: 'toTodo',
                                    label: '移到待办',
                                    icon: <RotateCcw size={14} strokeWidth={1.8} />,
                                    onClick: () => onMoveTaskToTodo(item.id),
                                  },
                                ]
                              : []),
                            { type: 'divider' },
                            {
                              key: 'delete',
                              label: '删除',
                              danger: true,
                              icon: <Trash2 size={14} strokeWidth={1.8} />,
                              onClick: () => onDeleteItem(item.id),
                            },
                          ],
                        }}
                        trigger={['click']}
                      >
                        <Button
                          type="text"
                          size="small"
                          icon={<MoreHorizontal size={16} strokeWidth={1.8} />}
                        />
                      </Dropdown>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={section.emptyText} />
      )}
    </Card>
  );
}

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
  const { copiedId, copy: handleCopy } = useCopyText();
  const currentDate = dailyWorkspace?.currentDate || getTodayDateKey();
  const dailyEntry = useMemo(() => getDailyEntry(dailyWorkspace, currentDate), [currentDate, dailyWorkspace]);
  const todoPool = useMemo(() => {
    return [...(dailyWorkspace?.todoPool ?? [])].sort((left, right) => right.updatedAt - left.updatedAt);
  }, [dailyWorkspace]);

  const itemsByType = useMemo(() => {
    const grouped = { task: [], event: [], note: [] };
    for (const item of dailyEntry.items) {
      grouped[item.type]?.push(item);
    }
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    grouped.task.sort((left, right) => {
      if (left.done !== right.done) return Number(left.done) - Number(right.done);
      return (priorityOrder[left.priority] ?? 1) - (priorityOrder[right.priority] ?? 1);
    });
    return grouped;
  }, [dailyEntry.items]);

  const removePendingInline = useCallback((itemId) => {
    setPendingInlineItems((current) => current.filter((item) => item.id !== itemId));
  }, []);

  const buildSectionItems = useCallback((type) => {
    const pending = pendingInlineItems
      .filter((item) => item.type === type)
      .map((item) => ({
        id: item.id,
        type: item.type,
        text: '',
        category: item.category,
        priority: item.priority ?? 'medium',
        done: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isPending: true,
      }));
    return [...pending, ...itemsByType[type]];
  }, [itemsByType, pendingInlineItems]);

  const handleStartInlineAdd = useCallback((type) => {
    const id = createPendingInlineId();
    setPendingInlineItems((current) => [{ id, type, priority: type === 'task' ? 'medium' : undefined }, ...current]);
    setEditingItem({ id, value: '', isPending: true });
  }, []);

  const handleUpdatePendingInline = useCallback((itemId, patch) => {
    setPendingInlineItems((current) =>
      current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  }, []);

  const handleStartInlineAddTodo = useCallback(() => {
    const id = createPendingInlineId();
    setPendingTodos((current) => [{ id }, ...current]);
    setEditingItem({ id, value: '', isPending: true, isTodo: true });
  }, []);

  const buildTodoItems = useCallback(() => {
    const pending = pendingTodos.map((item) => ({
      id: item.id,
      text: '',
      isPending: true,
    }));
    return [...pending, ...todoPool];
  }, [pendingTodos, todoPool]);

  const handleStartEdit = (item) => {
    setEditingItem({ id: item.id, value: item.text, isPending: Boolean(item.isPending) });
  };

  const handleEditDraftChange = (value) => {
    setEditingItem((current) => (current ? { ...current, value } : current));
  };

  const handleCancelEdit = () => {
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
  };

  const handleSaveEdit = () => {
    const nextValue = editingItem?.value?.trim();
    if (!editingItem?.id) return;

    if (editingItem.isPending) {
      if (!nextValue) {
        if (editingItem.isTodo) {
          setPendingTodos((current) => current.filter((item) => item.id !== editingItem.id));
        } else {
          removePendingInline(editingItem.id);
        }
        setEditingItem(null);
        return;
      }
      if (editingItem.isTodo) {
        onAddTodo(nextValue);
        setPendingTodos((current) => current.filter((item) => item.id !== editingItem.id));
        setEditingItem(null);
        return;
      }
      const pendingItem = pendingInlineItems.find((item) => item.id === editingItem.id);
      const type = pendingItem?.type ?? 'note';
      onAddItem(currentDate, type, nextValue, pendingItem?.category, pendingItem?.priority);
      removePendingInline(editingItem.id);
      setEditingItem(null);
      return;
    }

    if (!nextValue) {
      onDeleteItem(currentDate, editingItem.id);
      setEditingItem(null);
      return;
    }

    onUpdateItem(currentDate, editingItem.id, nextValue);
    setEditingItem(null);
  };

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

  const todoItems = buildTodoItems();
  const canSaveTodoEdit = Boolean(editingItem?.value?.trim());
  const isEditingTodo = Boolean(editingItem?.isTodo);

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
          {DAILY_SECTIONS.map((section) => (
            <DailySection
              key={section.type}
              section={section}
              items={buildSectionItems(section.type)}
              onStartInlineAdd={handleStartInlineAdd}
              currentDate={currentDate}
              editingItemId={editingItem?.id ?? null}
              editingDraftValue={editingItem?.value ?? ''}
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
              copiedId={copiedId}
              onCopy={handleCopy}
            />
          ))}
        </div>

        <Card className="daily-notebook-card daily-notebook-todo-column">
          <div className="daily-notebook-section-head">
            <div>
              <div className="daily-notebook-section-title">
                <span className="daily-notebook-section-icon"><Inbox size={16} strokeWidth={1.8} /></span>
                <strong>待办池</strong>
              </div>
              <p>这里专门放今天没做完、但又不想直接丢掉的事。</p>
            </div>
            <div className="daily-notebook-section-head-actions">
              <Tag className="daily-notebook-section-count">{todoPool.length} 条</Tag>
              <Button
                type="text"
                size="small"
                className="daily-notebook-add-trigger"
                icon={<Plus size={16} strokeWidth={1.8} />}
                onClick={handleStartInlineAddTodo}
                aria-label="添加待办"
              />
            </div>
          </div>

          {todoItems.length ? (
            <div className="daily-notebook-list">
              {todoItems.map((item) => {
                const isEditing = isEditingTodo && editingItem?.id === item.id;
                const isEmptyItem = !item.text?.trim();

                if (isEditing) {
                  return (
                    <div key={item.id} className="daily-notebook-item is-empty">
                      <div className="daily-notebook-item-main">
                        <div className="daily-notebook-item-editor">
                          <Input
                            autoFocus
                            value={editingItem.value}
                            placeholder="手动补一条待办"
                            onChange={(event) => handleEditDraftChange(event.target.value)}
                            onPressEnter={() => {
                              if (canSaveTodoEdit) handleSaveEdit();
                            }}
                            onKeyDown={(event) => {
                              if (event.key === 'Escape') {
                                event.preventDefault();
                                handleCancelEdit();
                              }
                            }}
                          />
                          <Button type="primary" size="small" disabled={!canSaveTodoEdit} onClick={handleSaveEdit}>
                            保存
                          </Button>
                          {canSaveTodoEdit ? (
                            <Button size="small" onClick={handleCancelEdit}>
                              取消
                            </Button>
                          ) : (
                            <Button size="small" danger onClick={handleCancelEdit}>
                              删除
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                return (
                <div key={item.id} className={`daily-notebook-item ${isEmptyItem ? 'is-empty' : ''}`}>
                  <div className="daily-notebook-item-main">
                    <div className="daily-notebook-item-text-row">
                      <span className="daily-notebook-item-text">{item.text}</span>
                      <Dropdown
                        menu={{ items: buildCategoryMenuItems(item.category ?? '', (value) => onUpdateTodoCategory(item.id, value)) }}
                        trigger={['click']}
                      >
                        {item.category ? (
                          <Tag
                            className="daily-notebook-category-tag"
                            style={{ '--category-color': getCategoryOption(item.category)?.color }}
                          >
                            {getCategoryOption(item.category)?.label}
                          </Tag>
                        ) : (
                          <button type="button" className="daily-notebook-category-placeholder">
                            类别
                          </button>
                        )}
                      </Dropdown>
                    </div>
                    <div className="daily-notebook-todo-meta">
                      {item.sourceDate && <Tag>来自 {formatDailyMetaDate(item.sourceDate)}</Tag>}
                    </div>
                  </div>
                  <div className="daily-notebook-item-actions">
                    <Button type="text" size="small" icon={<RotateCcw size={14} strokeWidth={1.8} />} onClick={() => onPromoteTodo(item.id, currentDate)} title="加入今天" />
                    <Button type="text" size="small" danger icon={<Trash2 size={14} strokeWidth={1.8} />} onClick={() => handleDeleteTodoItem(item.id)} title="完成并移除" />
                  </div>
                </div>
                );
              })}
            </div>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="待办池是空的，今天可以轻装上阵。" />
          )}
        </Card>
      </section>
    </div>
  );
}

export default memo(DailyNotebook);
