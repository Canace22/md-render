import { describe, expect, it } from 'vitest';
import { moveNodeToFolder } from '../renderer/src/store/workspaceUtils.js';
import { executeTool } from '../renderer/src/core/agent/toolRegistry.js';

const call = (name, args) => ({
  id: 'call-1',
  function: { name, arguments: JSON.stringify(args ?? {}) },
});

const makeWorkspace = () => ({
  id: 'root',
  type: 'folder',
  name: '工作区',
  children: [
    { id: 'doc-1', type: 'file', name: '稿件.md', content: 'x' },
    {
      id: 'folder-a',
      type: 'folder',
      name: '归档',
      children: [
        { id: 'doc-2', type: 'file', name: '旧稿.md', content: 'y' },
        { id: 'folder-b', type: 'folder', name: '深层', children: [] },
      ],
    },
  ],
});

describe('moveNodeToFolder（纯函数）', () => {
  it('把文件移进目标文件夹末尾', () => {
    const next = moveNodeToFolder(makeWorkspace(), 'doc-1', 'folder-a');
    const folder = next.children.find((c) => c.id === 'folder-a');
    expect(folder.children.map((c) => c.id)).toContain('doc-1');
    expect(next.children.some((c) => c.id === 'doc-1')).toBe(false);
  });

  it('目标在自己子树里时不移动（防环）', () => {
    const ws = makeWorkspace();
    expect(moveNodeToFolder(ws, 'folder-a', 'folder-b')).toBe(ws);
  });

  it('非法输入一律原样返回：移动根、目标不是文件夹、条目不存在、已在目标里', () => {
    const ws = makeWorkspace();
    expect(moveNodeToFolder(ws, 'root', 'folder-a')).toBe(ws);
    expect(moveNodeToFolder(ws, 'doc-1', 'doc-2')).toBe(ws);
    expect(moveNodeToFolder(ws, 'ghost', 'folder-a')).toBe(ws);
    expect(moveNodeToFolder(ws, 'doc-2', 'folder-a')).toBe(ws);
  });
});

describe('文件管理工具执行器（假 host）', () => {
  it('move：缺参数直接拒绝，不触达 host', async () => {
    let touched = false;
    const result = await executeTool(call('move_workspace_item', { id: 'doc-1' }), {
      moveWorkspaceItem: async () => { touched = true; },
    });
    expect(result).toContain('移动失败');
    expect(touched).toBe(false);
  });

  it('move：透传 ".agent" 特殊目标和 host 结果', async () => {
    const result = await executeTool(
      call('move_workspace_item', { id: 'doc-1', targetFolderId: '.agent' }),
      { moveWorkspaceItem: async ({ targetFolderId }) => `目标：${targetFolderId}` },
    );
    expect(result).toBe('目标：.agent');
  });

  it('rename：空名称拒绝', async () => {
    const result = await executeTool(call('rename_workspace_item', { id: 'doc-1', name: '  ' }), {});
    expect(result).toContain('重命名失败');
  });

  it('delete：空 ids、超过 10 个都拒绝，且不触达 host', async () => {
    let touched = false;
    const host = { deleteWorkspaceItems: async () => { touched = true; } };
    expect(await executeTool(call('delete_workspace_items', { ids: [] }), host)).toContain('删除失败');
    const tooMany = Array.from({ length: 11 }, (_, i) => `id-${i}`);
    expect(await executeTool(call('delete_workspace_items', { ids: tooMany }), host)).toContain('最多删除');
    expect(touched).toBe(false);
  });

  it('delete：去重后透传 host（确认与执行在宿主侧）', async () => {
    let received = null;
    const result = await executeTool(
      call('delete_workspace_items', { ids: ['a', 'a', 'b'], reason: '清理重复副本' }),
      { deleteWorkspaceItems: async ({ ids, reason }) => { received = { ids, reason }; return '已删除 2 个条目。'; } },
    );
    expect(received.ids).toEqual(['a', 'b']);
    expect(received.reason).toBe('清理重复副本');
    expect(result).toBe('已删除 2 个条目。');
  });
});
