const FILE_EXTENSION_RE = /(\.[^./\\]+)$/;
const DEFAULT_FILE_DISPLAY_NAME = '未命名';

export function stripFileExtension(name, fallback = DEFAULT_FILE_DISPLAY_NAME) {
  const value = String(name ?? '').trim();
  if (!value) return fallback;
  const displayName = value.replace(FILE_EXTENSION_RE, '').trim();
  return displayName || value;
}
