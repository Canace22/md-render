/**
 * 内容库 `.agent/` 下的 agent 数据文件（主进程 fs 实现）：
 * - proposals/<id>.json   待确认改动（重启后还在，外部也能看到）
 * - activity/<日期>.jsonl  工具调用活动日志，一行一条
 */

import fsp from 'fs/promises';
import path from 'path';
import { activityDateKey } from '@shared/capabilities/activity.js';

export const AGENT_DATA_DIR_NAME = '.agent';
const PROPOSALS_DIR = 'proposals';
const ACTIVITY_DIR = 'activity';
const PROPOSAL_ID_RE = /^p-[a-z0-9-]+$/;
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_ACTIVITY_LIMIT = 200;
const MISSING = 'ENOENT';

export const getAgentDataDir = (vaultRootPath) => path.join(vaultRootPath, AGENT_DATA_DIR_NAME);

const assertProposalId = (id) => {
  if (!PROPOSAL_ID_RE.test(String(id ?? ''))) throw new Error(`提案 id 不合法：${id}`);
};

export async function writeProposalFile(agentDir, proposal) {
  assertProposalId(proposal?.id);
  const dir = path.join(agentDir, PROPOSALS_DIR);
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${proposal.id}.json`);
  await fsp.writeFile(filePath, `${JSON.stringify(proposal, null, 2)}\n`, 'utf8');
  return filePath;
}

/** 读全部提案，坏文件跳过；按创建时间倒序 */
export async function readProposalFiles(agentDir) {
  const dir = path.join(agentDir, PROPOSALS_DIR);
  let names;
  try {
    names = await fsp.readdir(dir);
  } catch (error) {
    if (error.code === MISSING) return [];
    throw error;
  }
  const items = await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    try {
      return JSON.parse(await fsp.readFile(path.join(dir, name), 'utf8'));
    } catch {
      return null;
    }
  }));
  return items
    .filter((item) => item && PROPOSAL_ID_RE.test(String(item.id ?? '')))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function appendActivityEntry(agentDir, entry) {
  const dir = path.join(agentDir, ACTIVITY_DIR);
  await fsp.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${activityDateKey(entry?.ts)}.jsonl`);
  await fsp.appendFile(filePath, `${JSON.stringify(entry)}\n`, 'utf8');
  return filePath;
}

/** 读某天的活动日志，最新的在前；坏行跳过 */
export async function readActivityEntries(agentDir, { dateKey = activityDateKey(), limit = DEFAULT_ACTIVITY_LIMIT } = {}) {
  if (!DATE_KEY_RE.test(dateKey)) throw new Error(`日期不合法：${dateKey}`);
  let raw;
  try {
    raw = await fsp.readFile(path.join(agentDir, ACTIVITY_DIR, `${dateKey}.jsonl`), 'utf8');
  } catch (error) {
    if (error.code === MISSING) return [];
    throw error;
  }
  const entries = raw.split('\n').filter(Boolean).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
  return entries.reverse().slice(0, limit);
}
