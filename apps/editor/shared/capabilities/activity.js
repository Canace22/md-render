/**
 * 活动日志：每次工具调用（app 内 AI / MCP）追加一行，字段 who / tool / 目标 id / 结果摘要。
 * 不记录正文。纯函数；写文件由主进程负责。
 */

import { isFailureResult } from '../agentBridgeTools.js';

export const ACTIVITY_SOURCES = Object.freeze({ APP: 'app', MCP: 'mcp', EXTERNAL: 'external' });

const SUMMARY_MAX_CHARS = 80;
const TARGET_KEYS = ['id', 'ids', 'docId', 'targetId', 'proposalId', 'targetFolderId', 'dateKey'];
const pad2 = (value) => String(value).padStart(2, '0');

const truncate = (text, max = SUMMARY_MAX_CHARS) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** 只挑能定位目标的字段，正文类参数（content / text / cards）一律不记 */
export const pickActivityTarget = (args = {}) => {
  const target = {};
  TARGET_KEYS.forEach((key) => {
    if (args?.[key] != null && args[key] !== '') target[key] = args[key];
  });
  return target;
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** 结果摘要：JSON 结果挑 status/name/error，文案取第一句 */
export const summarizeResult = (result) => {
  const text = typeof result === 'string' ? result : JSON.stringify(result ?? '');
  const json = text.trim().startsWith('{') ? parseJson(text) : null;
  if (json && typeof json === 'object') {
    const parts = [json.status, json.name, json.proposalId, json.error, json.message].filter(Boolean);
    return truncate(parts.join(' · ') || (json.ok === false ? '失败' : '完成'));
  }
  return truncate(text.split('\n')[0].trim());
};

export const buildActivityEntry = ({ who = ACTIVITY_SOURCES.APP, client = '', tool, args = {}, result, now = Date.now() }) => ({
  ts: new Date(now).toISOString(),
  who,
  ...(client ? { client } : {}),
  tool,
  target: pickActivityTarget(args),
  ok: !isFailureResult(result),
  summary: summarizeResult(result),
});

/** 按本地时区取日期，作为日志文件名（YYYY-MM-DD） */
export const activityDateKey = (ts = Date.now()) => {
  const date = new Date(ts);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};
