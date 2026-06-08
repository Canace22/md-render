import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Empty, Input, Popconfirm, Popover, Select, Tag, Typography } from 'antd';
import { Eraser, FileText, Filter, Maximize2, Minimize2 } from 'lucide-react';
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_WIDTH = 252;
const GRID_COLUMNS_WIDE = 4;
const GRID_COLUMNS_MEDIUM = 3;
const GRID_COLUMNS_NARROW = 2;
const GRID_NARROW_THRESHOLD = 4;
const GRID_MEDIUM_THRESHOLD = 9;
const GRID_GAP_X = 332;
const GRID_GAP_Y = 228;
const GRID_STAGGER_OFFSET_X = 42;
const HANDLE_OFFSET = -8;
const ALL_FILTER_VALUE = '__all__';
const TITLE_FILTER_DEBOUNCE_MS = 360;
const INITIAL_FIT_PADDING = 0.16;
const INITIAL_FIT_MIN_ZOOM = 0.78;
const INITIAL_FIT_MAX_ZOOM = 1;
const DEFAULT_LIBRARY_OPEN = false;
const CANVAS_TITLE = '白板';
const CANVAS_EMPTY_HINTS = [
  '从下方加入卡片，或双击空白处打开候选列表',
  '拖动画布空白处移动视角',
  '滚轮缩放，拖拽节点锚点建立连线',
];
const REACT_FLOW_PANE_CLASS = 'react-flow__pane';
const LINK_FILTER_OPTIONS = [
  { value: ALL_FILTER_VALUE, label: '全部链接状态' },
  { value: 'linked', label: '有外链' },
  { value: 'plain', label: '无外链' },
];

const trimText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const getItemId = (item, index) => String(item?.id ?? `canvas-node-${index}`);
const getItemTitle = (item, index) => trimText(item?.title ?? item?.name ?? item?.label) || `未命名节点 ${index + 1}`;

function getItemSummary(item) {
  const summary = trimText(item?.summary ?? item?.excerpt ?? item?.description ?? item?.content);
  if (!summary) return '这条内容还没有摘要。';
  return summary.length > 54 ? `${summary.slice(0, 54)}...` : summary;
}

const getItemTags = (item) => (Array.isArray(item?.tags) ? item.tags : [])
  .map((tag) => trimText(tag))
  .filter(Boolean)
  .slice(0, 2);

const getItemPlatforms = (item) => (Array.isArray(item?.targetPlatforms) ? item.targetPlatforms : [])
  .map((value) => trimText(value))
  .filter(Boolean)
  .slice(0, 3);

const getItemStatus = (item) => trimText(item?.draftStatus ?? item?.status);

const getItemTypeLabel = (item) => trimText(item?.typeLabel ?? item?.nodeType ?? item?.type) || 'document';

function getItemMetaLine(item) {
  const platforms = getItemPlatforms(item);
  if (platforms.length) return platforms.join(', ');

  const status = getItemStatus(item);
  if (status) return status;

  if (Number.isFinite(Number(item?.wordCount)) && Number(item.wordCount) > 0) {
    return `${item.wordCount} 字`;
  }

  return getItemTypeLabel(item);
}

const getItemLinkState = (item) => {
  return trimText(item?.url) ? 'linked' : 'plain';
};

function getItemPosition(item, index, itemCount) {
  const x = item?.position?.x ?? item?.x;
  const y = item?.position?.y ?? item?.y;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y };
  }
  const columns = getGridColumns(itemCount);
  const row = Math.floor(index / columns);
  const column = index % columns;
  return {
    x: column * GRID_GAP_X + (row % 2 === 0 ? 0 : GRID_STAGGER_OFFSET_X),
    y: row * GRID_GAP_Y,
  };
}

function getGridColumns(itemCount) {
  if (itemCount <= GRID_NARROW_THRESHOLD) return GRID_COLUMNS_NARROW;
  if (itemCount <= GRID_MEDIUM_THRESHOLD) return GRID_COLUMNS_MEDIUM;
  return GRID_COLUMNS_WIDE;
}

function buildNodeData(item, index) {
  return {
    id: getItemId(item, index),
    sourceId: String(item?.sourceId ?? item?.fileId ?? item?.id ?? getItemId(item, index)),
    title: getItemTitle(item, index),
    summary: getItemSummary(item),
    typeLabel: getItemTypeLabel(item),
    metaLine: getItemMetaLine(item),
    nodeType: trimText(item?.nodeType ?? item?.type) || 'document',
    tags: getItemTags(item),
    platforms: getItemPlatforms(item),
    status: getItemStatus(item),
    url: trimText(item?.url),
    linkState: getItemLinkState(item),
    wordCount: Number(item?.wordCount) || 0,
    raw: item,
  };
}

function mapItemsToNodes(items) {
  const list = Array.isArray(items) ? items : [];
  return list.map((item, index) => ({
    id: getItemId(item, index),
    type: 'canvasCard',
    position: getItemPosition(item, index, list.length),
    data: buildNodeData(item, index),
    sourcePosition: Position.Right,
    targetPosition: Position.Left,
    className: 'canvas-node',
    style: { width: NODE_WIDTH, minHeight: 172 },
  }));
}

function mapEdges(edges) {
  return (Array.isArray(edges) ? edges : [])
    .filter((edge) => (edge?.source ?? edge?.source_id) && (edge?.target ?? edge?.target_id))
    .map((edge, index) => ({
      id: String(edge.id ?? `${edge.source ?? edge.source_id}-${edge.target ?? edge.target_id}-${index}`),
      source: String(edge.source ?? edge.source_id),
      target: String(edge.target ?? edge.target_id),
      label: trimText(edge.label),
      type: edge.type ?? 'step',
      markerEnd: { type: MarkerType.ArrowClosed },
      data: edge.data ?? null,
    }));
}

function buildTypeOptions(items) {
  const values = Array.from(new Set(
    items.map((item) => trimText(item?.nodeType ?? item?.type)).filter(Boolean),
  ));
  return [
    { value: ALL_FILTER_VALUE, label: '全部类型' },
    ...values.map((value) => ({ value, label: value })),
  ];
}

function buildTagOptions(items) {
  const values = Array.from(new Set(
    items.flatMap((item) => getItemTags(item)),
  ));
  return [
    { value: ALL_FILTER_VALUE, label: '全部标签' },
    ...values.map((value) => ({ value, label: value })),
  ];
}

function matchesFilters(item, filters) {
  const itemType = trimText(item?.nodeType ?? item?.type) || 'document';
  const itemTags = getItemTags(item);
  const linkState = getItemLinkState(item);
  const title = getItemTitle(item, 0).toLowerCase();
  const titleKeyword = trimText(filters.title).toLowerCase();

  if (filters.type !== ALL_FILTER_VALUE && itemType !== filters.type) return false;
  if (filters.tag !== ALL_FILTER_VALUE && !itemTags.includes(filters.tag)) return false;
  if (filters.link !== ALL_FILTER_VALUE && linkState !== filters.link) return false;
  if (titleKeyword && !title.includes(titleKeyword)) return false;
  return true;
}

function filterEdgesByVisibleNodes(edges, visibleItems) {
  const visibleIds = new Set(visibleItems.map((item) => String(item.id)));
  return (edges ?? []).filter((edge) => {
    const sourceId = String(edge?.source ?? edge?.source_id ?? '');
    const targetId = String(edge?.target ?? edge?.target_id ?? '');
    return visibleIds.has(sourceId) && visibleIds.has(targetId);
  });
}

function serializeNodes(nodes) {
  return nodes.map((node) => ({
    id: node.id,
    sourceId: node.data?.sourceId ?? node.id,
    position: node.position,
    title: node.data?.title,
    summary: node.data?.summary,
    typeLabel: node.data?.typeLabel,
    metaLine: node.data?.metaLine,
    nodeType: node.data?.nodeType,
    tags: node.data?.tags ?? [],
    platforms: node.data?.platforms ?? [],
    status: node.data?.status ?? '',
    url: node.data?.url ?? '',
    wordCount: node.data?.wordCount ?? 0,
    raw: node.data?.raw ?? null,
  }));
}

function serializeEdges(edges) {
  return edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    source_id: edge.source,
    target_id: edge.target,
    label: edge.label ?? '',
    type: edge.type ?? 'step',
    data: edge.data ?? null,
  }));
}

function mergeVisibleNodeChanges(allNodes, visibleNodes) {
  const visibleBySourceId = new Map(
    serializeNodes(visibleNodes).map((node) => [String(node.sourceId ?? node.id), node]),
  );
  return serializeNodes(allNodes).map((node) => {
    return visibleBySourceId.get(String(node.sourceId ?? node.id)) ?? node;
  });
}

function mergeVisibleEdgeChanges(allEdges, visibleEdges, visibleItems) {
  const visibleIds = new Set(visibleItems.map((item) => String(item.id)));
  const hiddenEdges = serializeEdges(allEdges).filter((edge) => {
    return !(visibleIds.has(String(edge.source)) && visibleIds.has(String(edge.target)));
  });
  return [...hiddenEdges, ...serializeEdges(visibleEdges)];
}

function buildSerializedNodes(items) {
  return serializeNodes(mapItemsToNodes(items));
}

function filterLibraryItems(items, query) {
  const keyword = trimText(query).toLowerCase();
  if (!keyword) return items;

  return items.filter((item, index) => {
    const title = getItemTitle(item, index).toLowerCase();
    const summary = getItemSummary(item).toLowerCase();
    return title.includes(keyword) || summary.includes(keyword);
  });
}

const CanvasCardNode = memo(function CanvasCardNode({ data }) {
  const chips = data.tags.filter(Boolean);
  const sourceText = data.url ? data.url.replace(/^https?:\/\//, '') : '';

  return (
    <Card size="small" bordered={false} className="canvas-node-card" title={null}>
      <Handle
        type="target"
        position={Position.Left}
        id="target"
        className="canvas-node-handle canvas-node-handle--target"
        style={{ left: HANDLE_OFFSET }}
      />
      <Handle
        type="source"
        position={Position.Right}
        id="source"
        className="canvas-node-handle canvas-node-handle--source"
        style={{ right: HANDLE_OFFSET }}
      />
      <Tag bordered={false} className="canvas-node-type">
        {data.typeLabel}
      </Tag>
      <Typography.Title level={3} className="canvas-node-title" title={data.title}>
        {data.title}
      </Typography.Title>
      <Typography.Text className="canvas-node-metaLine" title={data.metaLine}>
        {data.metaLine}
      </Typography.Text>
      <Typography.Paragraph className="canvas-node-summary" ellipsis={{ rows: 2 }}>
        {data.summary}
      </Typography.Paragraph>
      {chips.length > 0 ? (
        <div className="canvas-node-tags">
          {chips.map((value, index) => (
            <Tag key={`${data.id}-chip-${index}`} bordered={false} className="canvas-node-tag">
              {value}
            </Tag>
          ))}
        </div>
      ) : null}
      {sourceText ? (
        <Typography.Text className="canvas-node-source" title={data.url} ellipsis>
          {sourceText}
        </Typography.Text>
      ) : null}
    </Card>
  );
});

function CanvasToolbar({
  filters,
  hasCanvasContent,
  isFullscreen,
  titleDraft,
  typeOptions,
  tagOptions,
  onClearCanvas,
  onFilterChange,
  onToggleFullscreen,
  onTitleDraftChange,
  onResetFilters,
}) {
  const filterPanel = (
    <div className="canvas-filter-panel">
      <Select
        size="small"
        className="canvas-filter-select"
        value={filters.type}
        options={typeOptions}
        onChange={(value) => onFilterChange('type', value)}
      />
      <Select
        size="small"
        className="canvas-filter-select"
        value={filters.tag}
        options={tagOptions}
        onChange={(value) => onFilterChange('tag', value)}
      />
      <Select
        size="small"
        className="canvas-filter-select"
        value={filters.link}
        options={LINK_FILTER_OPTIONS}
        onChange={(value) => onFilterChange('link', value)}
      />
      <Input
        size="small"
        className="canvas-filter-input"
        value={titleDraft}
        placeholder="筛选标题"
        onChange={(event) => onTitleDraftChange(event.target.value)}
        allowClear
      />
      <Button size="small" className="canvas-filter-reset" onClick={onResetFilters}>
        重置筛选
      </Button>
    </div>
  );

  return (
    <header className="canvas-floating-controls" aria-label="白板工具栏">
      <Popover
        trigger="click"
        placement="leftTop"
        overlayClassName="canvas-filter-popover"
        content={filterPanel}
      >
        <Button
          size="small"
          className="canvas-toolbar-action"
          icon={<Filter size={14} strokeWidth={1.8} />}
          title="筛选画布卡片"
          aria-label="筛选画布卡片"
        />
      </Popover>
        <Popconfirm
          title="清空当前画布？"
          description="会移除画布里的全部卡片、连线和视角位置。"
          okText="清空"
          cancelText="取消"
          okButtonProps={{ danger: true }}
          disabled={!hasCanvasContent}
          onConfirm={onClearCanvas}
        >
          <Button
            size="small"
            danger
            disabled={!hasCanvasContent}
            className="canvas-toolbar-action canvas-toolbar-action-danger"
            icon={<Eraser size={14} strokeWidth={1.8} />}
            title="一键清空当前画布"
            aria-label="一键清空当前画布"
          />
        </Popconfirm>
        <Button
          size="small"
          className="canvas-toolbar-action"
          icon={isFullscreen ? <Minimize2 size={14} strokeWidth={1.8} /> : <Maximize2 size={14} strokeWidth={1.8} />}
          onClick={onToggleFullscreen}
          aria-pressed={isFullscreen}
          title={isFullscreen ? '退出全屏' : '全屏显示'}
        >
        </Button>
    </header>
  );
}

const NODE_TYPES = { canvasCard: CanvasCardNode };

function CanvasFlowPanel({
  flowNodes,
  flowEdges,
  savedViewport,
  onNodesChange,
  onEdgesChange,
  onConnect,
  onEdgeDoubleClick,
  onNodeDoubleClick,
  onViewportChange,
}) {
  const { fitView, getViewport } = useReactFlow();
  const didInitialFitRef = useRef(false);

  useEffect(() => {
    if (savedViewport || didInitialFitRef.current || !flowNodes.length) return;
    didInitialFitRef.current = true;
    requestAnimationFrame(() => {
      fitView({
        padding: INITIAL_FIT_PADDING,
        minZoom: INITIAL_FIT_MIN_ZOOM,
        maxZoom: INITIAL_FIT_MAX_ZOOM,
      }).then(() => {
        onViewportChange?.(getViewport());
      });
    });
  }, [flowNodes.length, fitView, getViewport, onViewportChange, savedViewport]);

  const handleMoveEnd = useCallback((_event, viewport) => {
    onViewportChange?.(viewport);
  }, [onViewportChange]);

  return (
    <ReactFlow
      nodes={flowNodes}
      edges={flowEdges}
      nodeTypes={NODE_TYPES}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onConnect={onConnect}
      onEdgeDoubleClick={onEdgeDoubleClick}
      onNodeDoubleClick={onNodeDoubleClick}
      onMoveEnd={handleMoveEnd}
      defaultViewport={savedViewport ?? undefined}
      minZoom={0.2}
      maxZoom={2}
      panOnDrag
      zoomOnScroll
      zoomOnPinch
      proOptions={{ hideAttribution: true }}
    >
      {flowNodes.length ? (
        <MiniMap
          pannable
          zoomable
          nodeBorderRadius={8}
          maskColor="rgba(15, 23, 42, 0.08)"
          style={{ background: 'rgba(255, 255, 255, 0.92)' }}
        />
      ) : null}
      <Controls position="top-right" showInteractive={false} />
      <Background gap={20} size={1} color="var(--canvas-grid-color)" />
    </ReactFlow>
  );
}

function CanvasSurfaceInner({
  documents,
  items,
  addableItems,
  edges,
  viewport,
  onChange,
  onClearCanvas,
  onViewportChange,
  onOpenFile,
  emptyText = '先从右上角候选列表选择内容，开始灵感之旅吧',
}) {
  const sourceItems = items ?? documents ?? [];
  const libraryItems = addableItems ?? documents ?? [];
  const [isLibraryOpen, setIsLibraryOpen] = useState(DEFAULT_LIBRARY_OPEN);
  const [filters, setFilters] = useState({
    type: ALL_FILTER_VALUE,
    tag: ALL_FILTER_VALUE,
    link: ALL_FILTER_VALUE,
    title: '',
  });
  const [titleDraft, setTitleDraft] = useState('');
  const [libraryQuery, setLibraryQuery] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const allCanvasNodes = useMemo(() => mapItemsToNodes(sourceItems), [sourceItems]);
  const allCanvasEdges = useMemo(() => mapEdges(edges), [edges]);
  const typeOptions = useMemo(() => buildTypeOptions(sourceItems), [sourceItems]);
  const tagOptions = useMemo(() => buildTagOptions(sourceItems), [sourceItems]);
  const filteredItems = useMemo(() => {
    return sourceItems.filter((item) => matchesFilters(item, filters));
  }, [filters, sourceItems]);
  const addedItemIds = useMemo(() => {
    return new Set(sourceItems.map((item) => String(item?.sourceId ?? item?.id)));
  }, [sourceItems]);
  const filteredLibraryItems = useMemo(() => {
    return filterLibraryItems(libraryItems, libraryQuery);
  }, [libraryItems, libraryQuery]);
  const filteredEdges = useMemo(() => {
    return filterEdgesByVisibleNodes(edges, filteredItems);
  }, [edges, filteredItems]);
  const controlledNodes = useMemo(() => mapItemsToNodes(filteredItems), [filteredItems]);
  const controlledEdges = useMemo(() => mapEdges(filteredEdges), [filteredEdges]);
  const [flowNodes, setFlowNodes] = useNodesState(controlledNodes);
  const [flowEdges, setFlowEdges] = useEdgesState(controlledEdges);
  const isSyncingRef = useRef(false);
  const titleFilterTimerRef = useRef(null);
  const hasActiveFilters = useMemo(() => {
    return (
      filters.type !== ALL_FILTER_VALUE
      || filters.tag !== ALL_FILTER_VALUE
      || filters.link !== ALL_FILTER_VALUE
      || Boolean(trimText(filters.title))
    );
  }, [filters]);
  const hasCanvasContent = allCanvasNodes.length > 0 || allCanvasEdges.length > 0 || Boolean(viewport);
  const emptyStateText = hasActiveFilters
    ? '当前筛选条件下没有命中内容。可以重置筛选，或换一个标签、类型或标题关键词。'
    : emptyText;

  useEffect(() => {
    return () => {
      if (titleFilterTimerRef.current) {
        window.clearTimeout(titleFilterTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isFullscreen) {
      document.body.classList.remove('canvas-fullscreen-active');
      return undefined;
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsFullscreen(false);
      }
    };

    document.body.classList.add('canvas-fullscreen-active');
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      document.body.classList.remove('canvas-fullscreen-active');
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFullscreen]);

  useEffect(() => {
    isSyncingRef.current = true;
    setFlowNodes(controlledNodes);
    setFlowEdges(controlledEdges);
  }, [controlledEdges, controlledNodes, setFlowEdges, setFlowNodes]);

  useEffect(() => {
    if (isSyncingRef.current) {
      isSyncingRef.current = false;
      return;
    }
    onChange?.(
      mergeVisibleNodeChanges(allCanvasNodes, flowNodes),
      mergeVisibleEdgeChanges(allCanvasEdges, flowEdges, filteredItems),
    );
  }, [allCanvasEdges, allCanvasNodes, filteredItems, flowEdges, flowNodes, onChange]);

  const handleNodesChange = useCallback((changes) => {
    setFlowNodes((currentNodes) => applyNodeChanges(changes, currentNodes));
  }, [setFlowNodes]);

  const handleEdgesChange = useCallback((changes) => {
    setFlowEdges((currentEdges) => applyEdgeChanges(changes, currentEdges));
  }, [setFlowEdges]);

  const handleConnect = useCallback((connection) => {
    setFlowEdges((currentEdges) => addEdge({
      ...connection,
      type: 'step',
      markerEnd: { type: MarkerType.ArrowClosed },
    }, currentEdges));
  }, [setFlowEdges]);

  const handleEdgeDoubleClick = useCallback((event, edge) => {
    event.preventDefault();
    setFlowEdges((currentEdges) => currentEdges.filter((item) => item.id !== edge.id));
  }, [setFlowEdges]);

  const handleNodeDoubleClick = useCallback((event, node) => {
    event.preventDefault();
    onOpenFile?.(node.data?.sourceId ?? node.id);
  }, [onOpenFile]);

  const handlePaneDoubleClick = useCallback((event) => {
    if (!event.target?.classList?.contains(REACT_FLOW_PANE_CLASS)) return;
    event.preventDefault();
    setIsLibraryOpen(true);
  }, []);

  const handleFilterChange = useCallback((key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
  }, []);

  const handleTitleDraftChange = useCallback((value) => {
    setTitleDraft(value);
    if (titleFilterTimerRef.current) {
      window.clearTimeout(titleFilterTimerRef.current);
    }
    titleFilterTimerRef.current = window.setTimeout(() => {
      setFilters((current) => ({ ...current, title: value }));
      titleFilterTimerRef.current = null;
    }, TITLE_FILTER_DEBOUNCE_MS);
  }, []);

  const handleResetFilters = useCallback(() => {
    if (titleFilterTimerRef.current) {
      window.clearTimeout(titleFilterTimerRef.current);
      titleFilterTimerRef.current = null;
    }
    setTitleDraft('');
    setFilters({
      type: ALL_FILTER_VALUE,
      tag: ALL_FILTER_VALUE,
      link: ALL_FILTER_VALUE,
      title: '',
    });
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setIsLibraryOpen(false);
    setIsFullscreen((current) => !current);
  }, []);

  const handleAddItem = useCallback((item) => {
    const targetId = String(item?.sourceId ?? item?.id ?? '');
    if (!targetId || addedItemIds.has(targetId)) return;

    const nextItems = [...sourceItems, item];
    onChange?.(buildSerializedNodes(nextItems), serializeEdges(allCanvasEdges));
  }, [addedItemIds, allCanvasEdges, onChange, sourceItems]);

  const handleRemoveItem = useCallback((itemId) => {
    const targetId = String(itemId ?? '');
    if (!targetId) return;

    const nextItems = sourceItems.filter((item) => String(item?.sourceId ?? item?.id) !== targetId);
    const nextEdges = serializeEdges(allCanvasEdges).filter((edge) => {
      return String(edge.source) !== targetId && String(edge.target) !== targetId;
    });

    onChange?.(buildSerializedNodes(nextItems), nextEdges);
  }, [allCanvasEdges, onChange, sourceItems]);

  const libraryPanel = (
    <div className="canvas-library">
      <div className="canvas-library-head">
        <div className="canvas-library-head-copy">
          <Typography.Title level={4} className="canvas-library-title">
            候选卡片
          </Typography.Title>
          <Typography.Paragraph className="canvas-library-subtitle">
            从列表里挑内容加入画布，按你的节奏搭灵感链路。
          </Typography.Paragraph>
        </div>
        <Tag bordered={false} className="canvas-library-count">
          {filteredLibraryItems.length} 项
        </Tag>
      </div>

      <Input
        size="small"
        value={libraryQuery}
        className="canvas-library-search"
        placeholder="搜索候选卡片"
        onChange={(event) => setLibraryQuery(event.target.value)}
        allowClear
      />

      <div className="canvas-library-list">
        {filteredLibraryItems.length ? filteredLibraryItems.map((item, index) => {
          const itemId = String(item?.sourceId ?? item?.id ?? `library-${index}`);
          const added = addedItemIds.has(itemId);

          return (
            <article key={itemId} className={`canvas-library-item${added ? ' is-added' : ''}`}>
              <div className="canvas-library-item-copy">
                <div className="canvas-library-item-head">
                  <strong>{getItemTitle(item, index)}</strong>
                  <span>{getItemTypeLabel(item)}</span>
                </div>
                <p>{getItemSummary(item)}</p>
              </div>
              <Button
                size="small"
                type={added ? 'default' : 'primary'}
                onClick={() => (added ? handleRemoveItem(itemId) : handleAddItem(item))}
              >
                {added ? '移出画布' : '加入画布'}
              </Button>
            </article>
          );
        }) : (
          <div className="canvas-library-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的候选卡片" />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <section
      className={`canvas-surface${isFullscreen ? ' canvas-surface--fullscreen' : ''}`}
      data-testid="canvas-surface"
    >
      <div className="canvas-stage">
        <div className="canvas-titlebar" aria-label={CANVAS_TITLE}>
          {CANVAS_TITLE}
        </div>
        <CanvasToolbar
          filters={filters}
          hasCanvasContent={hasCanvasContent}
          isFullscreen={isFullscreen}
          titleDraft={titleDraft}
          typeOptions={typeOptions}
          tagOptions={tagOptions}
          onClearCanvas={onClearCanvas}
          onFilterChange={handleFilterChange}
          onToggleFullscreen={handleToggleFullscreen}
          onTitleDraftChange={handleTitleDraftChange}
          onResetFilters={handleResetFilters}
        />
        <Popover
          trigger="click"
          placement="top"
          overlayClassName="canvas-library-popover"
          content={libraryPanel}
          open={isLibraryOpen}
          onOpenChange={setIsLibraryOpen}
        >
          <Button
            type="text"
            className="canvas-add-dock"
            icon={<FileText size={22} strokeWidth={1.7} />}
            title="加入卡片"
            aria-label="加入卡片"
          />
        </Popover>
        <div className="canvas-flow" onDoubleClick={handlePaneDoubleClick}>
          {!flowNodes.length ? (
            <div className="canvas-center-help">
              <div className="canvas-center-help-title">{emptyStateText}</div>
              {CANVAS_EMPTY_HINTS.map((hint) => (
                <div key={hint} className="canvas-center-help-line">{hint}</div>
              ))}
            </div>
          ) : null}
          <CanvasFlowPanel
            flowNodes={flowNodes}
            flowEdges={flowEdges}
            savedViewport={viewport}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            onViewportChange={onViewportChange}
          />
        </div>
      </div>
    </section>
  );
}

export default function CanvasSurface(props) {
  return (
    <ReactFlowProvider>
      <CanvasSurfaceInner {...props} />
    </ReactFlowProvider>
  );
}
