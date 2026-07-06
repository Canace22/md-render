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

export const pickClipboardImageFile = (clipboardData) => {
  const items = clipboardData?.items;
  if (!items) return null;
  for (const item of items) {
    if (item.kind === 'file' && item.type?.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
};

export const insertImageFromFile = async (editor, file, uploadFile) => {
  try {
    const url = await uploadFile(file);
    const currentBlock = editor.getTextCursorPosition()?.block;
    const imageBlock = { type: 'image', props: { url } };
    if (!currentBlock) {
      editor.insertBlocks([imageBlock], editor.document[0], 'after');
      return;
    }
    const isEmptyParagraph =
      currentBlock.type === 'paragraph' &&
      !currentBlock.content?.length &&
      !(currentBlock.children?.length > 0);
    if (isEmptyParagraph) {
      editor.updateBlock(currentBlock, imageBlock);
    } else {
      editor.insertBlocks([imageBlock], currentBlock, 'after');
    }
  } catch (error) {
    console.error('[asset] 粘贴图片失败:', error);
    message.error('图片粘贴失败');
  }
};

export function useEditorImageUpload({ localProjectSupported, selectedProjectRootPath }) {
  const assetProjectRootRef = useRef('');

  useEffect(() => {
    assetProjectRootRef.current = selectedProjectRootPath;
  }, [selectedProjectRootPath]);

  const uploadFile = useCallback(async (file) => {
    const dataUrl = await fileToDataUrl(file);
    const projectRootPath = assetProjectRootRef.current;
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
      return `local-media://${encodeURI(absPath)}`;
    } catch (error) {
      console.error('[asset] 保存截图失败，降级为内嵌:', error);
      message.warning('图片未能存入素材库，已内嵌到文档');
      return dataUrl;
    }
  }, [localProjectSupported]);

  return { uploadFile };
}
