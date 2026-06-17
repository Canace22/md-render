import { describe, expect, it } from 'vitest';
import {
  buildCanvasItemsFromAgentCards,
  buildCanvasSceneFromAgentGraph,
  countRenderableCanvasCards,
} from '../renderer/src/utils/excalidrawCanvas.js';

describe('buildCanvasItemsFromAgentCards', () => {
  it('fills defaults and keeps explicit positions', () => {
    const items = buildCanvasItemsFromAgentCards([
      { title: '起点', summary: '开始', x: 120, y: 80 },
      { id: 'decision', title: '判断', typeLabel: '分支' },
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      sourceId: 'agent-card-1',
      title: '起点',
      summary: '开始',
      typeLabel: '卡片',
      position: { x: 120, y: 80 },
    });
    expect(items[1]).toMatchObject({
      sourceId: 'decision',
      title: '判断',
      typeLabel: '分支',
    });
  });
});

describe('buildCanvasSceneFromAgentGraph', () => {
  it('builds a canvas scene with cards and arrows', () => {
    const scene = buildCanvasSceneFromAgentGraph({
      cards: [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
      edges: [
        { source: 'a', target: 'b', label: 'to B' },
        { source: 'A', target: 'C' },
      ],
    });

    expect(scene.engine).toBe('excalidraw');
    expect(scene.nodes).toEqual([]);
    expect(scene.edges).toEqual([]);
    const arrows = scene.excalidraw.elements.filter((element) => element.type === 'arrow');
    expect(arrows.length).toBe(2);
    expect(arrows[0].startBinding).not.toBeNull();
    expect(arrows[0].endBinding).not.toBeNull();
    expect(arrows[0].points[1][0]).toBeGreaterThan(0);
    expect(countRenderableCanvasCards(scene.excalidraw.elements)).toBe(3);
  });
});
