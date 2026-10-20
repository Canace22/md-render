/**
 * 单文件 Markdown 下载（UTF-8）
 */
export function downloadMarkdownFile(text, filename) {
  const blob = new Blob([text ?? ''], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** 保证下载名为 .md */
export function ensureMarkdownDownloadName(name) {
  const base = String(name ?? '').trim() || '未命名';
  return /\.md$/i.test(base) ? base : `${base}.md`;
}
