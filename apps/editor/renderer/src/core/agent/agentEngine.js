/**
 * Agent 引擎：最小可用的 agent loop。
 *
 * 原理（一句话）：把"系统提示 + 工具清单 + 对话历史"发给模型，
 * 模型要么直接回答、要么要求调工具；调了就执行并把结果塞回对话，
 * 然后再问一次，如此循环，直到模型给最终答复或达到步数上限。
 *
 * 本模块不直接碰 IPC / store / React：
 * 模型调用走 callChatCompletion，工具执行走 host，进度通过 onEvent 回调上报。
 * 这样引擎是可测试的（注入假的 callChatCompletion 和 host 即可）。
 */

import { callChatCompletion } from './aiClient.js';
import { TOOL_DEFINITIONS, executeTool, getToolLabel } from './toolRegistry.js';

const DEFAULT_MAX_STEPS = 8;

const SYSTEM_PROMPT = [
  '你是 md-render 内容创作工作台里的 AI 助手，能读写用户当前文档、搜索工作区。',
  '工作方式：先用工具了解情况，再动手。',
  '改写或生成正文前，先用 read_active_doc 看清现状，避免覆盖丢失内容。',
  '关键规则：当用户的意图是改动当前正文（如润色、改写、压缩、扩写、整理、续写、翻译、替换某段），',
  '处理完后必须调用 write_active_doc 把结果写回文档，而不是只在对话里输出文字。',
  '写入会先给用户一张 diff 卡片确认，所以放心调用。',
  '只有当用户明确是提问、要建议、要标题候选等「不改动正文」的需求时，才直接在对话里回答。',
  '回答用中文，简洁直接，不要解释你调用了哪些工具。',
].join('\n');

/** 把模型返回的 assistant 消息规整成可追加进历史的对象 */
const toAssistantMessage = (message) => ({
  role: 'assistant',
  content: message.content ?? '',
  ...(message.tool_calls ? { tool_calls: message.tool_calls } : {}),
});

/**
 * 运行一次 agent 任务。
 * @param {object} params
 * @param {string} params.userInput        用户这轮的输入
 * @param {Array}  [params.history]         之前的对话历史（OpenAI 格式，不含 system）
 * @param {object} params.config           AI 配置 { proxyBase, upstreamHost, apiKey, model }
 * @param {object} params.host             宿主能力 { readActiveDoc, writeActiveDoc, searchDocs }
 * @param {function} [params.onEvent]      进度回调，见下方事件类型
 * @param {number} [params.maxSteps]
 * @param {AbortSignal} [params.signal]
 * @returns {Promise<{ finalText: string, history: Array }>}
 *
 * onEvent 事件类型：
 *   { type: 'assistant_text', text }           模型的中间/最终文字
 *   { type: 'tool_start', name, label, args }  开始执行某工具
 *   { type: 'tool_done', name, label, result } 工具执行完成
 *   { type: 'error', message }
 *   { type: 'done', finalText }
 */
export const runAgent = async ({
  userInput,
  history = [],
  config,
  host,
  onEvent = () => {},
  maxSteps = DEFAULT_MAX_STEPS,
  signal,
}) => {
  const messages = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: String(userInput ?? '') },
  ];

  let finalText = '';

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal?.aborted) throw new Error('已取消');

    const message = await callChatCompletion({
      messages,
      tools: TOOL_DEFINITIONS,
      config,
      signal,
    });

    messages.push(toAssistantMessage(message));

    const toolCalls = message.tool_calls;

    // 没有工具调用 → 这是最终答复，结束循环
    if (!toolCalls || !toolCalls.length) {
      finalText = message.content ?? '';
      if (finalText) onEvent({ type: 'assistant_text', text: finalText });
      onEvent({ type: 'done', finalText });
      break;
    }

    // 有工具调用 → 逐个执行，把结果回填进历史
    for (const call of toolCalls) {
      const name = call.function?.name;
      const label = getToolLabel(name);
      let args = {};
      try {
        args = JSON.parse(call.function?.arguments || '{}');
      } catch {
        args = {};
      }

      onEvent({ type: 'tool_start', name, label, args });
      const result = await executeTool(call, host);
      onEvent({ type: 'tool_done', name, label, result });

      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: result,
      });
    }

    // 达到步数上限仍未收尾
    if (step === maxSteps - 1) {
      finalText = '已达到最大步数上限，任务可能未完全完成。';
      onEvent({ type: 'assistant_text', text: finalText });
      onEvent({ type: 'done', finalText });
    }
  }

  // 把本轮 user + assistant 追加进可复用的历史（剔除 system）
  const nextHistory = messages.filter((m) => m.role !== 'system');
  return { finalText, history: nextHistory };
};
