/**
 * [[双链]] 机制：正文里的 [[文档名]] 只显示文档名（链接样式），点击回调业务侧打开文档。
 *
 * 只加 ProseMirror 装饰（decoration），不改文档内容：
 * 落盘的 Markdown 仍是纯文本 [[文档名]]，反向链接统计不受影响。
 * 方括号默认隐藏；光标移进链接时才显示，方便用键盘编辑。
 */

import type { Node } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';

/** 与主进程 database.js 的 WIKILINK_RE 保持一致：[[名称]] 或 [[名称|别名]] */
const WIKILINK_RE = /\[\[([^\]|\n]{1,200})(\|[^\]\n]{0,200})?\]\]/g;
const BRACKET_LEN = 2;
const LEFT_MOUSE_BUTTON = 0;
/** 非文本行内节点（如换行）在 ProseMirror 里占 1 个位置，用占位符对齐偏移 */
const LEAF_PLACEHOLDER = '￼';

export const WIKILINK_CLASS = 'bn-wikilink';
export const WIKILINK_SYNTAX_CLASS = 'bn-wikilink-syntax';
export const WIKILINK_EDITING_CLASS = 'bn-wikilink-syntax--editing';
export const WIKILINK_NAME_ATTR = 'data-wikilink';

export interface IWikilinkMatch {
  /** 整个 [[...]] 的范围 */
  start: number;
  end: number;
  /** 要显示的文字范围：[[名称]] 是名称，[[名称|别名]] 是别名 */
  labelStart: number;
  labelEnd: number;
  name: string;
}

/** 在一段文本中找出所有 [[双链]]（纯函数） */
export function findWikilinks(text: string): IWikilinkMatch[] {
  const matches: IWikilinkMatch[] = [];
  WIKILINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WIKILINK_RE.exec(text)) !== null) {
    const name = match[1].trim();
    if (!name) continue;
    const start = match.index;
    const end = start + match[0].length;
    const hasAlias = Boolean(match[2] && match[2].length > 1);
    const labelStart = hasAlias ? start + BRACKET_LEN + match[1].length + 1 : start + BRACKET_LEN;
    matches.push({ start, end, labelStart, labelEnd: end - BRACKET_LEN, name });
  }
  return matches;
}

/** 文本块内容转成与位置一一对应的字符串 */
function textblockText(node: Node): string {
  let text = '';
  node.forEach((child) => {
    text += child.isText ? (child.text ?? '') : LEAF_PLACEHOLDER;
  });
  return text;
}

/** 文档里所有双链的绝对位置（只在文档变化时重算） */
function collectLinks(doc: Node): IWikilinkMatch[] {
  const links: IWikilinkMatch[] = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type.spec.code) return false;
    const offset = pos + 1;
    findWikilinks(textblockText(node)).forEach((m) => links.push({
      ...m,
      start: m.start + offset,
      end: m.end + offset,
      labelStart: m.labelStart + offset,
      labelEnd: m.labelEnd + offset,
    }));
    return false;
  });
  return links;
}

const isEditing = (state: EditorState, link: IWikilinkMatch): boolean => {
  const { from, to } = state.selection;
  return from >= link.start && to <= link.end;
};

function linkDecorations(link: IWikilinkMatch, editing: boolean): Decoration[] {
  const syntaxClass = editing ? `${WIKILINK_SYNTAX_CLASS} ${WIKILINK_EDITING_CLASS}` : WIKILINK_SYNTAX_CLASS;
  return [
    Decoration.inline(link.start, link.end, { class: WIKILINK_CLASS, [WIKILINK_NAME_ATTR]: link.name }),
    Decoration.inline(link.start, link.labelStart, { class: syntaxClass }),
    Decoration.inline(link.labelEnd, link.end, { class: syntaxClass }),
  ];
}

function buildDecorations(state: EditorState, links: IWikilinkMatch[]): DecorationSet {
  if (links.length === 0) return DecorationSet.empty;
  const decorations = links.flatMap((link) => linkDecorations(link, isEditing(state, link)));
  return DecorationSet.create(state.doc, decorations);
}

/** 从事件目标找到双链名称 */
export function wikilinkNameFromEvent(event: Event): string | null {
  const target = (event.target as HTMLElement | null)?.closest?.(`[${WIKILINK_NAME_ATTR}]`);
  return target?.getAttribute(WIKILINK_NAME_ATTR) ?? null;
}

const wikilinkPluginKey = new PluginKey<IWikilinkMatch[]>('wikilink');

/** 双链插件：onOpen(name) 由业务侧决定如何打开文档 */
export function createWikilinkPlugin(onOpen: (name: string) => void): Plugin<IWikilinkMatch[]> {
  return new Plugin<IWikilinkMatch[]>({
    key: wikilinkPluginKey,
    state: {
      init: (_, state) => collectLinks(state.doc),
      apply: (tr, old) => (tr.docChanged ? collectLinks(tr.doc) : old),
    },
    props: {
      decorations: (state) => buildDecorations(state, wikilinkPluginKey.getState(state) ?? []),
      handleDOMEvents: {
        // 在 mousedown 就处理：不让光标落进链接（否则方括号会先显示出来，点击位置跟着跳）
        mousedown: (_view: EditorView, event: MouseEvent) => {
          if (event.button !== LEFT_MOUSE_BUTTON) return false;
          const name = wikilinkNameFromEvent(event);
          if (!name) return false;
          event.preventDefault();
          onOpen(name);
          return true;
        },
      },
    },
  });
}
