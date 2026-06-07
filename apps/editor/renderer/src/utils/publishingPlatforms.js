const normalizePlatformToken = (value) => {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
};

export const DEFAULT_PUBLISHING_PLATFORM_OPTIONS = Object.freeze([
  { value: 'juejin', label: '掘金' },
  { value: 'wechat', label: '微信公众号' },
  { value: 'xiaohongshu', label: '小红书' },
]);

export const PUBLISHING_PLATFORM_OPTIONS = DEFAULT_PUBLISHING_PLATFORM_OPTIONS;

export const PUBLISHING_PLATFORM_VALUES = Object.freeze(
  PUBLISHING_PLATFORM_OPTIONS.map((option) => option.value),
);

export const PUBLISHING_PLATFORM_LABEL_MAP = Object.freeze(
  PUBLISHING_PLATFORM_OPTIONS.reduce((result, option) => {
    result[option.value] = option.label;
    return result;
  }, {}),
);

export const DEFAULT_TARGET_PLATFORMS = Object.freeze(['wechat']);

const buildFallbackPlatformValue = (label, index) => {
  const normalized = normalizePlatformToken(label);
  if (normalized) return normalized;
  return `platform_${index + 1}`;
};

export const sanitizePublishingPlatforms = (platforms) => {
  const source = Array.isArray(platforms) ? platforms : [];
  const seen = new Set();
  const cleaned = source
    .map((item, index) => {
      if (!item || typeof item !== 'object') return null;

      const label = String(item.label ?? '').trim();
      if (!label) return null;

      const baseValue = String(item.value ?? '').trim() || buildFallbackPlatformValue(label, index);
      let value = normalizePlatformToken(baseValue);
      if (!value) {
        value = buildFallbackPlatformValue(label, index);
      }

      if (seen.has(value)) return null;
      seen.add(value);
      return { value, label };
    })
    .filter(Boolean);

  return cleaned.length > 0 ? cleaned : DEFAULT_PUBLISHING_PLATFORM_OPTIONS.slice();
};

export const buildPublishingPlatformLabelMap = (platformOptions = PUBLISHING_PLATFORM_OPTIONS) => {
  return new Map(
    sanitizePublishingPlatforms(platformOptions).map((option) => [option.value, option.label]),
  );
};

export const getPublishingPlatformLabel = (value, platformOptions = PUBLISHING_PLATFORM_OPTIONS) => {
  const normalized = normalizePlatformToken(value);
  const labelMap = platformOptions === PUBLISHING_PLATFORM_OPTIONS
    ? PUBLISHING_PLATFORM_LABEL_MAP
    : Object.fromEntries(buildPublishingPlatformLabelMap(platformOptions));
  return labelMap[normalized] || value || '';
};

export const getDefaultTargetPlatforms = (platformOptions = PUBLISHING_PLATFORM_OPTIONS) => {
  const options = sanitizePublishingPlatforms(platformOptions);
  if (options.some((option) => option.value === DEFAULT_TARGET_PLATFORMS[0])) {
    return DEFAULT_TARGET_PLATFORMS.slice();
  }
  return options.length > 0 ? [options[0].value] : [];
};
