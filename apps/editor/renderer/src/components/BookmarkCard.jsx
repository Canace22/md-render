import { Bookmark, ExternalLink, Globe, Tag } from 'lucide-react';

const getHostname = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * 书签详情卡片：替代编辑器，展示链接、备注、标签，并提供「打开链接」按钮。
 * 在 Electron 中 window.open 会被 setWindowOpenHandler 转交系统浏览器；web 中开新标签页。
 */
export default function BookmarkCard({ file }) {
  if (!file) return null;
  const url = String(file.url ?? '').trim();
  const tags = file.tags ?? [];
  const summary = String(file.summary ?? '').trim();

  const openLink = () => {
    if (url) window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="bookmark-card" data-testid="bookmark-card">
      <div className="bookmark-card-icon">
        <Bookmark size={22} strokeWidth={1.7} />
      </div>
      <h2 className="bookmark-card-title">{file.name}</h2>

      {url ? (
        <button type="button" className="bookmark-card-url" onClick={openLink} title={url}>
          <Globe size={14} strokeWidth={1.8} />
          <span>{getHostname(url)}</span>
          <ExternalLink size={13} strokeWidth={1.8} />
        </button>
      ) : (
        <p className="bookmark-card-empty">这条书签还没有链接地址。</p>
      )}

      {summary && <p className="bookmark-card-summary">{summary}</p>}

      {tags.length > 0 && (
        <div className="bookmark-card-tags">
          {tags.map((tag) => (
            <span key={tag} className="bookmark-card-tag">
              <Tag size={12} strokeWidth={1.8} />
              <span>{tag}</span>
            </span>
          ))}
        </div>
      )}

      {url && (
        <button type="button" className="bookmark-card-open" onClick={openLink}>
          <ExternalLink size={16} strokeWidth={1.8} />
          <span>打开链接</span>
        </button>
      )}
    </div>
  );
}
