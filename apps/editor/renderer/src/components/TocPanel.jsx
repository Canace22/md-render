import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty } from 'antd';
import { PanelRightClose } from 'lucide-react';

const HEADING_SELECTOR =
  '.paper-content h1, .paper-content h2, .paper-content h3, ' +
  '.paper-content h4, .paper-content h5, .paper-content h6';

/** 迷你刻度的宽度：标题层级越深，刻度越短（px） */
const TICK_WIDTH_BY_LEVEL = [22, 22, 18, 15, 13, 11, 10];
/** 判定「已滚过」的容差：标题顶部进入视口这么多像素内就算当前节 */
const ACTIVE_HEADING_OFFSET = 120;

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

/** 找出当前滚动位置对应的标题下标 */
function findActiveIndex(elements) {
  let active = 0;
  for (let i = 0; i < elements.length; i += 1) {
    if (elements[i].getBoundingClientRect().top - ACTIVE_HEADING_OFFSET <= 0) active = i;
    else break;
  }
  return active;
}

/**
 * 幕布式大纲。
 *
 * 默认只露出一条迷你刻度（每个标题一根短线，当前节高亮），hover 才拉开完整大纲，
 * 写作时右侧不占正文宽度。collapsed 表示「不常驻」，展开态由 hover 或常驻共同决定。
 *
 * Props:
 *   markdown: string        当前文档 markdown 内容
 *   collapsed: boolean      是否收起（不常驻）
 *   onToggle: () => void    常驻/收起切换回调
 */
export default function TocPanel({ markdown, collapsed, onToggle }) {
  const headings = useMemo(() => extractHeadings(markdown), [markdown]);
  const [hovered, setHovered] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const rafRef = useRef(0);

  const open = !collapsed || hovered;

  useEffect(() => {
    if (!headings.length) return undefined;
    const sync = () => {
      rafRef.current = 0;
      setActiveIndex(findActiveIndex(document.querySelectorAll(HEADING_SELECTOR)));
    };
    const onScroll = () => {
      if (rafRef.current) return;
      rafRef.current = requestAnimationFrame(sync);
    };
    sync();
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [headings]);

  const handleHeadingClick = useCallback((index) => {
    const elements = document.querySelectorAll(HEADING_SELECTOR);
    elements[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  return (
    <div
      className={`toc-curtain${open ? ' is-open' : ''}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {open ? (
        <nav className="toc-curtain-panel" aria-label="文档目录">
          <div className="toc-curtain-panel-head">
            <Button
              type="text"
              className="toc-curtain-close"
              icon={<PanelRightClose size={16} />}
              onClick={onToggle}
              title={collapsed ? '常驻显示大纲' : '收起大纲'}
              aria-label={collapsed ? '常驻显示大纲' : '收起大纲'}
            />
          </div>
          <div className="toc-curtain-list">
            {headings.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无标题"
                className="toc-empty"
              />
            ) : (
              headings.map((heading, index) => (
                <button
                  key={`${heading.text}-${index}`}
                  type="button"
                  className={`toc-entry toc-level-${heading.level}${index === activeIndex ? ' is-active' : ''}`}
                  title={heading.text}
                  onClick={() => handleHeadingClick(index)}
                >
                  {heading.text}
                </button>
              ))
            )}
          </div>
        </nav>
      ) : (
        <div className="toc-curtain-ruler" aria-hidden="true">
          {headings.map((heading, index) => (
            <span
              key={`${heading.text}-${index}`}
              className={`toc-tick${index === activeIndex ? ' is-active' : ''}`}
              style={{ width: TICK_WIDTH_BY_LEVEL[heading.level] }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
