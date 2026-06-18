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
import {
  buildAllToolDefinitions,
  executeTool,
  getToolLabel,
  registerServerToolLabels,
} from './toolRegistry.js';
import { formatTaskContextPacket } from './taskContext.js';

const DEFAULT_MAX_STEPS = 8;

const ROLE_RULES = [
  '你是 md-render 内容创作工作台里的 AI 助手，不只是聊天，还要直接操作这个 app。',
  '你能读写当前文档、搜索工作区、打开文档或文件夹、切换主要面板，并按需要新建文档或文件夹。',
  '工作方式：先用工具了解情况，再动手。',
  '只有当系统简报里的“当前界面”是文档工作区，或用户明确在写稿/改稿时，才优先按创作助手方式工作。',
  '如果当前不在文档工作区，默认先按工作台助手处理：切界面、打开条目、整理工作区、操作 Daily / 白板 / 看板 / 发布等。',
  '当用户要求“打开 / 切到 / 带我去”某个界面时，优先调用 open_surface，直接切换界面，不要只告诉用户点哪里。',
  '当用户要求打开某篇文档、某个文件夹、某条搜索结果时，先定位 id，再调用 open_workspace_item。',
  '当用户要求整理工作区、建目录、建文件夹时，调用 create_folder。',
  '改写或生成正文前，先用 read_active_doc 看清现状，避免覆盖丢失内容。',
  '关键规则：当用户的意图是改动当前正文（如润色、改写、压缩、扩写、整理、续写、翻译、替换某段），',
  '处理完后必须调用 write_active_doc 把结果写回文档，而不是只在对话里输出文字。',
  '写入会先给用户一张 diff 卡片确认，所以放心调用。',
  '当用户明确要求保留原稿、另存为新文档、生成平台版本但不要覆盖当前文档时，必须调用 create_new_doc，新建文件，不要改写当前文档。',
  '当用户要求添加今日任务、事件、今日记录或待办时，优先调用 add_daily_entry 或 add_todo_entry，直接落到 Daily 面板。',
  '当用户要求开选题、开稿、建资料单或建待发布稿时，优先调用 create_content_entry，而不是只给建议。',
  '当用户要求打开白板、往白板加卡片、在灵感白板上画流程/关系图时，优先调用 open_canvas、append_canvas_cards、replace_canvas 或 clear_canvas。',
  '如果用户明确要“画到白板上”“操作白板”，不要只返回 Mermaid 或文字步骤，要直接调用白板工具落到页面。',
  '当用户问「有没有相关旧文」「帮我找参考」，或需要补充上下文 / 引用既有内容时，调用 recall_related_docs 主动召回工作区里的相关旧文。',
  '你还能调用 server 端注册的脚本工具（如 pdf_to_docx、video_to_audio 等）来处理本地文件操作，',
  '遇到需要转换文件格式、提取音视频、处理本地资源的任务时优先考虑用工具，而不是给出用户手动操作的步骤。',
  '只有当用户明确是提问、要建议、要标题候选等「不改动正文」的需求时，才直接在对话里回答。',
  '回答用中文，简洁直接，不要解释你调用了哪些工具。',
].join('\n');

const APP_BRIEF = [
  '产品知识：md-render 是本地优先的内容创作工作台，不是通用聊天框。',
  '模式分流：文档工作区偏创作；其它界面偏工作台操作。',
  '主要界面：总览、文档工作区、今日速记、灵感白板、创作看板、发布队列、知识库搜索、关系图谱、同步中心、设置。',
  '核心对象：当前稿件、工作区知识库、相关旧文、平台版本、Daily 速记、新生成文档、工作区目录。',
  '核心任务：写作、改写、引用旧文、生成平台版本、整理知识库内容、记录今日事项、创建选题与稿件、切换界面、打开条目。',
  '行为边界：知识库搜索结果不等于当前正文；没有明确要求时不要覆盖原文；用户要求保留原稿时优先新建文档。',
  '取数原则：先看系统给的任务简报，再决定是否调用工具读取全文或更多元数据。',
].join('\n');

const buildSystemPrompt = (taskContext) => {
  const sections = [ROLE_RULES, APP_BRIEF];
  const contextText = formatTaskContextPacket(taskContext);
  if (contextText) sections.push(contextText);
  return sections.join('\n\n');
};

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
 * @param {object} params.host             宿主能力 { readActiveDoc, writeActiveDoc, createNewDoc, searchDocs }
 * @param {function} [params.onEvent]      进度回调，见下方事件类型
 * @param {number} [params.maxSteps]
 * @param {AbortSignal} [params.signal]
 * @param {object} [params.taskContext]
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
  serverTools = [],
  taskContext = null,
}) => {
  const messages = [
    { role: 'system', content: buildSystemPrompt(taskContext) },
    ...history,
    { role: 'user', content: String(userInput ?? '') },
  ];

  // 注册 server 工具标签（用于 UI 显示），合并工具 schema
  if (serverTools.length) {
    const labels = Object.fromEntries(
      serverTools.map((t) => [t.function?.name, t.function?.name]),
    );
    registerServerToolLabels(labels);
  }
  const allTools = buildAllToolDefinitions(serverTools);

  let finalText = '';

  for (let step = 0; step < maxSteps; step += 1) {
    if (signal?.aborted) throw new Error('已取消');

    const message = await callChatCompletion({
      messages,
      tools: allTools,
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
