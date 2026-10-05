import {
  aiExtractAttachmentText,
  hasAiAttachmentTextBridge,
} from './electronBridge.js';

const normalizeBase = (value) => String(value ?? '').trim().replace(/\/+$/, '');

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = String(reader.result ?? '');
    const separatorIndex = dataUrl.indexOf(',');
    if (separatorIndex < 0) {
      reject(new Error('PDF 读取失败'));
      return;
    }
    resolve(dataUrl.slice(separatorIndex + 1));
  };
  reader.onerror = () => reject(reader.error || new Error('PDF 读取失败'));
  reader.readAsDataURL(file);
});

export const extractPdfAttachmentText = async (file, { aiProxyBase } = {}) => {
  const base64 = await fileToBase64(file);
  const payload = {
    base64,
    aiProxyBase: normalizeBase(aiProxyBase),
  };

  let result;
  if (hasAiAttachmentTextBridge()) {
    result = await aiExtractAttachmentText(payload);
  } else {
    if (!payload.aiProxyBase) throw new Error('未配置 AI 代理地址，无法读取 PDF');
    const response = await fetch(`${payload.aiProxyBase}/api/attachments/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base64 }),
    });
    result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error || `PDF 读取失败 (${response.status})`);
    }
  }

  if (!result?.ok) throw new Error(result?.error || 'PDF 读取失败');
  return String(result.content ?? '').trim();
};
