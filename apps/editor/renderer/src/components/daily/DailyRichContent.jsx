import { normalizeRichText, plainTextToRichText, resolveRichTextColorVar } from '../../utils/dailyRichText.js';

/**
 * 今日速记条目的只读展示。
 *
 * 直接按 BlockNote 的 block 结构渲染成 React 元素——不走 dangerouslySetInnerHTML，
 * 所以既不需要 HTML 消毒，也能在 node 环境（vitest）里静态渲染。
 */

const LIST_WRAPPER = {
  bulletListItem: 'ul',
  numberedListItem: 'ol',
  checkListItem: 'ul',
};

const buildTextStyle = (styles) => {
  const style = {};
  const color = resolveRichTextColorVar(styles?.textColor, 'text');
  if (color) style.color = color;
  const background = resolveRichTextColorVar(styles?.backgroundColor, 'bg');
  if (background) style.backgroundColor = background;
  return style;
};

function RichTextRun({ node }) {
  const styles = node.styles ?? {};
  const style = buildTextStyle(styles);
  let element = <span style={style}>{node.text}</span>;
  if (styles.code) element = <code>{element}</code>;
  if (styles.strike) element = <s>{element}</s>;
  if (styles.underline) element = <u>{element}</u>;
  if (styles.italic) element = <em>{element}</em>;
  if (styles.bold) element = <strong>{element}</strong>;
  return element;
}

function RichInlineContent({ content }) {
  if (!Array.isArray(content) || content.length === 0) return null;
  return content.map((node, index) => {
    if (node.type === 'link') {
      return (
        <a key={index} href={node.href} target="_blank" rel="noreferrer">
          <RichInlineContent content={node.content} />
        </a>
      );
    }
    return <RichTextRun key={index} node={node} />;
  });
}

const buildBlockStyle = (props) => {
  const style = {};
  if (props?.textAlignment) style.textAlign = props.textAlignment;
  const color = resolveRichTextColorVar(props?.textColor, 'text');
  if (color) style.color = color;
  const background = resolveRichTextColorVar(props?.backgroundColor, 'bg');
  if (background) style.backgroundColor = background;
  return style;
};

function RichBlockBody({ block }) {
  return (
    <>
      <RichInlineContent content={block.content} />
      {block.children?.length > 0 && <RichBlockList blocks={block.children} />}
    </>
  );
}

// 连续的同类列表块合并成一个 ul/ol，段落各自成行
function RichBlockList({ blocks }) {
  const groups = [];
  for (const block of blocks) {
    const wrapper = LIST_WRAPPER[block.type];
    const last = groups[groups.length - 1];
    if (wrapper && last?.type === block.type) last.blocks.push(block);
    else groups.push({ type: block.type, wrapper, blocks: [block] });
  }

  return groups.map((group, groupIndex) => {
    if (!group.wrapper) {
      // 段落用 div 而不是 p：段落底下可能挂着缩进的子列表，
      // <ul> 套在 <p> 里是非法嵌套，浏览器会自动断开标签导致排版错乱
      return group.blocks.map((block, index) => (
        <div key={`${groupIndex}-${index}`} className="daily-rich-paragraph" style={buildBlockStyle(block.props)}>
          <RichBlockBody block={block} />
        </div>
      ));
    }

    const ListTag = group.wrapper;
    const isCheckList = group.type === 'checkListItem';
    return (
      <ListTag
        key={groupIndex}
        className={`daily-rich-list ${isCheckList ? 'is-checklist' : ''}`}
      >
        {group.blocks.map((block, index) => (
          <li key={index} style={buildBlockStyle(block.props)}>
            {isCheckList && (
              <span className={`daily-rich-checkbox ${block.props?.checked ? 'is-checked' : ''}`} aria-hidden="true" />
            )}
            <RichBlockBody block={block} />
          </li>
        ))}
      </ListTag>
    );
  });
}

/**
 * @param {object} props
 * @param {Array} [props.richText] BlockNote block 数组；没有时按 text 的换行渲染
 * @param {string} [props.text] 纯文本兜底（旧数据 / Agent 写入的条目）
 */
function DailyRichContent({ richText, text, className = '', placeholder = '' }) {
  const blocks = normalizeRichText(richText);
  const fallbackBlocks = blocks.length > 0 ? blocks : plainTextToRichText(text);

  if (fallbackBlocks.length === 0) {
    return <span className={`daily-rich-content is-placeholder ${className}`}>{placeholder}</span>;
  }

  return (
    <div className={`daily-rich-content ${className}`}>
      <RichBlockList blocks={fallbackBlocks} />
    </div>
  );
}

export default DailyRichContent;
