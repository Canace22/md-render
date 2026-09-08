import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatShortcut, getModifierLabel, isMacPlatform } from '../renderer/src/utils/shortcutLabel.js';

/** jsdom 的 navigator.platform 只读，用 stubGlobal 换掉整个对象 */
const stubPlatform = (platform) => vi.stubGlobal('navigator', { platform, userAgent: platform });

describe('shortcutLabel', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('mac 平台用 ⌘ 符号', () => {
    stubPlatform('MacIntel');
    expect(isMacPlatform()).toBe(true);
    expect(getModifierLabel()).toBe('⌘');
    expect(formatShortcut('k')).toBe('⌘K');
  });

  it('非 mac 平台退回 Ctrl', () => {
    stubPlatform('Win32');
    expect(isMacPlatform()).toBe(false);
    expect(formatShortcut('k')).toBe('Ctrl+K');
  });

  it('主键为空时返回空串，不产出半截标签', () => {
    stubPlatform('MacIntel');
    expect(formatShortcut('')).toBe('');
    expect(formatShortcut(undefined)).toBe('');
  });
});
