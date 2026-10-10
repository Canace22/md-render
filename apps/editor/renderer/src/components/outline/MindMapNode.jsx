import { memo } from 'react';
import { Check } from 'lucide-react';
import { countDescendants } from '../../../../shared/outline/outlineTree.js';
import { splitWikilinks } from '../../utils/wikilinkText.js';

/** 节点文字：[[双链]] 只显示文档名；给了 onOpenLink 时可点击打开文档 */
function NodeText({ text, onOpenLink }) {
  return splitWikilinks(text).map((seg, index) => {
    if (seg.type === 'text') return seg.text;
    if (!onOpenLink) return seg.label;
    return (
      <span
        key={index}
        className="mm-link"
        onClick={(event) => {
          event.stopPropagation();
          onOpenLink(seg.name);
        }}
      >
        {seg.label}
      </span>
    );
  });
}

/** 一个节点 + 它的子树（向右展开）；连线全靠 CSS 伪元素画 */
function MindMapNode({ node, collapsedIds, onToggle, onSelect, onOpenLink }) {
  const hasChildren = node.children.length > 0;
  const collapsed = hasChildren && collapsedIds.has(node.id);

  return (
    <div className="mm-branch">
      <div
        className={`mm-node mm-node--${node.kind}`}
        data-node-id={node.id}
        onClick={() => onSelect(node.id)}
      >
        {node.kind === 'task' && (
          <span className={`mm-check${node.checked ? ' is-checked' : ''}`}>
            {node.checked && <Check size={11} strokeWidth={3} />}
          </span>
        )}
        {node.text && <span className={`mm-text${node.checked ? ' is-done' : ''}`}><NodeText text={node.text} onOpenLink={onOpenLink} /></span>}
        {node.kind === 'image' && node.imageUrl && <img className="mm-image" src={node.imageUrl} alt="" draggable={false} />}
        {hasChildren && (
          <button
            type="button"
            className={`mm-toggle${collapsed ? ' is-collapsed' : ''}`}
            aria-label={collapsed ? '展开' : '收起'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onToggle(node.id);
            }}
          >
            {collapsed ? countDescendants(node) : '−'}
          </button>
        )}
      </div>
      {hasChildren && !collapsed && (
        <div className="mm-children">
          {node.children.map((child) => (
            <div className="mm-child" key={child.id}>
              <MindMapNode
                node={child}
                collapsedIds={collapsedIds}
                onToggle={onToggle}
                onSelect={onSelect}
                onOpenLink={onOpenLink}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default memo(MindMapNode);
