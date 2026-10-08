/**
 * 版本历史的纯函数工具：快照时间文案。无副作用，便于单测。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const UNKNOWN_TIME_LABEL = '未知时间';

const pad2 = (value) => String(value).padStart(2, '0');

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/**
 * 快照时间 → 「今天 14:05」「昨天 09:12」「10月3日 18:20」，跨年再带年份。
 * @param {number} timestamp 毫秒时间戳
 * @param {number} [now] 当前时间，单测注入
 */
export const formatVersionTime = (timestamp, now = Date.now()) => {
  const time = Number(timestamp);
  if (!Number.isFinite(time) || time <= 0) return UNKNOWN_TIME_LABEL;
  const date = new Date(time);
  const current = new Date(now);
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  const dayDiff = Math.round((startOfDay(current) - startOfDay(date)) / DAY_MS);
  if (dayDiff === 0) return `今天 ${clock}`;
  if (dayDiff === 1) return `昨天 ${clock}`;
  const day = `${date.getMonth() + 1}月${date.getDate()}日`;
  const year = date.getFullYear() === current.getFullYear() ? '' : `${date.getFullYear()}年`;
  return `${year}${day} ${clock}`;
};

