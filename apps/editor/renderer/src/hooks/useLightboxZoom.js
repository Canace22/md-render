import { useCallback, useEffect, useRef, useState } from 'react';

const ZOOM_STEP = 1.15;
const VIEWPORT_RATIO = 0.92;
const MAX_ZOOM = 4; // 相对原图像素的最大倍数
const ORIGIN = { x: 0, y: 0 };

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const getViewport = () => ({ width: window.innerWidth, height: window.innerHeight });

/** 让图片完整放进视口的比例；小图不放大（避免越放越糊） */
export const getFitScale = (natural, viewport, ratio = VIEWPORT_RATIO) => {
  if (!natural?.width || !natural?.height) return 1;
  return Math.min(1, (viewport.width * ratio) / natural.width, (viewport.height * ratio) / natural.height);
};

/** 1:1 = 一个图片像素对应一个屏幕物理像素，Retina 截图在这个比例下最清楚 */
export const getActualScale = (devicePixelRatio = 1) => 1 / (devicePixelRatio || 1);

export const getZoomRange = (fitScale) => ({ min: fitScale / 2, max: Math.max(MAX_ZOOM, fitScale * 2) });

/**
 * lightbox 的缩放 / 平移。
 * 缩放改的是图片的真实宽高（而不是 transform: scale），
 * 浏览器每次都按原图重新采样，放大后文字依然清晰。
 * resetKey 变化（切图）时复位。
 */
export function useLightboxZoom(resetKey) {
  const [natural, setNatural] = useState(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState(ORIGIN);
  const dragRef = useRef(null);

  useEffect(() => {
    setNatural(null);
    setOffset(ORIGIN);
  }, [resetKey]);

  const fitScale = getFitScale(natural, getViewport());

  const applyScale = useCallback((next) => {
    setScale(next);
    setOffset(ORIGIN);
  }, []);

  const fit = useCallback(() => applyScale(fitScale), [applyScale, fitScale]);
  const actual = useCallback(() => applyScale(getActualScale(window.devicePixelRatio)), [applyScale]);
  const toggle = useCallback(() => (Math.abs(scale - fitScale) < 0.001 ? actual() : fit()), [scale, fitScale, actual, fit]);

  const onLoad = useCallback((event) => {
    const next = { width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight };
    setNatural(next);
    setScale(getFitScale(next, getViewport()));
  }, []);

  const onWheel = (event) => {
    if (!natural) return;
    const { min, max } = getZoomRange(fitScale);
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setScale((prev) => clamp(prev * factor, min, max));
  };

  const onMouseDown = (event) => {
    event.preventDefault();
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };

  const onMouseMove = (event) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (event.clientX - dragRef.current.x),
      y: dragRef.current.oy + (event.clientY - dragRef.current.y),
    });
  };

  const endDrag = () => { dragRef.current = null; };

  const imgStyle = natural
    ? {
      width: natural.width * scale,
      height: natural.height * scale,
      transform: `translate(${offset.x}px, ${offset.y}px)`,
    }
    : { visibility: 'hidden' };

  return { imgStyle, onLoad, onWheel, onMouseDown, onMouseMove, endDrag, fit, actual, toggle };
}
