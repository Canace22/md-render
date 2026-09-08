import { useCallback, useMemo, useState } from 'react';
import { Button, Card, Checkbox, DatePicker, Dropdown, Empty, Segmented, Tag } from 'antd';
import { NotebookPen, Plus } from 'lucide-react';
import DailyItemRow from './DailyItemRow.jsx';
import { DAILY_TYPE_OPTIONS, buildTypeMenuItems } from './dailyOptions.jsx';

export const ALL_TYPES_FILTER = 'all';

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

  // 只有「已落盘 + 当前可见」的条目能参与批量：草稿还没有真实 id，
  // 被类型筛选挡住的条目也不该被顺手移走
  const selectableIds = useMemo(
    () => items.filter((item) => !item.isPending).map((item) => item.id),
    [items],
  );
  const selectedIds = useMemo(
    () => selectableIds.filter((id) => selected.has(id)),
    [selectableIds, selected],
  );
  const isAllSelected = selectableIds.length > 0 && selectedIds.length === selectableIds.length;

  const toggleAll = useCallback(() => {
    setSelected(isAllSelected ? new Set() : new Set(selectableIds));
  }, [isAllSelected, selectableIds]);

  const exitBatch = useCallback(() => {
    setBatchMode(false);
    setSelected(new Set());
  }, []);

  return { batchMode, selected, selectedIds, toggleBatchMode, toggleItem, isAllSelected, toggleAll, exitBatch };
}

const buildFilterOptions = (countByType, totalCount) => [
  { value: ALL_TYPES_FILTER, label: `全部 ${totalCount}` },
  ...DAILY_TYPE_OPTIONS.map((option) => ({
    value: option.value,
    label: `${option.label} ${countByType[option.value] ?? 0}`,
  })),
];

function DailyEntryList({
  items,
  countByType,
  totalCount,
  typeFilter,
  onTypeFilterChange,
  onStartInlineAdd,
  onMoveItems,
  editingItemId,
  editingDraftValue,
  copiedId,
  ...itemProps
}) {
  const { batchMode, selected, selectedIds, toggleBatchMode, toggleItem, isAllSelected, toggleAll, exitBatch } =
    useBatchSelect(items);
  const [batchDate, setBatchDate] = useState(null);

  const handleBatchMove = useCallback(() => {
    if (!batchDate || selectedIds.length === 0) return;
    onMoveItems(selectedIds, batchDate.format('YYYY-MM-DD'));
    setBatchDate(null);
    exitBatch();
  }, [batchDate, selectedIds, onMoveItems, exitBatch]);

  return (
    <Card className="daily-notebook-card daily-notebook-section">
      <div className="daily-notebook-section-head">
        <div>
          <div className="daily-notebook-section-title">
            <span className="daily-notebook-section-icon">
              <NotebookPen size={16} strokeWidth={1.8} />
            </span>
            <strong>今日记录</strong>
            {totalCount > 0 && <Tag className="daily-notebook-section-count">{totalCount} 条</Tag>}
          </div>
          <p>任务、笔记、事件都在这一条列表里，用标签区分类型。</p>
        </div>
        <div className="daily-notebook-section-head-actions">
          {totalCount > 0 && (
            <Button size="small" type={batchMode ? 'primary' : 'default'} onClick={toggleBatchMode}>
              {batchMode ? '取消批量' : '批量改日期'}
            </Button>
          )}
          <Dropdown menu={{ items: buildTypeMenuItems(onStartInlineAdd) }} trigger={['click']}>
            <Button
              type="text"
              size="small"
              className="daily-notebook-add-trigger"
              icon={<Plus size={16} strokeWidth={1.8} />}
              aria-label="添加记录"
            />
          </Dropdown>
        </div>
      </div>

      {totalCount > 0 && (
        <Segmented
          size="small"
          className="daily-notebook-type-filter"
          value={typeFilter}
          options={buildFilterOptions(countByType, totalCount)}
          onChange={onTypeFilterChange}
        />
      )}

      {items.length ? (
        <>
          {batchMode && (
            <div className="daily-notebook-batch-bar">
              <Checkbox
                checked={isAllSelected}
                indeterminate={selectedIds.length > 0 && !isAllSelected}
                onChange={toggleAll}
              >
                全选
              </Checkbox>
              <span className="daily-notebook-batch-count">已选 {selectedIds.length} 条</span>
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
                disabled={selectedIds.length === 0 || !batchDate}
                onClick={handleBatchMove}
              >
                移到该日期
              </Button>
            </div>
          )}
          <div className="daily-notebook-list">
            {items.map((item) => (
              <DailyItemRow
                key={item.id}
                item={item}
                isEditing={editingItemId === item.id}
                editingDraftValue={editingDraftValue}
                copied={copiedId === item.id}
                batchMode={batchMode}
                isSelected={selected.has(item.id)}
                onToggleSelect={toggleItem}
                {...itemProps}
              />
            ))}
          </div>
        </>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={totalCount > 0 ? '当前类型下还没有记录。' : '今天还没有记录，点右上角「+」添加。'}
        />
      )}
    </Card>
  );
}

export default DailyEntryList;
