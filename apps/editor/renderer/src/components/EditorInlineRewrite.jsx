import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Button, message } from 'antd';
import { Check, ChevronDown, Minimize2, RotateCcw, Sparkles, Square, X } from 'lucide-react';
import { useBlockNoteEditor, useComponentsContext } from '@blocknote/react';
import { runInlineRewrite } from '../core/agent/inlineRewrite.js';
import { getBlockTextContent } from '../utils/markdownUtils.js';

const CARD_MARGIN_PX = 16;
const CARD_GAP_PX = 10;
const CARD_ESTIMATED_WIDTH_PX = 420;
const ABORTED_MESSAGE = '已取消';

const InlineRewriteContext = createContext(null);

const flattenBlocks = (blocks = []) => blocks.flatMap((block) => [
  block,
  ...flattenBlocks(block.children),
]);

const captureSelection = (editor) => {
  const selection = editor.prosemirrorState.selection;
  if (selection.empty) return null;

  const { from, to } = selection;
  const sourceText = editor.prosemirrorState.doc.textBetween(from, to, '\n').trim();
  if (!sourceText) return null;

  const selectedBlocks = editor.getSelection()?.blocks ?? [];
  const allBlocks = flattenBlocks(editor.document);
  const firstIndex = allBlocks.findIndex((block) => block.id === selectedBlocks[0]?.id);
  const lastId = selectedBlocks[selectedBlocks.length - 1]?.id;
  const lastIndex = allBlocks.findIndex((block) => block.id === lastId);
  const bounds = editor.getSelectionBoundingBox();

  return {
    from,
    to,
    sourceText,
    context: {
      before: firstIndex > 0 ? getBlockTextContent(allBlocks[firstIndex - 1]?.content) : '',
      after: lastIndex >= 0 && lastIndex < allBlocks.length - 1
        ? getBlockTextContent(allBlocks[lastIndex + 1]?.content)
        : '',
    },
    anchor: bounds ? { left: bounds.left, bottom: bounds.bottom } : null,
  };
};

const resolveCardPosition = (anchor) => {
  if (!anchor || typeof window === 'undefined') return null;
  const maxLeft = Math.max(CARD_MARGIN_PX, window.innerWidth - CARD_ESTIMATED_WIDTH_PX - CARD_MARGIN_PX);
  return {
    left: Math.max(CARD_MARGIN_PX, Math.min(anchor.left, maxLeft)),
    top: anchor.bottom + CARD_GAP_PX,
  };
};

function InlineRewriteCard({ state, onAccept, onDiscard, onRegenerate }) {
  if (!state.snapshot || typeof document === 'undefined') return null;
  const position = resolveCardPosition(state.snapshot.anchor);
  if (!position) return null;

  const running = state.status === 'running';
  return createPortal(
    <section
      className="editor-inline-rewrite-card"
      style={position}
      aria-label="AI 选区改写预览"
    >
      <div className="editor-inline-rewrite-card__header">
        <span>{state.label}</span>
        <button type="button" onClick={onDiscard} aria-label="放弃改写"><X size={15} /></button>
      </div>
      <div className="editor-inline-rewrite-card__section">
        <span className="editor-inline-rewrite-card__caption">原文</span>
        <p>{state.snapshot.sourceText}</p>
      </div>
      <div className="editor-inline-rewrite-card__section editor-inline-rewrite-card__section--result">
        <span className="editor-inline-rewrite-card__caption">改写后</span>
        <p>{state.error || state.draft || (running ? '正在生成…' : '')}</p>
        {running && <span className="editor-inline-rewrite-card__cursor" aria-hidden="true" />}
      </div>
      <div className="editor-inline-rewrite-card__actions">
        {running ? (
          <Button size="small" icon={<Square size={13} />} onClick={onDiscard}>停止</Button>
        ) : (
          <>
            <Button size="small" icon={<X size={14} />} onClick={onDiscard}>放弃</Button>
            <Button size="small" icon={<RotateCcw size={14} />} onClick={onRegenerate}>再来一版</Button>
            <Button
              type="primary"
              size="small"
              icon={<Check size={14} />}
              disabled={!state.draft || Boolean(state.error)}
              onClick={onAccept}
            >
              接受
            </Button>
          </>
        )}
      </div>
    </section>,
    document.body,
  );
}

export function EditorInlineRewriteProvider({ children }) {
  const editor = useBlockNoteEditor();
  const abortRef = useRef(null);
  const [state, setState] = useState({ status: 'idle', draft: '', error: '', snapshot: null, instruction: 'polish', label: '润色' });

  const discard = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState({ status: 'idle', draft: '', error: '', snapshot: null, instruction: 'polish', label: '润色' });
  }, []);

  useEffect(() => {
    discard();
    return () => abortRef.current?.abort();
  }, [discard, editor]);

  const start = useCallback(async (instruction, label, existingSnapshot = null) => {
    const snapshot = existingSnapshot ?? captureSelection(editor);
    if (!snapshot) {
      message.warning('请先选中要改写的文字');
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'running', draft: '', error: '', snapshot, instruction, label });
    try {
      const result = await runInlineRewrite({
        text: snapshot.sourceText,
        context: snapshot.context,
        instruction,
        signal: controller.signal,
        onDelta: (draft) => setState((current) => (
          current.snapshot === snapshot ? { ...current, draft } : current
        )),
      });
      setState((current) => (
        current.snapshot === snapshot ? { ...current, status: 'ready', draft: result } : current
      ));
    } catch (error) {
      if (controller.signal.aborted || error?.message === ABORTED_MESSAGE) return;
      setState((current) => (
        current.snapshot === snapshot
          ? { ...current, status: 'error', error: error?.message || '改写失败' }
          : current
      ));
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [editor]);

  const accept = useCallback(() => {
    const { snapshot, draft } = state;
    if (!snapshot || !draft) return;
    const currentText = editor.prosemirrorState.doc
      .textBetween(snapshot.from, snapshot.to, '\n')
      .trim();
    if (currentText !== snapshot.sourceText) {
      message.warning('原选区已发生变化，请重新选中后再试');
      discard();
      return;
    }

    editor.transact((transaction) => {
      transaction.insertText(draft, snapshot.from, snapshot.to);
    });
    editor.focus();
    discard();
  }, [discard, editor, state]);

  const regenerate = useCallback(() => {
    if (!state.snapshot) return;
    void start(state.instruction, state.label, state.snapshot);
  }, [start, state.instruction, state.label, state.snapshot]);

  const value = useMemo(
    () => ({ running: state.status === 'running', start }),
    [start, state.status],
  );
  return (
    <InlineRewriteContext.Provider value={value}>
      {children}
      <InlineRewriteCard
        state={state}
        onAccept={accept}
        onDiscard={discard}
        onRegenerate={regenerate}
      />
    </InlineRewriteContext.Provider>
  );
}

export function EditorInlineRewriteButtons() {
  const rewrite = useContext(InlineRewriteContext);
  const Components = useComponentsContext();
  if (!rewrite || !Components) return null;

  const run = (instruction, label) => { void rewrite.start(instruction, label); };
  return (
    <>
      <Components.FormattingToolbar.Button
        className="editor-ai-toolbar__button"
        label="润色"
        mainTooltip="润色选中文字"
        isDisabled={rewrite.running}
        icon={<span className="editor-ai-toolbar__label"><Sparkles size={14} />润色</span>}
        onClick={() => run('polish', '润色')}
      />
      <Components.Generic.Menu.Root>
        <Components.Generic.Menu.Trigger>
          <Components.FormattingToolbar.Button
            className="editor-ai-toolbar__button"
            label="调整语气"
            mainTooltip="调整选中文字的语气"
            isDisabled={rewrite.running}
            icon={<span className="editor-ai-toolbar__label">语气<ChevronDown size={13} /></span>}
          />
        </Components.Generic.Menu.Trigger>
        <Components.Generic.Menu.Dropdown className="bn-menu-dropdown">
          <Components.Generic.Menu.Item onClick={() => run('colloquial', '更口语')}>更口语</Components.Generic.Menu.Item>
          <Components.Generic.Menu.Item onClick={() => run('formal', '更正式')}>更正式</Components.Generic.Menu.Item>
          <Components.Generic.Menu.Item onClick={() => run('concise', '更简洁')}>更简洁</Components.Generic.Menu.Item>
        </Components.Generic.Menu.Dropdown>
      </Components.Generic.Menu.Root>
      <Components.FormattingToolbar.Button
        className="editor-ai-toolbar__button"
        label="精简"
        mainTooltip="压缩选中文字"
        isDisabled={rewrite.running}
        icon={<span className="editor-ai-toolbar__label"><Minimize2 size={14} />精简</span>}
        onClick={() => run('shorten', '精简')}
      />
    </>
  );
}
