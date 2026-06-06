import { Bookmark } from 'lucide-react';

/**
 * 书签网页视图：当前应用 tab 直接显示网页本身。
 */
export default function BookmarkCard({ file }) {
  if (!file) return null;
  const url = String(file.url ?? '').trim();

  return (
    <div className="bookmark-webview" data-testid="bookmark-card">
      {url ? (
        <iframe
          className="bookmark-webview-frame"
          src={url}
          title={file.name || '书签网页'}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="bookmark-webview-empty">
          <div className="bookmark-webview-empty-icon">
            <Bookmark size={22} strokeWidth={1.7} />
          </div>
          <p>这条书签还没有链接地址。</p>
        </div>
      )}
    </div>
  );
}
