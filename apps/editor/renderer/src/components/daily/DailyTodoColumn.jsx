import { Button, Card, Empty, Input, Tag } from 'antd';
import { Inbox, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { formatDailyMetaDate } from '../../utils/dailyWorkspace.js';
import { DailyCategoryControl } from './DailyItemRow.jsx';

function DailyTodoColumn({
  items,
  totalCount,
  editingItem,
  onStartInlineAdd,
  onEditDraftChange,
  onSaveEdit,
  onCancelEdit,
  onPromoteTodo,
  onDeleteTodo,
  onUpdateTodoCategory,
}) {
  const canSaveEdit = Boolean(editingItem?.value?.trim());
  const isEditingTodo = Boolean(editingItem?.isTodo);

  return (
    <Card className="daily-notebook-card daily-notebook-todo-column">
      <div className="daily-notebook-section-head">
        <div>
          <div className="daily-notebook-section-title">
            <span className="daily-notebook-section-icon">
              <Inbox size={16} strokeWidth={1.8} />
            </span>
            <strong>待办池</strong>
          </div>
          <p>这里专门放今天没做完、但又不想直接丢掉的事。</p>
        </div>
        <div className="daily-notebook-section-head-actions">
          <Tag className="daily-notebook-section-count">{totalCount} 条</Tag>
          <Button
            type="text"
            size="small"
            className="daily-notebook-add-trigger"
            icon={<Plus size={16} strokeWidth={1.8} />}
            onClick={onStartInlineAdd}
            aria-label="添加待办"
          />
        </div>
      </div>

      {items.length ? (
        <div className="daily-notebook-list">
          {items.map((item) => {
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
                      {canSaveEdit ? (
                        <Button size="small" onClick={onCancelEdit}>
                          取消
                        </Button>
                      ) : (
                        <Button size="small" danger onClick={onCancelEdit}>
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
                    <DailyCategoryControl
                      category={item.category}
                      onSelect={(value) => onUpdateTodoCategory(item.id, value)}
                    />
                  </div>
                  <div className="daily-notebook-todo-meta">
                    {item.sourceDate && <Tag>来自 {formatDailyMetaDate(item.sourceDate)}</Tag>}
                  </div>
                </div>
                <div className="daily-notebook-item-actions">
                  <Button
                    type="text"
                    size="small"
                    icon={<RotateCcw size={14} strokeWidth={1.8} />}
                    onClick={() => onPromoteTodo(item.id)}
                    title="加入今天"
                  />
                  <Button
                    type="text"
                    size="small"
                    danger
                    icon={<Trash2 size={14} strokeWidth={1.8} />}
                    onClick={() => onDeleteTodo(item.id)}
                    title="完成并移除"
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="待办池是空的，今天可以轻装上阵。" />
      )}
    </Card>
  );
}

export default DailyTodoColumn;
