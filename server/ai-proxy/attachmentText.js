const { execFile } = require('child_process');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);
const MAX_ATTACHMENT_BYTES = 12 * 1024 * 1024;
const MAX_ATTACHMENT_TEXT_CHARS = 30000;
const PDF_EXTRACT_TIMEOUT_MS = 30000;
const PDF_TEXT_SCRIPT = path.join(__dirname, 'tools', 'pdf-to-docx', 'pdf-to-text.py');
const MAX_CONCURRENT_EXTRACTIONS = 2;
let activeExtractions = 0;

const normalizeBase64 = (value) => String(value ?? '').replace(/\s+/g, '');

const decodePdf = (base64) => {
  const clean = normalizeBase64(base64);
  if (!clean || !/^[a-z0-9+/]+={0,2}$/i.test(clean)) {
    throw new Error('PDF 内容不是有效的 base64');
  }
  const buffer = Buffer.from(clean, 'base64');
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error(`PDF 大小必须在 1 字节到 ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB 之间`);
  }
  if (!buffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) {
    throw new Error('附件不是有效的 PDF');
  }
  return buffer;
};

async function extractPdfText({ base64 } = {}) {
  if (activeExtractions >= MAX_CONCURRENT_EXTRACTIONS) {
    const error = new Error('PDF 读取任务较多，请稍后重试');
    error.code = 'PDF_EXTRACT_BUSY';
    throw error;
  }
  const buffer = decodePdf(base64);
  activeExtractions += 1;
  let tempRoot = '';
  try {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'md-render-pdf-'));
    const inputPath = path.join(tempRoot, `${crypto.randomUUID()}.pdf`);
    await fs.writeFile(inputPath, buffer, { flag: 'wx' });
    const { stdout } = await execFileAsync('python3', [PDF_TEXT_SCRIPT, inputPath], {
      timeout: PDF_EXTRACT_TIMEOUT_MS,
      maxBuffer: MAX_ATTACHMENT_TEXT_CHARS * 4,
      windowsHide: true,
    });
    const content = String(stdout ?? '').trim();
    if (!content) throw new Error('PDF 中没有可提取的文字');
    const truncated = content.length > MAX_ATTACHMENT_TEXT_CHARS;
    return {
      ok: true,
      content: truncated ? `${content.slice(0, MAX_ATTACHMENT_TEXT_CHARS)}\n…（内容过长已截断）` : content,
      truncated,
    };
  } catch (error) {
    if (error?.killed || error?.signal) throw new Error('PDF 文字提取超时');
    throw new Error(error?.stderr?.trim() || error?.message || 'PDF 文字提取失败');
  } finally {
    try {
      if (tempRoot) await fs.rm(tempRoot, { recursive: true, force: true });
    } finally {
      activeExtractions -= 1;
    }
  }
}

module.exports = { extractPdfText };
