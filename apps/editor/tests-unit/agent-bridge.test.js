import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isFailureResult,
  isSafeTool,
  filterSafeToolDefs,
  validateInvoke,
  SAFE_TOOL_NAMES,
  BLOCKED_TOOLS,
  LIST_TOOLS_NAME,
} from '../shared/agentBridgeTools.js';
import { handleBridgeRequest, toBridgeHost } from '../renderer/src/core/agent/bridgeListener.js';
import {
  removeHandshakeFileIfOwned,
  startAgentBridge,
  stopAgentBridge,
} from '../main/agentBridge.js';
import {
  isConnectionError,
  readToolCache,
  resolveBridge,
  writeToolCache,
} from '../../../server/mcp-bridge/bridgeClient.js';

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'md-render-bridge-'));

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

describe('isFailureResult（P0-3）', () => {
  it.each([
    ['写入失败：内容为空。', true],
    ['工具「read_doc」执行出错：boom', true],
    ['写入被拒绝：已有一处改动在等待用户确认', true],
    ['{"ok":false,"error":"x"}', true],
    [{ ok: false }, true],
  ])('失败文案 %s → true', (input, expected) => {
    expect(isFailureResult(input)).toBe(expected);
  });

  it.each([
    ['已添加到今日速记。'],
    ['已暂存改动，等待用户在编辑器里确认（应用或放弃）。'],
    ['{"title":"失败是成功之母","content":"正文"}'],
    ['未找到与「失败」相关的文档。'],
    [''],
  ])('正常结果 %s → false', (input) => {
    expect(isFailureResult(input)).toBe(false);
  });
});

describe('handleBridgeRequest 失败标记与非阻塞写入（P0-3 / P0-4）', () => {
  const toolDefs = [{ function: { name: 'write_active_doc' } }];

  it('工具返回失败文案时 ok=false', async () => {
    const executeTool = vi.fn().mockResolvedValue('写入失败：内容为空。');
    const reply = await handleBridgeRequest(
      { name: 'write_active_doc', args: { content: '' } },
      { host: {}, executeTool, toolDefs },
    );
    expect(reply).toEqual({ ok: false, result: '写入失败：内容为空。' });
  });

  it('桥接调用 write_active_doc 时 host 以 wait:false 调用', async () => {
    const writeActiveDoc = vi.fn().mockResolvedValue('已暂存改动');
    const executeTool = vi.fn(async (_call, host) => host.writeActiveDoc('新内容'));
    const reply = await handleBridgeRequest(
      { name: 'write_active_doc', args: { content: '新内容' } },
      { host: { writeActiveDoc }, executeTool, toolDefs },
    );
    expect(writeActiveDoc).toHaveBeenCalledWith('新内容', { wait: false, who: 'mcp' });
    expect(reply.ok).toBe(true);
  });

  it('toBridgeHost 不改动其它能力，host 为空时原样返回', () => {
    const readActiveDoc = vi.fn();
    expect(toBridgeHost({ readActiveDoc }).readActiveDoc).toBe(readActiveDoc);
    expect(toBridgeHost(null)).toBeNull();
  });
});

describe('握手文件清理（P0-2）', () => {
  afterEach(() => stopAgentBridge());

  it('只删除 token 一致的握手文件', () => {
    const file = path.join(makeTempDir(), 'agent-bridge.json');
    fs.writeFileSync(file, JSON.stringify({ url: 'http://x', token: 'other' }));
    expect(removeHandshakeFileIfOwned(file, 'mine')).toBe(false);
    expect(fs.existsSync(file)).toBe(true);
    expect(removeHandshakeFileIfOwned(file, 'other')).toBe(true);
    expect(fs.existsSync(file)).toBe(false);
    expect(removeHandshakeFileIfOwned(file, 'other')).toBe(false);
  });

  it('stopAgentBridge 后握手文件被删除，重复调用安全', async () => {
    const dir = makeTempDir();
    const file = path.join(dir, 'agent-bridge.json');
    const bridge = startAgentBridge({
      app: { getPath: () => dir },
      ipcMain: new EventEmitter(),
      getMainWindow: () => null,
    });
    await vi.waitFor(() => expect(fs.existsSync(file)).toBe(true));
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).token).toBe(bridge.getToken());

    stopAgentBridge();
    stopAgentBridge();
    expect(fs.existsSync(file)).toBe(false);
  });
});

describe('MCP bridgeClient（P0-1）', () => {
  it('握手文件不存在时返回 null，不抛错', () => {
    const env = { MD_RENDER_BRIDGE_FILE: path.join(makeTempDir(), 'missing.json') };
    expect(resolveBridge(env)).toBeNull();
  });

  it('每次调用都重新读握手文件（app 重启后拿到新地址）', () => {
    const file = path.join(makeTempDir(), 'agent-bridge.json');
    const env = { MD_RENDER_BRIDGE_FILE: file };
    fs.writeFileSync(file, JSON.stringify({ url: 'http://127.0.0.1:1', token: 'a' }));
    expect(resolveBridge(env)).toEqual({ url: 'http://127.0.0.1:1', token: 'a' });
    fs.writeFileSync(file, JSON.stringify({ url: 'http://127.0.0.1:2', token: 'b' }));
    expect(resolveBridge(env)).toEqual({ url: 'http://127.0.0.1:2', token: 'b' });
  });

  it('握手文件缺字段或不是 JSON 时返回 null', () => {
    const file = path.join(makeTempDir(), 'agent-bridge.json');
    fs.writeFileSync(file, '{"url":"http://x"}');
    expect(resolveBridge({ MD_RENDER_BRIDGE_FILE: file })).toBeNull();
    fs.writeFileSync(file, 'not json');
    expect(resolveBridge({ MD_RENDER_BRIDGE_FILE: file })).toBeNull();
  });

  it('环境变量优先于握手文件', () => {
    expect(resolveBridge({ MD_RENDER_BRIDGE_URL: 'http://u', MD_RENDER_BRIDGE_TOKEN: 't' }))
      .toEqual({ url: 'http://u', token: 't' });
  });

  it('识别连接失败（残留握手文件指向已退出的 app）', () => {
    expect(isConnectionError(new TypeError('fetch failed'))).toBe(true);
    expect(isConnectionError({ cause: { code: 'ECONNREFUSED' } })).toBe(true);
    expect(isConnectionError(new Error('unauthorized'))).toBe(false);
  });

  it('工具列表缓存可写可读，坏文件返回空数组', () => {
    const file = path.join(makeTempDir(), 'cache.json');
    expect(readToolCache(file)).toEqual([]);
    writeToolCache(file, [{ name: 'read_active_doc' }]);
    expect(readToolCache(file)).toEqual([{ name: 'read_active_doc' }]);
    fs.writeFileSync(file, 'oops');
    expect(readToolCache(file)).toEqual([]);
  });
});
