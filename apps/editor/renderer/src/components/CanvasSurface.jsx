import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Select } from 'antd';
import {
  ReactFlow,
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

const NODE_WIDTH = 252;
const GRID_COLUMNS = 4;
const GRID_GAP_X = 284;
const GRID_GAP_Y = 176;
const HANDLE_OFFSET = -8;
const ALL_FILTER_VALUE = '__all__';
const TITLE_FILTER_DEBOUNCE_MS = 360;
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

function getItemPosition(item, index) {
  const x = item?.position?.x ?? item?.x;
  const y = item?.position?.y ?? item?.y;
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y };
  }
  return {
    x: (index % GRID_COLUMNS) * GRID_GAP_X,
    y: Math.floor(index / GRID_COLUMNS) * GRID_GAP_Y,
  };
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
  return (Array.isArray(items) ? items : []).map((item, index) => ({
    id: getItemId(item, index),
    type: 'canvasCard',
    position: getItemPosition(item, index),
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

const CanvasCardNode = memo(function CanvasCardNode({ data }) {
  const chips = data.tags.filter(Boolean);
  const sourceText = data.url ? data.url.replace(/^https?:\/\//, '') : '';

  return (
    <div className="canvas-node-card" title={data.title}>
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
      <div className="canvas-node-type">{data.typeLabel}</div>
      <h3 className="canvas-node-title">{data.title}</h3>
      <div className="canvas-node-metaLine">{data.metaLine}</div>
      <p className="canvas-node-summary">{data.summary}</p>
      {chips.length > 0 ? (
        <div className="canvas-node-tags">
          {chips.map((value, index) => (
            <span key={`${data.id}-chip-${index}`} className="canvas-node-tag">
              {value}
            </span>
          ))}
        </div>
      ) : null}
      {sourceText ? (
        <div className="canvas-node-source" title={data.url}>
          {sourceText}
        </div>
      ) : null}
    </div>
  );
});

function CanvasToolbar({
  itemCount,
  edgeCount,
  bookmarkCount,
  filters,
  titleDraft,
  typeOptions,
  tagOptions,
  onFilterChange,
  onTitleDraftChange,
  onResetFilters,
}) {
  return (
    <header className="canvas-toolbar">
      <div className="canvas-toolbar-main">
        <span className="canvas-toolbar-kicker">Canvas Workspace</span>
        <h2 className="canvas-toolbar-title">内容画布</h2>
        <p className="canvas-toolbar-desc">
          保持现在的底色不变，把内容节点和关系线收成更清楚的内容流程图。
        </p>
      </div>
      <div className="canvas-toolbar-side">
        <div className="canvas-toolbar-filters">
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
            重置
          </Button>
        </div>
        <div className="canvas-toolbar-stats">
          <div className="canvas-stat">
            <span className="canvas-stat-label">卡片</span>
            <strong className="canvas-stat-value">{itemCount}</strong>
          </div>
          <div className="canvas-stat">
            <span className="canvas-stat-label">连线</span>
            <strong className="canvas-stat-value">{edgeCount}</strong>
          </div>
          <div className="canvas-stat">
            <span className="canvas-stat-label">书签</span>
            <strong className="canvas-stat-value">{bookmarkCount}</strong>
          </div>
        </div>
        <div className="canvas-toolbar-hint">双击节点打开原文档，双击连线可删除</div>
      </div>
    </header>
  );
}

const NODE_TYPES = { canvasCard: CanvasCardNode };

function CanvasSurfaceInner({
  documents,
  items,
  edges,
  onChange,
  onOpenFile,
  emptyText = '暂无可展示的内容。',
}) {
  const sourceItems = items ?? documents ?? [];
  const [filters, setFilters] = useState({
    type: ALL_FILTER_VALUE,
    tag: ALL_FILTER_VALUE,
    link: ALL_FILTER_VALUE,
    title: '',
  });
  const [titleDraft, setTitleDraft] = useState('');
  const allCanvasNodes = useMemo(() => mapItemsToNodes(sourceItems), [sourceItems]);
  const allCanvasEdges = useMemo(() => mapEdges(edges), [edges]);
  const typeOptions = useMemo(() => buildTypeOptions(sourceItems), [sourceItems]);
  const tagOptions = useMemo(() => buildTagOptions(sourceItems), [sourceItems]);
  const filteredItems = useMemo(() => {
    return sourceItems.filter((item) => matchesFilters(item, filters));
  }, [filters, sourceItems]);
  const filteredEdges = useMemo(() => {
    return filterEdgesByVisibleNodes(edges, filteredItems);
  }, [edges, filteredItems]);
  const controlledNodes = useMemo(() => mapItemsToNodes(filteredItems), [filteredItems]);
  const controlledEdges = useMemo(() => mapEdges(filteredEdges), [filteredEdges]);
  const bookmarkCount = useMemo(
    () => filteredItems.filter((item) => trimText(item?.nodeType ?? item?.type) === 'bookmark').length,
    [filteredItems],
  );
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

  return (
    <section className="canvas-surface" data-testid="canvas-surface">
      <CanvasToolbar
        itemCount={flowNodes.length}
        edgeCount={flowEdges.length}
        bookmarkCount={bookmarkCount}
        filters={filters}
        titleDraft={titleDraft}
        typeOptions={typeOptions}
        tagOptions={tagOptions}
        onFilterChange={handleFilterChange}
        onTitleDraftChange={handleTitleDraftChange}
        onResetFilters={handleResetFilters}
      />
      {flowNodes.length ? (
        <div className="canvas-flow">
          <div className="canvas-flow-callout">
            提示：拖拽排布节点，用左右锚点连线，适合整理“素材 -> 稿件 -> 发布”的内容链路。
          </div>
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={NODE_TYPES}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={handleConnect}
            onEdgeDoubleClick={handleEdgeDoubleClick}
            onNodeDoubleClick={handleNodeDoubleClick}
            fitView
            fitViewOptions={{ padding: 0.08, maxZoom: 0.92 }}
            minZoom={0.2}
            maxZoom={2}
            panOnDrag
            zoomOnScroll
            zoomOnPinch
            proOptions={{ hideAttribution: true }}
          >
            <MiniMap
              pannable
              zoomable
              nodeBorderRadius={8}
              maskColor="rgba(15, 23, 42, 0.08)"
              style={{ background: 'rgba(255, 255, 255, 0.92)' }}
            />
            <Controls showInteractive />
            <Background gap={20} size={1} color="rgba(100, 116, 139, 0.18)" />
          </ReactFlow>
        </div>
      ) : (
        <div className="canvas-empty-state">
          <strong className="canvas-empty-state-title">画布还没有内容</strong>
          <p className="canvas-empty-state-text">{emptyStateText}</p>
        </div>
      )}
    </section>
  );
}

export default function CanvasSurface(props) {
  return <CanvasSurfaceInner {...props} />;
}
