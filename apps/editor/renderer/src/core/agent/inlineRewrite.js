import { callChatCompletion } from './aiClient.js';
import { stripPrivateReasoning } from './assistantResponse.js';

export const INLINE_REWRITE_INSTRUCTIONS = Object.freeze({
  polish: '在不改变原意和事实的前提下，把表达改得自然、顺畅、准确。',
  colloquial: '改成自然的口语表达，像真人在说话，避免网络热词堆砌。',
  formal: '改成克制、清晰、正式的书面表达，不要使用空泛套话。',
  concise: '改得更简洁直接，保留原有信息和语气，删掉不必要的绕弯。',
  shorten: '尽量压缩篇幅，删除重复和次要信息，只保留核心意思。',
});

const SYSTEM_PROMPT = [
  '你是一个中文文字编辑，只改写用户选中的文字。',
  '只返回改写后的正文，不要解释，不要加标题、引号或代码围栏。',
  '不得增加原文没有的事实、数字、来源或结论。',
].join('\n');

const normalizeContext = (context) => {
  if (!context) return '';
  if (typeof context === 'string') return context.trim();
  const before = String(context.before ?? '').trim();
  const after = String(context.after ?? '').trim();
  return [
    before ? `前一段（仅供理解，不要输出）：\n${before}` : '',
    after ? `后一段（仅供理解，不要输出）：\n${after}` : '',
  ].filter(Boolean).join('\n\n');
};

export const buildInlineRewriteMessages = ({ text, context, instruction }) => {
  const source = String(text ?? '').trim();
  if (!source) throw new Error('请先选中要处理的文字');

  const instructionText = INLINE_REWRITE_INSTRUCTIONS[instruction];
  if (!instructionText) throw new Error('未知的改写方式');

  const contextText = normalizeContext(context);
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        `任务：${instructionText}`,
        contextText,
        `选中原文：\n${source}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
};

/**
 * 只改写一段选区：不传 tools，不进 agent loop，直接返回干净正文。
 * onDelta 收到的是“当前累积正文”，便于 UI 直接替换预览内容。
 */
export const runInlineRewrite = async ({
  text,
  context = null,
  instruction = 'polish',
  signal,
  onDelta = () => {},
  config,
}) => {
  const messages = buildInlineRewriteMessages({ text, context, instruction });
  let streamedText = '';

  const response = await callChatCompletion({
    messages,
    tools: undefined,
    config,
    signal,
    onDelta: (chunk) => {
      streamedText += String(chunk ?? '');
      onDelta(stripPrivateReasoning(streamedText));
    },
  });

  if (signal?.aborted) throw new Error('已取消');
  const result = stripPrivateReasoning(response?.content);
  if (!result) throw new Error('模型没有返回可用的改写结果');
  return result;
};
