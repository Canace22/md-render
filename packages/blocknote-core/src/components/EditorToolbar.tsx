/**
 * 通用编辑器底部工具栏（数据驱动，无业务语义）。
 *
 * 工具栏内容完全由 `entries` 决定，组件只负责渲染：按钮 / 分隔线 / 下拉。
 * 短标签转换通过 `getShortLabel` 注入（默认恒等），业务侧可传剧本专属映射。
 */

import React from 'react';
import { Button, Divider, Dropdown } from 'antd';
import { Check, ChevronDown, Save } from 'lucide-react';

export interface ToolbarButtonItem {
  title: string;
  /** 工具栏上显示的精简说明（与 title 完整名配合：title 作悬停提示） */
  label?: string;
  /** 来源分组（斜杠菜单 group，保留供调试或后续用途） */
  menuGroup?: string;
  icon?: React.ReactNode;
  onItemClick?: () => void;
  /** 点击后不聚焦编辑器（如 AI 续写，避免 focus 导致光标跳到文档末尾） */
  skipFocusEditor?: boolean;
}

export type EditorToolbarEntry =
  | { type: 'button'; key: string; button: ToolbarButtonItem }
  | { type: 'divider'; key: string }
  | {
      type: 'toolbar-dropdown';
      key: string;
      items: ToolbarButtonItem[];
      /** 当前光标所在块对应的项 title，与 items 中某项一致时菜单显示勾选 */
      activeTitle?: string | null;
      /** 无匹配块时触发器上显示的短文案 */
      triggerPlaceholder: string;
      /** 触发按钮的悬停说明 */
      triggerHint: string;
    };

export interface EditorToolbarProps {
  /** 工具栏项 */
  entries: EditorToolbarEntry[];
  /** 保存回调，有则显示保存按钮 */
  onSave?: () => void;
  /** 点击任意按钮后聚焦编辑器 */
  onFocusEditor: () => void;
  /**
   * 下拉触发器上 activeTitle → 短标签的转换。默认恒等。
   * 业务侧可注入剧本专属映射（如「接：NPC」→「接」）。
   */
  getShortLabel?: (title: string) => string;
}

const identity = (title: string): string => title;

export const EditorToolbar: React.FC<EditorToolbarProps> = ({
  entries,
  onSave,
  onFocusEditor,
  getShortLabel = identity,
}) => {
  const handleButtonClick = React.useCallback(
    (item: ToolbarButtonItem) => {
      item.onItemClick?.();
      if (!item.skipFocusEditor) {
        onFocusEditor();
      }
    },
    [onFocusEditor]
  );

  return (
    <div className="editor-toolbar">
      <div className="toolbar-center">
        {entries.map((entry) => {
          if (entry.type === 'divider') {
            return (
              <Divider
                key={entry.key}
                type="vertical"
                className="editor-toolbar-divider"
              />
            );
          }
          if (entry.type === 'toolbar-dropdown') {
            const { items, activeTitle, triggerPlaceholder, triggerHint } = entry;
            const triggerText = activeTitle
              ? getShortLabel(activeTitle)
              : triggerPlaceholder;
            const menuItems = items.map((item) => ({
              key: item.title,
              className: 'script-editor-toolbar-block-dropdown-menu-item',
              label: (
                <>
                  {activeTitle === item.title ? (
                    <Check size={14} strokeWidth={2.5} />
                  ) : null}
                  <span className="toolbar-dropdown-icon mr-2">{item.icon}</span>
                  <span className="toolbar-dropdown-text">{item.title}</span>
                </>
              ),
              onClick: () => handleButtonClick(item),
            }));
            return (
              <Dropdown
                key={entry.key}
                menu={{
                  items: menuItems,
                  className: 'script-editor-toolbar-block-dropdown-menu',
                }}
                trigger={['click']}
                placement="bottomLeft"
              >
                <Button
                  type="text"
                  size="small"
                  className="toolbar-button toolbar-button-heading-dropdown"
                  title={triggerHint}
                >
                  {triggerText}
                  <ChevronDown size={14} />
                </Button>
              </Dropdown>
            );
          }
          const item = entry.button;
          return (
            <Button
              key={entry.key}
              type="text"
              size="small"
              icon={item.icon}
              onClick={() => handleButtonClick(item)}
              className={
                item.label ? 'toolbar-button toolbar-button-with-label' : 'toolbar-button'
              }
              title={item.title}
            >
              {item.label}
            </Button>
          );
        })}
        {onSave && (
          <Button
            type="text"
            size="small"
            icon={<Save size={16} />}
            onClick={() => {
              onSave();
              onFocusEditor();
            }}
            className="toolbar-button toolbar-button-with-label"
            title="保存"
            style={{ marginLeft: 8 }}
          >
            保存
          </Button>
        )}
      </div>
    </div>
  );
};
