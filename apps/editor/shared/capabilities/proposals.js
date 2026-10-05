/**
 * 提案：覆盖正文、删除条目这类不可逆操作，先生成提案、立即返回 pending，等用户在收件箱里应用或放弃。
 * 纯数据和纯函数；存储（store / .agent/proposals/*.json）由调用方负责。
 */

import { hashContent } from './contentHash.js';

export const PROPOSAL_KINDS = Object.freeze({ EDIT: 'edit', DELETE: 'delete' });

export const PROPOSAL_STATUS = Object.freeze({
  PENDING: 'pending',
  APPLIED: 'applied',
  DISCARDED: 'discarded',
  CONFLICT: 'conflict',
});

const ID_RANDOM_LENGTH = 6;
const RANDOM_RADIX = 36;
const SUMMARY_NAMES_LIMIT = 3;

export const createProposalId = (now = Date.now(), random = Math.random) =>
  `p-${now.toString(RANDOM_RADIX)}-${random().toString(RANDOM_RADIX).slice(2, 2 + ID_RANDOM_LENGTH)}`;

const baseFields = ({ id, who = 'app', tool = '', now = Date.now() }) => ({
  id: id || createProposalId(now),
  who,
  tool,
  status: PROPOSAL_STATUS.PENDING,
  createdAt: new Date(now).toISOString(),
  resolvedAt: null,
});

/** 改正文提案：记下提案时的原文和 hash，应用前再比一次 */
export const buildEditProposal = ({ target, newText, ...rest }) => ({
  ...baseFields(rest),
  kind: PROPOSAL_KINDS.EDIT,
  targetId: target.id,
  targetName: target.name || '未命名',
  baseHash: hashContent(target.content ?? ''),
  oldText: String(target.content ?? ''),
  newText: String(newText ?? ''),
});

/** 删除提案：只记 id 和名称 */
export const buildDeleteProposal = ({ targets, reason = '', ...rest }) => ({
  ...baseFields(rest),
  kind: PROPOSAL_KINDS.DELETE,
  targets: targets.map(({ id, name }) => ({ id, name: name || '未命名' })),
  reason: String(reason ?? ''),
});

export const isPending = (proposal) => proposal?.status === PROPOSAL_STATUS.PENDING;

/**
 * 应用前检查：改正文提案要求当前内容和提案时一致，否则判为冲突，避免覆盖用户刚改的内容。
 * @returns {{ ok: true } | { ok: false, status: string, error: string }}
 */
export const checkProposalApplicable = (proposal, currentContent) => {
  if (!isPending(proposal)) return { ok: false, status: proposal?.status, error: '提案已处理过' };
  if (proposal.kind === PROPOSAL_KINDS.EDIT && hashContent(currentContent ?? '') !== proposal.baseHash) {
    return { ok: false, status: PROPOSAL_STATUS.CONFLICT, error: '文档在提案之后被改过，为避免覆盖已放弃这次改动，请让 AI 重新读取后再提' };
  }
  return { ok: true };
};

export const resolveProposal = (proposal, status, now = Date.now()) => ({
  ...proposal,
  status,
  resolvedAt: new Date(now).toISOString(),
});

/** 收件箱里一行的说明 */
export const summarizeProposal = (proposal) => {
  if (proposal.kind === PROPOSAL_KINDS.DELETE) {
    const names = proposal.targets.slice(0, SUMMARY_NAMES_LIMIT).map((t) => `「${t.name}」`).join('、');
    const more = proposal.targets.length > SUMMARY_NAMES_LIMIT ? ` 等 ${proposal.targets.length} 个` : '';
    return `删除 ${names}${more}`;
  }
  return `修改「${proposal.targetName}」`;
};

/** 给 agent 的状态结果（不带正文） */
export const toProposalStatus = (proposal) => (proposal
  ? {
    ok: true,
    proposalId: proposal.id,
    kind: proposal.kind,
    status: proposal.status,
    summary: summarizeProposal(proposal),
    createdAt: proposal.createdAt,
    resolvedAt: proposal.resolvedAt,
  }
  : { ok: false, error: '找不到这个提案' });
