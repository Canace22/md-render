import { memo, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Input, Tag } from 'antd';
import {
  CalendarClock,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  Inbox,
  ListTodo,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  formatDailyHeading,
  formatDailyMetaDate,
  getDailyEntry,
  getTodayDateKey,
  shiftDateKey,
} from '../utils/dailyWorkspace.js';

const DAILY_SECTIONS = [
  {
    type: 'task',
    title: '今日任务',
    description: '只放今天准备推进的事，做不完再移去待办池。',
    placeholder: '写下一件今天要推进的事',
    icon: <ListTodo size={16} strokeWidth={1.8} />,
    emptyText: '今天的任务先留白，需要时再加。',
  },
  {
    type: 'event',
    title: '事件',
    description: '记录约定、会议、临时插入的安排。',
    placeholder: '记一条今天发生的事件',
    icon: <CalendarClock size={16} strokeWidth={1.8} />,
    emptyText: '今天还没有记录事件。',
  },
  {
    type: 'note',
    title: '笔记',
    description: '随手写想法、观察和一闪而过的结论。',
    placeholder: '记一条今天的想法或观察',
    icon: <FileText size={16} strokeWidth={1.8} />,
    emptyText: '还没有留下任何笔记。',
  },
];

function DailySection({
  section,
  items,
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
  onDeleteItem,
}) {
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
      </div>

      <div className="daily-notebook-composer">
        <Input
          value={draftValue}
          placeholder={section.placeholder}
          onChange={(event) => onDraftChange(section.type, event.target.value)}
          onPressEnter={() => onSubmit(section.type)}
        />
        <Button type="primary" onClick={() => onSubmit(section.type)}>添加</Button>
      </div>

      {items.length ? (
        <div className="daily-notebook-list">
          {items.map((item) => {
            const isEditing = editingItemId === item.id;
            const canSaveEdit = Boolean(editingDraftValue?.trim());

            return (
              <div key={item.id} className={`daily-notebook-item ${item.done ? 'is-done' : ''}`}>
                <div className="daily-notebook-item-main">
                  <div className="daily-notebook-item-text-row">
                    {section.type === 'task' && (
                      <button
                        type="button"
                        className={`daily-notebook-check ${item.done ? 'is-done' : ''}`}
                        onClick={() => onToggleTask(item.id)}
                        aria-label={item.done ? '标记为未完成' : '标记为已完成'}
                      >
                        {item.done && <Check size={13} strokeWidth={2.4} />}
                      </button>
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

                {!isEditing && (
                  <div className="daily-notebook-item-actions">
                    <Button type="text" size="small" onClick={() => onStartEdit(item)}>
                      编辑
                    </Button>
                    {section.type === 'task' && !item.done && (
                      <Button type="text" size="small" onClick={() => onMoveTaskToTodo(item.id)}>
                        移到待办
                      </Button>
                    )}
                    <Button type="text" size="small" danger icon={<Trash2 size={14} strokeWidth={1.8} />} onClick={() => onDeleteItem(item.id)} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
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
  onMoveTaskToTodo,
  onAddTodo,
  onPromoteTodo,
  onRemoveTodo,
}) {
  const [drafts, setDrafts] = useState({ task: '', event: '', note: '', todo: '' });
  const [editingItem, setEditingItem] = useState(null);
  const currentDate = dailyWorkspace?.currentDate || getTodayDateKey();
  const todayKey = getTodayDateKey();
  const dailyEntry = useMemo(() => getDailyEntry(dailyWorkspace, currentDate), [currentDate, dailyWorkspace]);
  const todoPool = useMemo(() => {
    return [...(dailyWorkspace?.todoPool ?? [])].sort((left, right) => right.updatedAt - left.updatedAt);
  }, [dailyWorkspace]);

  const itemsByType = useMemo(() => {
    const grouped = { task: [], event: [], note: [] };
    for (const item of dailyEntry.items) {
      grouped[item.type]?.push(item);
    }
    grouped.task.sort((left, right) => Number(left.done) - Number(right.done));
    return grouped;
  }, [dailyEntry.items]);

  const stats = useMemo(() => {
    const tasks = itemsByType.task;
    return [
      { key: 'open', label: '未完成', value: tasks.filter((item) => !item.done).length },
      { key: 'done', label: '已完成', value: tasks.filter((item) => item.done).length },
      { key: 'notes', label: '今日记录', value: dailyEntry.items.length },
      { key: 'todo', label: '待办池', value: todoPool.length },
    ];
  }, [dailyEntry.items.length, itemsByType.task, todoPool.length]);

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
          <span className="daily-notebook-eyebrow">Daily Scratchpad</span>
          <h1>{formatDailyHeading(currentDate)}</h1>
          <p>把今天真正要处理的任务、事件和笔记放在一页里；做不完的再沉到待办池，明天手动带回来。</p>
        </div>

        <div className="daily-notebook-date-panel">
          <div className="daily-notebook-date-actions">
            <Button icon={<ChevronLeft size={14} strokeWidth={1.8} />} onClick={() => onSetCurrentDate(shiftDateKey(currentDate, -1))} />
            <Button icon={<ChevronRight size={14} strokeWidth={1.8} />} onClick={() => onSetCurrentDate(shiftDateKey(currentDate, 1))} />
            <Button type={currentDate === todayKey ? 'primary' : 'default'} onClick={() => onSetCurrentDate(todayKey)}>今天</Button>
          </div>
          <div className="daily-notebook-date-input-row">
            <CalendarDays size={16} strokeWidth={1.8} />
            <input
              className="daily-notebook-date-input"
              type="date"
              value={currentDate}
              onChange={(event) => onSetCurrentDate(event.target.value)}
            />
          </div>
        </div>
      </section>

      <section className="daily-notebook-stats">
        {stats.map((item) => (
          <div key={item.key} className="daily-notebook-stat">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </section>

      <section className="daily-notebook-grid">
        <div className="daily-notebook-main-column">
          {DAILY_SECTIONS.map((section) => (
            <DailySection
              key={section.type}
              section={section}
              items={itemsByType[section.type]}
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
              onDeleteItem={(itemId) => onDeleteItem(currentDate, itemId)}
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
            <Button onClick={handleSubmitTodo}>加入</Button>
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
                    <Button type="text" size="small" icon={<RotateCcw size={14} strokeWidth={1.8} />} onClick={() => onPromoteTodo(item.id, currentDate)}>
                      加入今天
                    </Button>
                    <Button type="text" size="small" danger icon={<Trash2 size={14} strokeWidth={1.8} />} onClick={() => onRemoveTodo(item.id)}>
                      完成
                    </Button>
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
