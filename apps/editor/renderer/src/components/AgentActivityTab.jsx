import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { activityDateKey } from '../../../shared/capabilities/activity.js';
import { shouldLogActivity } from '../../../shared/capabilities/riskLevels.js';
import { getRecentActivity, subscribeActivity } from '../core/agent/activityLog.js';
import { getToolLabel } from '../core/agent/toolRegistry.js';
import { fetchActivityEntries, isAgentDataSupported } from '../utils/agentDataBridge.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SOURCE_LABELS = Object.freeze({ app: 'app 内 AI', mcp: '外部 AI', external: '外部改动', 'local-agent': '本机 agent' });
const CLIENT_NAMED_SOURCES = new Set(['mcp', 'local-agent']);

const shiftDateKey = (dateKey, days) => activityDateKey(new Date(`${dateKey}T12:00:00`).getTime() + days * DAY_MS);

const formatTime = (ts) => {
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString('zh-CN', { hour12: false });
};

const formatTarget = (target = {}) => Object.values(target)
  .map((value) => (Array.isArray(value) ? value.join('、') : String(value)))
  .join(' · ');

const sourceLabel = (entry) => (CLIENT_NAMED_SOURCES.has(entry.who) && entry.client ? entry.client : SOURCE_LABELS[entry.who] || entry.who);

/** 某天的记录：桌面版读 .agent/activity 文件，Web 版用内存里的 */
const loadEntries = async (dateKey) => {
  if (isAgentDataSupported()) return fetchActivityEntries({ dateKey });
  return getRecentActivity().filter((entry) => activityDateKey(entry.ts) === dateKey);
};

/**
 * AI 面板「活动」页：按时间列出工具调用，标注来源（app 内 AI / 外部 AI / 外部改动）。
 */
export default function AgentActivityTab() {
  const today = activityDateKey();
  const [dateKey, setDateKey] = useState(today);
  const [entries, setEntries] = useState([]);
  const [changesOnly, setChangesOnly] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    try {
      setEntries(await loadEntries(dateKey));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [dateKey]);

  useEffect(() => { reload(); }, [reload]);

  // 看的是今天时，新记录实时插到最前面
  useEffect(() => subscribeActivity((entry) => {
    if (activityDateKey(entry.ts) === dateKey) setEntries((prev) => [entry, ...prev]);
  }), [dateKey]);

  const visible = useMemo(
    () => (changesOnly ? entries.filter((entry) => entry.who === 'external' || shouldLogActivity(entry.tool)) : entries),
    [entries, changesOnly],
  );

  return (
    <div className="agent-panel__tab-panel agent-activity" role="tabpanel" aria-label="活动">
      <div className="agent-activity__head">
        <button type="button" onClick={() => setDateKey(shiftDateKey(dateKey, -1))} aria-label="前一天"><ChevronLeft size={14} /></button>
        <span className="agent-activity__date">{dateKey === today ? `今天 ${dateKey}` : dateKey}</span>
        <button type="button" onClick={() => setDateKey(shiftDateKey(dateKey, 1))} disabled={dateKey >= today} aria-label="后一天"><ChevronRight size={14} /></button>
        <label className="agent-activity__filter">
          <input type="checkbox" checked={changesOnly} onChange={(e) => setChangesOnly(e.target.checked)} />
          只看改动
        </label>
        <button type="button" onClick={reload} aria-label="刷新"><RefreshCw size={13} /></button>
      </div>
      {error && <div className="agent-panel__skill-warnings">{error}</div>}
      {visible.length === 0 ? (
        <div className="agent-panel__empty">这天没有{changesOnly ? '改动类' : ''}操作记录。</div>
      ) : (
        <ul className="agent-activity__list">
          {visible.map((entry, index) => (
            <li key={`${entry.ts}-${index}`} className={`agent-activity__item${entry.ok ? '' : ' is-failed'}`}>
              <span className="agent-activity__time">{formatTime(entry.ts)}</span>
              <span className={`agent-activity__source is-${entry.who}`}>{sourceLabel(entry)}</span>
              <span className="agent-activity__main">
                <span className="agent-activity__tool">{getToolLabel(entry.tool)}</span>
                {formatTarget(entry.target) && <span className="agent-activity__target">{formatTarget(entry.target)}</span>}
                <span className="agent-activity__summary">{entry.summary}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
