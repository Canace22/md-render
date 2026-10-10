import { Dropdown } from 'antd';
import {
  ChevronDown, ClipboardCopy, Copy, Download, Eye, FileCode2, MessageSquare, Rocket, Share2,
} from 'lucide-react';
import { EXPORT_FORMATS } from './DocActionMenuItems.jsx';

const ICON_SIZE = 14;
const ICON_STROKE = 1.8;
const EXPORT_KEY_PREFIX = 'export:';

const icon = (Comp) => <Comp size={ICON_SIZE} strokeWidth={ICON_STROKE} />;

const copyAndExportItems = () => [
  { key: 'copy-rich', icon: icon(ClipboardCopy), label: '复制富文本' },
  { key: 'copy-markdown', icon: icon(FileCode2), label: '复制为 Markdown' },
  {
    key: 'export',
    icon: icon(Download),
    label: '导出为',
    children: EXPORT_FORMATS.map((f) => ({ key: `${EXPORT_KEY_PREFIX}${f.key}`, label: f.label })),
  },
];

/**
 * 菜单结构：通用动作（发布 / 复制 / 导出）在前，公众号专属动作收在最后一组。
 * 「复制为 Markdown」方便贴给 AI；大纲页是记录 / 梳理用的，不走发布流程，只留复制和导出。
 */
export const buildMenuItems = ({ styleSuffix = '', isOutline = false } = {}) => {
  if (isOutline) return copyAndExportItems();
  return [
    { key: 'prepare-publish', icon: icon(Rocket), label: '准备发布…' },
    ...copyAndExportItems(),
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
};

/**
 * 编辑区顶部的文档动作栏（参照 Obsidian 的 view-header：独占一条细栏，不遮挡正文）。
 *
 * 所有文档级动作收进一个「分享」下拉，避免顶栏堆满某个平台专属的按钮——
 * 这个编辑器也用来写笔记、剧本，公众号只是其中一种出口。
 * 复制 / 导出的成败提示由调用方的 message 负责，这里只分发点击。
 */
export default function EditorQuickToolbar({
  leading = null,
  disabled,
  isOutline = false,
  onPreparePublish,
  onCopyRichText,
  onCopyMarkdown,
  onExportAs,
  onPreviewWeChat,
  onCopyWeChat,
  copyStyleName,
  commentCount = 0,
  commentsOpen = false,
  onToggleComments,
}) {
  const handlers = {
    'prepare-publish': onPreparePublish,
    'copy-rich': onCopyRichText,
    'copy-markdown': onCopyMarkdown,
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
      {leading && <div className="outline-quick-toolbar-leading">{leading}</div>}
      {onToggleComments && (
        <button
          type="button"
          className={`editor-comment-trigger${commentsOpen ? ' is-active' : ''}`}
          title={commentsOpen ? '收起评论' : '评论'}
          aria-pressed={commentsOpen}
          onClick={onToggleComments}
        >
          <MessageSquare size={ICON_SIZE} strokeWidth={ICON_STROKE} />
          {commentCount > 0 && <span>{commentCount}</span>}
        </button>
      )}
      <Dropdown
        menu={{
          items: buildMenuItems({ styleSuffix, isOutline }),
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
