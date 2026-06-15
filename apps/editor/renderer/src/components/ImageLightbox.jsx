import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const ZOOM_STEP = 1.15;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/**
 * 图片放大查看器（lightbox）。
 * - 遮罩点击 / ESC 关闭
 * - 滚轮缩放、按住拖动平移
 * - 多图时左右切换（按钮 + ← / → 键）
 *
 * 受控组件：images 为图片 URL 数组，index 为当前下标，open 为 -1 时关闭。
 * 切图时自动复位缩放与平移。
 */
export default function ImageLightbox({ images = [], index = -1, onClose, onIndexChange }) {
  const open = index >= 0 && index < images.length;
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef(null);

  // 切换图片或打开时复位
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [index]);

  const goPrev = useCallback(() => {
    if (images.length < 2) return;
    onIndexChange?.((index - 1 + images.length) % images.length);
  }, [images.length, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (images.length < 2) return;
    onIndexChange?.((index + 1) % images.length);
  }, [images.length, index, onIndexChange]);

  // 键盘：ESC 关闭，左右切换
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
      else if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, goPrev, goNext]);

  if (!open) return null;

  const handleWheel = (event) => {
    event.preventDefault();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    setScale((prev) => clamp(prev * factor, MIN_SCALE, MAX_SCALE));
  };

  const handleMouseDown = (event) => {
    event.preventDefault();
    dragRef.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
  };

  const handleMouseMove = (event) => {
    if (!dragRef.current) return;
    setOffset({
      x: dragRef.current.ox + (event.clientX - dragRef.current.x),
      y: dragRef.current.oy + (event.clientY - dragRef.current.y),
    });
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  // 点空白区域（非图片、非按钮）关闭
  const handleOverlayClick = (event) => {
    if (event.target === event.currentTarget) onClose?.();
  };

  const stop = (event) => event.stopPropagation();

  return createPortal(
    <div
      className="image-lightbox"
      role="dialog"
      aria-modal="true"
      onClick={handleOverlayClick}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={endDrag}
      onMouseLeave={endDrag}
    >
      <button
        type="button"
        className="image-lightbox__close"
        aria-label="关闭"
        onClick={onClose}
      >
        ×
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className="image-lightbox__nav image-lightbox__nav--prev"
            aria-label="上一张"
            onClick={(event) => { stop(event); goPrev(); }}
          >
            ‹
          </button>
          <button
            type="button"
            className="image-lightbox__nav image-lightbox__nav--next"
            aria-label="下一张"
            onClick={(event) => { stop(event); goNext(); }}
          >
            ›
          </button>
          <div className="image-lightbox__counter">{index + 1} / {images.length}</div>
        </>
      )}

      <img
        className="image-lightbox__img"
        src={images[index]}
        alt=""
        draggable={false}
        onClick={stop}
        onMouseDown={handleMouseDown}
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          cursor: dragRef.current ? 'grabbing' : 'grab',
        }}
      />
    </div>,
    document.body,
  );
}
