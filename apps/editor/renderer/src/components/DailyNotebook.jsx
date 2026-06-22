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

const getPriorityColor = (priority) => {
  return PRIORITY_OPTIONS.find((opt) => opt.value === priority)?.color ?? '#f59e0b';
};

const PRIORITY_CYCLE = { high: 'medium', medium: 'low', low: 'high' };

const cyclePriority = (current) => PRIORITY_CYCLE[current] ?? 'medium';

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
  draftValue,
  onDraftChange,
  onSubmit,
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
  copiedId,
  onCopy,
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
          </div>
          <p>{section.description}</p>
        </div>
        {isNote && items.length > 0 && (
          <Button size="small" type={batchMode ? 'primary' : 'default'} onClick={toggleBatchMode}>
            {batchMode ? '取消批量' : '批量改日期'}
          </Button>
        )}
      </div>

      <div className="daily-notebook-composer">
        <Input
          value={draftValue}
          placeholder={section.placeholder}
          onChange={(event) => onDraftChange(section.type, event.target.value)}
          onPressEnter={() => onSubmit(section.type)}
        />
        <Button type="primary" onClick={() => onSubmit(section.type)} icon={<Plus size={14} strokeWidth={2} />} />
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

              return (
                <div key={item.id} className={`daily-notebook-item ${item.done ? 'is-done' : ''}`}>
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
                          <div
                            className="daily-notebook-priority-dot clickable"
                            style={{ backgroundColor: getPriorityColor(item.priority) }}
                            title={`点击切换优先级 (当前: ${PRIORITY_OPTIONS.find((opt) => opt.value === item.priority)?.label ?? '中'})`}
                            onClick={() => onUpdatePriority(item.id, cyclePriority(item.priority))}
                          />
                        </div>
                      )}
                      {isEditing ? (
                        <div className="daily-notebook-item-editor">
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
                            保存
                          </Button>
                          <Button size="small" onClick={onCancelEdit}>
                            取消
                          </Button>
                        </div>
                      ) : (
                        <span
                          className="daily-notebook-item-text"
                          onDoubleClick={() => onStartEdit(item)}
                        >
                          {item.text}
                        </span>
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
}) {
  const [drafts, setDrafts] = useState({ task: '', event: '', note: '', todo: '' });
  const [editingItem, setEditingItem] = useState(null);
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

  const handleDraftChange = (type, value) => {
    setDrafts((current) => ({ ...current, [type]: value }));
  };

  const handleSubmit = (type) => {
    const nextValue = drafts[type]?.trim();
    if (!nextValue) return;
    onAddItem(currentDate, type, nextValue);
    setDrafts((current) => ({ ...current, [type]: '' }));
  };

  const handleSubmitTodo = () => {
    const nextValue = drafts.todo?.trim();
    if (!nextValue) return;
    onAddTodo(nextValue);
    setDrafts((current) => ({ ...current, todo: '' }));
  };

  const handleStartEdit = (item) => {
    setEditingItem({ id: item.id, value: item.text });
  };

  const handleEditDraftChange = (value) => {
    setEditingItem((current) => (current ? { ...current, value } : current));
  };

  const handleCancelEdit = () => {
    setEditingItem(null);
  };

  const handleSaveEdit = () => {
    const nextValue = editingItem?.value?.trim();
    if (!editingItem?.id || !nextValue) return;
    onUpdateItem(currentDate, editingItem.id, nextValue);
    setEditingItem(null);
  };

  useEffect(() => {
    setEditingItem(null);
  }, [currentDate]);

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
              items={itemsByType[section.type]}
              currentDate={currentDate}
              draftValue={drafts[section.type]}
              onDraftChange={handleDraftChange}
              onSubmit={handleSubmit}
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
              onDeleteItem={(itemId) => onDeleteItem(currentDate, itemId)}
              onUpdatePriority={(itemId, priority) => onUpdateItemPriority(currentDate, itemId, priority)}
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
            <Tag>{todoPool.length} 条</Tag>
          </div>

          <div className="daily-notebook-composer">
            <Input
              value={drafts.todo}
              placeholder="手动补一条待办"
              onChange={(event) => handleDraftChange('todo', event.target.value)}
              onPressEnter={handleSubmitTodo}
            />
            <Button type="primary" onClick={handleSubmitTodo} icon={<Plus size={14} strokeWidth={2} />} />
          </div>

          {todoPool.length ? (
            <div className="daily-notebook-list">
              {todoPool.map((item) => (
                <div key={item.id} className="daily-notebook-item">
                  <div className="daily-notebook-item-main">
                    <span className="daily-notebook-item-text">{item.text}</span>
                    <div className="daily-notebook-todo-meta">
                      {item.sourceDate && <Tag>来自 {formatDailyMetaDate(item.sourceDate)}</Tag>}
                    </div>
                  </div>
                  <div className="daily-notebook-item-actions">
                    <Button type="text" size="small" icon={<RotateCcw size={14} strokeWidth={1.8} />} onClick={() => onPromoteTodo(item.id, currentDate)} title="加入今天" />
                    <Button type="text" size="small" danger icon={<Trash2 size={14} strokeWidth={1.8} />} onClick={() => onRemoveTodo(item.id)} title="完成并移除" />
                  </div>
                </div>
              ))}
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
