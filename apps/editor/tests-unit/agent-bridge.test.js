import { describe, expect, it, vi } from 'vitest';
import {
  isSafeTool,
  filterSafeToolDefs,
  validateInvoke,
  SAFE_TOOL_NAMES,
  BLOCKED_TOOLS,
  LIST_TOOLS_NAME,
} from '../shared/agentBridgeTools.js';
import { handleBridgeRequest } from '../renderer/src/core/agent/bridgeListener.js';

describe('agent bridge 白名单', () => {
  it('放行只读与安全写工具', () => {
    expect(isSafeTool('read_active_doc')).toBe(true);
    expect(isSafeTool('create_new_doc')).toBe(true);
    expect(isSafeTool('open_surface')).toBe(true);
  });

  it('拒绝全部破坏性工具', () => {
    for (const name of BLOCKED_TOOLS) {
      expect(isSafeTool(name)).toBe(false);
      expect(SAFE_TOOL_NAMES.has(name)).toBe(false);
    }
  });

  it('未知工具名一律拒绝', () => {
    expect(isSafeTool('rm_rf')).toBe(false);
    expect(isSafeTool('')).toBe(false);
    expect(isSafeTool(null)).toBe(false);
  });

  it('filterSafeToolDefs 只留白名单', () => {
    const defs = [
      { function: { name: 'read_active_doc' } },
      { function: { name: 'delete_workspace_items' } },
      { function: { name: 'write_active_doc' } },
    ];
    const kept = filterSafeToolDefs(defs).map((d) => d.function.name);
    expect(kept).toEqual(['read_active_doc', 'write_active_doc']);
  });
});

describe('validateInvoke', () => {
  it('合法安全工具通过并带默认 args', () => {
    expect(validateInvoke({ name: 'search_docs' })).toEqual({
      ok: true,
      name: 'search_docs',
      args: {},
    });
  });

  it('非法 body / 空名 / 破坏性工具都被拒', () => {
    expect(validateInvoke(null).ok).toBe(false);
    expect(validateInvoke({}).ok).toBe(false);
    expect(validateInvoke({ name: 'delete_workspace_items' }).ok).toBe(false);
  });
});

describe('handleBridgeRequest', () => {
  const toolDefs = [
    { function: { name: 'read_active_doc' } },
    { function: { name: 'delete_workspace_items' } },
  ];

  it('__list_tools__ 只返回安全 schema', async () => {
    const reply = await handleBridgeRequest(
      { name: LIST_TOOLS_NAME },
      { host: {}, executeTool: vi.fn(), toolDefs },
    );
    expect(reply.ok).toBe(true);
    expect(reply.result.map((d) => d.function.name)).toEqual(['read_active_doc']);
  });

  it('安全工具经 executeTool 执行', async () => {
    const executeTool = vi.fn().mockResolvedValue('已读取');
    const reply = await handleBridgeRequest(
      { name: 'read_active_doc', args: {} },
      { host: { readActiveDoc: () => ({}) }, executeTool, toolDefs },
    );
    expect(reply).toEqual({ ok: true, result: '已读取' });
    expect(executeTool).toHaveBeenCalledOnce();
    const [toolCall] = executeTool.mock.calls[0];
    expect(toolCall.function.name).toBe('read_active_doc');
    expect(toolCall.function.arguments).toBe('{}');
  });

  it('破坏性工具不会走到 executeTool', async () => {
    const executeTool = vi.fn();
    const reply = await handleBridgeRequest(
      { name: 'delete_workspace_items', args: { ids: ['x'] } },
      { host: {}, executeTool, toolDefs },
    );
    expect(reply.ok).toBe(false);
    expect(executeTool).not.toHaveBeenCalled();
  });
});
