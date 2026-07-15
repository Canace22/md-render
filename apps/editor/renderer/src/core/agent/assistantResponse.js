import { parseAssistantChoiceCards } from './choiceCards.js';

export const EMPTY_ASSISTANT_RESPONSE = '模型未返回可展示的最终答复，请重试。';

const REASONING_TAG_PATTERN = /<\s*(\/?)\s*(?:think|analysis)(?=\s|\/?>)[^>]*>/gi;
const LEADING_REASONING_OPEN_PATTERN = /^\s*<\s*(?:think|analysis)(?=\s|\/?>)[^>]*>/i;
const LEADING_REASONING_CLOSE_PATTERN = /^\s*<\s*\/\s*(?:think|analysis)(?=\s|>)[^>]*>/i;
const LEADING_REASONING_PREFIX_PATTERN = /^\s*<\s*(?:think|analysis)(?=\s|\/?>|\/?$)/i;
const PARTIAL_CHOICE_PATTERN = /<!--\s*agent-choice[\s\S]*$/i;

/**
 * 去掉 assistant 开头的私有推理块，不会误伤正文中的 XML / 代码示例。
 * 开头的推理块未闭合，或 opening tag 自身被截断时，丢弃至文本末尾。
 */
export const stripPrivateReasoning = (value) => {
  let remaining = String(value ?? '');

  while (LEADING_REASONING_OPEN_PATTERN.test(remaining)) {
    const opening = LEADING_REASONING_OPEN_PATTERN.exec(remaining);
    let hiddenDepth = 1;
    let blockEnd = -1;
    let match;

    REASONING_TAG_PATTERN.lastIndex = opening[0].length;
    while ((match = REASONING_TAG_PATTERN.exec(remaining))) {
      hiddenDepth += match[1] ? -1 : 1;
      if (hiddenDepth === 0) {
        blockEnd = REASONING_TAG_PATTERN.lastIndex;
        break;
      }
    }

    if (blockEnd < 0) return '';
    remaining = remaining.slice(blockEnd);
  }

  // 兼容只返回了 `<think` / `<analysis attr=` 的截断响应。
  if (LEADING_REASONING_PREFIX_PATTERN.test(remaining)) return '';

  // 孤立闭合标签只在回复开头处理，避免清空正常正文前缀。
  while (LEADING_REASONING_CLOSE_PATTERN.test(remaining)) {
    remaining = remaining.replace(LEADING_REASONING_CLOSE_PATTERN, '');
  }
  return remaining.trim();
};

export const normalizeAssistantContent = (
  value,
  { fallback = EMPTY_ASSISTANT_RESPONSE } = {},
) => stripPrivateReasoning(value) || fallback;

export const stripPartialChoiceProtocol = (value) =>
  String(value ?? '').replace(PARTIAL_CHOICE_PATTERN, '').trimEnd();

export const buildAssistantRenderPayload = (message) => {
  const safeText = normalizeAssistantContent(message?.text);
  if (message?.typing) {
    return {
      displayText: stripPartialChoiceProtocol(safeText),
      choices: [],
    };
  }
  return parseAssistantChoiceCards(safeText);
};
