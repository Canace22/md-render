import { useEffect, useRef } from 'react';
import { drag } from 'd3-drag';
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation } from 'd3-force';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';

const NODE_R = 14;
const TYPE_COLORS = {
  concept: '#4a9eff',
  method: '#ff9f43',
  tech: '#2ed573',
  component: '#ff6b6b',
  document: '#a29bfe',
};
const TYPE_LABELS = {
  concept: '概念',
  method: '方法',
  tech: '技术',
  component: '组件',
  document: '文档',
};

function truncate(name, max = 12) {
  const s = (name ?? '').replace(/\.md$/i, '');
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function GraphView({ nodes = [], edges = [], selectedId, onOpenFile }) {
  const containerRef = useRef(null);
  // Keep latest callback in a ref so the effect doesn't need to re-run when it changes
  const onOpenFileRef = useRef(onOpenFile);
  useEffect(() => { onOpenFileRef.current = onOpenFile; }, [onOpenFile]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();
    const W = width || 800;
    const H = height || 560;

    // Clear any previous render
    select(container).selectAll('*').remove();

    if (!nodes.length) {
      select(container)
        .append('div')
        .attr('class', 'graph-empty-hint')
        .text('暂无文档数据，保存文档后图谱会自动更新。');
      return;
    }

    const svg = select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', '100%')
      .attr('aria-label', '知识图谱');

    // Defs: arrowhead
    const defs = svg.append('defs');
    defs.append('marker')
      .attr('id', 'arrow')
      .attr('viewBox', '0 -4 8 8')
      .attr('refX', NODE_R + 9)
      .attr('markerWidth', 6)
      .attr('markerHeight', 6)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-4L8,0L0,4')
      .attr('fill', 'rgba(100,116,139,0.5)');

    const g = svg.append('g');

    // Zoom + pan
    const zoomBehavior = zoom()
      .scaleExtent([0.08, 5])
      .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoomBehavior);
    // Initial view: center the graph
    svg.call(zoomBehavior.transform, zoomIdentity.translate(W / 2, H / 2).scale(0.75));

    // Build simulation data
    const nodeIds = new Set(nodes.map((n) => n.id));
    const simNodes = nodes.map((n) => ({ ...n }));
    const simLinks = edges
      .filter((e) => nodeIds.has(e.source_id) && nodeIds.has(e.target_id))
      .map((e) => ({ source: e.source_id, target: e.target_id }));

    const degreeMap = new Map();
    for (const e of simLinks) {
      degreeMap.set(e.source, (degreeMap.get(e.source) ?? 0) + 1);
      degreeMap.set(e.target, (degreeMap.get(e.target) ?? 0) + 1);
    }

    const sim = forceSimulation(simNodes)
      .force('link', forceLink(simLinks).id((d) => d.id).distance(90).strength(0.5))
      .force('charge', forceManyBody().strength(-220))
      .force('center', forceCenter(0, 0))
      .force('collision', forceCollide(NODE_R + 5));

    // Draw links
    const linkGroup = g.append('g').attr('class', 'graph-links');
    const linkEl = linkGroup.selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', 'rgba(100,116,139,0.3)')
      .attr('stroke-width', 1.2)
      .attr('marker-end', 'url(#arrow)');

    // Draw nodes
    const nodeGroup = g.append('g').attr('class', 'graph-nodes');
    const nodeEl = nodeGroup.selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(
        drag()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on('drag', (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      )
      .on('click', (event, d) => {
        event.stopPropagation();
        onOpenFileRef.current?.(d.id);
      });

    nodeEl.append('circle')
      .attr('r', (d) => {
        const deg = degreeMap.get(d.id) ?? 0;
        return NODE_R + Math.min(deg * 1.5, 10);
      })
      .attr('fill', (d) => TYPE_COLORS[d.node_type] ?? TYPE_COLORS.document)
      .attr('fill-opacity', 0.82)
      .attr('stroke', (d) => (d.id === selectedId ? '#fff' : 'rgba(255,255,255,0.25)'))
      .attr('stroke-width', (d) => (d.id === selectedId ? 2.5 : 1));

    // Selected node: outer ring
    nodeEl.filter((d) => d.id === selectedId)
      .append('circle')
      .attr('r', (d) => {
        const deg = degreeMap.get(d.id) ?? 0;
        return NODE_R + Math.min(deg * 1.5, 10) + 5;
      })
      .attr('fill', 'none')
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)
      .attr('stroke-opacity', 0.6);

    nodeEl.append('text')
      .text((d) => truncate(d.name))
      .attr('dy', (d) => NODE_R + Math.min((degreeMap.get(d.id) ?? 0) * 1.5, 10) + 13)
      .attr('text-anchor', 'middle')
      .attr('font-size', 10)
      .attr('fill', 'var(--color-text-secondary, #64748b)')
      .attr('pointer-events', 'none');

    // Tooltip
    nodeEl.append('title').text((d) => d.name.replace(/\.md$/i, ''));

    // Tick
    sim.on('tick', () => {
      linkEl
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y);
      nodeEl.attr('transform', (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
    });

    // Double-click to reset zoom
    svg.on('dblclick.zoom', null);
    svg.on('dblclick', () => {
      svg.transition().duration(400)
        .call(zoomBehavior.transform, zoomIdentity.translate(W / 2, H / 2).scale(0.75));
    });

    return () => {
      sim.stop();
      select(container).selectAll('*').remove();
    };
  }, [nodes, edges, selectedId]);

  return (
    <div className="graph-view-wrapper">
      <div ref={containerRef} className="graph-view-canvas" />
      <div className="graph-view-legend">
        {Object.entries(TYPE_COLORS).map(([type, color]) => (
          <span key={type} className="graph-legend-item">
            <span className="graph-legend-dot" style={{ background: color }} />
            {TYPE_LABELS[type] ?? type}
          </span>
        ))}
        <span className="graph-legend-hint">滚轮缩放 · 拖动节点 · 双击重置</span>
      </div>
    </div>
  );
}
