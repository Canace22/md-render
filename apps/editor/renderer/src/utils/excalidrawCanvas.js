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

      const sourceCenter = getElementCenter(source);
      const targetCenter = getElementCenter(target);
      return {
        type: 'arrow',
        id: `md-edge-${edge?.id ?? `${sourceId}-${targetId}-${index}`}`,
        x: sourceCenter.x,
        y: sourceCenter.y,
        points: [
          [0, 0],
          [targetCenter.x - sourceCenter.x, targetCenter.y - sourceCenter.y],
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
