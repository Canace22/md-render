import { lazy, memo, Suspense, useCallback, useMemo } from 'react';
import DailyToolbar from './daily/DailyToolbar.jsx';
import { useCopyText } from '../hooks/useCopyText.js';
import { useEditorImageUpload } from '../hooks/useEditorImageUpload.js';
import { useEditorStore } from '../store/useEditorStore.js';
import {
  formatDailyHeading,
  getDailyBlocksForEditor,
  getDailyEntry,
  getDailyMarkdown,
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
 */
function DailyNotebook({ dailyWorkspace, onSetCurrentDate, onSetBlocks, localProjectSupported, assetRootPath }) {
  const today = getTodayDateKey();
  const currentDate = dailyWorkspace?.currentDate || today;
  const entry = useMemo(() => getDailyEntry(dailyWorkspace, currentDate), [currentDate, dailyWorkspace]);
  const { uploadFile } = useEditorImageUpload({ localProjectSupported, selectedProjectRootPath: assetRootPath });
  const { copiedId, copy } = useCopyText();

  const handleShift = useCallback((offset) => onSetCurrentDate(shiftDateKey(currentDate, offset)), [currentDate, onSetCurrentDate]);
  const handleToday = useCallback(() => onSetCurrentDate(getTodayDateKey()), [onSetCurrentDate]);

  // 点按钮时编辑器已失焦并把最后的改动存进 store，直接读最新状态
  const handleCopy = useCallback(() => {
    copy(currentDate, getDailyMarkdown(useEditorStore.getState().dailyWorkspace, currentDate));
  }, [copy, currentDate]);

  const fallback = <DailyOutlineFallback markdown={getDailyMarkdown(dailyWorkspace, currentDate)} />;

  return (
    <div className="daily-outline" data-testid="daily-surface">
      <header className="daily-outline-header">
        <h1>{formatDailyHeading(currentDate)}</h1>
        <DailyToolbar
          dateKey={currentDate}
          isToday={currentDate === today}
          copied={copiedId === currentDate}
          onShift={handleShift}
          onToday={handleToday}
          onPick={onSetCurrentDate}
          onCopy={handleCopy}
        />
      </header>

      <section className="daily-outline-body">
        {canUseDOM ? (
          <Suspense fallback={fallback}>
            <DailyOutlineEditor
              key={currentDate}
              dateKey={currentDate}
              initialBlocks={getDailyBlocksForEditor(dailyWorkspace, currentDate)}
              storeBlocks={entry.blocks}
              uploadFile={uploadFile}
              onSave={onSetBlocks}
            />
          </Suspense>
        ) : fallback}
      </section>
    </div>
  );
}

export default memo(DailyNotebook);
