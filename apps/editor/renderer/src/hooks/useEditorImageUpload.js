import { useCallback, useEffect, useRef } from 'react';
import { message } from 'antd';
import { saveBinaryAsset } from '../services/electronBridge.js';

const fileToDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error ?? new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });

const parseDataUrl = (dataUrl = '') => {
  const match = /^data:image\/([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!match) throw new Error('不支持的图片数据');
  return { mimeSubtype: match[1], base64: match[2] };
};

const PENDING_IMAGE_FALLBACK_URL = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E';
let pendingImageFallbackId = 0;
const pendingImageResolutions = new Map();
const editorImageResolutions = new WeakMap();

const getPendingImageKey = (fileId, blockId, pendingUrl) => (
  `${fileId || 'unknown'}:${blockId || pendingUrl}`
);

export const classifyClipboardFiles = (clipboardData) => {
  const items = clipboardData?.items;
  if (!items) return { hasFiles: false, imageFiles: [], unsupportedFiles: [] };
  const fileItems = Array.from(items).filter((item) => item.kind === 'file');
  const files = fileItems.map((item) => item.getAsFile()).filter(Boolean);
  return {
    hasFiles: fileItems.length > 0,
    imageFiles: files.filter((file) => file.type?.startsWith('image/')),
    unsupportedFiles: files.filter((file) => !file.type?.startsWith('image/')),
  };
};

const createPendingImage = (file) => {
  if (typeof window.URL?.createObjectURL === 'function') {
    return {
      url: window.URL.createObjectURL(file),
      revoke: true,
    };
  }

  pendingImageFallbackId += 1;
  return {
    url: `${PENDING_IMAGE_FALLBACK_URL}#pending-${pendingImageFallbackId}`,
    revoke: false,
  };
};

const findBlockByImageUrl = (blocks, url) => {
  for (const block of blocks ?? []) {
    if (block.type === 'image' && block.props?.url === url) return block;
    const nested = findBlockByImageUrl(block.children, url);
    if (nested) return nested;
  }
  return null;
};

const findPendingImageBlock = (editor, resolution) => {
  const block = resolution.blockId ? editor.getBlock(resolution.blockId) : null;
  if (block?.type === 'image' && block.props?.url === resolution.pendingUrl) return block;
  return findBlockByImageUrl(editor.document, resolution.pendingUrl);
};

const rememberEditorResolutions = (editor, resolutions) => {
  const remembered = editorImageResolutions.get(editor) ?? new Map();
  resolutions.forEach((resolution) => {
    remembered.set(
      getPendingImageKey(resolution.fileId, resolution.blockId, resolution.pendingUrl),
      resolution,
    );
  });
  editorImageResolutions.set(editor, remembered);
};

const forgetPersistedResolutions = (resolutions) => {
  pendingImageResolutions.forEach((resolution, key) => {
    if (resolutions.includes(resolution)) pendingImageResolutions.delete(key);
  });
};

const collectEditorResolutions = (editor, fileId) => {
  const combined = new Map(editorImageResolutions.get(editor) ?? []);
  pendingImageResolutions.forEach((resolution, key) => {
    if (resolution.fileId === fileId) combined.set(key, resolution);
  });
  return Array.from(combined.values()).filter((item) => item.fileId === fileId);
};

const isPendingImageUrl = (url = '') => (
  url.startsWith('blob:') || url.startsWith(PENDING_IMAGE_FALLBACK_URL)
);

export const hasPendingImagePlaceholders = (blocks) => {
  for (const block of blocks ?? []) {
    if (block.type === 'image' && isPendingImageUrl(block.props?.url)) return true;
    if (hasPendingImagePlaceholders(block.children)) return true;
  }
  return false;
};

export const hasPendingImageClipboardData = (clipboardData) => {
  if (!clipboardData || typeof document === 'undefined') return false;
  for (const mimeType of ['blocknote/html', 'text/html']) {
    const html = clipboardData.getData(mimeType);
    if (!html) continue;
    const container = document.createElement('div');
    container.innerHTML = html;
    if (Array.from(container.querySelectorAll('[src], [href]')).some((element) => (
      isPendingImageUrl(
        element.getAttribute('src') ?? element.getAttribute('href') ?? '',
      )
    ))) {
      return true;
    }
  }
  return false;
};

export const reconcilePendingImages = (editor, fileId) => {
  if (!editor || !hasPendingImagePlaceholders(editor.document)) return false;
  const updates = collectEditorResolutions(editor, fileId)
    .map((resolution) => ({ resolution, block: findPendingImageBlock(editor, resolution) }))
    .filter((item) => item.block);
  if (updates.length === 0) return false;
  rememberEditorResolutions(editor, updates.map((item) => item.resolution));

  editor.transact((transaction) => {
    transaction.setMeta('addToHistory', false);
    updates.forEach(({ block, resolution }) => {
      if (resolution.failed) {
        editor.removeBlocks([block.id]);
        return;
      }
      editor.updateBlock(block, {
        props: {
          url: resolution.url,
          name: resolution.name,
        },
      });
    });
  });
  return true;
};

const pastePendingImages = (editor, files) => {
  const pendingImages = files.map((file) => {
    const pending = createPendingImage(file);
    const image = document.createElement('img');
    image.src = pending.url;
    image.alt = file.name || '粘贴的图片';
    return {
      ...pending,
      file,
      url: image.src,
      html: image.outerHTML,
    };
  });

  editor.pasteHTML(pendingImages.map((item) => item.html).join(''));
  return pendingImages.map((item) => ({
    ...item,
    blockId: findBlockByImageUrl(editor.document, item.url)?.id ?? null,
  }));
};

export const insertImagesFromFiles = async (
  editor,
  files,
  uploadFile,
  { fileId = '', onResolved } = {},
) => {
  const pendingImages = pastePendingImages(editor, files);

  const resolutions = await Promise.all(pendingImages.map(async ({ blockId, file, url: pendingUrl }) => {
    try {
      const url = await uploadFile(file);
      return {
        fileId,
        blockId,
        pendingUrl,
        url,
        name: file.name || '',
      };
    } catch (error) {
      console.error('[asset] 粘贴图片失败:', error);
      message.error('图片粘贴失败');
      return {
        fileId,
        blockId,
        pendingUrl,
        failed: true,
      };
    }
  }));

  resolutions.forEach((resolution) => {
    pendingImageResolutions.set(
      getPendingImageKey(fileId, resolution.blockId, resolution.pendingUrl),
      resolution,
    );
  });
  rememberEditorResolutions(editor, resolutions);

  try {
    reconcilePendingImages(editor, fileId);
  } catch (error) {
    console.warn('[asset] 图片编辑器回填延后处理:', error);
  }
  let persisted = true;
  try {
    persisted = (await onResolved?.(resolutions)) !== false;
  } catch (error) {
    persisted = false;
    console.error('[asset] 图片内容回填失败:', error);
    message.error('图片内容回填失败');
  }
  if (persisted) forgetPersistedResolutions(resolutions);

  pendingImages.forEach(({ revoke, url }) => {
    if (revoke) {
      window.URL.revokeObjectURL(url);
    }
  });
};

const encodeLocalMediaPath = (value) => String(value)
  .replace(/\\/g, '/')
  .split('/')
  .map((segment) => encodeURIComponent(segment))
  .join('/');

export function useEditorImageUpload({ localProjectSupported, selectedProjectRootPath }) {
  const assetProjectRootRef = useRef('');

  useEffect(() => {
    assetProjectRootRef.current = selectedProjectRootPath;
  }, [selectedProjectRootPath]);

  const uploadFile = useCallback(async (file) => {
    // 粘贴发生时就固定目标项目，避免 FileReader/IPC 等待期间切文档后存错目录。
    const projectRootPath = assetProjectRootRef.current;
    const dataUrl = await fileToDataUrl(file);
    if (!localProjectSupported || !projectRootPath) return dataUrl;

    try {
      const { base64, mimeSubtype } = parseDataUrl(dataUrl);
      const res = await saveBinaryAsset({
        projectRootPath,
        base64,
        mimeSubtype,
      });
      if (!res?.relativePath) throw new Error('保存素材失败');
      const absPath = `${projectRootPath}/${res.relativePath}`;
      return `local-media://${encodeLocalMediaPath(absPath)}`;
    } catch (error) {
      console.error('[asset] 保存截图失败，降级为内嵌:', error);
      message.warning('图片未能存入素材库，已内嵌到文档');
      return dataUrl;
    }
  }, [localProjectSupported]);

  return { uploadFile };
}
