import { copyImageToClipboardNative } from '../services/electronBridge.js';

/**
 * 复制图片到系统剪贴板。
 * 1. Electron：交给主进程直接读文件写剪贴板（不受 local-media 跨域限制）。
 * 2. 其他情况（Web / blob: 地址）：fetch 原图 → 转 PNG → Clipboard API。
 * 失败时抛错，由调用方提示。
 */

// Clipboard API 只稳定支持 image/png，其他格式先画到 canvas 转一下
export const toPngBlob = async (blob) => {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error('图片转换失败'))), 'image/png');
  });
};

const copyWithClipboardApi = async (src) => {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('当前环境不支持复制图片');
  }
  const res = await fetch(src);
  if (!res.ok) throw new Error('读取图片失败');
  const png = await toPngBlob(await res.blob());
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
};

export async function copyImageToClipboard(src) {
  if (!src) throw new Error('没有可复制的图片');
  const native = await copyImageToClipboardNative(src);
  if (native?.ok) return;
  await copyWithClipboardApi(src);
}
