import { PROPOSAL_KINDS, isPending } from '@shared/capabilities/proposals.js';

/** 当前打开文档的待确认改正文提案（DiffOverlay 用） */
export const selectPendingEditForSelected = (state) => state.agentProposals.find(
  (item) => isPending(item) && item.kind === PROPOSAL_KINDS.EDIT && item.targetId === state.selectedId,
) || null;

export const selectPendingProposals = (state) => state.agentProposals.filter(isPending);
