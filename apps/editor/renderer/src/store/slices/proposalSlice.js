import {
  PROPOSAL_KINDS,
  PROPOSAL_STATUS,
  buildDeleteProposal,
  buildEditProposal,
  checkProposalApplicable,
  isPending,
  resolveProposal,
} from '@shared/capabilities/proposals.js';
import { isSameContentHash } from '@shared/capabilities/contentHash.js';
import { findNodeById } from '../workspaceUtils.js';
import { saveProposalFile } from '../../utils/agentDataBridge.js';

/**
 * 提案收件箱（内存态 + 内容库 .agent/proposals 落盘）。
 *
 * 覆盖正文、删除条目都先生成提案，立即返回；用户在收件箱 / 编辑器 diff 里应用或放弃。
 * app 内 AI 可以 waitForAgentProposal 等结果；MCP 不等，之后用 get_proposal_status 查。
 */

export const PROPOSAL_BUSY_MESSAGE = '写入被拒绝：这篇文档已有一处改动在等待用户确认，请等用户应用或放弃后再写。';
export const PROPOSAL_STALE_MESSAGE = '写入被拒绝：内容已变化，请重新读取后再提交。';
const MAX_RESOLVED_KEPT = 50;

// 等待结果的回调不放进 store（不可序列化）
const waiters = new Map();

const notifyWaiters = (proposal) => {
  (waiters.get(proposal.id) || []).forEach((resolve) => resolve(proposal));
  waiters.delete(proposal.id);
};

const persistProposal = (proposal) => {
  saveProposalFile(proposal)?.catch?.((error) => console.warn('[proposals] 落盘失败:', error?.message));
};

/** 新的在前；已处理的只保留最近一批 */
const prependProposal = (list, proposal) => {
  const next = [proposal, ...list];
  const resolved = next.filter((item) => !isPending(item));
  if (resolved.length <= MAX_RESOLVED_KEPT) return next;
  const dropIds = new Set(resolved.slice(MAX_RESOLVED_KEPT).map((item) => item.id));
  return next.filter((item) => !dropIds.has(item.id));
};

const applyEdit = (get, proposal) => {
  const target = findNodeById(get().workspace, proposal.targetId);
  const check = checkProposalApplicable(proposal, target?.content ?? '');
  if (!check.ok) return check;
  get().applyContentFromOutside(proposal.targetId, proposal.newText);
  return { ok: true };
};

const applyDelete = (get, proposal) => {
  const failed = proposal.targets.filter((target) => !get().deleteNode(target.id)).map((target) => target.name);
  return failed.length
    ? { ok: true, note: `部分删除失败：${failed.map((name) => `「${name}」`).join('、')}` }
    : { ok: true };
};

const APPLIERS = Object.freeze({
  [PROPOSAL_KINDS.EDIT]: applyEdit,
  [PROPOSAL_KINDS.DELETE]: applyDelete,
});

export const createProposalSlice = (set, get) => ({
  agentProposals: [],

  /**
   * 提交改正文提案。baseHash 不匹配（agent 读到的是旧版本）直接拒绝。
   * @returns {{ ok: true, proposal } | { ok: false, error: string, code?: string }}
   */
  submitEditProposal: ({ targetId, newText, baseHash = '', who = 'app', tool = '' } = {}) => {
    const target = findNodeById(get().workspace, targetId);
    if (!target || target.type !== 'file') return { ok: false, error: '写入失败：找不到目标文档。', code: 'not_found' };
    if (!isSameContentHash(target.content ?? '', baseHash)) return { ok: false, error: PROPOSAL_STALE_MESSAGE, code: 'stale' };
    const busy = get().agentProposals.some((item) => isPending(item) && item.kind === PROPOSAL_KINDS.EDIT && item.targetId === targetId);
    if (busy) return { ok: false, error: PROPOSAL_BUSY_MESSAGE, code: 'busy' };

    const proposal = buildEditProposal({ target, newText, who, tool });
    set((state) => ({ agentProposals: prependProposal(state.agentProposals, proposal) }));
    persistProposal(proposal);
    return { ok: true, proposal };
  },

  /** 提交删除提案（外部 agent 用；app 内 AI 仍弹确认框） */
  submitDeleteProposal: ({ ids = [], reason = '', who = 'app', tool = '' } = {}) => {
    const { workspace } = get();
    const targets = ids
      .map((id) => findNodeById(workspace, id))
      .filter((node) => node && node.id !== 'root');
    if (!targets.length) return { ok: false, error: '删除失败：没有找到任何对应条目。', code: 'not_found' };
    const proposal = buildDeleteProposal({ targets, reason, who, tool });
    set((state) => ({ agentProposals: prependProposal(state.agentProposals, proposal) }));
    persistProposal(proposal);
    return { ok: true, proposal };
  },

  /**
   * 用户应用或放弃。应用前再检查一次，提案后文档被改过就判为冲突、不覆盖。
   * @param {'apply'|'discard'} decision
   * @returns {{ ok: boolean, status?: string, error?: string, note?: string }}
   */
  resolveAgentProposal: (id, decision) => {
    const proposal = get().agentProposals.find((item) => item.id === id);
    if (!proposal || !isPending(proposal)) return { ok: false, error: '提案不存在或已处理' };

    let outcome = { ok: true };
    let status = PROPOSAL_STATUS.DISCARDED;
    if (decision === 'apply') {
      outcome = APPLIERS[proposal.kind]?.(get, proposal) ?? { ok: false, error: '未知的提案类型' };
      status = outcome.ok ? PROPOSAL_STATUS.APPLIED : (outcome.status || PROPOSAL_STATUS.CONFLICT);
    }

    const resolved = resolveProposal(proposal, status);
    set((state) => ({
      agentProposals: state.agentProposals.map((item) => (item.id === id ? resolved : item)),
    }));
    persistProposal(resolved);
    notifyWaiters(resolved);
    return { ...outcome, status };
  },

  /** 等提案被处理；已处理的立即返回 */
  waitForAgentProposal: (id) => new Promise((resolve) => {
    const proposal = get().agentProposals.find((item) => item.id === id);
    if (!proposal || !isPending(proposal)) {
      resolve(proposal || null);
      return;
    }
    waiters.set(id, [...(waiters.get(id) || []), resolve]);
  }),

  getAgentProposal: (id) => get().agentProposals.find((item) => item.id === id) || null,

  /** 启动时并入磁盘上的提案（只补内存里没有的） */
  mergeAgentProposals: (proposals = []) => {
    set((state) => {
      const known = new Set(state.agentProposals.map((item) => item.id));
      const fresh = proposals.filter((item) => item?.id && !known.has(item.id));
      if (!fresh.length) return {};
      const merged = [...state.agentProposals, ...fresh]
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
      return { agentProposals: merged };
    });
  },
});
