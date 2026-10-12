import { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react';
import DailyToolbar from './daily/DailyToolbar.jsx';
import MindMapView from './outline/MindMapView.jsx';
import OutlineViewSwitch, { MINDMAP_VIEW, OUTLINE_VIEW } from './outline/OutlineViewSwitch.jsx';
import { blocksToMindTree } from '@shared/outline/outlineTree.js';
import { useCopyText } from '../hooks/useCopyText.js';
import { useEditorImageUpload } from '../hooks/useEditorImageUpload.js';
import { useEditorStore } from '../store/useEditorStore.js';
import {
  formatDailyHeading,
  getDailyBlocksForEditor,
  getDailyEntry,
  getDailyMarkdown,
  getDailyRecordedDates,
  getTodayDateKey,
  shiftDateKey,
} from '../utils/dailyWorkspace.js';

// BlockNote 依赖 DOM：lazy 只在真正渲染时才 import，node 单测的静态渲染碰不到它
const DailyOutlineEditor = lazy(() => import('./daily/DailyOutlineEditor.jsx'));

const canUseDOM = typeof window !== 'undefined' && typeof window.document?.createElement === 'function';

/** 编辑器还没加载好（或没有 DOM）时，先把当天内容按 Markdown 摆出来 */
function DailyOutlineFallback({ markdown }) {
  return <pre className="daily-outline-fallback">{markdown || '今天还没有记录。'}</pre>;
}

/**
 * 今日速记（幕布式）：一天一篇大纲，默认「今日任务 / 事件 / 笔记」三个分区，
 * 可以嵌套、勾选、贴图；过去没勾掉的任务在进入今天时自动带过来。
 * 可切到思维导图（只读）看全貌，点节点回到大纲对应那一行。
 */
function DailyNotebook({ dailyWorkspace, onSetCurrentDate, onSetBlocks, localProjectSupported, assetRootPath }) {
  const today = getTodayDateKey();
  const currentDate = dailyWorkspace?.currentDate || today;
  const entry = useMemo(() => getDailyEntry(dailyWorkspace, currentDate), [currentDate, dailyWorkspace]);
  const { uploadFile } = useEditorImageUpload({ localProjectSupported, selectedProjectRootPath: assetRootPath });
  const { copiedId, copy } = useCopyText();
  const [view, setView] = useState(OUTLINE_VIEW);
  const [focusBlockId, setFocusBlockId] = useState(null);
  const isMindMap = view === MINDMAP_VIEW;
  const recordedDates = useMemo(() => getDailyRecordedDates(dailyWorkspace), [dailyWorkspace]);
  const editorBlocks = useMemo(() => getDailyBlocksForEditor(dailyWorkspace, currentDate), [currentDate, dailyWorkspace]);
  const mindTree = useMemo(
    () => (isMindMap ? blocksToMindTree(editorBlocks, formatDailyHeading(currentDate)) : null),
    [isMindMap, editorBlocks, currentDate],
  );

  const handleShift = useCallback((offset) => onSetCurrentDate(shiftDateKey(currentDate, offset)), [currentDate, onSetCurrentDate]);
  const handleToday = useCallback(() => onSetCurrentDate(getTodayDateKey()), [onSetCurrentDate]);

  // 点按钮时编辑器已失焦并把最后的改动存进 store，直接读最新状态
  const handleCopy = useCallback(() => {
    copy(currentDate, getDailyMarkdown(useEditorStore.getState().dailyWorkspace, currentDate));
  }, [copy, currentDate]);

  const handleViewChange = useCallback((next) => {
    setFocusBlockId(null);
    setView(next);
  }, []);

  // 导图里点节点：回到大纲并把光标放到那一行
  const handleSelectNode = useCallback((blockId) => {
    setFocusBlockId(blockId);
    setView(OUTLINE_VIEW);
  }, []);

  const fallback = <DailyOutlineFallback markdown={getDailyMarkdown(dailyWorkspace, currentDate)} />;

  return (
    <div className={`daily-outline${isMindMap ? ' is-mindmap' : ''}`} data-testid="daily-surface">
      <header className="daily-outline-header">
        <h1>{formatDailyHeading(currentDate)}</h1>
        <DailyToolbar
          dateKey={currentDate}
          isToday={currentDate === today}
          recordedDates={recordedDates}
          copied={copiedId === currentDate}
          onShift={handleShift}
          onToday={handleToday}
          onPick={onSetCurrentDate}
          onCopy={handleCopy}
          viewSwitch={<OutlineViewSwitch value={view} onChange={handleViewChange} />}
        />
      </header>

      <section className="daily-outline-body">
        {isMindMap && canUseDOM ? (
          <MindMapView key={currentDate} tree={mindTree} onSelectNode={handleSelectNode} />
        ) : canUseDOM ? (
          <Suspense fallback={fallback}>
            <DailyOutlineEditor
              key={currentDate}
              dateKey={currentDate}
              initialBlocks={editorBlocks}
              storeBlocks={entry.blocks}
              uploadFile={uploadFile}
              onSave={onSetBlocks}
              focusBlockId={focusBlockId}
            />
          </Suspense>
        ) : fallback}
      </section>
    </div>
  );
}

export default memo(DailyNotebook);
