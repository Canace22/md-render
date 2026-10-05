import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/utils/agentDataBridge.js', () => ({
  saveProposalFile: vi.fn(() => Promise.resolve(null)),
  fetchProposalFiles: vi.fn(() => Promise.resolve([])),
}));

// excalidraw 依赖在部分环境里装不全；本文件不测白板，直接替换掉
vi.mock('../renderer/src/utils/excalidrawCanvas.js', () => ({
  buildCanvasItemsFromAgentCards: vi.fn(() => []),
  buildCanvasSceneFromAgentGraph: vi.fn(() => ({})),
  buildExcalidrawCanvasState: vi.fn(() => ({})),
  buildExcalidrawElementsFromItems: vi.fn(() => []),
  countRenderableCanvasCards: vi.fn(() => 0),
}));

import { useEditorStore } from '../renderer/src/store/useEditorStore.js';
import { createHost } from '../renderer/src/core/agent/createHost.js';
import { toBridgeHost } from '../renderer/src/core/agent/bridgeListener.js';
import { DEFAULT_FILE_ID } from '../renderer/src/store/workspaceUtils.js';
import { EDITORIAL_MEMORY_DOC_NAME } from '../renderer/src/core/agent/editorialMemory.js';

const makeHost = (overrides = {}) => createHost({ getState: useEditorStore.getState, ...overrides });

// 直接数原始树（collectFiles 会跳过隐藏的 .agent 目录）
const countByName = (node, name) => (node?.name === name && node.type === 'file' ? 1 : 0)
  + (node?.children ?? []).reduce((sum, child) => sum + countByName(child, name), 0);
const countMemoryFiles = () => countByName(useEditorStore.getState().workspace, `${EDITORIAL_MEMORY_DOC_NAME}.md`);

describe('createHost', () => {
  beforeEach(() => {
    useEditorStore.getState().selectNode(DEFAULT_FILE_ID);
  });

  it('每次调用读实时状态：host 建好后切换文档，读到的是新文档', () => {
    const host = makeHost();
    useEditorStore.getState().updateSelectedFileContent('# 新正文');
    expect(host.readActiveDoc().content).toBe('# 新正文');
  });

  it('同一轮里连续「先查再写」编辑部记忆，只建一份', async () => {
    const host = makeHost();
    const before = countMemoryFiles();
    await host.updateEditorialMemory({ category: 'experience', text: '第一条经验' });
    await host.updateEditorialMemory({ category: 'experience', text: '第二条经验' });
    expect(countMemoryFiles()).toBe(Math.max(before, 1));
    const memory = await host.readEditorialMemory();
    expect(memory.content).toContain('第一条经验');
    expect(memory.content).toContain('第二条经验');
  });

  it('外部调用写入：立即返回提案 id；同一文档再写被拒绝', async () => {
    const host = toBridgeHost(makeHost());
    const first = await host.writeActiveDoc('外部改动');
    expect(first).toMatch(/^已提交改动提案（p-/);
    expect(await host.writeActiveDoc('又一次')).toMatch(/^写入被拒绝/);
    const pending = useEditorStore.getState().agentProposals.find((p) => p.status === 'pending' && p.targetId === DEFAULT_FILE_ID);
    expect(pending.who).toBe('mcp');
    useEditorStore.getState().resolveAgentProposal(pending.id, 'discard');
  });

  it('app 内写入：等用户处理后返回结果', async () => {
    const host = makeHost();
    const resultPromise = host.writeActiveDoc('AI 改写');
    const pending = useEditorStore.getState().agentProposals.find((p) => p.status === 'pending' && p.targetId === DEFAULT_FILE_ID);
    useEditorStore.getState().resolveAgentProposal(pending.id, 'apply');
    await expect(resultPromise).resolves.toBe('改动已应用到当前文档。');
    expect(useEditorStore.getState().markdown).toBe('AI 改写');
  });

  it('删除：app 内走确认框，外部生成删除提案', async () => {
    const confirmDelete = vi.fn(async () => false);
    const host = makeHost({ confirmDelete });
    expect(await host.deleteWorkspaceItems({ ids: [DEFAULT_FILE_ID] })).toBe('用户取消了删除，未做任何改动。');
    expect(confirmDelete).toHaveBeenCalledTimes(1);

    const external = JSON.parse(await toBridgeHost(host).deleteWorkspaceItems({ ids: [DEFAULT_FILE_ID] }));
    expect(external).toMatchObject({ ok: true, status: 'pending' });
    expect(confirmDelete).toHaveBeenCalledTimes(1);
    useEditorStore.getState().resolveAgentProposal(external.proposalId, 'discard');
  });
});
