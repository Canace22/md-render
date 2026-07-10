const MAX_SUMMARY_CHARS = 140;

export const AGENT_ARTIFACT_TYPES = Object.freeze({
  plan: Object.freeze({ label: '方案', fallbackName: 'AI 方案', draftStatus: 'draft' }),
  brief: Object.freeze({ label: '简报', fallbackName: '工作区简报', draftStatus: 'collecting' }),
  research: Object.freeze({ label: '调研', fallbackName: '调研结果', draftStatus: 'collecting' }),
  checklist: Object.freeze({ label: '清单', fallbackName: '执行清单', draftStatus: 'draft' }),
  platform_draft: Object.freeze({ label: '平台稿', fallbackName: '平台版本', draftStatus: 'ready' }),
  incident_report: Object.freeze({ label: '事故报告', fallbackName: 'MD Render 故障报告', draftStatus: 'collecting' }),
});

const normalizeList = (value) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map((item) => String(item ?? '').trim())
    .filter(Boolean),
));

const deriveSummary = (content) => {
  const line = String(content ?? '')
    .split('\n')
    .map((item) => item.replace(/^#+\s*/, '').trim())
    .find(Boolean) ?? '';
  return line.length <= MAX_SUMMARY_CHARS
    ? line
    : `${line.slice(0, MAX_SUMMARY_CHARS)}…`;
};

export const buildAgentArtifactPayload = ({
  artifactType,
  name = '',
  summary = '',
  content = '',
  sourceMaterialIds = [],
  targetPlatforms = [],
} = {}) => {
  const preset = AGENT_ARTIFACT_TYPES[artifactType];
  const cleanContent = String(content ?? '').trim();
  if (!preset) return { ok: false, error: '不支持的产出物类型。' };
  if (!cleanContent) return { ok: false, error: '产出物内容为空。' };

  const cleanSummary = String(summary ?? '').trim() || deriveSummary(cleanContent);
  return {
    ok: true,
    artifact: {
      type: artifactType,
      label: preset.label,
      name: String(name ?? '').trim() || preset.fallbackName,
      content: `${cleanContent}\n`,
      meta: {
        summary: cleanSummary,
        draftStatus: preset.draftStatus,
        sourceMaterialIds: normalizeList(sourceMaterialIds),
        targetPlatforms: normalizeList(targetPlatforms),
      },
    },
  };
};

export const parseAgentArtifactResult = (value) => {
  if (!value) return null;
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed?.kind === 'agent_artifact' && parsed?.ok ? parsed : null;
  } catch {
    return null;
  }
};
