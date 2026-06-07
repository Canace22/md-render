const normalizePlatformToken = (value) => {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/-/g, '_');
};

export const PUBLISHING_PLATFORM_OPTIONS = Object.freeze([
  { value: 'juejin', label: '掘金' },
  { value: 'wechat', label: '微信公众号' },
  { value: 'xiaohongshu', label: '小红书' },
]);

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

export const getPublishingPlatformLabel = (value) => {
  const normalized = normalizePlatformToken(value);
  return PUBLISHING_PLATFORM_LABEL_MAP[normalized] || value || '';
};
