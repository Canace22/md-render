import { Dropdown } from 'antd';
import {
  Bot,
  ChevronDown,
  FileText,
  Globe,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import Breadcrumb from './Breadcrumb.jsx';
import ThemeToggleButton from './ThemeToggleButton.jsx';
import { stripFileExtension } from '../utils/fileDisplayName.js';

/** 打开文档菜单项的 key 前缀，与批量关闭动作区分 */
const TAB_KEY_PREFIX = 'tab:';

/**
 * 编辑器唯一顶栏 —— 把原先「标签页 / 面包屑」两条横栏合成一条全局导航。
 *
 * 左：侧栏折叠 + 面包屑（末级由文档下拉接管，代替标签页栏）
 * 右：AI 助手 + 主题切换两个全局功能
 */
export default function EditorTopBar({
  workspace,
  selectedId,
  onNavigate,
  tabs = [],
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onCloseTabsToTheRight,
  onOpenTabExternal,
  sidebarCollapsed,
  onToggleSidebar,
  theme,
  onThemeChange,
  agentPanelOpen,
  onToggleAgentPanel,
}) {
  const activeTab = tabs.find((tab) => tab.id === selectedId) ?? null;
  const activeIndex = tabs.findIndex((tab) => tab.id === selectedId);
  const hasTabsToTheRight = activeIndex >= 0 && activeIndex < tabs.length - 1;

  const tabItems = tabs.map((tab) => {
    const displayTitle = stripFileExtension(tab.title);
    const isBookmark = tab.nodeType === 'bookmark' && Boolean(tab.url);
    return {
      key: `${TAB_KEY_PREFIX}${tab.id}`,
      className: tab.id === selectedId ? 'doc-switcher-item is-active' : 'doc-switcher-item',
      label: (
        <>
          <FileText size={13} strokeWidth={1.6} className="doc-switcher-item-icon" />
          <span className="doc-switcher-item-text">{displayTitle}</span>
          {isBookmark && (
            <span
              role="button"
              tabIndex={-1}
              aria-label={`在浏览器打开 ${displayTitle}`}
              title="在浏览器打开"
              className="doc-switcher-item-external"
              onClick={(event) => {
                event.stopPropagation();
                onOpenTabExternal?.(tab);
              }}
            >
              <Globe size={12} strokeWidth={1.8} />
            </span>
          )}
          <span
            role="button"
            tabIndex={-1}
            aria-label={`关闭 ${displayTitle}`}
            className="doc-switcher-item-close"
            onClick={(event) => {
              event.stopPropagation();
              onCloseTab?.(tab.id);
            }}
          >
            <X size={12} strokeWidth={2} />
          </span>
        </>
      ),
    };
  });

  const menuItems = tabItems.length
    ? [
      ...tabItems,
      { type: 'divider', key: 'divider' },
      { key: 'close-others', label: '关闭其他', disabled: tabs.length <= 1 },
      { key: 'close-right', label: '关闭右侧', disabled: !hasTabsToTheRight },
      { key: 'close-all', label: '关闭全部' },
    ]
    : [{ key: 'empty', label: '暂无打开的文档', disabled: true }];

  const handleMenuClick = ({ key }) => {
    if (key.startsWith(TAB_KEY_PREFIX)) {
      onNavigate?.(key.slice(TAB_KEY_PREFIX.length));
      return;
    }
    if (key === 'close-others') onCloseOtherTabs?.(selectedId);
    if (key === 'close-right') onCloseTabsToTheRight?.(selectedId);
    if (key === 'close-all') onCloseAllTabs?.();
  };

  const docSwitcher = activeTab ? (
    <Dropdown
      menu={{ items: menuItems, onClick: handleMenuClick, className: 'doc-switcher-menu' }}
      trigger={['click']}
      placement="bottomLeft"
    >
      <button type="button" className="doc-switcher" title="切换已打开的文档">
        <FileText size={13} strokeWidth={1.5} className="doc-switcher-icon" />
        <span className="doc-switcher-text">{stripFileExtension(activeTab.title)}</span>
        <ChevronDown size={12} strokeWidth={1.8} className="doc-switcher-caret" />
      </button>
    </Dropdown>
  ) : null;

  return (
    <div className="editor-top-bar">
      <div className="editor-top-bar-lead">
        <button
          type="button"
          className="editor-top-bar-collapse"
          onClick={onToggleSidebar}
          aria-label={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
          title={sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}
        >
          {sidebarCollapsed
            ? <PanelLeftOpen size={17} strokeWidth={1.6} />
            : <PanelLeftClose size={17} strokeWidth={1.6} />}
        </button>
        <Breadcrumb
          workspace={workspace}
          selectedId={selectedId}
          onNavigate={onNavigate}
          currentSlot={docSwitcher}
        />
      </div>
      <div className="editor-top-bar-actions">
        <button
          type="button"
          className={`titlebar-agent-toggle${agentPanelOpen ? ' is-open' : ''}`}
          onClick={onToggleAgentPanel}
          aria-label={agentPanelOpen ? '关闭 AI 助手' : '打开 AI 助手'}
          aria-pressed={agentPanelOpen}
          title={`${agentPanelOpen ? '关闭 AI 助手' : '打开 AI 助手'}（⌘/Ctrl+J）`}
        >
          <Bot size={16} strokeWidth={1.7} />
          <span>AI 助手</span>
        </button>
        <ThemeToggleButton theme={theme} onThemeChange={onThemeChange} />
      </div>
    </div>
  );
}
