import { describe, expect, it } from 'vitest';
import { CARD_CANVAS_PATH, EXCALIDRAW_CANVAS_PATH, parseCanvasFiles, serializeCanvasState } from '../shared/migration/canvasFormat.js';

const filesToInput = (files) => ({
  canvasContent: files.find((f) => f.relativePath === CARD_CANVAS_PATH)?.content ?? '',
  excalidrawContent: files.find((f) => f.relativePath === EXCALIDRAW_CANVAS_PATH)?.content ?? '',
});

describe('白板 ↔ 文件', () => {
  it('卡片引擎写成 JSON Canvas，往返一致', () => {
    const state = {
      nodes: [
        { id: 'canvas-a', sourceId: 'doc-a', position: { x: 10, y: 20 }, title: '选题', content: '正文', status: 'idea', tags: ['工具'] },
        { id: 'canvas-b', sourceId: 'doc-b', position: { x: 300, y: 20 } },
      ],
      edges: [{ id: 'e1', source: 'canvas-a', target: 'canvas-b', label: '引出', relationType: 'related' }],
      viewport: { x: 1, y: 2, zoom: 1.2 },
    };
    const files = serializeCanvasState(state);
    expect(files.map((f) => f.relativePath)).toEqual([CARD_CANVAS_PATH]);
    const doc = JSON.parse(files[0].content);
    expect(doc.nodes[0]).toMatchObject({ id: 'canvas-a', type: 'text', x: 10, y: 20, text: '**选题**\n\n正文' });
    expect(doc.edges[0]).toMatchObject({ fromNode: 'canvas-a', toNode: 'canvas-b', label: '引出' });
    expect(parseCanvasFiles(filesToInput(files))).toEqual({ canvasState: state, errors: [] });
  });

  it('Excalidraw 引擎写成 .excalidraw，往返一致', () => {
    const state = {
      nodes: [],
      edges: [],
      engine: 'excalidraw',
      excalidraw: { elements: [{ id: 'r1', type: 'rectangle' }], appState: { viewBackgroundColor: '#fff' }, files: {} },
    };
    const files = serializeCanvasState(state);
    expect(files.map((f) => f.relativePath)).toEqual([EXCALIDRAW_CANVAS_PATH]);
    expect(JSON.parse(files[0].content)).toMatchObject({ type: 'excalidraw', version: 2 });
    expect(parseCanvasFiles(filesToInput(files)).canvasState).toEqual(state);
  });

  it('Obsidian 里手画的节点（没有 mdRender 字段）也能读回；坏 JSON 给出原因', () => {
    const canvasContent = JSON.stringify({ nodes: [{ id: 'n1', type: 'text', text: '手写卡片', x: 5, y: 6 }], edges: [] });
    expect(parseCanvasFiles({ canvasContent }).canvasState.nodes[0]).toEqual({ id: 'n1', sourceId: 'n1', content: '手写卡片', position: { x: 5, y: 6 } });
    expect(parseCanvasFiles({ canvasContent: '{坏' }).errors[0]).toContain('不是合法的 JSON');
  });

  it('空白板也写一个 .canvas，读回是空白板', () => {
    const files = serializeCanvasState({ nodes: [], edges: [] });
    expect(parseCanvasFiles(filesToInput(files)).canvasState).toEqual({ nodes: [], edges: [] });
  });
});
