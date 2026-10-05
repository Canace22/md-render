/**
 * 本地 agent 通用运行器（L1-1）：spawn CLI → 按行切 JSONL 交给适配器解析 → 事件回调。
 *
 * - 每次运行独占一个进程组（detached），Stop 时整组 SIGTERM → 1.5 秒后 SIGKILL，
 *   agent 拉起的 shell 命令一起停掉（真取消）。
 * - 另起一个守护进程：md-render 自己被强退时（IPC 断开）也会清掉这组进程，不留孤儿。
 * - stderr 只留尾部，超时自动停止。
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

export const RUN_TIMEOUT_MS = 30 * 60 * 1000;
const KILL_GRACE_MS = 1500;
const STDERR_TAIL_CHARS = 6000;
const GROUP_POLL_MS = 25;
const GROUP_POLL_ATTEMPTS = 60;

const GUARDIAN_SCRIPT = `
const group = Number(process.argv[process.argv.length - 1]);
let timer;
const signal = (value) => { try { process.kill(-group, value); } catch {} };
process.on('disconnect', () => {
  signal('SIGTERM');
  timer = setTimeout(() => { signal('SIGKILL'); process.exit(0); }, ${KILL_GRACE_MS});
});
process.on('message', (message) => {
  if (message === 'finished') { clearTimeout(timer); process.exit(0); }
});
`;

const isWindows = process.platform === 'win32';

const signalGroup = (child, signal) => {
  if (!child?.pid) return;
  try {
    if (isWindows) {
      // Windows 没有进程组信号：用 taskkill /T 连子进程一起结束
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error.code !== 'ESRCH') child.kill(signal);
  }
};

const waitForGroupExit = async (pid) => {
  if (!pid || isWindows) return;
  for (let attempt = 0; attempt < GROUP_POLL_ATTEMPTS; attempt += 1) {
    try {
      process.kill(-pid, 0);
    } catch (error) {
      if (error.code === 'ESRCH') return;
    }
    await new Promise((resolve) => { setTimeout(resolve, GROUP_POLL_MS); });
  }
};

/** 守护进程：用 Electron 自身以 node 模式运行 */
const startGuardian = (child) => {
  if (isWindows || !child.pid) return null;
  try {
    const guardian = spawn(process.execPath, ['-e', GUARDIAN_SCRIPT, String(child.pid)], {
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      detached: true,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
    guardian.on('error', () => {});
    guardian.unref();
    guardian.channel?.unref?.();
    return guardian;
  } catch {
    return null;
  }
};

/**
 * 启动一次运行。
 * @param {object} params
 * @param {string} params.command
 * @param {string[]} params.args
 * @param {string} params.cwd
 * @param {object} params.env
 * @param {string} [params.stdin]       prompt
 * @param {{ parseLine: Function, finish: Function }} params.parser
 * @param {(event: object) => void} params.onEvent
 * @param {number} [params.timeoutMs]
 * @returns {{ cancel: () => Promise<void>, done: Promise<{ code, signal, cancelled, timedOut }> }}
 */
export const startLocalAgentRun = ({
  command,
  args,
  cwd,
  env,
  stdin = '',
  parser,
  onEvent,
  timeoutMs = RUN_TIMEOUT_MS,
}) => {
  let stderr = '';
  let cancelled = false;
  let timedOut = false;
  let guardian = null;

  const emit = (events) => events.forEach((event) => {
    try {
      onEvent(event);
    } catch (error) {
      console.warn('[local-agent] event handler failed:', error?.message);
    }
  });

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
    detached: !isWindows,
    windowsHide: true,
  });
  child.once('spawn', () => { guardian = startGuardian(child); });

  const closed = new Promise((resolve) => {
    child.once('close', (code, signal) => resolve({ code, signal }));
    child.once('error', (error) => {
      stderr = `${stderr}\n无法启动 ${command}：${error.message}`.slice(-STDERR_TAIL_CHARS);
      resolve({ code: -1, signal: null });
    });
  });

  child.stdin.on('error', () => { /* 进程提前退出时写 stdin 会 EPIPE，结果以退出事件为准 */ });
  child.stdin.end(stdin);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL_CHARS); });
  createInterface({ input: child.stdout, crlfDelay: Infinity }).on('line', (line) => {
    if (cancelled || !line.trim()) return;
    emit(parser.parseLine(line));
  });

  const stop = async () => {
    signalGroup(child, 'SIGTERM');
    const timer = setTimeout(() => signalGroup(child, 'SIGKILL'), KILL_GRACE_MS);
    try {
      await closed;
      // CLI 可能先退出、它拉起的 shell 还没响应 SIGTERM
      signalGroup(child, 'SIGKILL');
      await waitForGroupExit(child.pid);
    } finally {
      clearTimeout(timer);
    }
  };

  const timeout = setTimeout(() => {
    timedOut = true;
    stop();
  }, timeoutMs);
  timeout.unref?.();

  const done = closed.then(async ({ code, signal }) => {
    clearTimeout(timeout);
    if (guardian?.connected) guardian.send('finished', () => {});
    if (!cancelled) {
      const tail = timedOut ? `本地 agent 运行超过 ${Math.round(timeoutMs / 60000)} 分钟，已停止` : stderr;
      emit(parser.finish({ code, signal, stderr: tail }));
    }
    return { code, signal, cancelled, timedOut };
  });

  const cancel = async () => {
    if (cancelled) return;
    cancelled = true;
    await stop();
    await done;
  };

  return { cancel, done };
};
