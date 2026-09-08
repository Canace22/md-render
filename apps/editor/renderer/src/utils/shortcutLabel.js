/**
 * 快捷键文案 —— 把 Cmd/Ctrl 这类修饰键渲染成当前平台看得懂的字符。
 *
 * 纯展示用途，不参与按键判定（判定仍在各 hook 里 `metaKey || ctrlKey` 两边都收）。
 * 拿不到平台信息时退回 Ctrl，宁可在 mac 上多显示两个字母，也不要在 Windows 上显示 ⌘。
 */

const MAC_PLATFORM_PATTERN = /mac|iphone|ipad|ipod/i;

const readPlatform = () => {
  if (typeof navigator === 'undefined') return '';
  return navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
};

/** 当前是否 mac 系平台 */
export const isMacPlatform = () => MAC_PLATFORM_PATTERN.test(readPlatform());

/** 修饰键符号：mac 为 ⌘，其余平台为 Ctrl */
export const getModifierLabel = () => (isMacPlatform() ? '⌘' : 'Ctrl');

/**
 * 组合出「修饰键 + 主键」的短标签，如 `⌘K` / `Ctrl+K`
 * @param {string} key 主键字母，调用方传大写
 */
export const formatShortcut = (key) => {
  const upperKey = String(key ?? '').toUpperCase();
  if (!upperKey) return '';
  return isMacPlatform() ? `⌘${upperKey}` : `Ctrl+${upperKey}`;
};
