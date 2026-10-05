import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/utils/agentDataBridge.js', () => ({ saveActivityEntry: vi.fn() }));

import { LOCAL_AGENT_STATUS, getLocalAgent } from '../shared/localAgents.js';
import {
  buildCandidatePaths,
  detectAllLocalAgents,
  isCursorBinary,
  parseLoginStatus,
} from '../main/localAgents/detect.js';
import { getAdapter } from '../main/localAgents/adapters/index.js';
import {
  buildMcpLaunchConfig,
  mergeCursorMcpJson,
  toCodexConfigArgs,
} from '../main/localAgents/mcpConfig.js';
import { parseCodexDefaultModel, parseCursorModels } from '../main/localAgents/models.js';
import { startLocalAgentRun } from '../main/localAgents/runner.js';
import { isSafeWorkDir, resolveWorkDir } from '../main/localAgents/workDir.js';
import {
  filterAllowedTools,
  isToolAllowedByEnv,
  readAllowedTools,
} from '../../../server/mcp-bridge/bridgeClient.js';
import { buildAiSourceList, parseSourceId, pickDefaultSource } from '../renderer/src/core/agent/aiSources.js';
import { createSession, resolveLocalAgentSession } from '../renderer/src/core/agent/sessionUtils.js';
import {
  createLocalEventTranslator,
  formatLocalAgentError,
  getLocalToolLabel,
  pickAgentProjectRoot,
} from '../renderer/src/core/agent/localAgentClient.js';

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'local-agents');
const readFixture = (name) => fs.readFileSync(path.join(FIXTURES, `${name}.jsonl`), 'utf8').split('\n');

/** 把录好的 JSONL 喂给适配器，收集统一事件 */
const parseFixture = (agentId) => {
  const parser = getAdapter(agentId).createParser();
  const events = readFixture(agentId).flatMap((line) => parser.parseLine(line));
  return [...events, ...parser.finish({ code: 0, signal: null, stderr: '' })];
};

const detected = (id, status, extra = {}) => ({
  id,
  label: getLocalAgent(id).label,
  kind: getLocalAgent(id).kind,
  priority: getLocalAgent(id).priority,
  supported: getLocalAgent(id).supported,
  installed: status !== LOCAL_AGENT_STATUS.MISSING,
  version: '1.0.0',
  path: `/bin/${id}`,
  status,
  ...extra,
});

describe('本地 agent 检测', () => {
  it('Cursor 先找 cursor-agent，再找 agent', () => {
    const candidates = buildCandidatePaths(getLocalAgent('cursor'), { pathEnv: '/a:/b', home: '/home/u', platform: 'linux' });
    const firstAgent = candidates.findIndex((item) => item.bin === 'agent');
    const lastCursorAgent = candidates.map((item) => item.bin).lastIndexOf('cursor-agent');
    expect(candidates[0].file).toBe('/a/cursor-agent');
    expect(lastCursorAgent).toBeLessThan(firstAgent);
  });

  it('重名的 agent 只有路径或版本号像 Cursor 才算', () => {
    expect(isCursorBinary({ realPath: '/home/u/.local/share/cursor-agent/versions/x/cursor-agent' })).toBe(true);
    expect(isCursorBinary({ realPath: '/usr/bin/agent', versionOutput: '2026.09.28-64d2043' })).toBe(true);
    expect(isCursorBinary({ realPath: '/usr/bin/agent', versionOutput: 'agent 3.2.1' })).toBe(false);
  });

  it('登录检测输出识别未登录', () => {
    expect(parseLoginStatus({ ok: true, output: 'Logged in using ChatGPT' })).toBe(LOCAL_AGENT_STATUS.READY);
    expect(parseLoginStatus({ ok: true, output: 'Not logged in' })).toBe(LOCAL_AGENT_STATUS.NEEDS_LOGIN);
    expect(parseLoginStatus({ ok: false, output: '' })).toBe(LOCAL_AGENT_STATUS.NEEDS_LOGIN);
  });

  it('login shell 的 PATH 里有 codex 也能找到；PATH 里非 Cursor 的 agent 被忽略', async () => {
    const files = new Set(['/shell/bin/codex', '/usr/bin/agent', '/home/u/.local/bin/claude']);
    const run = vi.fn(async (file, args) => {
      if (args[0] === '--version') return { ok: true, output: file.endsWith('agent') ? 'agent 3.2.1' : '1.2.3' };
      if (args.join(' ') === 'login status') return { ok: true, output: 'Logged in' };
      return { ok: false, output: '' };
    });
    const list = await detectAllLocalAgents({
      getEnv: async () => ({ PATH: '/shell/bin:/usr/bin' }),
      isExecutable: (file) => files.has(file),
      realPath: (file) => file,
      run,
      probe: async () => false,
      platform: 'linux',
      home: '/home/u',
    });
    const byId = Object.fromEntries(list.map((item) => [item.id, item]));
    expect(byId.codex).toMatchObject({ installed: true, path: '/shell/bin/codex', status: 'ready', version: '1.2.3' });
    expect(byId.claude).toMatchObject({ installed: true, status: 'unverified' });
    expect(byId.cursor).toMatchObject({ installed: false, status: 'missing' });
    expect(byId.ollama.installed).toBe(false);
  });

  it('单个 CLI 卡住不拖垮整体', async () => {
    const list = await detectAllLocalAgents({
      getEnv: async () => ({ PATH: '/bin' }),
      isExecutable: (file) => file === '/bin/codex' || file === '/bin/claude',
      realPath: (file) => file,
      run: (file) => (file === '/bin/codex' ? new Promise(() => {}) : Promise.resolve({ ok: true, output: '2.0.0' })),
      probe: async () => false,
      platform: 'linux',
      home: '/home/u',
      timeoutMs: 20,
    });
    const byId = Object.fromEntries(list.map((item) => [item.id, item]));
    expect(byId.codex.installed).toBe(false);
    expect(byId.claude.installed).toBe(true);
  });
});

describe('适配器 buildArgs', () => {
  it('Claude Code：选了 opus 带 --model，默认 bypass；跟随默认不带 --model', () => {
    const claude = getAdapter('claude');
    const withModel = claude.buildArgs({ prompt: 'hi', model: 'opus' }).args;
    expect(withModel).toEqual(expect.arrayContaining(['--model', 'opus', '--dangerously-skip-permissions']));
    expect(claude.buildArgs({ prompt: 'hi' }).args).not.toContain('--model');
    const safe = claude.buildArgs({ prompt: 'hi', safeMode: true, sessionId: 's1', systemPrompt: '规则' }).args;
    expect(safe).toEqual(expect.arrayContaining(['--permission-mode', 'acceptEdits', '--resume', 's1', '--append-system-prompt', '规则']));
    expect(safe).not.toContain('--dangerously-skip-permissions');
    const readOnly = claude.buildArgs({ prompt: 'hi', readOnly: true }).args;
    expect(readOnly).toEqual(expect.arrayContaining(['--permission-mode', 'plan', '--tools']));
    expect(readOnly).not.toContain('--dangerously-skip-permissions');
  });

  it('Codex：resume 续会话，续会话时不重复系统提示，安全模式用 workspace-write', () => {
    const codex = getAdapter('codex');
    const first = codex.buildArgs({ prompt: '问题', systemPrompt: '规则' });
    expect(first.stdin.startsWith('规则')).toBe(true);
    expect(first.args).toContain('--dangerously-bypass-approvals-and-sandbox');
    const next = codex.buildArgs({ prompt: '问题', systemPrompt: '规则', sessionId: 't1', safeMode: true });
    expect(next.stdin).toBe('问题');
    expect(next.args.slice(-3)).toEqual(['resume', 't1', '-']);
    expect(next.args).toEqual(expect.arrayContaining(['--sandbox', 'workspace-write']));
    expect(codex.buildArgs({ prompt: '问题', readOnly: true }).args)
      .toEqual(expect.arrayContaining(['--sandbox', 'read-only']));
  });

  it('Cursor：默认带 --force，安全模式不带', () => {
    const cursor = getAdapter('cursor');
    expect(cursor.buildArgs({ prompt: 'x', cwd: '/w' }).args).toEqual(expect.arrayContaining(['--force', '--workspace', '/w', '--approve-mcps']));
    expect(cursor.buildArgs({ prompt: 'x', safeMode: true }).args).not.toContain('--force');
    expect(cursor.buildArgs({ prompt: 'x', readOnly: true }).args)
      .toEqual(expect.arrayContaining(['--mode', 'ask']));
  });
});

describe('适配器解析录好的 JSONL', () => {
  it.each(['codex', 'claude', 'cursor'])('%s：工具调用成对、callId 对得上，结束带最终正文和会话 id', (agentId) => {
    const events = parseFixture(agentId);
    const starts = events.filter((event) => event.type === 'tool_start');
    const dones = events.filter((event) => event.type === 'tool_done');
    expect(starts.map((event) => event.callId)).toEqual(dones.map((event) => event.callId));
    expect(starts.map((event) => event.tool.kind)).toEqual(['command', 'edit', 'mcp']);
    expect(dones.map((event) => event.ok)).toEqual([true, true, false]);
    expect(starts[1].tool.target).toBe('/work/docs/草稿.md');
    expect(starts[2].tool.name).toBe('read_active_doc');
    const done = events.at(-1);
    expect(done).toMatchObject({ type: 'done', finalText: '已经把草稿的标题改好了。' });
    expect(done.sessionId).toBeTruthy();
    expect(events[0]).toMatchObject({ type: 'session', sessionId: done.sessionId });
  });

  it('Claude 返回鉴权错误时标记 auth，并附上登录指引', () => {
    const parser = getAdapter('claude').createParser();
    const [event] = parser.parseLine(JSON.stringify({ type: 'result', subtype: 'success', is_error: true, result: 'Invalid API key · Please run /login' }));
    expect(event).toMatchObject({ type: 'error', auth: true });
    expect(formatLocalAgentError('claude', event)).toContain('claude');
  });

  it('进程异常退出又没收到结束事件：用 stderr 兜底报错', () => {
    const parser = getAdapter('codex').createParser();
    const [event] = parser.finish({ code: 1, signal: null, stderr: 'boom' });
    expect(event).toMatchObject({ type: 'error', message: 'boom' });
  });
});

describe('md-render MCP 注入', () => {
  const launch = buildMcpLaunchConfig({ execPath: '/App/Electron', scriptPath: '/res/mcp-bridge/index.mjs', bridgeFile: '/ud/agent-bridge.json', allowedTools: ['search_docs'] });

  it('用 Electron 自身跑 bridge，并带上白名单', () => {
    expect(launch).toEqual({
      command: '/App/Electron',
      args: ['/res/mcp-bridge/index.mjs'],
      env: { ELECTRON_RUN_AS_NODE: '1', MD_RENDER_BRIDGE_FILE: '/ud/agent-bridge.json', MD_RENDER_ALLOWED_TOOLS: 'search_docs' },
    });
    expect(buildMcpLaunchConfig({ execPath: '/e', scriptPath: '/s', allowedTools: null }).env).not.toHaveProperty('MD_RENDER_ALLOWED_TOOLS');
    expect(toCodexConfigArgs(launch)).toContain('mcp_servers.md-render.command="/App/Electron"');
  });

  it('Cursor 的 mcp.json 只合并 md-render 一项，原有配置原样保留', () => {
    const existing = JSON.stringify({ mcpServers: { github: { command: 'gh-mcp' } }, other: 1 });
    const merged = mergeCursorMcpJson(existing, launch);
    const config = JSON.parse(merged.text);
    expect(config.other).toBe(1);
    expect(config.mcpServers.github).toEqual({ command: 'gh-mcp' });
    expect(config.mcpServers['md-render']).toEqual(launch);
    expect(merged.changed).toBe(true);
    expect(mergeCursorMcpJson(merged.text, launch).changed).toBe(false);
    expect(mergeCursorMcpJson('{oops', launch).error).toBeTruthy();
  });

  it('mcp-bridge 按环境变量过滤工具，状态工具始终可用', () => {
    const tools = [{ name: 'search_docs' }, { name: 'write_active_doc' }, { name: 'md_render_status' }];
    expect(readAllowedTools({})).toBeNull();
    const allowed = readAllowedTools({ MD_RENDER_ALLOWED_TOOLS: 'search_docs' });
    expect(filterAllowedTools(tools, allowed, ['md_render_status']).map((tool) => tool.name)).toEqual(['search_docs', 'md_render_status']);
    expect(isToolAllowedByEnv('write_active_doc', allowed)).toBe(false);
    expect(readAllowedTools({ MD_RENDER_ALLOWED_TOOLS: '' }).size).toBe(0);
  });
});

describe('模型列表', () => {
  it('解析 agent models 输出', () => {
    const output = 'Available models\n\nauto - Auto  (current)\ngpt-5 - GPT-5\nsonnet-4.5-thinking - Claude 4.5 Sonnet (Thinking)\n';
    expect(parseCursorModels(output)).toEqual([
      { id: 'auto', label: 'Auto' },
      { id: 'gpt-5', label: 'GPT-5' },
      { id: 'sonnet-4.5-thinking', label: 'Claude 4.5 Sonnet (Thinking)' },
    ]);
  });

  it('只读 config.toml 顶层的 model', () => {
    expect(parseCodexDefaultModel('model = "gpt-5-codex"\n[profiles.x]\nmodel = "o3"')).toBe('gpt-5-codex');
    expect(parseCodexDefaultModel('[profiles.x]\nmodel = "o3"')).toBe('');
  });
});

describe('工作目录', () => {
  it('不允许 home、根目录、系统目录', () => {
    expect(isSafeWorkDir('/home/u', { home: '/home/u' })).toBe(false);
    expect(isSafeWorkDir('/home', { home: '/home/u' })).toBe(false);
    expect(isSafeWorkDir('/', { home: '/home/u' })).toBe(false);
    expect(isSafeWorkDir('/usr/local/x', { home: '/home/u' })).toBe(false);
    expect(isSafeWorkDir('/home/u/Documents/MdRender', { home: '/home/u' })).toBe(true);
  });

  it('项目根目录优先，没有就用内容库', () => {
    const exists = () => true;
    expect(resolveWorkDir({ projectRoot: '/home/u/p', vaultRoot: '/home/u/v', home: '/home/u', exists })).toMatchObject({ cwd: '/home/u/p', source: 'project' });
    expect(resolveWorkDir({ vaultRoot: '/home/u/v', home: '/home/u', exists })).toMatchObject({ cwd: '/home/u/v', source: 'vault' });
    expect(resolveWorkDir({ projectRoot: '/home/u', home: '/home/u', exists }).ok).toBe(false);
  });

  it('按选中的文档找它所在的挂载项目', () => {
    const workspace = {
      id: 'root',
      type: 'folder',
      children: [
        { id: 'a', type: 'folder', localProjectRoot: true, projectRootPath: '/p/a', children: [{ id: 'a1', type: 'file' }] },
        { id: 'b', type: 'folder', localProjectRoot: true, projectRootPath: '/p/b', children: [{ id: 'b1', type: 'file' }] },
        { id: 'c1', type: 'file' },
      ],
    };
    expect(pickAgentProjectRoot(workspace, 'b1')).toBe('/p/b');
    expect(pickAgentProjectRoot(workspace, 'c1')).toBe('');
    expect(pickAgentProjectRoot({ ...workspace, children: [workspace.children[0]] }, 'zzz')).toBe('/p/a');
  });
});

describe('来源选择', () => {
  const codex = detected('codex', 'ready');
  const claude = detected('claude', 'unverified');
  const cursor = detected('cursor', 'ready');

  it('都装了默认 Codex；只装 Cursor 选 Cursor；都没装回落到内置服务商', () => {
    expect(pickDefaultSource([cursor, claude, codex], '', ['minimax'])).toBe('local:codex');
    expect(pickDefaultSource([cursor], '', ['minimax'])).toBe('local:cursor');
    expect(pickDefaultSource([], '', ['minimax'])).toBe('minimax');
    expect(pickDefaultSource([], '', [])).toBe('');
  });

  it('记住上次的选择；上次选的 agent 不可用了自动换下一个', () => {
    expect(pickDefaultSource([codex, claude], 'local:claude', [])).toBe('local:claude');
    expect(pickDefaultSource([codex, claude], 'deepseek', [])).toBe('deepseek');
    expect(pickDefaultSource([claude], 'local:codex', [])).toBe('local:claude');
    expect(pickDefaultSource([detected('codex', 'needs-login'), claude], '', [])).toBe('local:claude');
  });

  it('来源列表：不可用的写明原因', () => {
    const list = buildAiSourceList({ detected: [detected('codex', 'needs-login'), detected('gemini', 'unsupported')], builtinProviders: ['minimax'] });
    expect(list.find((item) => item.id === 'local:codex')).toMatchObject({ available: false, reason: '未登录' });
    expect(list.find((item) => item.id === 'local:gemini')).toMatchObject({ available: false, reason: '即将支持' });
    expect(list.find((item) => item.id === 'minimax')).toMatchObject({ kind: 'api', builtinKey: true });
    expect(parseSourceId('local:cursor')).toEqual({ kind: 'local', id: 'cursor' });
  });
});

describe('会话续接', () => {
  it('同一个 agent resume；换 agent 开新会话并提示', () => {
    const session = {
      ...createSession(),
      messages: [{ role: 'user', text: 'hi' }],
      agentId: 'codex',
      externalSessionId: 't1',
      externalSessionMode: 'chat',
    };
    expect(resolveLocalAgentSession(session, 'codex', 'chat')).toEqual({ externalSessionId: 't1', switched: false });
    expect(resolveLocalAgentSession(session, 'claude', 'chat')).toEqual({ externalSessionId: '', switched: true });
    expect(resolveLocalAgentSession(createSession(), 'claude', 'chat')).toEqual({ externalSessionId: '', switched: false });
  });
});

describe('renderer 事件翻译', () => {
  it('改文件 / 跑命令映射成步骤，并写活动记录', () => {
    const onEvent = vi.fn();
    const onActivity = vi.fn();
    const translator = createLocalEventTranslator({ agentLabel: 'Codex', onEvent, onActivity });
    parseFixture('codex').forEach((event) => translator.handle(event));
    const labels = onEvent.mock.calls.map(([event]) => event).filter((event) => event.type === 'tool_start').map((event) => event.label);
    expect(labels[0]).toBe('运行命令 bash -lc ls');
    expect(labels[1]).toBe('改文件 草稿.md');
    const failed = onEvent.mock.calls.map(([event]) => event).find((event) => event.type === 'tool_done' && event.tool.kind === 'mcp');
    expect(JSON.parse(failed.result).ok).toBe(false);
    expect(onActivity).toHaveBeenCalledTimes(3);
    expect(translator.state.sessionId).toBe('0199a213-81c0-7800-8aa1-bbab2a035a53');
    expect(translator.state.finalText).toBe('已经把草稿的标题改好了。');
    expect(getLocalToolLabel({ kind: 'command' })).toBe('运行命令');
  });
});

describe('运行器', () => {
  const FAKE_AGENT = `
    const lines = require('fs').readFileSync(0, 'utf8') ? ${JSON.stringify(readFixture('claude'))} : [];
    lines.forEach((line) => process.stdout.write(line + '\\n'));
  `;

  it('按行解析 stdout，prompt 走 stdin，进程退出后 done', async () => {
    const events = [];
    const run = startLocalAgentRun({
      command: process.execPath,
      args: ['-e', FAKE_AGENT],
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdin: 'hi',
      parser: getAdapter('claude').createParser(),
      onEvent: (event) => events.push(event),
    });
    const result = await run.done;
    expect(result).toMatchObject({ code: 0, cancelled: false });
    expect(events.at(-1)).toMatchObject({ type: 'done', finalText: '已经把草稿的标题改好了。' });
  });

  it('Stop 时连子进程一起停掉，不再推事件', async () => {
    if (process.platform === 'win32') return;
    const events = [];
    const script = `
      const { spawn } = require('child_process');
      const child = spawn('sleep', ['30'], { stdio: 'ignore' });
      process.stdout.write(JSON.stringify({ pid: child.pid }) + '\\n');
      setInterval(() => {}, 1000);
    `;
    let childPid = 0;
    const run = startLocalAgentRun({
      command: process.execPath,
      args: ['-e', script],
      cwd: process.cwd(),
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      parser: { parseLine: (line) => { childPid = JSON.parse(line).pid; return [{ type: 'line' }]; }, finish: () => [{ type: 'finish' }] },
      onEvent: (event) => events.push(event),
    });
    await vi.waitFor(() => expect(childPid).toBeGreaterThan(0), { timeout: 3000 });
    await run.cancel();
    const result = await run.done;
    expect(result.cancelled).toBe(true);
    expect(() => process.kill(childPid, 0)).toThrow();
    expect(events.map((event) => event.type)).toEqual(['line']);
  }, 10000);
});
