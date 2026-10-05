import { convertToMarkdown } from '../../utils/fileConverters.js';

const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(['md', 'markdown', 'txt']);
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp']);
const DOCX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const AGENT_ATTACHMENT_ACCEPT = [
  '.md', '.markdown', '.txt', '.pdf', '.docx',
  '.png', '.jpg', '.jpeg', '.gif', '.webp',
].join(',');

const getExtension = (name) => String(name ?? '').split('.').pop()?.toLowerCase() ?? '';

const getAttachmentKind = (file) => {
  const extension = getExtension(file?.name);
  const mediaType = String(file?.type ?? '').toLowerCase();
  if (TEXT_EXTENSIONS.has(extension) || mediaType === 'text/plain' || mediaType === 'text/markdown') return 'text';
  if (extension === 'pdf' || mediaType === 'application/pdf') return 'pdf';
  if (extension === 'docx' || mediaType === DOCX_MEDIA_TYPE) return 'docx';
  if (IMAGE_EXTENSIONS.has(extension) || mediaType.startsWith('image/')) return 'image';
  return '';
};

const getAttachmentName = (file) => {
  const name = String(file?.name ?? '').trim();
  if (name) return name;
  const kind = getAttachmentKind(file);
  if (kind === 'image') return '粘贴图片';
  if (kind === 'docx') return '粘贴文档.docx';
  if (kind === 'pdf') return '粘贴文档.pdf';
  return kind === 'text' ? '粘贴文本.txt' : '粘贴附件';
};

export const createAttachmentId = (file) => [
  'upload',
  getAttachmentName(file),
  Number(file?.size) || 0,
  Number(file?.lastModified) || 0,
].join(':');

export const isSupportedAgentAttachment = (file) => {
  return Boolean(getAttachmentKind(file));
};

export async function extractAgentAttachment(file, { extractPdfText } = {}) {
  if (!file || !isSupportedAgentAttachment(file)) {
    throw new Error('只支持 md、txt、pdf、docx 和常见图片附件');
  }
  if (!file.size || file.size > MAX_ATTACHMENT_BYTES) {
    throw new Error(`附件大小必须在 1 字节到 ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB 之间`);
  }

  const kind = getAttachmentKind(file);
  const name = getAttachmentName(file);
  const common = {
    id: createAttachmentId(file),
    name,
    kind: 'file',
    mediaType: file.type || '',
    status: 'ready',
  };

  if (kind === 'text') {
    return { ...common, content: await file.text() };
  }
  if (kind === 'docx') {
    return { ...common, content: await convertToMarkdown(name, await file.arrayBuffer()) };
  }
  if (kind === 'pdf') {
    if (typeof extractPdfText !== 'function') throw new Error('当前环境不支持读取 PDF');
    const content = await extractPdfText(file);
    return { ...common, content };
  }

  return {
    ...common,
    content: `【图片附件：${name}】\n当前 AI 来源未开启图片识别，请不要猜测图片内容。`,
    imageUnavailable: true,
  };
}
