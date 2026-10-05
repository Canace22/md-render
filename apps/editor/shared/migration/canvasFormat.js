/**
 * 灵感白板 ↔ 文件：
 * - 卡片引擎 → Canvas/白板.canvas（Obsidian 的 JSON Canvas 格式，Obsidian 能直接打开）
 * - Excalidraw 引擎 → Canvas/白板.excalidraw（标准 excalidraw 文件，excalidraw.com / Obsidian 插件能打开）
 *
 * JSON Canvas 表达不了的字段（sourceId、状态、标签……）放在节点 / 边的 `mdRender` 字段里，保证往返一致。
 * 纯函数。
 */

export const CANVAS_DIR_NAME = 'Canvas';
export const CANVAS_BASE_NAME = '白板';
export const CARD_CANVAS_PATH = `${CANVAS_DIR_NAME}/${CANVAS_BASE_NAME}.canvas`;
export const EXCALIDRAW_CANVAS_PATH = `${CANVAS_DIR_NAME}/${CANVAS_BASE_NAME}.excalidraw`;

const ENGINE_EXCALIDRAW = 'excalidraw';
const CARD_WIDTH = 260;
const CARD_HEIGHT = 160;
const EXCALIDRAW_FILE_VERSION = 2;
const JSON_INDENT = 2;

const cardText = (node) => [node.title ? `**${node.title}**` : '', node.content || node.summary || '']
  .filter(Boolean)
  .join('\n\n') || node.sourceId;

const toCanvasNode = (node) => {
  const { id, position, ...rest } = node;
  return {
    id,
    type: 'text',
    text: cardText(node),
    x: position.x,
    y: position.y,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    mdRender: rest,
  };
};

const fromCanvasNode = (node) => ({
  id: node.id,
  ...(node.mdRender ?? { sourceId: node.id, content: node.text ?? '' }),
  position: { x: Number(node.x) || 0, y: Number(node.y) || 0 },
});

const toCanvasEdge = ({ id, source, target, label, ...rest }) => ({
  id,
  fromNode: source,
  toNode: target,
  ...(label ? { label } : {}),
  mdRender: { ...(label != null ? { label } : {}), ...rest },
});

const fromCanvasEdge = (edge) => ({
  id: edge.id,
  source: edge.fromNode,
  target: edge.toNode,
  ...(edge.mdRender ?? (edge.label ? { label: edge.label } : {})),
});

/**
 * canvasState → 要写的文件（相对内容库根目录）
 * @returns {Array<{ relativePath: string, content: string }>}
 */
export const serializeCanvasState = (canvasState = {}) => {
  const files = [];
  const nodes = canvasState.nodes ?? [];
  const edges = canvasState.edges ?? [];
  const isExcalidraw = canvasState.engine === ENGINE_EXCALIDRAW || Boolean(canvasState.excalidraw);

  if (nodes.length || edges.length || canvasState.viewport || !isExcalidraw) {
    const doc = {
      nodes: nodes.map(toCanvasNode),
      edges: edges.map(toCanvasEdge),
      mdRender: {
        ...(canvasState.viewport ? { viewport: canvasState.viewport } : {}),
        ...(isExcalidraw ? { engine: ENGINE_EXCALIDRAW } : {}),
      },
    };
    files.push({ relativePath: CARD_CANVAS_PATH, content: `${JSON.stringify(doc, null, JSON_INDENT)}\n` });
  }

  if (canvasState.excalidraw) {
    const doc = {
      type: 'excalidraw',
      version: EXCALIDRAW_FILE_VERSION,
      source: 'md-render',
      elements: canvasState.excalidraw.elements ?? [],
      appState: canvasState.excalidraw.appState ?? {},
      files: canvasState.excalidraw.files ?? {},
    };
    files.push({ relativePath: EXCALIDRAW_CANVAS_PATH, content: `${JSON.stringify(doc, null, JSON_INDENT)}\n` });
  }
  return files;
};

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/**
 * 文件 → canvasState。两个文件都可选；JSON 坏了的那个当作不存在，并在 errors 里说明。
 * @returns {{ canvasState: object, errors: string[] }}
 */
export const parseCanvasFiles = ({ canvasContent = '', excalidrawContent = '' } = {}) => {
  const errors = [];
  const cards = canvasContent ? parseJson(canvasContent) : null;
  if (canvasContent && !cards) errors.push(`${CARD_CANVAS_PATH} 不是合法的 JSON`);
  const excalidraw = excalidrawContent ? parseJson(excalidrawContent) : null;
  if (excalidrawContent && !excalidraw) errors.push(`${EXCALIDRAW_CANVAS_PATH} 不是合法的 JSON`);

  const canvasState = {
    nodes: (cards?.nodes ?? []).filter((node) => node?.id).map(fromCanvasNode),
    edges: (cards?.edges ?? []).filter((edge) => edge?.id && edge.fromNode && edge.toNode).map(fromCanvasEdge),
  };
  if (cards?.mdRender?.viewport) canvasState.viewport = cards.mdRender.viewport;
  if (excalidraw || cards?.mdRender?.engine === ENGINE_EXCALIDRAW) canvasState.engine = ENGINE_EXCALIDRAW;
  if (excalidraw) {
    canvasState.excalidraw = {
      elements: Array.isArray(excalidraw.elements) ? excalidraw.elements : [],
      appState: excalidraw.appState ?? {},
      files: excalidraw.files ?? {},
    };
  }
  return { canvasState, errors };
};
