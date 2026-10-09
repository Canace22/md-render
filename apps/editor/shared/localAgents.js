/**
 * 本地 agent 注册表（纯数据）：md-render 能检测 / 驱动的本机 agent CLI 和本地模型服务。
 *
 * 加一个新 agent：在这里加一条 + 在 main/localAgents/adapters/ 写一个适配器并登记。
 * main（检测、运行）和 renderer（来源列表、模型选项）共用这一份，避免漂移。
 */

export const LOCAL_AGENT_KINDS = Object.freeze({ AGENT: 'agent', MODEL_SERVER: 'model-server' });

/** 检测结果状态：ready 可直接用；unverified 装了但登录态要首轮才知道；needs-login 要先登录 */
export const LOCAL_AGENT_STATUS = Object.freeze({
  READY: 'ready',
  UNVERIFIED: 'unverified',
  NEEDS_LOGIN: 'needs-login',
  UNSUPPORTED: 'unsupported',
  MISSING: 'missing',
});

/** 能直接运行的状态（needs-login / unsupported / missing 都不行） */
export const RUNNABLE_STATUSES = Object.freeze([LOCAL_AGENT_STATUS.READY, LOCAL_AGENT_STATUS.UNVERIFIED]);

export const LOCAL_AGENTS = Object.freeze([
  {
    id: 'codex',
    label: 'Codex',
    kind: LOCAL_AGENT_KINDS.AGENT,
    bins: ['codex'],
    // Codex 桌面版 / ChatGPT 桌面版自带 CLI
    appBundlePaths: ['Codex.app/Contents/Resources/codex', 'ChatGPT.app/Contents/Resources/codex'],
    priority: 10,
    supported: true,
    loginCheckArgs: ['login', 'status'],
    // 兜底预设：正常从 ~/.codex/models_cache.json 读真实列表
    modelPresets: ['gpt-6.1-sol', 'gpt-6-astra', 'gpt-5.6-sol'],
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    installHint: 'npm install -g @openai/codex',
    loginHint: '在终端运行一次 `codex login` 完成登录',
  },
  {
    id: 'claude',
    label: 'Claude Code',
    kind: LOCAL_AGENT_KINDS.AGENT,
    bins: ['claude'],
    extraDirs: ['~/.claude/local'],
    priority: 20,
    supported: true,
    // 没有便宜的登录检测命令：标「未验证」，首轮报鉴权错误时再引导
    loginCheckArgs: null,
    modelPresets: ['fable', 'opus', 'sonnet', 'haiku'],
    effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'],
    installHint: 'curl -fsSL https://claude.ai/install.sh | bash',
    loginHint: '在终端运行一次 `claude` 完成登录',
  },
  {
    id: 'cursor',
    label: 'Cursor',
    kind: LOCAL_AGENT_KINDS.AGENT,
    // 新名 `agent` 太通用：先找 cursor-agent，再找 agent 并确认真是 Cursor
    bins: ['cursor-agent', 'agent'],
    ambiguousBins: ['agent'],
    extraDirs: ['~/.cursor/bin'],
    priority: 30,
    supported: true,
    loginCheckArgs: ['status'],
    modelPresets: ['auto'],
    installHint: 'curl https://cursor.com/install -fsS | bash',
    loginHint: '在终端运行一次 `cursor-agent login` 完成登录',
  },
  { id: 'gemini', label: 'Gemini CLI', kind: LOCAL_AGENT_KINDS.AGENT, bins: ['gemini'], priority: 40, supported: false },
  { id: 'qwen', label: 'Qwen Code', kind: LOCAL_AGENT_KINDS.AGENT, bins: ['qwen'], priority: 50, supported: false },
  { id: 'opencode', label: 'OpenCode', kind: LOCAL_AGENT_KINDS.AGENT, bins: ['opencode'], priority: 60, supported: false },
  {
    id: 'ollama',
    label: 'Ollama',
    kind: LOCAL_AGENT_KINDS.MODEL_SERVER,
    probeUrl: 'http://localhost:11434/api/tags',
    priority: 70,
    supported: false,
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    kind: LOCAL_AGENT_KINDS.MODEL_SERVER,
    probeUrl: 'http://localhost:1234/v1/models',
    priority: 80,
    supported: false,
  },
]);

export const getLocalAgent = (id) => LOCAL_AGENTS.find((agent) => agent.id === id) || null;

/** 检测结果是否能直接跑一轮 */
export const isRunnableAgent = (detected) => Boolean(
  detected
  && getLocalAgent(detected.id)?.supported
  && RUNNABLE_STATUSES.includes(detected.status),
);
