import { describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/utils/agentDataBridge.js', () => ({ saveProposalFile: vi.fn(() => Promise.resolve(null)) }));

import { createProposalSlice, PROPOSAL_BUSY_MESSAGE, PROPOSAL_STALE_MESSAGE } from '../renderer/src/store/slices/proposalSlice.js';
import { hashContent } from '@shared/capabilities/contentHash.js';
import { selectPendingEditForSelected } from '../renderer/src/store/proposalSelectors.js';

// 用最小假 store 驱动 proposalSlice：真 findNodeById + 假的跨 slice 写入方法。
function makeStore(initial) {
  let state = { ...initial };
  const get = () => state;
  const set = (patch) => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const writes = [];
  const deletes = [];
  state = {
    ...state,
    ...createProposalSlice(set, get),
    applyContentFromOutside: (fileId, text) => {
      writes.push({ fileId, text });
      state = { ...state, workspace: setContent(state.workspace, fileId, text) };
    },
    deleteNode: (id) => {
      deletes.push(id);
      return id !== 'locked';
    },
  };
  return { get, set, writes, deletes };
}

const setContent = (node, id, text) => (node.id === id
  ? { ...node, content: text }
  : { ...node, children: node.children?.map((child) => setContent(child, id, text)) });

const workspace = {
  id: 'root',
  type: 'folder',
  children: [
    { id: 'A', type: 'file', name: 'A.md', content: '原文 A' },
    { id: 'B', type: 'file', name: 'B.md', content: '原文 B' },
    { id: 'F', type: 'folder', name: '文件夹', children: [] },
    { id: 'locked', type: 'file', name: '挂载', content: '' },
  ],
};

describe('改正文提案', () => {
  it('提交后选中态漂移，仍写回提案时的目标文档', async () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const { proposal } = store.get().submitEditProposal({ targetId: 'A', newText: '新文 A' });
    const waiting = store.get().waitForAgentProposal(proposal.id);

    store.set({ selectedId: 'B' });
    expect(store.get().resolveAgentProposal(proposal.id, 'apply')).toMatchObject({ ok: true, status: 'applied' });

    await expect(waiting).resolves.toMatchObject({ status: 'applied' });
    expect(store.writes).toEqual([{ fileId: 'A', text: '新文 A' }]);
  });

  it('用目标文档的真实正文作为 diff 旧文', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const { proposal } = store.get().submitEditProposal({ targetId: 'A', newText: '新文 A' });
    expect(proposal).toMatchObject({ targetId: 'A', oldText: '原文 A', status: 'pending' });
    expect(selectPendingEditForSelected(store.get()).id).toBe(proposal.id);
  });

  it('目标不是文件时拒绝', () => {
    const store = makeStore({ workspace, selectedId: 'F' });
    expect(store.get().submitEditProposal({ targetId: 'F', newText: 'x' })).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('放弃不落盘，等待方拿到 discarded', async () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const { proposal } = store.get().submitEditProposal({ targetId: 'A', newText: '不要的改动' });
    const waiting = store.get().waitForAgentProposal(proposal.id);
    store.get().resolveAgentProposal(proposal.id, 'discard');
    await expect(waiting).resolves.toMatchObject({ status: 'discarded' });
    expect(store.writes).toEqual([]);
  });

  it('同一文档已有待确认提案时拒绝新的，不覆盖；其它文档不受影响', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    store.get().submitEditProposal({ targetId: 'A', newText: '第一次' });
    expect(store.get().submitEditProposal({ targetId: 'A', newText: '第二次' })).toMatchObject({ ok: false, error: PROPOSAL_BUSY_MESSAGE });
    expect(store.get().submitEditProposal({ targetId: 'B', newText: 'B 新' }).ok).toBe(true);
  });

  it('乐观锁：baseHash 和当前内容不一致时拒绝', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    expect(store.get().submitEditProposal({ targetId: 'A', newText: 'x', baseHash: hashContent('旧版本') }))
      .toMatchObject({ ok: false, error: PROPOSAL_STALE_MESSAGE });
    expect(store.get().submitEditProposal({ targetId: 'A', newText: 'x', baseHash: hashContent('原文 A') }).ok).toBe(true);
  });

  it('提案后用户又改了文档，应用时判为冲突、不覆盖', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const { proposal } = store.get().submitEditProposal({ targetId: 'A', newText: 'AI 版' });
    store.set({ workspace: setContent(store.get().workspace, 'A', '用户刚改的') });
    expect(store.get().resolveAgentProposal(proposal.id, 'apply')).toMatchObject({ ok: false, status: 'conflict' });
    expect(store.writes).toEqual([]);
    expect(store.get().getAgentProposal(proposal.id).status).toBe('conflict');
  });

  it('处理完后可以再次提交；重复处理被拒绝', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const first = store.get().submitEditProposal({ targetId: 'A', newText: '第一次' }).proposal;
    store.get().resolveAgentProposal(first.id, 'discard');
    expect(store.get().resolveAgentProposal(first.id, 'apply').ok).toBe(false);
    expect(store.get().submitEditProposal({ targetId: 'A', newText: '第二次' }).ok).toBe(true);
  });
});

describe('删除提案', () => {
  it('应用后逐个删除，失败的写进说明', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const { proposal } = store.get().submitDeleteProposal({ ids: ['B', 'locked', 'nope'] });
    expect(proposal.targets.map((t) => t.id)).toEqual(['B', 'locked']);
    const result = store.get().resolveAgentProposal(proposal.id, 'apply');
    expect(result).toMatchObject({ ok: true, status: 'applied' });
    expect(result.note).toContain('挂载');
    expect(store.deletes).toEqual(['B', 'locked']);
  });

  it('全部找不到时不生成提案', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    expect(store.get().submitDeleteProposal({ ids: ['nope', 'root'] }).ok).toBe(false);
  });
});

describe('磁盘提案并入', () => {
  it('只补内存里没有的，按时间倒序', () => {
    const store = makeStore({ workspace, selectedId: 'A' });
    const { proposal } = store.get().submitEditProposal({ targetId: 'A', newText: 'x' });
    store.get().mergeAgentProposals([proposal, { id: 'p-old', createdAt: '2020-01-01T00:00:00.000Z', status: 'pending' }]);
    expect(store.get().agentProposals.map((p) => p.id)).toEqual([proposal.id, 'p-old']);
  });
});
