import { useMemo } from 'react';
import { Button, Card, Empty, Typography } from 'antd';
import { List, PanelRightClose, PanelRightOpen } from 'lucide-react';

const HEADING_SELECTOR =
  '.paper-content h1, .paper-content h2, .paper-content h3, ' +
  '.paper-content h4, .paper-content h5, .paper-content h6';

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

  const handleHeadingClick = (index) => {
    const elements = document.querySelectorAll(HEADING_SELECTOR);
    if (elements[index]) {
      elements[index].scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  if (collapsed) {
    return (
      <div className="toc-panel toc-panel--collapsed">
        <Button
          type="text"
          className="toc-collapse-btn"
          icon={<PanelRightOpen size={16} />}
          onClick={onToggle}
          title="展开目录"
          aria-label="展开目录"
        />
      </div>
    );
  }

  return (
    <div className="toc-panel">
      <Card
        size="small"
        className="toc-card"
        title={(
          <span className="toc-card-title">
            <List size={14} />
            <span>目录</span>
          </span>
        )}
        extra={(
          <Button
            type="text"
            size="small"
            className="toc-card-toggle"
            icon={<PanelRightClose size={15} />}
            onClick={onToggle}
            title="收起目录"
            aria-label="收起目录"
          />
        )}
      >
        <nav className="toc-nav" aria-label="文档目录">
          {headings.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无标题"
              className="toc-empty"
            />
          ) : (
            <div className="toc-list">
              {headings.map((heading, index) => (
                <Button
                  key={`${heading.text}-${index}`}
                  type="text"
                  block
                  className={`toc-link toc-level-${heading.level}`}
                  title={heading.text}
                  onClick={() => handleHeadingClick(index)}
                >
                  <Typography.Text ellipsis className="toc-link-text">
                    {heading.text}
                  </Typography.Text>
                </Button>
              ))}
            </div>
          )}
        </nav>
      </Card>
    </div>
  );
}
