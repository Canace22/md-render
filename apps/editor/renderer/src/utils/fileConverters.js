/**
 * 文件格式转换工具
 * 将各种文件格式转换为 Markdown 文本
 * 所有函数为纯函数 / 异步纯函数，无副作用
 */

// ─── 常量 ────────────────────────────────────────────────────────────────────

/** 支持导入的文件扩展名 → MIME 类型映射 */
export const IMPORT_ACCEPT = [
  '.md', '.markdown', '.txt',
  '.html', '.htm',
  '.docx',
  '.csv',
  '.rst',
  '.org',
  '.json',
].join(',');

/** 文件扩展名 → 人类可读类型名 */
const EXT_LABELS = {
  '.md': 'Markdown',
  '.markdown': 'Markdown',
  '.txt': '纯文本',
  '.html': 'HTML',
  '.htm': 'HTML',
  '.docx': 'Word',
  '.csv': 'CSV',
  '.xlsx': 'Excel',
  '.xls': 'Excel',
  '.rst': 'reStructuredText',
  '.org': 'Org Mode',
  '.json': 'JSON',
  // 图片
  '.png': '图片', '.jpg': '图片', '.jpeg': '图片',
  '.gif': '图片', '.svg': '图片', '.webp': '图片',
  '.bmp': '图片', '.ico': '图标',
  // 视频
  '.mp4': '视频', '.webm': '视频', '.ogg': '视频', '.mov': '视频',
  // 音频
  '.mp3': '音频', '.wav': '音频', '.flac': '音频', '.aac': '音频',
};

export const getFileTypeLabel = (filename) => {
  const ext = getExtension(filename);
  return EXT_LABELS[ext] || ext.toUpperCase().slice(1);
};

// ─── 工具函数 ──────────────────────────────────────────────────────────────

const getExtension = (filename) => {
  const match = String(filename ?? '').match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
};

const isMarkdownExt = (ext) => ['.md', '.markdown', '.txt'].includes(ext);

// ─── HTML → Markdown ─────────────────────────────────────────────────────

let turndownInstance = null;

const getTurndown = async () => {
  if (turndownInstance) return turndownInstance;
  const { default: TurndownService } = await import('turndown');
  turndownInstance = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
  });
  // 移除 script / style 标签
  turndownInstance.remove(['script', 'style', 'noscript']);
  return turndownInstance;
};

export async function htmlToMarkdown(html) {
  const td = await getTurndown();
  return td.turndown(html).trim();
}

// ─── DOCX → Markdown ────────────────────────────────────────────────────

/**
 * 将 DOCX 的 ArrayBuffer 转为 Markdown
 * @param {ArrayBuffer} arrayBuffer docx 文件内容
 * @returns {Promise<string>} markdown 文本
 */
export async function docxToMarkdown(arrayBuffer) {
  const mammoth = await import('mammoth');
  const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
  return htmlToMarkdown(html);
}

/**
 * 将 base64 编码的 DOCX 转为 Markdown
 * @param {string} base64 base64 编码的 docx 内容
 * @returns {Promise<string>} markdown 文本
 */
export async function docxBase64ToMarkdown(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return docxToMarkdown(bytes.buffer);
}

// ─── CSV → Markdown ─────────────────────────────────────────────────────

/**
 * 将 CSV 文本转为 Markdown 表格
 * 简易解析，支持引号和逗号转义
 */
export function csvToMarkdown(csvText) {
  const lines = parseCSVLines(csvText);
  if (lines.length === 0) return '';

  const header = lines[0];
  const colCount = header.length;
  const separator = header.map(() => '---').join(' | ');
  const formatRow = (row) =>
    row.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ');

  const rows = [formatRow(header), separator];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    // 补齐或截断到与 header 等列数
    const normalized = Array.from({ length: colCount }, (_, idx) => row[idx] ?? '');
    rows.push(formatRow(normalized));
  }
  return rows.join('\n');
}

function parseCSVLines(text) {
  const lines = [];
  let current = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      current.push(cell.trim());
      cell = '';
    } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
      current.push(cell.trim());
      if (current.some((c) => c !== '')) lines.push(current);
      current = [];
      cell = '';
      if (ch === '\r') i++;
    } else {
      cell += ch;
    }
  }
  // 最后一行
  current.push(cell.trim());
  if (current.some((c) => c !== '')) lines.push(current);

  return lines;
}

// ─── reStructuredText → Markdown (基础转换) ─────────────────────────────

export function rstToMarkdown(rst) {
  let md = rst;
  // 标题：下划线风格 → ATX
  md = md.replace(/^(.+)\n[=]{3,}\s*$/gm, (_, title) => `# ${title.trim()}`);
  md = md.replace(/^(.+)\n[-]{3,}\s*$/gm, (_, title) => `## ${title.trim()}`);
  md = md.replace(/^(.+)\n[~]{3,}\s*$/gm, (_, title) => `### ${title.trim()}`);
  md = md.replace(/^(.+)\n[\^]{3,}\s*$/gm, (_, title) => `#### ${title.trim()}`);
  // 粗体 / 斜体
  md = md.replace(/\*\*(.+?)\*\*/g, '**$1**');
  md = md.replace(/\*(.+?)\*/g, '*$1*');
  // 行内代码
  md = md.replace(/``(.+?)``/g, '`$1`');
  // 链接 `text <url>`_
  md = md.replace(/`([^<]+?)\s+<([^>]+)>`_/g, '[$1]($2)');
  // 代码块 :: 后的缩进块
  md = md.replace(/::(\n(?:\n|[ \t]+[^\n]*\n)*)/g, (_, block) => {
    const lines = block.split('\n').map((line) => line.replace(/^ {3,4}/, ''));
    return '\n```\n' + lines.join('\n').trim() + '\n```\n';
  });
  // 列表项 (数字和 *)
  md = md.replace(/^#\.\s/gm, '1. ');
  return md.trim();
}

// ─── Org Mode → Markdown (基础转换) ─────────────────────────────────────

export function orgToMarkdown(org) {
  let md = org;
  // 标题 * → #
  md = md.replace(/^\*{1}\s+(.+)$/gm, '# $1');
  md = md.replace(/^\*{2}\s+(.+)$/gm, '## $1');
  md = md.replace(/^\*{3}\s+(.+)$/gm, '### $1');
  md = md.replace(/^\*{4}\s+(.+)$/gm, '#### $1');
  // 粗体 / 斜体 / 代码
  md = md.replace(/\*(.+?)\*/g, '**$1**');
  md = md.replace(/\/(.+?)\//g, '*$1*');
  md = md.replace(/~(.+?)~/g, '`$1`');
  md = md.replace(/=(.+?)=/g, '`$1`');
  // 链接 [[url][text]]
  md = md.replace(/\[\[([^\]]+)\]\[([^\]]+)\]\]/g, '[$2]($1)');
  // 纯链接 [[url]]
  md = md.replace(/\[\[([^\]]+)\]\]/g, '[$1]($1)');
  // 代码块
  md = md.replace(/^#\+BEGIN_SRC\s*(.*)/gim, '```$1');
  md = md.replace(/^#\+END_SRC\s*/gim, '```');
  md = md.replace(/^#\+BEGIN_QUOTE\s*/gim, '');
  md = md.replace(/^#\+END_QUOTE\s*/gim, '');
  // 移除 #+TITLE 等元信息行，转为注释
  md = md.replace(/^#\+TITLE:\s*(.+)$/gim, '# $1');
  md = md.replace(/^#\+\w+:.*$/gim, '');
  return md.trim();
}

// ─── JSON → Markdown ────────────────────────────────────────────────────

export function jsonToMarkdown(jsonText) {
  try {
    const parsed = JSON.parse(jsonText);
    return '```json\n' + JSON.stringify(parsed, null, 2) + '\n```';
  } catch {
    return '```\n' + jsonText + '\n```';
  }
}

// ─── 统一入口 ───────────────────────────────────────────────────────────

/**
 * 根据文件名/扩展名自动选择转换器，将文件内容转为 Markdown
 * @param {string} filename 文件名（含扩展名）
 * @param {string|ArrayBuffer} content 文件内容（文本或 ArrayBuffer）
 * @returns {Promise<string>} 转换后的 Markdown 文本
 */
export async function convertToMarkdown(filename, content) {
  const ext = getExtension(filename);

  if (isMarkdownExt(ext)) {
    return String(content);
  }

  switch (ext) {
    case '.html':
    case '.htm':
      return htmlToMarkdown(String(content));
    case '.docx':
      if (content instanceof ArrayBuffer) {
        return docxToMarkdown(content);
      }
      // base64 string from IPC
      return docxBase64ToMarkdown(String(content));
    case '.csv':
      return csvToMarkdown(String(content));
    case '.rst':
      return rstToMarkdown(String(content));
    case '.org':
      return orgToMarkdown(String(content));
    case '.json':
      return jsonToMarkdown(String(content));
    default:
      return String(content);
  }
}

/**
 * 判断文件扩展名是否需要转换（即非原生 Markdown）
 */
export function needsConversion(filename) {
  return !isMarkdownExt(getExtension(filename));
}
