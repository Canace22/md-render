import { useCallback, useEffect, useMemo, useRef } from 'react';
import { message } from 'antd';
import { SideMenu, SideMenuController, useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { zh } from '@blocknote/core/locales';
import { buildSchema } from '@narrative/blocknote-core';
import '@blocknote/core/fonts/inter.css';
import '@blocknote/mantine/style.css';
import { isDailyBlocksEmpty } from '@shared/daily/dailyBlocks.js';
import { useEditorStore } from '../../store/useEditorStore.js';
import {
  classifyClipboardFiles,
  hasPendingImagePlaceholders,
  insertImagesFromFiles,
} from '../../hooks/useEditorImageUpload.js';
import { useImageLightbox } from '../../hooks/useImageLightbox.js';
import { useTwoStageSelectAll } from '../../hooks/useTwoStageSelectAll.js';
import EditorFormattingToolbarController from '../EditorFormattingToolbar.jsx';
import ImageLightbox from '../ImageLightbox.jsx';
import DailyBlockMenu from './DailyBlockMenu.jsx';
import DailySlashMenu from './DailySlashMenu.jsx';
import { DAILY_IMAGE_SOURCE_ID } from './dailyBlockActions.js';
import { focusOutlineBlock } from '../outline/focusOutlineBlock.js';

/**
 * 今日速记的大纲编辑器（一天一篇 BlockNote 文档）。
 *
 * - 非受控：只在挂载时取初值，之后防抖把整篇 document 往上抛；切日期由父级用 key 重挂。
 * - 外部改动（AI 写入、跨天结转、内容库文件被改）会让 storeBlocks 变成「不是自己刚抛出去的那份」，
 *   这时整篇替换；用户正在输入（防抖未落）时以用户为准。
 * - 只在浏览器里懒加载：@blocknote/* 依赖 DOM，node 单测里跑不动。
 */

const SAVE_DEBOUNCE_MS = 400;
const PLACEHOLDER = '随手记下来…  输入 “/” 设标题、待办、图片（/红 改颜色、/图标 加图标），Tab 缩进成子级';

// 速记用不到表格和音视频附件；标题要留着做分区（buildSchema 默认会去掉标题）
const DAILY_SCHEMA = buildSchema({
  blockSpecs: {},
  excludeDefaultBlocks: ['table', 'video', 'audio', 'file'],
});

const DICTIONARY = {
  ...zh,
  placeholders: { ...zh.placeholders, default: PLACEHOLDER, emptyDocument: PLACEHOLDER },
};

/** 左侧手柄：保留「+」和拖拽，点手柄弹幕布式块菜单 */
const DailySideMenu = (props) => <SideMenu {...props} dragHandleMenu={DailyBlockMenu} />;

/** 截图 / 复制的图片：先占位，再存进内容库 assets/ 回填地址 */
const createPasteHandler = (uploadFile) => ({ event, editor, defaultPasteHandler }) => {
  const { hasFiles, imageFiles, unsupportedFiles } = classifyClipboardFiles(event.clipboardData);
  if (!hasFiles) return defaultPasteHandler();
  if (unsupportedFiles.length > 0 || imageFiles.length === 0) message.warning('速记里只支持粘贴图片');
  if (imageFiles.length > 0) void insertImagesFromFiles(editor, imageFiles, uploadFile, { fileId: DAILY_IMAGE_SOURCE_ID });
  return true;
};

function DailyOutlineEditor({ dateKey, initialBlocks, storeBlocks, uploadFile, onSave, focusBlockId = null }) {
  // 挂载时固定：日期、初值、回调（卸载前最后一次保存也必须落到这一天）
  const dateRef = useRef(dateKey);
  const onSaveRef = useRef(onSave);
  const initialContent = useMemo(() => initialBlocks, []); // eslint-disable-line react-hooks/exhaustive-deps
  const lastEmittedRef = useRef(storeBlocks);
  const timerRef = useRef(null);
  const applyingRef = useRef(false);
  const theme = useEditorStore((state) => state.theme);
  const { lightbox, openFromEvent, close, changeIndex } = useImageLightbox();

  const editor = useCreateBlockNote({
    dictionary: DICTIONARY,
    schema: DAILY_SCHEMA,
    initialContent,
    uploadFile,
    pasteHandler: createPasteHandler(uploadFile),
  });

  // Cmd/Ctrl+A 与主编辑器一致：单按选当前节点，长按才全选整篇
  const {
    handleSelectAllBlurCapture,
    handleSelectAllKeyDownCapture,
    handleSelectAllKeyUpCapture,
    resetSelectAllState,
  } = useTwoStageSelectAll(editor);

  const flush = useCallback(() => {
    clearTimeout(timerRef.current);
    timerRef.current = null;
    const blocks = editor.document;
    // 图片还在上传（blob: 占位）就先不存，等回填后的那次变更
    if (hasPendingImagePlaceholders(blocks)) return;
    lastEmittedRef.current = blocks;
    onSaveRef.current?.(dateRef.current, blocks);
  }, [editor]);

  const handleChange = useCallback(() => {
    if (applyingRef.current) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
  }, [flush]);

  // 卸载（切日期 / 离开页面）前把没落的改动存掉
  useEffect(() => () => {
    if (timerRef.current) flush();
  }, [flush]);

  // 从导图点回来：光标落到那一行并滚进视野（只在挂载时跑一次）
  useEffect(() => {
    focusOutlineBlock(editor, focusBlockId);
  }, [editor]); // eslint-disable-line react-hooks/exhaustive-deps

  // 外部改动：整篇替换（自己刚存的、或双方都是空的，不动）
  useEffect(() => {
    if (storeBlocks === lastEmittedRef.current || timerRef.current) return;
    if (isDailyBlocksEmpty(storeBlocks) && isDailyBlocksEmpty(editor.document)) return;
    lastEmittedRef.current = storeBlocks;
    applyingRef.current = true;
    try {
      editor.replaceBlocks(editor.document, storeBlocks.length ? storeBlocks : initialContent);
    } finally {
      applyingRef.current = false;
    }
  }, [editor, initialContent, storeBlocks]);

  return (
    <div
      className="daily-outline-editor-shell"
      onBlur={() => timerRef.current && flush()}
      onBlurCapture={handleSelectAllBlurCapture}
      onKeyDownCapture={handleSelectAllKeyDownCapture}
      onKeyUpCapture={handleSelectAllKeyUpCapture}
      onPointerDownCapture={resetSelectAllState}
      onDoubleClick={openFromEvent}
    >
      <BlockNoteView
        editor={editor}
        className="blocknote-editor daily-outline-editor"
        theme={theme === 'dark' ? 'dark' : 'light'}
        formattingToolbar={false}
        sideMenu={false}
        slashMenu={false}
        onChange={handleChange}
      >
        <EditorFormattingToolbarController />
        <SideMenuController sideMenu={DailySideMenu} />
        <DailySlashMenu />
      </BlockNoteView>
      <ImageLightbox images={lightbox.images} index={lightbox.index} onClose={close} onIndexChange={changeIndex} />
    </div>
  );
}

export default DailyOutlineEditor;
