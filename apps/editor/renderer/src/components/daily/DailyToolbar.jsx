import { memo, useState } from 'react';
import { Button, Calendar, Popover, Select, Tooltip } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import dayjs from 'dayjs';
// 仅注册中文语言包（不切全局 locale），供 Calendar 按 locale 渲染星期/月份
import 'dayjs/locale/zh-cn';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy, PanelRightOpen } from 'lucide-react';

const ICON_SIZE = 15;
const ICON_STROKE = 1.8;
const YEAR_RANGE = 10;
const MONTHS_PER_YEAR = 12;
const MONTH_OPTIONS = Array.from({ length: MONTHS_PER_YEAR }, (_, month) => ({ value: month, label: `${month + 1}月` }));

/** 日历头部：只保留年、月下拉（速记只需选“天”，不需要 Month/Year 视图切换） */
function renderCalendarHeader({ value, onChange }) {
  const currentYear = value.year();
  const yearOptions = Array.from({ length: YEAR_RANGE * 2 + 1 }, (_, i) => {
    const year = currentYear - YEAR_RANGE + i;
    return { value: year, label: `${year}年` };
  });
  return (
    <div className="daily-outline-calendar-header">
      <Select size="small" value={currentYear} options={yearOptions} onChange={(year) => onChange(value.year(year))} />
      <Select size="small" value={value.month()} options={MONTH_OPTIONS} onChange={(month) => onChange(value.month(month))} />
    </div>
  );
}

/** 日期栏：前一天 / 后一天 / 今天 / 日历跳转 / 复制为 Markdown / 大纲⇄导图（幕布式）/ 笔记汇总开关 */
function DailyToolbar({
  dateKey,
  isToday,
  copied,
  onShift,
  onToday,
  onPick,
  onCopy,
  notesOpen = false,
  onToggleNotes,
  viewSwitch = null,
}) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const calendar = (
    <div className="daily-outline-calendar">
      <Calendar
        fullscreen={false}
        locale={zhCN.Calendar}
        headerRender={renderCalendarHeader}
        value={dayjs(dateKey)}
        onSelect={(date, info) => {
          if (info?.source && info.source !== 'date') return;
          onPick(date.format('YYYY-MM-DD'));
          setCalendarOpen(false);
        }}
      />
    </div>
  );

  return (
    <div className="daily-outline-toolbar">
      <div className="daily-outline-btn-group">
        <Button type="text" size="small" aria-label="前一天" icon={<ChevronLeft size={ICON_SIZE} strokeWidth={ICON_STROKE} />} onClick={() => onShift(-1)} />
        <Button type="text" size="small" aria-label="后一天" icon={<ChevronRight size={ICON_SIZE} strokeWidth={ICON_STROKE} />} onClick={() => onShift(1)} />
      </div>
      <div className="daily-outline-btn-group">
        <Button type="text" size="small" disabled={isToday} onClick={onToday}>今天</Button>
        <Popover trigger="click" placement="bottomLeft" open={calendarOpen} onOpenChange={setCalendarOpen} content={calendar}>
          <Button type="text" size="small" aria-label="选择日期" icon={<CalendarDays size={ICON_SIZE} strokeWidth={ICON_STROKE} />} />
        </Popover>
      </div>
      <Tooltip title="复制为 Markdown，可直接粘给其他 AI">
        <Button
          type="text"
          size="small"
          className="daily-outline-btn-group"
          icon={copied ? <Check size={ICON_SIZE} strokeWidth={ICON_STROKE} /> : <Copy size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
          onClick={onCopy}
        >
          {copied ? '已复制' : '复制'}
        </Button>
      </Tooltip>
      {viewSwitch}
      {onToggleNotes && !notesOpen ? (
        <Tooltip title="按周汇总所有笔记，方便查看和整理">
          <Button
            type="text"
            size="small"
            className="daily-outline-btn-group"
            icon={<PanelRightOpen size={ICON_SIZE} strokeWidth={ICON_STROKE} />}
            onClick={onToggleNotes}
          >
            笔记汇总
          </Button>
        </Tooltip>
      ) : null}
    </div>
  );
}

export default memo(DailyToolbar);
