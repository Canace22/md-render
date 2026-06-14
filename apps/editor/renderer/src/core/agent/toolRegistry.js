/**
 * 工具注册表：把宿主能力（读文档 / 写文档 / 搜索）描述成
 * OpenAI tools 协议，供 agentEngine 调用。
 *
 * 设计：工具定义（schema）是纯数据；执行逻辑依赖外部注入的 `host`，
 * 工具本身不直接碰 IPC / store，便于单测时用假 host 替换。
 *
 * host 接口约定（由 AgentPanel 注入，内部对接 store / IPC）：
 *   host.readActiveDoc()            -> { title, content }
 *   host.writeActiveDoc(content)    -> void            （覆盖当前文档正文）
 *   host.searchDocs(query)          -> [{ title, snippet, id }]
 */

const MAX_SEARCH_RESULTS = 8;
const MAX_SNIPPET_CHARS = 200;

/** OpenAI 工具定义（纯数据，无副作用） */
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
    await host.writeActiveDoc(content);
    return `已写入当前文档（${content.length} 字）。`;
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
};

/**
 * 执行一个工具调用。
 * @param {object} toolCall  OpenAI 的 tool_call 对象 { id, function: { name, arguments } }
 * @param {object} host      宿主能力
 * @returns {Promise<string>} 工具结果（字符串，回填给模型）
 */
export const executeTool = async (toolCall, host) => {
  const name = toolCall?.function?.name;
  const executor = EXECUTORS[name];
  if (!executor) return `未知工具：${name}`;
  try {
    const args = parseArgs(toolCall?.function?.arguments);
    return await executor(args, host);
  } catch (error) {
    return `工具「${name}」执行出错：${error?.message ?? String(error)}`;
  }
};

/** 工具名 → 中文标签（给任务清单 UI 显示用） */
export const TOOL_LABELS = Object.freeze({
  read_active_doc: '读取当前文档',
  write_active_doc: '写入当前文档',
  search_docs: '搜索工作区',
});

export const getToolLabel = (name) => TOOL_LABELS[name] || name;
