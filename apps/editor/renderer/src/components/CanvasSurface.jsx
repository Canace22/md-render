import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Empty, Input, Popconfirm, Popover, Tag, Typography } from 'antd';
import { Eraser, FileText, Plus } from 'lucide-react';
import { Excalidraw, THEME } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import {
  buildExcalidrawCanvasState,
  buildExcalidrawElementsFromItems,
  buildInitialExcalidrawData,
  getCanvasSourceIdFromElement,
} from '../utils/excalidrawCanvas.js';

const CANVAS_TITLE = '灵感白板';
const SAVE_DEBOUNCE_MS = 420;
const DOUBLE_CLICK_INTERVAL_MS = 320;
const DEFAULT_LIBRARY_OPEN = false;
const LIBRARY_PREVIEW_LENGTH = 96;
const BLANK_CARD_TITLE = '空白卡片';

const trimText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const hasVisibleElements = (elements = []) => {
  return Boolean((Array.isArray(elements) ? elements : []).some((element) => !element?.isDeleted));
};

const buildSceneSignature = ({ elements = [], appState = {}, files = {} } = {}) => {
  return JSON.stringify(buildExcalidrawCanvasState({ elements, appState, files }).excalidraw ?? null);
};

const getItemId = (item, index) => {
  return String(item?.sourceId ?? item?.fileId ?? item?.id ?? `library-${index}`);
};

const getItemTitle = (item, index) => {
  return trimText(item?.title ?? item?.name ?? item?.label) || `未命名卡片 ${index + 1}`;
};

const getItemTypeLabel = (item) => {
  return trimText(item?.typeLabel ?? item?.nodeType ?? item?.type) || 'document';
};

const getItemSummary = (item) => {
  const text = trimText(item?.summary ?? item?.excerpt ?? item?.description ?? item?.content);
  return text.length > LIBRARY_PREVIEW_LENGTH ? `${text.slice(0, LIBRARY_PREVIEW_LENGTH)}...` : text;
};

function filterLibraryItems(items, query) {
  const keyword = trimText(query).toLowerCase();
  if (!keyword) return items;

  return items.filter((item, index) => {
    return getItemTitle(item, index).toLowerCase().includes(keyword)
      || getItemSummary(item).toLowerCase().includes(keyword);
  });
}

export default function CanvasSurface({
  canvasState,
  items,
  addableItems,
  edges,
  theme,
  onChange,
  onClearCanvas,
  onCaptureLibraryItems,
  onOpenFile,
  emptyText = '从下方加入候选卡片，或直接使用白板工具自由绘制',
}) {
  const excalidrawApiRef = useRef(null);
  const saveTimerRef = useRef(null);
  const latestSceneRef = useRef(null);
  const lastHitRef = useRef({ elementId: '', occurredAt: 0 });
  const processedLibraryIdsRef = useRef(new Set());
  const librarySyncReadyRef = useRef(false);
  const sourceItems = items ?? [];
  const libraryItems = addableItems ?? sourceItems;
  const [isLibraryOpen, setIsLibraryOpen] = useState(DEFAULT_LIBRARY_OPEN);
  const [libraryQuery, setLibraryQuery] = useState('');

  const initialData = useMemo(() => {
    return buildInitialExcalidrawData(canvasState, sourceItems, edges);
  }, [canvasState, edges, sourceItems]);
  const [sceneHasContent, setSceneHasContent] = useState(() => {
    return hasVisibleElements(initialData.elements);
  });

  const filteredLibraryItems = useMemo(() => {
    return filterLibraryItems(libraryItems, libraryQuery);
  }, [libraryItems, libraryQuery]);

  const openableSourceIds = useMemo(() => {
    return new Set(
      libraryItems
        .map((item, index) => getItemId(item, index))
        .filter(Boolean),
    );
  }, [libraryItems]);

  useEffect(() => {
    setSceneHasContent(hasVisibleElements(initialData.elements));
  }, [initialData]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      librarySyncReadyRef.current = true;
    }, 0);
    return () => {
      window.clearTimeout(timerId);
      librarySyncReadyRef.current = false;
    };
  }, []);

  const flushScene = useCallback(() => {
    if (!latestSceneRef.current) return;
    onChange?.(buildExcalidrawCanvasState(latestSceneRef.current));
    latestSceneRef.current = null;
  }, [onChange]);

  const syncSceneFromProps = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;

    const nextElements = Array.isArray(initialData.elements) ? initialData.elements : [];
    const nextAppState = initialData.appState && typeof initialData.appState === 'object'
      ? initialData.appState
      : {};
    const nextFiles = initialData.files && typeof initialData.files === 'object'
      ? initialData.files
      : {};
    const currentElements = api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements?.() ?? [];
    const currentAppState = api.getAppState?.() ?? {};
    const currentFiles = api.getFiles?.() ?? {};

    if (buildSceneSignature({
      elements: currentElements,
      appState: currentAppState,
      files: currentFiles,
    }) === buildSceneSignature({
      elements: nextElements,
      appState: nextAppState,
      files: nextFiles,
    })) {
      setSceneHasContent(hasVisibleElements(nextElements));
      return;
    }

    api.updateScene({
      elements: nextElements,
      appState: {
        ...currentAppState,
        ...nextAppState,
      },
      files: nextFiles,
    });
    if (nextElements.length) {
      api.scrollToContent?.(nextElements);
    }
    setSceneHasContent(hasVisibleElements(nextElements));
  }, [initialData]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
      flushScene();
    };
  }, [flushScene]);

  useEffect(() => {
    syncSceneFromProps();
  }, [syncSceneFromProps]);

  const scheduleSceneSave = useCallback((elements, appState, files) => {
    setSceneHasContent(Boolean(elements?.some((element) => !element?.isDeleted)));
    latestSceneRef.current = { elements, appState, files };
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      flushScene();
    }, SAVE_DEBOUNCE_MS);
  }, [flushScene]);

  const handleAddItem = useCallback((item, index) => {
    const api = excalidrawApiRef.current;
    if (!api) return;

    const currentElements = api.getSceneElementsIncludingDeleted?.() ?? api.getSceneElements?.() ?? [];
    const nextElements = buildExcalidrawElementsFromItems([item], {
      startIndex: currentElements.length + index,
    });
    api.updateScene({
      elements: [...currentElements, ...nextElements],
      appState: {
        ...api.getAppState?.(),
        selectedElementIds: Object.fromEntries(nextElements.map((element) => [element.id, true])),
      },
    });
    scheduleSceneSave(
      [...currentElements, ...nextElements],
      api.getAppState?.() ?? {},
      api.getFiles?.() ?? {},
    );
    setIsLibraryOpen(false);
  }, [scheduleSceneSave]);

  const handleCreateBlankCard = useCallback(() => {
    const id = `blank-${Date.now().toString(36)}`;
    handleAddItem({
      id,
      title: BLANK_CARD_TITLE,
      summary: '写下一个想法，再用白板工具继续延展。',
      nodeType: 'blank-card',
      typeLabel: '卡片',
    }, 0);
  }, [handleAddItem]);

  const handleClearCanvas = useCallback(() => {
    excalidrawApiRef.current?.resetScene?.();
    onClearCanvas?.();
  }, [onClearCanvas]);

  const resolveOpenFileId = useCallback((hitElement, hitElements = []) => {
    if (!hitElement) return '';

    const api = excalidrawApiRef.current;
    const sceneElements = api?.getSceneElementsIncludingDeleted?.() ?? api?.getSceneElements?.() ?? [];
    const elementsById = new Map(sceneElements.map((element) => [element.id, element]));
    const candidates = [hitElement, ...hitElements];
    const containerElement = hitElement?.containerId ? elementsById.get(hitElement.containerId) : null;
    if (containerElement) {
      candidates.push(containerElement);
    }

    for (const candidate of candidates) {
      const sourceId = getCanvasSourceIdFromElement(candidate);
      if (sourceId && openableSourceIds.has(sourceId)) {
        return sourceId;
      }
    }

    return '';
  }, [openableSourceIds]);

  const handleCanvasPointerUp = useCallback((_, pointerDownState) => {
    if (!onOpenFile) return;
    if (pointerDownState?.drag?.hasOccurred || pointerDownState?.boxSelection?.hasOccurred) return;

    const hitElement = pointerDownState?.hit?.element;
    const hitElements = pointerDownState?.hit?.allHitElements ?? [];
    const fileId = resolveOpenFileId(hitElement, hitElements);
    if (!fileId) return;

    const currentElementId = String(hitElement?.id ?? fileId);
    const occurredAt = Date.now();
    const lastHit = lastHitRef.current;
    const isDoubleClick = lastHit.elementId === currentElementId
      && occurredAt - lastHit.occurredAt <= DOUBLE_CLICK_INTERVAL_MS;

    lastHitRef.current = { elementId: currentElementId, occurredAt };
    if (!isDoubleClick) return;

    lastHitRef.current = { elementId: '', occurredAt: 0 };
    onOpenFile(fileId);
  }, [onOpenFile, resolveOpenFileId]);

  const handleLibraryChange = useCallback(async (libraryItems = []) => {
    const nextItems = (Array.isArray(libraryItems) ? libraryItems : []).filter((item) => {
      const itemId = String(item?.id ?? '').trim();
      if (!itemId || processedLibraryIdsRef.current.has(itemId)) return false;
      processedLibraryIdsRef.current.add(itemId);
      return true;
    });
    if (!nextItems.length) return;

    if (!librarySyncReadyRef.current) {
      await excalidrawApiRef.current?.updateLibrary?.({
        libraryItems: [],
        merge: false,
      });
      return;
    }

    try {
      await onCaptureLibraryItems?.(nextItems);
    } finally {
      await excalidrawApiRef.current?.updateLibrary?.({
        libraryItems: [],
        merge: false,
      });
    }
  }, [onCaptureLibraryItems]);

  const libraryPanel = (
    <div className="canvas-library canvas-library--excalidraw">
      <div className="canvas-library-head">
        <div className="canvas-library-head-copy">
          <Typography.Title level={4} className="canvas-library-title">
            候选卡片
          </Typography.Title>
          <Typography.Paragraph className="canvas-library-subtitle">
            选择内容后会以卡片插入当前白板。
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
          const itemId = getItemId(item, index);
          return (
            <article key={itemId} className="canvas-library-item">
              <div className="canvas-library-item-copy">
                <div className="canvas-library-item-head">
                  <strong>{getItemTitle(item, index)}</strong>
                  <span>{getItemTypeLabel(item)}</span>
                </div>
                <p>{getItemSummary(item) || '这条内容还没有摘要。'}</p>
              </div>
              <Button size="small" type="primary" onClick={() => handleAddItem(item, index)}>
                插入
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
    <section className="canvas-surface canvas-surface--excalidraw" data-testid="canvas-surface">
      <div className="canvas-stage">
        <div className="canvas-titlebar" aria-label={CANVAS_TITLE}>
          {CANVAS_TITLE}
        </div>
        <div className="canvas-floating-controls" aria-label="白板工具栏">
          <Popconfirm
            title="清空当前画布？"
            description="会移除当前白板里的所有内容。"
            okText="清空"
            cancelText="取消"
            okButtonProps={{ danger: true }}
            onConfirm={handleClearCanvas}
          >
            <Button
              size="small"
              danger
              className="canvas-toolbar-action canvas-toolbar-action-danger"
              icon={<Eraser size={14} strokeWidth={1.8} />}
              title="清空当前画布"
              aria-label="清空当前画布"
            />
          </Popconfirm>
        </div>

        <div className="canvas-dock">
          <Button
            type="text"
            className="canvas-dock-action"
            icon={<Plus size={22} strokeWidth={1.8} />}
            title="新建空白卡片"
            aria-label="新建空白卡片"
            onClick={handleCreateBlankCard}
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
              className="canvas-dock-action"
              icon={<FileText size={22} strokeWidth={1.7} />}
              title="插入候选卡片"
              aria-label="插入候选卡片"
            />
          </Popover>
        </div>

        <div className="canvas-flow canvas-excalidraw-host">
          {!sourceItems.length && !sceneHasContent ? (
            <div className="canvas-center-help">
              <div className="canvas-center-help-title">{emptyText}</div>
            </div>
          ) : null}
          <Excalidraw
            initialData={initialData}
            excalidrawAPI={(api) => {
              excalidrawApiRef.current = api;
              syncSceneFromProps();
            }}
            onChange={scheduleSceneSave}
            onLibraryChange={handleLibraryChange}
            onPointerUp={handleCanvasPointerUp}
            theme={theme === 'dark' ? THEME.DARK : THEME.LIGHT}
            langCode="zh-CN"
            gridModeEnabled
            autoFocus
          />
        </div>
      </div>
    </section>
  );
}
