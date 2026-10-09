import { useCallback, useState } from 'react';

const CLOSED = { images: [], index: -1 };

/**
 * 从双击事件里取出「被点的编辑器图片 + 同一容器里的全部图片」。
 * 不是双击在图片上返回 null。
 */
export const pickLightboxImages = (event) => {
  const img = event.target.closest?.('img.bn-visual-media');
  if (!img) return null;
  const nodes = Array.from(event.currentTarget.querySelectorAll('img.bn-visual-media'));
  const images = nodes.map((node) => node.currentSrc || node.src).filter(Boolean);
  const index = nodes.indexOf(img);
  return index < 0 || !images.length ? null : { images, index };
};

/**
 * 编辑器图片双击放大：把 openFromEvent 挂到容器的 onDoubleClick 上，
 * 再把 lightbox / close / changeIndex 交给 <ImageLightbox />。
 * 单击不拦截，交给 BlockNote 选中图片块（这样删除键才能删图）。
 */
export function useImageLightbox(onClose) {
  const [lightbox, setLightbox] = useState(CLOSED);

  const openFromEvent = useCallback((event) => {
    const next = pickLightboxImages(event);
    if (!next) return;
    event.preventDefault();
    setLightbox(next);
  }, []);

  const close = useCallback(() => {
    setLightbox((prev) => ({ ...prev, index: -1 }));
    onClose?.();
  }, [onClose]);

  const changeIndex = useCallback((index) => setLightbox((prev) => ({ ...prev, index })), []);

  return { lightbox, openFromEvent, close, changeIndex };
}
