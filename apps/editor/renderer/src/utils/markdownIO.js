import { saveExportFile } from '../services/desktopShellBridge.js';

/**
 * 单文件 Markdown 导出（UTF-8）
 */
export function downloadMarkdownFile(text, filename) {
  return saveExportFile({
    defaultName: ensureMarkdownDownloadName(filename),
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    content: text ?? '',
    encoding: 'utf8',
  });
}

/** 保证下载名为 .md */
export function ensureMarkdownDownloadName(name) {
  const base = String(name ?? '').trim() || '未命名';
  return /\.md$/i.test(base) ? base : `${base}.md`;
}
