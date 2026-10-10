/** 剧本 / 节拍解析共用的块工具（纯函数） */
import { inlineToPlainText } from '../daily/dailyMarkdown.js';

export const blockText = (block) => inlineToPlainText(block?.content).trim();

/** 场景标题以场次号开头：「1. 日 内 咖啡馆」「第12场 …」 */
export const SCENE_NUMBER_RE = /^(?:第\s*)?(\d+)\s*场?\s*[.、．:：]?\s*/;

export const isSceneHeadingBlock = (block) => block?.type === 'heading' && SCENE_NUMBER_RE.test(blockText(block));

export const headingLevel = (block) => Number(block?.props?.level) || 1;

/** 剧本基本平铺，但也把子块摊平，防止有人缩进了几行 */
export const flattenBlocks = (blocks) => (Array.isArray(blocks) ? blocks : [])
  .flatMap((block) => [block, ...flattenBlocks(block?.children)]);
