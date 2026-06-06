import { useRef, useEffect, useState, useCallback } from 'react';
import { X, FileText, Globe } from 'lucide-react';

const getHostname = (url) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

/**
 * VS Code 风格的多标签页栏，支持右键菜单
 */
export default function TabBar({
  tabs,
  activeId,
  onSelect,
  onClose,
  onCloseAll,
  onCloseOthers,
  onCloseToTheRight,
  onOpenExternal,
}) {
  const activeRef = useRef(null);
  const [contextMenu, setContextMenu] = useState(null); // { x, y, tabId }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  }, [activeId]);

  // 点击任意位置关闭菜单
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
    };
  }, [contextMenu]);

  const handleContextMenu = useCallback((e, tabId) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, tabId });
  }, []);

  const menuAction = useCallback((fn) => {
    fn();
    setContextMenu(null);
  }, []);

  if (!tabs.length) return null;

  const ctxTabIdx = contextMenu ? tabs.findIndex((t) => t.id === contextMenu.tabId) : -1;
  const hasRight = ctxTabIdx >= 0 && ctxTabIdx < tabs.length - 1;
  const contextTab = contextMenu
    ? tabs.find((tab) => tab.id === contextMenu.tabId) ?? null
    : null;
  const contextTabIsBookmark = contextTab?.nodeType === 'bookmark' && Boolean(contextTab.url);

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
              onContextMenu={(e) => handleContextMenu(e, tab.id)}
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

      {/* 右键菜单 */}
      {contextMenu && (
        <div
          className="tab-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextTabIsBookmark && (
            <>
              <div className="tab-context-menu-meta" title={contextTab.url}>
                <Globe size={13} strokeWidth={1.8} />
                <span>{getHostname(contextTab.url)}</span>
              </div>
              <button onClick={() => menuAction(() => onSelect(contextMenu.tabId))}>
                当前页签打开
              </button>
              <button onClick={() => menuAction(() => onOpenExternal?.(contextTab))}>
                浏览器打开
              </button>
              <div className="tab-context-menu-divider" />
            </>
          )}
          <button onClick={() => menuAction(() => onClose(contextMenu.tabId))}>关闭</button>
          <button onClick={() => menuAction(() => onCloseOthers(contextMenu.tabId))} disabled={tabs.length <= 1}>
            关闭其他
          </button>
          <button onClick={() => menuAction(() => onCloseToTheRight(contextMenu.tabId))} disabled={!hasRight}>
            关闭右侧
          </button>
          <div className="tab-context-menu-divider" />
          <button onClick={() => menuAction(onCloseAll)}>关闭全部</button>
        </div>
      )}
    </div>
  );
}
