import { memo, useState } from 'react';
import { Button, Calendar, Popover, Tooltip } from 'antd';
import dayjs from 'dayjs';
import { CalendarDays, Check, ChevronLeft, ChevronRight, Copy } from 'lucide-react';

const ICON_SIZE = 15;
const ICON_STROKE = 1.8;

/** 日期栏：前一天 / 后一天 / 今天 / 日历跳转 / 复制为 Markdown（幕布式） */
function DailyToolbar({ dateKey, isToday, copied, onShift, onToday, onPick, onCopy }) {
  const [calendarOpen, setCalendarOpen] = useState(false);

  const calendar = (
    <div className="daily-outline-calendar">
      <Calendar
        fullscreen={false}
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
    </div>
  );
}

export default memo(DailyToolbar);
