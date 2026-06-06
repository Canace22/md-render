import { useRef, useEffect } from 'react';
import { X, FileText } from 'lucide-react';

/**
 * Obsidian 风格的多标签页栏
 * @param {{ tabs: Array<{id:string, title:string}>, activeId: string, onSelect: function, onClose: function }} props
 */
export default function TabBar({ tabs, activeId, onSelect, onClose }) {
  const activeRef = useRef(null);

  // 激活 tab 变化时滚动到可视区域
  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  if (!tabs.length) return null;

  return (
    <div className="tab-bar">
      <div className="tab-bar-scroller">
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          return (
            <div
              key={tab.id}
              ref={isActive ? activeRef : null}
              className={`tab-bar-item${isActive ? ' active' : ''}`}
              onClick={() => onSelect(tab.id)}
              role="tab"
              aria-selected={isActive}
              title={tab.title}
            >
              <FileText size={13} strokeWidth={1.5} className="tab-bar-item-icon" />
              <span className="tab-bar-item-text">{tab.title}</span>
              <button
                type="button"
                className="tab-bar-item-close"
                onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}
                title="关闭标签"
                aria-label={`关闭 ${tab.title}`}
              >
                <X size={12} strokeWidth={2} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
