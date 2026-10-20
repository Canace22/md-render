/**
 * 文档导出服务
 * 封装 Markdown → HTML / PDF / DOCX 导出逻辑
 * 通过 IPC 调用主进程完成文件保存
 */

// ─── 常量 ────────────────────────────────────────────────────────────────────

const EXPORT_FORMATS = [
  { key: 'md', label: 'Markdown (.md)', ext: 'md' },
  { key: 'html', label: 'HTML (.html)', ext: 'html' },
  { key: 'pdf', label: 'PDF (.pdf)', ext: 'pdf' },
  { key: 'docx', label: 'Word (.docx)', ext: 'docx' },
];

export { EXPORT_FORMATS };

// ─── HTML 模板 ──────────────────────────────────────────────────────────────

const wrapHtmlDocument = (bodyHtml, title = '导出文档') => `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<style>
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 20px;
    line-height: 1.8;
    color: #333;
  }
  h1, h2, h3, h4, h5, h6 { margin-top: 1.5em; margin-bottom: 0.5em; }
  pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
  code { background: #f0f0f0; padding: 2px 4px; border-radius: 3px; font-size: 0.9em; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #ddd; margin: 1em 0; padding: 0.5em 1em; color: #666; }
  table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
  th { background: #f5f5f5; font-weight: 600; }
  img { max-width: 100%; height: auto; }
  a { color: #0366d6; text-decoration: none; }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

const escapeHtml = (str) =>
  String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ─── 导出为 HTML ────────────────────────────────────────────────────────────

/**
 * 导出 Markdown 为 HTML 文件
 * @param {string} html 已渲染的 HTML 片段
 * @param {string} title 文档标题
 * @param {string} filename 文件名（不含扩展名）
 */
export async function exportToHtml(html, title, filename) {
  const fullHtml = wrapHtmlDocument(html, title);

  // Electron 环境 → 使用 save dialog
  if (window.electronAPI?.exportSaveFile) {
    return window.electronAPI.exportSaveFile({
      defaultName: `${filename}.html`,
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
      content: fullHtml,
      encoding: 'utf8',
    });
  }

  // 浏览器环境 → 下载
  downloadBlob(fullHtml, `${filename}.html`, 'text/html;charset=utf-8');
  return { canceled: false };
}

// ─── 导出为 PDF ─────────────────────────────────────────────────────────────

/**
 * 导出 Markdown 为 PDF（需要 Electron）
 */
export async function exportToPdf(html, title, filename) {
  const fullHtml = wrapHtmlDocument(html, title);

  if (!window.electronAPI?.exportToPdf) {
    alert('PDF 导出仅在桌面版应用中可用');
    return { canceled: true };
  }

  return window.electronAPI.exportToPdf({
    html: fullHtml,
    defaultName: `${filename}.pdf`,
  });
}

// ─── 导出为 DOCX ────────────────────────────────────────────────────────────

/**
 * 导出 Markdown 为 Word 文档
 */
export async function exportToDocx(html, title, filename) {
  const fullHtml = wrapHtmlDocument(html, title);

  try {
    const htmlToDocx = await import('html-to-docx');
    const convert = htmlToDocx.default || htmlToDocx;
    const docxBlob = await convert(fullHtml, null, {
      table: { row: { cantSplit: true } },
      footer: true,
      pageNumber: true,
    });

    // Electron 环境 → 使用 save dialog
    if (window.electronAPI?.exportSaveFile) {
      const arrayBuffer = await docxBlob.arrayBuffer();
      const base64 = arrayBufferToBase64(arrayBuffer);
      return window.electronAPI.exportSaveFile({
        defaultName: `${filename}.docx`,
        filters: [{ name: 'Word', extensions: ['docx'] }],
        content: base64,
        encoding: 'base64',
      });
    }

    // 浏览器环境 → 下载
    downloadBlobObject(docxBlob, `${filename}.docx`);
    return { canceled: false };
  } catch (error) {
    console.error('DOCX 导出失败:', error);
    alert('DOCX 导出失败：' + (error?.message || '未知错误'));
    return { canceled: true };
  }
}

// ─── 导出为 Markdown ────────────────────────────────────────────────────────

export function exportToMd(markdownText, filename) {
  downloadBlob(markdownText, `${filename}.md`, 'text/markdown;charset=utf-8');
  return { canceled: false };
}

// ─── 统一导出入口 ────────────────────────────────────────────────────────────

/**
 * 统一导出接口
 * @param {string} format 导出格式 key: 'md' | 'html' | 'pdf' | 'docx'
 * @param {object} params { markdown, html, title, filename }
 */
export async function exportDocument(format, { markdown, html, title, filename }) {
  const safeName = filename || '导出文档';

  switch (format) {
    case 'md':
      return exportToMd(markdown, safeName);
    case 'html':
      return exportToHtml(html, title, safeName);
    case 'pdf':
      return exportToPdf(html, title, safeName);
    case 'docx':
      return exportToDocx(html, title, safeName);
    default:
      alert(`不支持的导出格式: ${format}`);
      return { canceled: true };
  }
}

// ─── 内部工具 ────────────────────────────────────────────────────────────────

function downloadBlob(text, filename, type) {
  const blob = new Blob([text], { type });
  downloadBlobObject(blob, filename);
}

function downloadBlobObject(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
