import { getDesktopRuntimeKind } from './desktopBridge.js';

const ALLOWED_EXTERNAL_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_EXPORT_ENCODINGS = new Set(['utf8', 'base64']);

const getElectronAPI = () => (
  typeof window !== 'undefined' ? window.electronAPI : null
);

const toError = (error, fallbackMessage) => {
  if (error instanceof Error) return error;
  if (typeof error?.message === 'string') return new Error(error.message);
  return new Error(String(error || fallbackMessage));
};

const getTauriInvoke = async () => {
  const globalCore = typeof window !== 'undefined' ? window.__TAURI__?.core : null;
  if (typeof globalCore?.invoke === 'function') return globalCore.invoke.bind(globalCore);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke;
};

const invokeTauri = async (command, args) => {
  try {
    const invoke = await getTauriInvoke();
    return await invoke(command, args);
  } catch (error) {
    throw toError(error, 'Tauri 系统能力调用失败');
  }
};

const normalizeExternalUrl = (value) => {
  let url;
  try {
    url = new URL(String(value ?? '').trim());
  } catch {
    throw new Error('无法打开无效链接');
  }
  if (!ALLOWED_EXTERNAL_PROTOCOLS.has(url.protocol)) {
    throw new Error('仅支持打开 http/https 链接');
  }
  return url.toString();
};

const normalizeExportPayload = (payload = {}) => {
  const defaultName = String(payload.defaultName ?? '').trim();
  const encoding = payload.encoding || 'utf8';
  if (!defaultName) throw new Error('导出文件名不能为空');
  if (!ALLOWED_EXPORT_ENCODINGS.has(encoding)) {
    throw new Error('不支持的导出编码');
  }
  if (typeof payload.content !== 'string') {
    throw new Error('导出内容必须是字符串');
  }
  return {
    defaultName,
    filters: Array.isArray(payload.filters) ? payload.filters : [],
    content: payload.content,
    encoding,
  };
};

const base64ToBytes = (content) => {
  const binary = atob(content);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const downloadInBrowser = ({ defaultName, content, encoding }) => {
  if (typeof document === 'undefined') {
    throw new Error('当前环境无法下载文件');
  }
  const body = encoding === 'base64' ? base64ToBytes(content) : content;
  const blob = new Blob([body]);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = defaultName;
  anchor.click();
  URL.revokeObjectURL(url);
  return { canceled: false };
};

export const shouldOfferPdfExport = () => getDesktopRuntimeKind() !== 'tauri';

export const openExternalUrl = async (value) => {
  const url = normalizeExternalUrl(value);
  if (getDesktopRuntimeKind() === 'tauri') {
    return invokeTauri('open_external_url', { url });
  }
  if (typeof window === 'undefined') throw new Error('当前环境无法打开链接');
  window.open(url, '_blank', 'noopener,noreferrer');
  return { opened: true };
};

export const saveExportFile = async (payload) => {
  const normalized = normalizeExportPayload(payload);
  const electronAPI = getElectronAPI();
  if (typeof electronAPI?.exportSaveFile === 'function') {
    return electronAPI.exportSaveFile(normalized);
  }
  if (getDesktopRuntimeKind() === 'tauri') {
    return invokeTauri('save_export_file', { payload: normalized });
  }
  return downloadInBrowser(normalized);
};

export const exportPdfFile = async (payload) => {
  const electronAPI = getElectronAPI();
  if (typeof electronAPI?.exportToPdf !== 'function') {
    throw new Error('PDF 导出尚未在当前桌面壳中实现');
  }
  return electronAPI.exportToPdf(payload);
};
