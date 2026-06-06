import { useMemo } from 'react';

/** 从 markdown 文本提取标题列表 */
function extractHeadings(markdown) {
  if (!markdown) return [];
  const headings = [];
  for (const line of markdown.split('\n')) {
    const m = line.match(/^(#{1,6})\s+(.+)/);
    if (m) {
      headings.push({ level: m[1].length, text: m[2].trim() });
    }
  }
  return headings;
}

/**
 * 目录面板。
 * Props:
 *   markdown: string        当前文档 markdown 内容
 *   collapsed: boolean      是否收起
 *   onToggle: () => void    展开/收起回调
 */
export default function TocPanel({ markdown, collapsed, onToggle }) {
  const headings = useMemo(() => extractHeadings(markdown), [markdown]);

  return (
    <div className={`toc-panel${collapsed ? ' toc-panel--collapsed' : ''}`}>
      <button
        type="button"
        className="toc-toggle-btn"
        onClick={onToggle}
        title={collapsed ? '展开目录' : '收起目录'}
        aria-label={collapsed ? '展开目录' : '收起目录'}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
          <rect y="2" width="14" height="1.5" rx="0.75" fill="currentColor" />
          <rect y="6.25" width="10" height="1.5" rx="0.75" fill="currentColor" />
          <rect y="10.5" width="12" height="1.5" rx="0.75" fill="currentColor" />
        </svg>
        {!collapsed && <span className="toc-toggle-label">目录</span>}
      </button>

      {!collapsed && (
        <nav className="toc-nav" aria-label="文档目录">
          {headings.length === 0 ? (
            <p className="toc-empty">暂无标题</p>
          ) : (
            <ul className="toc-list">
              {headings.map((h, i) => (
                <li
                  key={i}
                  className={`toc-item toc-level-${h.level}`}
                  style={{ paddingLeft: `${(h.level - 1) * 12}px` }}
                >
                  <a
                    href={`#heading-${i}`}
                    className="toc-link"
                    title={h.text}
                    onClick={(e) => {
                      e.preventDefault();
                      // 查找编辑器内匹配的标题节点并滚动
                      const els = document.querySelectorAll(
                        '.paper-content h1, .paper-content h2, .paper-content h3, ' +
                        '.paper-content h4, .paper-content h5, .paper-content h6'
                      );
                      if (els[i]) {
                        els[i].scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }
                    }}
                  >
                    {h.text}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </nav>
      )}
    </div>
  );
}
