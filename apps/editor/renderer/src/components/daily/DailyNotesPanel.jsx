import { memo, useMemo, useState } from 'react';
import { Button, Segmented, Tooltip } from 'antd';
import { CheckCircle2, ChevronDown, ChevronRight, Circle, PanelRightClose } from 'lucide-react';
import {
  collectDailyNotes,
  filterNotes,
  formatNoteDate,
  groupNotesByWeek,
  NOTE_FILTERS,
} from '../../utils/dailyNotes.js';

const ICON_SIZE = 15;
const ICON_STROKE = 1.8;

const FILTER_OPTIONS = [
  { value: NOTE_FILTERS.PENDING, label: '未整理' },
  { value: NOTE_FILTERS.ORGANIZED, label: '已整理' },
  { value: NOTE_FILTERS.ALL, label: '全部' },
];

const EMPTY_TEXT = {
  [NOTE_FILTERS.ALL]: '还没有笔记。写在「💡 笔记」分区里的内容会按周汇总到这里。',
  [NOTE_FILTERS.PENDING]: '笔记都整理完了 🎉',
  [NOTE_FILTERS.ORGANIZED]: '还没有标记为已整理的笔记。',
};

function NoteItem({ note, onOpen, onToggle }) {
  const toggleTitle = note.organized ? '取消已整理' : '标为已整理';
  return (
    <li className={`daily-notes-item${note.organized ? ' is-organized' : ''}`}>
      <button type="button" className="daily-notes-item-main" onClick={() => onOpen(note.date, note.blockId)}>
        <span className="daily-notes-item-date">{formatNoteDate(note.date)}</span>
        <span className="daily-notes-item-title">{note.title || '（无标题）'}</span>
        {note.detail ? <span className="daily-notes-item-detail">{note.detail}</span> : null}
      </button>
      {note.canOrganize ? (
        <Tooltip title={toggleTitle}>
          <Button
            type="text"
            size="small"
            aria-label={toggleTitle}
            className="daily-notes-item-toggle"
            icon={note.organized
              ? <CheckCircle2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
              : <Circle size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            onClick={() => onToggle(note.date, note.blockId, !note.organized)}
          />
        </Tooltip>
      ) : null}
    </li>
  );
}

function WeekGroup({ group, expanded, onToggleExpanded, onOpen, onToggle }) {
  const Chevron = expanded ? ChevronDown : ChevronRight;
  return (
    <section className="daily-notes-week">
      <button type="button" className="daily-notes-week-header" onClick={() => onToggleExpanded(group.weekStart)}>
        <Chevron size={ICON_SIZE} strokeWidth={ICON_STROKE} />
        <span className="daily-notes-week-label">{group.label}</span>
        {group.tag ? <span className="daily-notes-week-tag">{group.tag}</span> : null}
        <span className="daily-notes-week-count">{group.organizedCount}/{group.notes.length}</span>
      </button>
      {expanded ? (
        <ul className="daily-notes-list">
          {group.notes.map((note) => <NoteItem key={note.key} note={note} onOpen={onOpen} onToggle={onToggle} />)}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * 右侧「笔记汇总」：所有日子「💡 笔记」里的条目按周归档。
 * 点条目跳到那天那一行；右侧圆圈标记已整理（行尾加 #已整理）。
 * 周默认展开；只有「全部」里已经整理完的周默认收起。手动点过的以手动为准。
 */
function DailyNotesPanel({ dailyWorkspace, today, onOpenNote, onToggleOrganized, onClose }) {
  const [filter, setFilter] = useState(NOTE_FILTERS.PENDING);
  const [expandedOverrides, setExpandedOverrides] = useState({});
  const notes = useMemo(() => collectDailyNotes(dailyWorkspace), [dailyWorkspace]);
  const groups = useMemo(() => groupNotesByWeek(filterNotes(notes, filter), today), [notes, filter, today]);
  const pendingCount = useMemo(() => notes.filter((note) => !note.organized).length, [notes]);

  const isExpanded = (group) => expandedOverrides[group.weekStart]
    ?? (filter !== NOTE_FILTERS.ALL || group.organizedCount < group.notes.length);
  const handleToggleExpanded = (weekStart) => {
    const group = groups.find((item) => item.weekStart === weekStart);
    setExpandedOverrides((prev) => ({ ...prev, [weekStart]: !isExpanded(group) }));
  };

  return (
    <aside className="daily-notes-panel" aria-label="笔记汇总">
      <header className="daily-notes-panel-header">
        <div className="daily-notes-panel-title">
          <span>笔记汇总</span>
          <span className="daily-notes-panel-summary">待整理 {pendingCount} / 共 {notes.length}</span>
        </div>
        <Tooltip title="收起">
          <Button
            type="text"
            size="small"
            aria-label="收起笔记汇总"
            icon={<PanelRightClose size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            onClick={onClose}
          />
        </Tooltip>
      </header>
      <Segmented block size="small" className="daily-notes-filter" value={filter} options={FILTER_OPTIONS} onChange={setFilter} />
      <div className="daily-notes-body">
        {groups.length ? groups.map((group) => (
          <WeekGroup
            key={group.weekStart}
            group={group}
            expanded={isExpanded(group)}
            onToggleExpanded={handleToggleExpanded}
            onOpen={onOpenNote}
            onToggle={onToggleOrganized}
          />
        )) : <p className="daily-notes-empty">{EMPTY_TEXT[filter]}</p>}
      </div>
    </aside>
  );
}

export default memo(DailyNotesPanel);
