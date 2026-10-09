import { Dropdown } from 'antd';
import {
  ChevronDown, ClipboardCopy, Copy, Download, Eye, Rocket, Share2,
} from 'lucide-react';
import { EXPORT_FORMATS } from './DocActionMenuItems.jsx';

const ICON_SIZE = 14;
const ICON_STROKE = 1.8;
const EXPORT_KEY_PREFIX = 'export:';

const icon = (Comp) => <Comp size={ICON_SIZE} strokeWidth={ICON_STROKE} />;

/** 菜单结构：通用动作（发布 / 复制 / 导出）在前，公众号专属动作收在最后一组 */
const buildMenuItems = (styleSuffix) => [
  { key: 'prepare-publish', icon: icon(Rocket), label: '准备发布…' },
  { key: 'copy-rich', icon: icon(ClipboardCopy), label: '复制富文本' },
  {
    key: 'export',
    icon: icon(Download),
    label: '导出为',
    children: EXPORT_FORMATS.map((f) => ({ key: `${EXPORT_KEY_PREFIX}${f.key}`, label: f.label })),
  },
  { type: 'divider' },
  {
    type: 'group',
    label: `公众号${styleSuffix}`,
    children: [
      { key: 'preview-wechat', icon: icon(Eye), label: '预览公众号格式' },
      { key: 'copy-wechat', icon: icon(Copy), label: '复制为公众号格式' },
    ],
  },
];

/**
 * 编辑区顶部的文档动作栏（参照 Obsidian 的 view-header：独占一条细栏，不遮挡正文）。
 *
 * 所有文档级动作收进一个「分享」下拉，避免顶栏堆满某个平台专属的按钮——
 * 这个编辑器也用来写笔记、剧本，公众号只是其中一种出口。
 * 复制 / 导出的成败提示由调用方的 message 负责，这里只分发点击。
 */
export default function EditorQuickToolbar({
  disabled,
  onPreparePublish,
  onCopyRichText,
  onExportAs,
  onPreviewWeChat,
  onCopyWeChat,
  copyStyleName,
}) {
  const handlers = {
    'prepare-publish': onPreparePublish,
    'copy-rich': onCopyRichText,
    'preview-wechat': onPreviewWeChat,
    'copy-wechat': onCopyWeChat,
  };

  const handleClick = ({ key }) => {
    if (disabled) return;
    if (key.startsWith(EXPORT_KEY_PREFIX)) {
      void onExportAs?.(key.slice(EXPORT_KEY_PREFIX.length));
      return;
    }
    void handlers[key]?.();
  };

  const styleSuffix = copyStyleName ? ` · ${copyStyleName}` : '';

  return (
    <div
      className="editor-quick-toolbar-shell"
      data-testid="editor-quick-toolbar"
      data-disabled={disabled ? 'true' : undefined}
    >
      <Dropdown
        menu={{
          items: buildMenuItems(styleSuffix),
          onClick: handleClick,
          className: 'editor-share-menu',
        }}
        trigger={['click']}
        placement="bottomRight"
        disabled={disabled}
      >
        <button type="button" className="editor-share-trigger" title="发布、复制与导出">
          <Share2 size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          <span>分享</span>
          <ChevronDown size={12} strokeWidth={ICON_STROKE} />
        </button>
      </Dropdown>
    </div>
  );
}
