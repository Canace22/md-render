/**
 * 工具注册表：把宿主能力（读文档 / 写文档 / 搜索）描述成
 * OpenAI tools 协议，供 agentEngine 调用。
 *
 * 设计：工具定义（schema）是纯数据；执行逻辑依赖外部注入的 `host`，
 * 工具本身不直接碰 IPC / store，便于单测时用假 host 替换。
 *
 * host 接口约定（由 AgentPanel 注入，内部对接 store / IPC）：
 *   host.readActiveDoc()            -> { title, content }
 *   host.writeActiveDoc(content)    -> string           （提交一次写入；返回给模型的结果文案，
 *                                                         如「已应用」「用户已放弃」。可异步）
 *   host.createNewDoc(payload)      -> string           （新建一篇 Markdown 文档；返回创建结果文案）
 *   host.searchDocs(query)          -> [{ title, snippet, id }]
 */

import { extractRecallKeywords, rankRelatedDocs } from './contextRecall.js';

const MAX_SEARCH_RESULTS = 8;
const MAX_SNIPPET_CHARS = 200;
const MAX_RECALL_RESULTS = 5; // 主动召回返回的相关旧文条数
const MAX_RECALL_KEYWORDS = 6; // 用于召回搜索的关键词条数

/** OpenAI 工具定义（纯数据，无副作用）
 *
 * 本地工具（读/写/搜索文档）写死在这里；
 * server 端注册的脚本工具（pdf_to_docx、video_to_audio 等）通过 fetchServerTools() 动态拉取合并。
 */

/** 标记这是 server 端工具，需要在 toolRegistry 加载时拉取并合并 */
const SERVER_TOOL_MARKER = '__server_tool__';
export const TOOL_DEFINITIONS = Object.freeze([
  {
    type: 'function',
    function: {
      name: 'read_active_doc',
      description: '读取当前正在编辑的文档的标题和正文。当你需要了解用户当前文档内容时调用。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write_active_doc',
      description: '把新的正文写入当前文档（整体覆盖）。当用户要求改写、生成或整理当前文档内容时调用。调用前应已通过 read_active_doc 了解现状。',
      parameters: {
        type: 'object',
        properties: {
          content: { type: 'string', description: '要写入文档的完整 Markdown 正文' },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_new_doc',
      description: '新建一篇 Markdown 文档，保留当前文档不变。当用户要求另存为新稿、生成平台版本但不要覆盖原文、或拆出独立文档时调用。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '新文档文件名，建议带平台或用途后缀' },
          content: { type: 'string', description: '要写入新文档的完整 Markdown 正文' },
          targetPlatforms: {
            type: 'array',
            description: '新文档关联的平台标识列表，如 wechat / xiaohongshu / zhihu',
            items: { type: 'string' },
          },
        },
        required: ['content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_docs',
      description: '在工作区的所有文档中全文搜索关键词，返回匹配的文档标题和摘要。当你需要查找其他文档作为参考或上下文时调用。',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: '搜索关键词' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recall_related_docs',
      description:
        '根据当前文档（标题 + 正文）主动召回工作区里相关的旧文，供写作引用参考。当用户问「有没有相关旧文」「帮我找参考」，或你需要补充上下文 / 引用既有内容时调用。无需传参，会自动读当前文档并按关键词相关度排序返回。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
]);

const truncate = (text, max) => {
  const str = String(text ?? '');
  return str.length <= max ? str : `${str.slice(0, max)}…`;
};

const parseArgs = (raw) => {
  if (raw && typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw || '{}');
  } catch {
    return {};
  }
};

/** 多关键词分别搜工作区，按 id（无 id 退化用标题）合并去重 */
const collectCandidates = async (host, keywords) => {
  const byKey = new Map();
  for (const kw of keywords) {
    const hits = (await host.searchDocs(kw)) || [];
    hits.forEach((hit) => {
      const key = hit?.id ?? hit?.title;
      if (key != null && !byKey.has(key)) byKey.set(key, hit);
    });
  }
  return [...byKey.values()];
};

/** 工具执行器：name -> async (args, host) => 结果字符串 */
const EXECUTORS = {
  read_active_doc: async (_args, host) => {
    const doc = await host.readActiveDoc();
    if (!doc || !String(doc.content ?? '').trim()) {
      return '当前文档为空。';
    }
    return JSON.stringify({ title: doc.title ?? '', content: doc.content ?? '' });
  },

  write_active_doc: async (args, host) => {
    const content = String(args?.content ?? '');
    if (!content.trim()) return '写入失败：内容为空。';
    // host 提交写入（可能弹 diff 让用户确认），返回结果文案回填给模型
    const result = await host.writeActiveDoc(content);
    return typeof result === 'string' ? result : `已提交写入（${content.length} 字）。`;
  },

  create_new_doc: async (args, host) => {
    const content = String(args?.content ?? '');
    if (!content.trim()) return '新建失败：内容为空。';
    const result = await host.createNewDoc({
      name: args?.name,
      content,
      targetPlatforms: args?.targetPlatforms,
    });
    return typeof result === 'string' ? result : '已创建新文档。';
  },

  search_docs: async (args, host) => {
    const query = String(args?.query ?? '').trim();
    if (!query) return '搜索失败：关键词为空。';
    const results = (await host.searchDocs(query)) || [];
    if (!results.length) return `未找到与「${query}」相关的文档。`;
    const top = results.slice(0, MAX_SEARCH_RESULTS).map((r) => ({
      title: r.title ?? '未命名',
      snippet: truncate(r.snippet ?? '', MAX_SNIPPET_CHARS),
    }));
    return JSON.stringify(top);
  },

  recall_related_docs: async (_args, host) => {
    const doc = await host.readActiveDoc();
    if (!doc || !String(doc.content ?? '').trim()) {
      return '当前文档为空，无法据此召回相关旧文。';
    }
    const keywords = extractRecallKeywords(doc, { max: MAX_RECALL_KEYWORDS });
    if (!keywords.length) return '未能从当前文档提取到关键词。';

    // 多个关键词分别搜，再按 id/标题合并去重，得到候选集
    const candidates = await collectCandidates(host, keywords);
    // 候选叠加 snippet 作为内容参与重合度排序，排除当前文档自身
    const ranked = rankRelatedDocs(doc, candidates, {
      limit: MAX_RECALL_RESULTS,
      keywords,
    });
    if (!ranked.length) return '工作区里没有与当前文档明显相关的旧文。';

    const top = ranked.map((r) => ({
      id: r.id ?? null,
      title: r.title ?? '未命名',
      snippet: truncate(r.snippet ?? r.content ?? '', MAX_SNIPPET_CHARS),
    }));
    return JSON.stringify(top);
  },
};

/**
 * 执行一个工具调用。
 * @param {object} toolCall  OpenAI 的 tool_call 对象 { id, function: { name, arguments } }
 * @param {object} host      宿主能力（含可选 host.execServerTool 用于 server 工具）
 * @returns {Promise<string>} 工具结果（字符串，回填给模型）
 */
export const executeTool = async (toolCall, host) => {
  const name = toolCall?.function?.name;
  const executor = EXECUTORS[name];
  if (executor) {
    try {
      const args = parseArgs(toolCall?.function?.arguments);
      return await executor(args, host);
    } catch (error) {
      return `工具「${name}」执行出错：${error?.message ?? String(error)}`;
    }
  }
  // 本地 EXECUTORS 找不到 → 走 server 工具执行器
  return executeServerTool(toolCall, host);
};

/** 工具名 → 中文标签（给任务清单 UI 显示用）
 *
 * 本地标签写死在这里；server 工具通过 registerServerToolLabels 动态注册。
 */
const _localToolLabels = Object.freeze({
  read_active_doc: '读取当前文档',
  write_active_doc: '写入当前文档',
  create_new_doc: '新建文档',
  search_docs: '搜索工作区',
  recall_related_docs: '召回相关旧文',
});

const _serverToolLabels = {};
export const registerServerToolLabels = (labels) => {
  for (const [name, label] of Object.entries(labels || {})) {
    _serverToolLabels[name] = label;
  }
};

export const getToolLabel = (name) => _serverToolLabels[name] || _localToolLabels[name] || name;

// ── Server 端脚本工具（动态加载） ──────────────────────────
//
// pdf_to_docx、video_to_audio 等由 ai-proxy server 的 tools/ 目录提供。
// Renderer 启动时从 server 拉 schema，并注册对应的执行器（通过 host.execServerTool）。
// 这样新工具只需在 server 丢一个 manifest + 脚本，不用改前端代码。

/** server 工具的本地缓存：name -> { definition, label } */
let _serverToolsCache = null;

/** 拉取 server 工具 schema */
export const fetchServerTools = async (fetchFn) => {
  if (_serverToolsCache) return _serverToolsCache;
  try {
    const data = await fetchFn('/api/tools/schema');
    const tools = Array.isArray(data?.tools) ? data.tools : [];
    _serverToolsCache = tools;
    return _serverToolsCache;
  } catch {
    _serverToolsCache = [];
    return _serverToolsCache;
  }
};

/** 合并本地 + server 工具定义，供 agentEngine 调用 */
export const buildAllToolDefinitions = (serverTools = []) => {
  return [...TOOL_DEFINITIONS, ...serverTools];
};

/**
 * 执行 server 工具（在 EXECUTORS 表里查不到时走这条路径）。
 * @param {object} toolCall  OpenAI tool_call
 * @param {object} host     需实现 host.execServerTool(toolName, args) -> Promise<string>
 * @returns {Promise<string>}
 */
export const executeServerTool = async (toolCall, host) => {
  const name = toolCall?.function?.name;
  if (!host?.execServerTool) {
    return `工具「${name}」不可用：server 工具执行通道未连接。`;
  }
  try {
    const args = JSON.parse(toolCall?.function?.arguments || '{}');
    const result = await host.execServerTool(name, args);
    return typeof result === 'string' ? result : JSON.stringify(result);
  } catch (error) {
    return `工具「${name}」执行出错：${error?.message ?? String(error)}`;
  }
};
