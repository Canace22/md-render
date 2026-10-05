import { describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/utils/excalidrawCanvas.js', () => ({}));

import { buildMigrationPayload, collectMemoryContents } from '../renderer/src/services/vaultMigration.js';

const workspace = {
  id: 'root',
  type: 'folder',
  children: [
    { id: 'meta', type: 'folder', name: '.agent', agentMetaFolder: true, children: [{ id: 'm1', type: 'file', name: '编辑部记忆.md', content: '主记忆' }] },
    { id: 'm2', type: 'file', name: '编辑部记忆', content: '散落副本' },
    { id: 'd1', type: 'file', name: '稿子', content: '[BLOCKNOTE]' },
    { id: 'disk', type: 'file', name: '磁盘', projectRootPath: '/v', relativePath: 'Projects/a.md', content: '[BLOCKNOTE]' },
  ],
  canvasState: { nodes: [], edges: [] },
};

describe('迁移数据组装', () => {
  it('编辑部记忆：.agent 下的排第一，散落副本随后', () => {
    expect(collectMemoryContents(workspace)).toEqual(['主记忆', '散落副本']);
  });

  it('只转换内置文档的正文；带上 Daily 和白板', () => {
    const payload = buildMigrationPayload({ workspace, dailyWorkspace: { currentDate: '2026-10-05', entries: {}, todoPool: [] } }, {
      toMarkdown: (text) => (text === '[BLOCKNOTE]' ? '# 已转换' : text),
    });
    expect(payload.workspace.children[2].content).toBe('# 已转换');
    expect(payload.workspace.children[3].content).toBe('[BLOCKNOTE]');
    expect(payload.canvasState).toEqual({ nodes: [], edges: [] });
    expect(payload.dailyWorkspace.currentDate).toBe('2026-10-05');
  });
});

describe('外部修改提示（U6）', () => {
  it('当前文档在 app 外被改了才提示；内容一样、不是当前文档都不提示', async () => {
    const { buildExternalChangeNotice } = await import('../renderer/src/hooks/useLocalProjectWatcher.js');
    const node = { id: 'n1', type: 'file', name: 'a.md', projectRootPath: '/v', relativePath: 'Projects/a.md', content: '旧' };
    const state = { workspace: { id: 'root', type: 'folder', children: [node] }, selectedId: 'n1', markdown: '旧' };
    const disk = (content) => ({ projectsChildren: [{ ...node, content }] });
    expect(buildExternalChangeNotice(state, disk('新'), '/v', false)).toMatchObject({ fileId: 'n1', previousContent: '旧', diskContent: '新' });
    expect(buildExternalChangeNotice(state, disk('旧'), '/v', false)).toBeNull();
    expect(buildExternalChangeNotice({ ...state, selectedId: 'x' }, disk('新'), '/v', false)).toBeNull();
    expect(buildExternalChangeNotice(state, disk('新'), '/other', false)).toBeNull();
  });
});
