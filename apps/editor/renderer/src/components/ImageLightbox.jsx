import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { message } from 'antd';
import { Copy, Maximize2, Scan } from 'lucide-react';
import { useLightboxZoom } from '../hooks/useLightboxZoom.js';
import { copyImageToClipboard } from '../utils/imageClipboard.js';

const isCopyShortcut = (event) => (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c';

/**
 * 图片放大查看器（lightbox）。
 * - 打开时按窗口大小完整显示；双击 / 「1:1」看原始像素（Retina 截图最清楚）
 * - 滚轮缩放、按住拖动平移
 * - 「复制」按钮或 ⌘C / Ctrl+C 把原图复制到剪贴板
 * - 遮罩点击 / ESC 关闭；多图时左右切换（按钮 + ← / → 键）
 *
 * 受控组件：images 为图片 URL 数组，index 为当前下标，-1 表示关闭。
 */
export default function ImageLightbox({ images = [], index = -1, onClose, onIndexChange }) {
  const open = index >= 0 && index < images.length;
  const src = open ? images[index] : '';
  const zoom = useLightboxZoom(src);

  const goPrev = useCallback(() => {
    if (images.length < 2) return;
    onIndexChange?.((index - 1 + images.length) % images.length);
  }, [images.length, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (images.length < 2) return;
    onIndexChange?.((index + 1) % images.length);
  }, [images.length, index, onIndexChange]);

  const handleCopy = useCallback(async () => {
    try {
      await copyImageToClipboard(src);
      message.success('图片已复制');
    } catch (error) {
      message.error(error?.message || '复制图片失败');
    }
  }, [src]);

  // 键盘：ESC 关闭，左右切换，⌘C 复制
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onClose?.();
      else if (event.key === 'ArrowLeft') goPrev();
      else if (event.key === 'ArrowRight') goNext();
      else if (isCopyShortcut(event)) {
        event.preventDefault(); // 不让底下编辑器把选中的块也复制走
        void handleCopy();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, goPrev, goNext, handleCopy]);

  if (!open) return null;

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
      onWheel={zoom.onWheel}
      onMouseMove={zoom.onMouseMove}
      onMouseUp={zoom.endDrag}
      onMouseLeave={zoom.endDrag}
    >
      <div className="image-lightbox__toolbar">
        <button type="button" title="适应窗口" aria-label="适应窗口" onClick={zoom.fit}>
          <Maximize2 size={16} />
        </button>
        <button type="button" title="原始大小 1:1（双击图片也可切换）" aria-label="原始大小" onClick={zoom.actual}>
          <Scan size={16} />
          <span>1:1</span>
        </button>
        <button type="button" title="复制图片（⌘C）" aria-label="复制图片" onClick={handleCopy}>
          <Copy size={16} />
          <span>复制</span>
        </button>
      </div>

      <button type="button" className="image-lightbox__close" aria-label="关闭" onClick={onClose}>
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
        key={src}
        className="image-lightbox__img"
        src={src}
        alt=""
        draggable={false}
        onLoad={zoom.onLoad}
        onClick={stop}
        onDoubleClick={zoom.toggle}
        onMouseDown={zoom.onMouseDown}
        style={zoom.imgStyle}
      />
    </div>,
    document.body,
  );
}
