export const SAFE_REPAIR_IDS = Object.freeze({
  RESET_AI_PROXY_OVERRIDE: 'reset_ai_proxy_override',
});

const SAFE_REPAIR_LABELS = Object.freeze({
  [SAFE_REPAIR_IDS.RESET_AI_PROXY_OVERRIDE]: '恢复打包默认 AI 代理',
});

const toSafeEndpoint = (value) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  try {
    return new URL(text).origin;
  } catch {
    return text.split(/[?#]/)[0].slice(0, 120);
  }
};

const isProxyReachable = (snapshot) => (
  snapshot?.aiProxy?.reachable === true
  || snapshot?.runtime?.aiProxy?.reachable === true
);

const getResetProxyProposal = (aiConfiguration = {}) => {
  const previousBase = String(aiConfiguration.override ?? '').trim();
  const nextBase = String(aiConfiguration.builtDefault ?? '').trim();
  if (!previousBase || !nextBase || previousBase === nextBase) return null;
  return {
    id: SAFE_REPAIR_IDS.RESET_AI_PROXY_OVERRIDE,
    label: SAFE_REPAIR_LABELS[SAFE_REPAIR_IDS.RESET_AI_PROXY_OVERRIDE],
    description: `清除本机覆盖值 ${toSafeEndpoint(previousBase)}，恢复为打包默认值 ${toSafeEndpoint(nextBase)}。`,
    previousBase,
    nextBase,
  };
};

export const buildAgentHealthSnapshot = ({
  runtimeSnapshot = {},
  aiConfiguration = {},
  workspaceBrief = null,
  activeDoc = null,
  currentSurface = '',
} = {}) => {
  const issues = [];
  const proxy = runtimeSnapshot?.aiProxy ?? {};
  const database = runtimeSnapshot?.database ?? {};

  if (proxy.reachable === false) {
    issues.push({
      code: 'ai_proxy_unreachable',
      severity: 'error',
      message: `AI 代理 ${proxy.endpoint || toSafeEndpoint(aiConfiguration.resolved)} 无法连接。`,
    });
  }
  if (
    database.ok === false
    || (database.integrity && database.integrity !== 'ok')
    || (database.quickCheck && database.quickCheck !== 'ok')
  ) {
    issues.push({
      code: 'database_unhealthy',
      severity: 'error',
      message: 'SQLite 数据库自检未通过。',
    });
  }
  if (runtimeSnapshot?.ok === false) {
    const runtimeError = runtimeSnapshot.error;
    issues.push({
      code: 'runtime_diagnostics_incomplete',
      severity: 'warning',
      message: typeof runtimeError === 'string'
        ? runtimeError
        : runtimeError?.message || '本机运行诊断不完整。',
    });
  }

  const repair = runtimeSnapshot?.ok !== false && proxy.reachable === false
    ? getResetProxyProposal(aiConfiguration)
    : null;

  return {
    capturedAt: runtimeSnapshot?.capturedAt ?? new Date().toISOString(),
    app: runtimeSnapshot?.app ?? null,
    runtime: runtimeSnapshot?.runtime ?? null,
    database,
    aiProxy: {
      ...proxy,
      configSource: aiConfiguration.source ?? 'unknown',
      endpoint: proxy.endpoint || proxy.origin || toSafeEndpoint(aiConfiguration.resolved),
    },
    updater: runtimeSnapshot?.updater ?? null,
    workspace: workspaceBrief,
    currentSurface,
    activeDoc,
    issues,
    availableRepairs: repair
      ? [{ id: repair.id, label: repair.label, description: repair.description }]
      : [],
  };
};

export const runSafeRepair = async ({
  repairId,
  aiConfiguration,
  confirm,
  clearAiServerOverride,
  restoreAiServerOverride,
  verify,
} = {}) => {
  if (repairId !== SAFE_REPAIR_IDS.RESET_AI_PROXY_OVERRIDE) {
    return { ok: false, error: '未知的安全修复动作。' };
  }

  const proposal = getResetProxyProposal(aiConfiguration);
  if (!proposal) {
    return { ok: false, error: '当前没有可恢复的 AI 代理覆盖配置。' };
  }

  const approved = await confirm?.({
    title: proposal.label,
    description: proposal.description,
  });
  if (!approved) return { ok: false, cancelled: true, message: '用户取消了修复。' };

  try {
    clearAiServerOverride?.();
    const verification = await verify?.(proposal.nextBase);
    if (isProxyReachable(verification)) {
      return {
        ok: true,
        repairId,
        message: '已恢复打包默认 AI 代理，复检连接正常。',
        endpoint: toSafeEndpoint(proposal.nextBase),
      };
    }

    restoreAiServerOverride?.(proposal.previousBase);
    return {
      ok: false,
      repairId,
      rolledBack: true,
      error: '新配置复检失败，已自动恢复原配置。',
    };
  } catch (error) {
    restoreAiServerOverride?.(proposal.previousBase);
    return {
      ok: false,
      repairId,
      rolledBack: true,
      error: `修复执行失败，已恢复原配置：${error?.message ?? String(error)}`,
    };
  }
};
