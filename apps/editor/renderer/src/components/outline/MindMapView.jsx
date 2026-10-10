import { memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Minus, Plus, ChevronsLeftRight } from 'lucide-react';
import MindMapNode from './MindMapNode.jsx';

const MIN_SCALE = 0.3;
const MAX_SCALE = 2;
const SCALE_STEP = 0.1;
const WHEEL_ZOOM_FACTOR = 0.002;
const DRAG_THRESHOLD_PX = 4;
const EDGE_PADDING_PX = 48;
const ICON_SIZE = 14;
const ROOT_ID = '__root__';

const clampScale = (scale) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(scale * 100) / 100));

/** 内容垂直居中、靠左留边：初次进入和点「重置」时用 */
const centerViewport = (container, content, scale) => {
  if (!container || !content) return { x: EDGE_PADDING_PX, y: EDGE_PADDING_PX, scale };
  const y = (container.clientHeight - content.offsetHeight * scale) / 2;
  return { x: EDGE_PADDING_PX, y: Math.max(EDGE_PADDING_PX, y), scale };
};

/** 拖空白处平移；滚轮平移，按住 Ctrl/⌘ 滚轮（触控板双指捏合）缩放 */
function useMindMapViewport(containerRef, contentRef) {
  const [viewport, setViewportState] = useState({ x: EDGE_PADDING_PX, y: EDGE_PADDING_PX, scale: 1 });
  const viewportRef = useRef(viewport);
  const movedRef = useRef(false);

  const setViewport = useCallback((updater) => {
    const next = typeof updater === 'function' ? updater(viewportRef.current) : updater;
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  const reset = useCallback((scale = 1) => {
    setViewport(centerViewport(containerRef.current, contentRef.current, scale));
  }, [containerRef, contentRef, setViewport]);

  const zoomBy = useCallback((delta) => {
    setViewport((prev) => ({ ...prev, scale: clampScale(prev.scale + delta) }));
  }, [setViewport]);

  // 原生非 passive 监听：要 preventDefault，避免整页滚动 / 缩放
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;
    const onWheel = (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        zoomBy(-event.deltaY * WHEEL_ZOOM_FACTOR);
        return;
      }
      setViewport((prev) => ({ ...prev, x: prev.x - event.deltaX, y: prev.y - event.deltaY }));
    };
    container.addEventListener('wheel', onWheel, { passive: false });
    return () => container.removeEventListener('wheel', onWheel);
  }, [containerRef, setViewport, zoomBy]);

  const handlePointerDown = useCallback((event) => {
    if (event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    const origin = viewportRef.current;
    movedRef.current = false;

    const onMove = (moveEvent) => {
      const dx = moveEvent.clientX - start.x;
      const dy = moveEvent.clientY - start.y;
      if (!movedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      movedRef.current = true;
      setViewport({ ...origin, x: origin.x + dx, y: origin.y + dy });
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, [setViewport]);

  return { viewport, reset, zoomBy, movedRef, handlePointerDown };
}

/**
 * 思维导图视图（只读）：大纲树向右展开，可折叠、平移、缩放；点节点回到大纲对应那一行，点 [[双链]] 打开文档。
 * tree 由 shared/outline/outlineTree.js 的 blocksToMindTree 生成；父级按页面 / 日期给 key。
 */
function MindMapView({ tree, onSelectNode, onOpenLink }) {
  const containerRef = useRef(null);
  const contentRef = useRef(null);
  const [collapsedIds, setCollapsedIds] = useState(() => new Set());
  const { viewport, reset, zoomBy, movedRef, handlePointerDown } = useMindMapViewport(containerRef, contentRef);

  // 挂载时居中一次；换页面 / 换日期由父级用 key 重挂，内容变化不打断当前视角
  useLayoutEffect(() => {
    reset();
  }, [reset]);

  const handleToggle = useCallback((id) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelect = useCallback((id) => {
    if (movedRef.current || id === ROOT_ID) return;
    onSelectNode?.(id);
  }, [movedRef, onSelectNode]);

  // 拖动画布后松手不算点击；没传 onOpenLink（如今日速记）时双链只显示不可点
  const handleOpenLink = useCallback((name) => {
    if (!movedRef.current) onOpenLink(name);
  }, [movedRef, onOpenLink]);

  return (
    <div
      ref={containerRef}
      className="mindmap-view"
      data-testid="mindmap-view"
      onPointerDown={handlePointerDown}
    >
      <div
        ref={contentRef}
        className="mindmap-canvas"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.scale})` }}
      >
        <MindMapNode
          node={tree}
          collapsedIds={collapsedIds}
          onToggle={handleToggle}
          onSelect={handleSelect}
          onOpenLink={onOpenLink ? handleOpenLink : undefined}
        />
      </div>

      <div className="mindmap-controls" onPointerDown={(event) => event.stopPropagation()}>
        <button type="button" aria-label="缩小" onClick={() => zoomBy(-SCALE_STEP)}><Minus size={ICON_SIZE} /></button>
        <button type="button" className="mindmap-scale" title="重置为 100%" onClick={() => reset(1)}>
          {Math.round(viewport.scale * 100)}%
        </button>
        <button type="button" aria-label="放大" onClick={() => zoomBy(SCALE_STEP)}><Plus size={ICON_SIZE} /></button>
        <button
          type="button"
          aria-label="全部展开"
          title="全部展开"
          disabled={collapsedIds.size === 0}
          onClick={() => setCollapsedIds(new Set())}
        >
          <ChevronsLeftRight size={ICON_SIZE} />
        </button>
      </div>
    </div>
  );
}

export default memo(MindMapView);
