import { useCallback, useMemo } from 'react';
import { SuggestionMenuController, useBlockNoteEditor } from '@blocknote/react';
import { FileText } from 'lucide-react';
import { useOpenWikilink, useWikilinkNavigation } from '../hooks/useWikilinkNavigation.js';
import {
  MENTION_TRIGGER,
  collectLinkedNames,
  docTitle,
  listWorkspaceDocs,
  matchDocs,
  rankLinkableDocs,
  toWikilink,
} from '../utils/docMentionItems.js';

/**
 * 主编辑器的文档双链：
 * - 输入「@」引用工作区文档（已引用的不再出现，离当前文档近的排前面），插入 [[双链]]
 * - 正文里的 [[双链]] 显示为链接，点击跳转到对应文档
 */

const ICON_SIZE = 18;
const BLOCK_SEPARATOR = '\n';

const buildDocItem = (editor, { file, group }) => ({
  key: `doc_${file.id}`,
  title: docTitle(file),
  group,
  icon: <FileText size={ICON_SIZE} />,
  onItemClick: () => editor.insertInlineContent(`${toWikilink(file)} `),
});

/** 当前正文纯文本（只用来找已有的 [[双链]]） */
const editorText = (editor) => {
  const { doc } = editor.prosemirrorState;
  return doc.textBetween(0, doc.content.size, BLOCK_SEPARATOR);
};

function EditorDocLinks({ workspace, currentFileId }) {
  const editor = useBlockNoteEditor();
  const entries = useMemo(() => listWorkspaceDocs(workspace), [workspace]);
  const openByName = useOpenWikilink(workspace);

  useWikilinkNavigation(editor, openByName);

  const getItems = useCallback(async (query) => {
    const linkedNames = collectLinkedNames(editorText(editor));
    return matchDocs(rankLinkableDocs(entries, currentFileId, linkedNames), query)
      .map((item) => buildDocItem(editor, item));
  }, [editor, entries, currentFileId]);

  return <SuggestionMenuController triggerCharacter={MENTION_TRIGGER} getItems={getItems} />;
}

export default EditorDocLinks;
