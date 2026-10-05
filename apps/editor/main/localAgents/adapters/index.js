/** 已适配的本地 agent：id → 适配器。加新 agent 时在这里登记（注册表见 shared/localAgents.js） */
import claudeCode from './claudeCode.js';
import codex from './codex.js';
import cursor from './cursor.js';

const ADAPTERS = Object.freeze({
  [codex.id]: codex,
  [claudeCode.id]: claudeCode,
  [cursor.id]: cursor,
});

export const getAdapter = (id) => ADAPTERS[id] || null;
