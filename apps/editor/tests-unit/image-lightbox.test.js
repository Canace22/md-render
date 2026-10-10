import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../renderer/src/services/electronBridge.js', () => ({
  copyImageToClipboardNative: vi.fn(),
}));

import { getActualScale, getFitScale, getZoomRange } from '../renderer/src/hooks/useLightboxZoom.js';
import { copyImageToClipboard } from '../renderer/src/utils/imageClipboard.js';
import { copyImageToClipboardNative } from '../renderer/src/services/electronBridge.js';
import { copyImageSrcToClipboard, createImageFromSrc, localMediaUrlToPath } from '../main/clipboardImage.js';

const fakeImage = (empty = false) => ({ isEmpty: () => empty });
const fakeNative = () => ({
  createFromDataURL: vi.fn(() => fakeImage()),
  createFromPath: vi.fn(() => fakeImage()),
});

describe('lightbox 缩放比例', () => {
  it('大图按视口完整显示（Retina 截图 3022×1574 放进 1440×900 窗口）', () => {
    const scale = getFitScale({ width: 3022, height: 1574 }, { width: 1440, height: 900 });
    expect(3022 * scale).toBeCloseTo(1440 * 0.92);
  });

  it('小图不放大，保持原始像素', () => {
    expect(getFitScale({ width: 400, height: 300 }, { width: 1440, height: 900 })).toBe(1);
  });

  it('1:1 在 2 倍屏上是 0.5，图片像素对齐屏幕物理像素', () => {
    expect(getActualScale(2)).toBe(0.5);
    expect(getActualScale(undefined)).toBe(1);
  });

  it('缩放范围至少能放大到原图 4 倍', () => {
    expect(getZoomRange(0.4)).toEqual({ min: 0.2, max: 4 });
  });
});

describe('主进程写剪贴板', () => {
  it('local-media 地址解析出带中文的绝对路径', () => {
    const url = 'local-media:///Users/test/%E5%86%85%E5%AE%B9/assets/%E6%88%AA%E5%9B%BE.png';
    expect(localMediaUrlToPath(url)).toBe('/Users/test/内容/assets/截图.png');
  });

  it('data URL 与 local-media 分别走对应的 nativeImage 构造', () => {
    const nativeImage = fakeNative();
    createImageFromSrc('data:image/png;base64,AAAA', nativeImage);
    createImageFromSrc('local-media:///a/b.png', nativeImage);
    expect(nativeImage.createFromDataURL).toHaveBeenCalledOnce();
    expect(nativeImage.createFromPath).toHaveBeenCalledWith('/a/b.png');
    expect(createImageFromSrc('https://x.com/a.png', nativeImage)).toBeNull();
  });

  it('读不到图片时返回错误而不是抛出', () => {
    const clipboard = { writeImage: vi.fn() };
    const nativeImage = { ...fakeNative(), createFromPath: () => fakeImage(true) };
    expect(copyImageSrcToClipboard('local-media:///missing.png', { clipboard, nativeImage }).ok).toBe(false);
    expect(clipboard.writeImage).not.toHaveBeenCalled();
  });
});

describe('渲染进程复制图片', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('Electron 成功时不再走 Clipboard API', async () => {
    copyImageToClipboardNative.mockResolvedValueOnce({ ok: true });
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    await copyImageToClipboard('local-media:///a.png');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('非 Electron 时用 Clipboard API 写入 PNG', async () => {
    copyImageToClipboardNative.mockResolvedValueOnce(undefined);
    const png = new Blob(['x'], { type: 'image/png' });
    const write = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, blob: async () => png })));
    vi.stubGlobal('navigator', { clipboard: { write } });
    vi.stubGlobal('ClipboardItem', class { constructor(items) { this.items = items; } });
    await copyImageToClipboard('blob:abc');
    expect(write.mock.calls[0][0][0].items['image/png']).toBe(png);
  });

  it('空地址直接报错', async () => {
    await expect(copyImageToClipboard('')).rejects.toThrow('没有可复制的图片');
  });
});
