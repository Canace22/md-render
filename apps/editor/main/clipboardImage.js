/**
 * 把渲染进程里的图片地址写进系统剪贴板（主进程用，不含 UI）。
 * 只认两种来源：data:image/... 内嵌图、local-media:// 本地素材。
 * electron 的 clipboard / nativeImage 由调用方传入，便于单测替换。
 */

const LOCAL_MEDIA_RE = /^local-media:\/+/i;

// 与 main.js 里 local-media 协议处理器保持同一套解析：切掉 scheme，保留首段路径
export const localMediaUrlToPath = (src = '') => decodeURIComponent(String(src).replace(LOCAL_MEDIA_RE, '/'));

export const createImageFromSrc = (src, nativeImage) => {
  const text = String(src ?? '').trim();
  if (text.startsWith('data:image/')) return nativeImage.createFromDataURL(text);
  if (LOCAL_MEDIA_RE.test(text)) return nativeImage.createFromPath(localMediaUrlToPath(text));
  return null;
};

export function copyImageSrcToClipboard(src, { clipboard, nativeImage }) {
  try {
    const image = createImageFromSrc(src, nativeImage);
    if (!image || image.isEmpty()) return { ok: false, error: '无法读取这张图片' };
    clipboard.writeImage(image);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error?.message || '复制图片失败' };
  }
}
