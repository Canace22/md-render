import { convertToExcalidrawElements } from '@excalidraw/excalidraw';

const CARD_WIDTH = 260;
const CARD_HEIGHT = 160;
const CARD_GAP_X = 340;
const CARD_GAP_Y = 220;
const GRID_COLUMNS = 3;
const DEFAULT_BACKGROUND = '#fbfbfa';
const DEFAULT_STROKE = '#1f2937';
const DEFAULT_FILL = '#ffffff';
const DEFAULT_ARROW = '#475569';
const TEXT_PREVIEW_LENGTH = 96;
export const EXCALIDRAW_CARD_ID_PREFIX = 'md-card-';
const AGENT_CARD_ID_PREFIX = 'agent-card-';
const AGENT_EDGE_ID_PREFIX = 'agent-edge-';
const EXCALIDRAW_APP_STATE_FIELDS = [
  'viewBackgroundColor',
  'theme',
  'gridModeEnabled',
  'scrollX',
  'scrollY',
  'zoom',
  'name',
];

const trimText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const getItemTitle = (item, index = 0) => {
  return trimText(item?.title ?? item?.name ?? item?.label) || `未命名卡片 ${index + 1}`;
};

const getItemSummary = (item) => {
  const text = trimText(item?.content ?? item?.summary ?? item?.excerpt ?? item?.description);
  return text.length > TEXT_PREVIEW_LENGTH ? `${text.slice(0, TEXT_PREVIEW_LENGTH)}...` : text;
};

const getItemId = (item, index = 0) => {
  return String(item?.sourceId ?? item?.fileId ?? item?.id ?? `canvas-card-${index}`);
};

const buildCardElementId = (item, index = 0) => {
  return `${EXCALIDRAW_CARD_ID_PREFIX}${getItemId(item, index)}`;
};

const getItemPosition = (item, index = 0) => {
  const x = Number(item?.position?.x ?? item?.x);
  const y = Number(item?.position?.y ?? item?.y);
  if (Number.isFinite(x) && Number.isFinite(y)) {
    return { x, y };
  }
  return {
    x: (index % GRID_COLUMNS) * CARD_GAP_X,
    y: Math.floor(index / GRID_COLUMNS) * CARD_GAP_Y,
  };
};

const getCardText = (item, index) => {
  const title = getItemTitle(item, index);
  const summary = getItemSummary(item);
  const type = trimText(item?.typeLabel ?? item?.nodeType ?? item?.type);
  return [title, type, summary].filter(Boolean).join('\n');
};

const getElementCenter = (element) => {
  return {
    x: Number(element?.x ?? 0) + Number(element?.width ?? CARD_WIDTH) / 2,
    y: Number(element?.y ?? 0) + Number(element?.height ?? CARD_HEIGHT) / 2,
  };
};

const getDirectionalAnchorPoint = (source, target, isSource = true) => {
  const sourceCenter = getElementCenter(source);
  const targetCenter = getElementCenter(target);
  const width = Number(source?.width ?? CARD_WIDTH);
  const height = Number(source?.height ?? CARD_HEIGHT);
  const dx = targetCenter.x - sourceCenter.x;
  const dy = targetCenter.y - sourceCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return {
      x: sourceCenter.x + (dx >= 0 ? width / 2 : -width / 2),
      y: sourceCenter.y,
      side: dx >= 0 ? (isSource ? 'right' : 'left') : (isSource ? 'left' : 'right'),
    };
  }

  return {
    x: sourceCenter.x,
    y: sourceCenter.y + (dy >= 0 ? height / 2 : -height / 2),
    side: dy >= 0 ? (isSource ? 'bottom' : 'top') : (isSource ? 'top' : 'bottom'),
  };
};

const getExcalidrawElements = (canvasState = {}) => {
  return Array.isArray(canvasState?.excalidraw?.elements)
    ? canvasState.excalidraw.elements
    : [];
};

const getExcalidrawAppState = (canvasState = {}) => {
  return canvasState?.excalidraw?.appState && typeof canvasState.excalidraw.appState === 'object'
    ? canvasState.excalidraw.appState
    : {};
};

const getExcalidrawFiles = (canvasState = {}) => {
  return canvasState?.excalidraw?.files && typeof canvasState.excalidraw.files === 'object'
    ? canvasState.excalidraw.files
    : {};
};

export const hasExcalidrawScene = (canvasState = {}) => {
  return Boolean(canvasState?.excalidraw && typeof canvasState.excalidraw === 'object');
};

export const buildExcalidrawElementsFromItems = (items = [], options = {}) => {
  const startIndex = Number(options.startIndex) || 0;
  const skeletons = (Array.isArray(items) ? items : []).map((item, index) => {
    const itemId = getItemId(item, startIndex + index);
    const position = getItemPosition(item, startIndex + index);
    return {
      type: 'rectangle',
      id: buildCardElementId(item, startIndex + index),
      x: position.x,
      y: position.y,
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      strokeColor: DEFAULT_STROKE,
      backgroundColor: DEFAULT_FILL,
      customData: {
        sourceId: itemId,
      },
      label: {
        text: getCardText(item, startIndex + index),
        fontSize: 20,
        strokeColor: DEFAULT_STROKE,
      },
    };
  });
  return convertToExcalidrawElements(skeletons);
};

const toAgentCardId = (card = {}, index = 0) => {
  const explicitId = trimText(card?.id);
  return explicitId || `${AGENT_CARD_ID_PREFIX}${index + 1}`;
};

export const buildCanvasItemsFromAgentCards = (cards = [], options = {}) => {
  const startIndex = Number.isFinite(Number(options.startIndex))
    ? Math.max(0, Math.floor(Number(options.startIndex)))
    : 0;

  return (Array.isArray(cards) ? cards : []).map((card, index) => {
    const finalIndex = startIndex + index;
    const sourceId = toAgentCardId(card, finalIndex);
    const title = trimText(card?.title) || `卡片 ${finalIndex + 1}`;
    const summary = trimText(card?.summary ?? card?.content ?? card?.text);
    const typeLabel = trimText(card?.typeLabel) || '卡片';
    const nodeType = trimText(card?.nodeType) || 'agent-card';
    const x = Number(card?.x);
    const y = Number(card?.y);

    return {
      id: sourceId,
      sourceId,
      title,
      summary,
      content: summary,
      typeLabel,
      nodeType,
      ...(Number.isFinite(x) && Number.isFinite(y)
        ? { position: { x, y } }
        : {}),
    };
  });
};

const buildAgentCardAliasMap = (cards = [], items = []) => {
  const aliases = new Map();
  cards.forEach((card, index) => {
    const item = items[index];
    if (!item?.sourceId) return;
    const normalizedSourceId = String(item.sourceId);
    const rawId = trimText(card?.id);
    const rawTitle = trimText(card?.title);

    aliases.set(normalizedSourceId, normalizedSourceId);
    if (rawId && !aliases.has(rawId)) aliases.set(rawId, normalizedSourceId);
    if (rawTitle && !aliases.has(rawTitle)) aliases.set(rawTitle, normalizedSourceId);
  });
  return aliases;
};

const normalizeAgentEdges = (edges = [], aliases = new Map()) => {
  return (Array.isArray(edges) ? edges : []).map((edge, index) => {
    const sourceKey = trimText(edge?.source);
    const targetKey = trimText(edge?.target);
    const source = aliases.get(sourceKey) || sourceKey;
    const target = aliases.get(targetKey) || targetKey;
    if (!source || !target || source === target) return null;
    if (!aliases.has(source) || !aliases.has(target)) return null;

    const label = trimText(edge?.label);
    return {
      id: trimText(edge?.id) || `${AGENT_EDGE_ID_PREFIX}${index + 1}`,
      source,
      target,
      ...(label ? { label } : {}),
    };
  }).filter(Boolean);
};

export const countRenderableCanvasCards = (elements = []) => {
  return (Array.isArray(elements) ? elements : []).filter((element) => {
    return !element?.isDeleted && Boolean(getCanvasSourceIdFromElement(element));
  }).length;
};

export const getCanvasSourceIdFromElement = (element) => {
  if (!element || typeof element !== 'object') return '';

  const customSourceId = String(element?.customData?.sourceId ?? '').trim();
  if (customSourceId) return customSourceId;

  const elementId = String(element?.id ?? '');
  if (elementId.startsWith(EXCALIDRAW_CARD_ID_PREFIX)) {
    return elementId.slice(EXCALIDRAW_CARD_ID_PREFIX.length);
  }

  return '';
};

export const buildInitialExcalidrawData = (canvasState = {}, items = [], edges = []) => {
  if (hasExcalidrawScene(canvasState)) {
    return {
      elements: getExcalidrawElements(canvasState),
      appState: {
        viewBackgroundColor: DEFAULT_BACKGROUND,
        ...getExcalidrawAppState(canvasState),
      },
      files: getExcalidrawFiles(canvasState),
      scrollToContent: true,
    };
  }

  const itemElements = buildExcalidrawElementsFromItems(items);
  const elementsBySourceId = new Map();
  itemElements.forEach((element, index) => {
    const itemId = getItemId(items[index], index);
    elementsBySourceId.set(String(itemId), element);
  });

  const arrowSkeletons = (Array.isArray(edges) ? edges : [])
    .map((edge, index) => {
      const sourceId = String(edge?.source ?? edge?.source_id ?? '');
      const targetId = String(edge?.target ?? edge?.target_id ?? '');
      const source = elementsBySourceId.get(sourceId);
      const target = elementsBySourceId.get(targetId);
      if (!source || !target || sourceId === targetId) return null;

      const sourceAnchor = getDirectionalAnchorPoint(source, target, true);
      const targetAnchor = getDirectionalAnchorPoint(target, source, false);
      return {
        type: 'arrow',
        id: `md-edge-${edge?.id ?? `${sourceId}-${targetId}-${index}`}`,
        x: sourceAnchor.x,
        y: sourceAnchor.y,
        start: {
          id: source.id,
          type: source.type,
          x: sourceAnchor.x,
          y: sourceAnchor.y,
        },
        end: {
          id: target.id,
          type: target.type,
          x: targetAnchor.x,
          y: targetAnchor.y,
        },
        points: [
          [0, 0],
          [targetAnchor.x - sourceAnchor.x, targetAnchor.y - sourceAnchor.y],
        ],
        strokeColor: DEFAULT_ARROW,
        endArrowhead: 'arrow',
        label: trimText(edge?.label)
          ? { text: trimText(edge.label), fontSize: 18, strokeColor: DEFAULT_ARROW }
          : undefined,
      };
    })
    .filter(Boolean);

  return {
    elements: [...itemElements, ...convertToExcalidrawElements(arrowSkeletons)],
    appState: {
      viewBackgroundColor: DEFAULT_BACKGROUND,
      gridModeEnabled: true,
    },
    files: {},
    scrollToContent: true,
  };
};

export const buildCanvasSceneFromAgentGraph = ({
  cards = [],
  edges = [],
  appState = {},
  files = {},
} = {}) => {
  const items = buildCanvasItemsFromAgentCards(cards);
  const aliases = buildAgentCardAliasMap(cards, items);
  const normalizedEdges = normalizeAgentEdges(edges, aliases);
  const initialData = buildInitialExcalidrawData({}, items, normalizedEdges);

  return buildExcalidrawCanvasState({
    elements: initialData.elements,
    appState: {
      ...initialData.appState,
      ...appState,
    },
    files,
  });
};

export const pickPersistentExcalidrawAppState = (appState = {}) => {
  return EXCALIDRAW_APP_STATE_FIELDS.reduce((result, field) => {
    if (!Object.prototype.hasOwnProperty.call(appState, field)) return result;
    result[field] = appState[field];
    return result;
  }, {});
};

export const buildExcalidrawCanvasState = ({ elements = [], appState = {}, files = {} } = {}) => {
  return {
    engine: 'excalidraw',
    nodes: [],
    edges: [],
    viewport: null,
    excalidraw: {
      elements: Array.isArray(elements) ? elements : [],
      appState: pickPersistentExcalidrawAppState(appState),
      files: files && typeof files === 'object' ? files : {},
    },
  };
};
