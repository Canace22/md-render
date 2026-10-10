/**
 * 活动日志（renderer 侧）：每次工具调用记一条，写到内容库 .agent/activity/<日期>.jsonl，
 * 同时在内存里留最近一批，供活动记录页实时刷新（Web 版只有内存）。
 */

import { buildActivityEntry } from '@shared/capabilities/activity.js';
import { saveActivityEntry } from '../../utils/agentDataBridge.js';

const MAX_MEMORY_ENTRIES = 200;

let recentEntries = [];
const listeners = new Set();

const parseArgs = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

/**
 * 记一条工具调用。失败只打日志，不影响工具结果。
 * @param {{ who: 'app'|'mcp', client?: string, name: string, args?: object|string, result: any }} call
 */
export const recordToolActivity = ({ who, client, name, args, result }) => {
  const entry = buildActivityEntry({ who, client, tool: name, args: parseArgs(args), result });
  recentEntries = [entry, ...recentEntries].slice(0, MAX_MEMORY_ENTRIES);
  listeners.forEach((listener) => listener(entry));
  Promise.resolve(saveActivityEntry(entry)).catch((error) => console.warn('[activity] 写入失败:', error?.message));
  return entry;
};

export const getRecentActivity = () => recentEntries;

/** 有新记录时回调；返回取消订阅 */
export const subscribeActivity = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/**
 * 包一层 executeTool：执行后记活动日志。MCP 控制桥用。
 * @returns {(toolCall: object, host: object) => Promise<any>}
 */
export const withActivityLog = (executeTool, { who, client = '' }) => async (toolCall, host) => {
  const result = await executeTool(toolCall, host);
  recordToolActivity({ who, client, name: toolCall?.function?.name, args: toolCall?.function?.arguments, result });
  return result;
};

/** 测试用 */
export const resetActivityMemory = () => {
  recentEntries = [];
};
