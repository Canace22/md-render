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
 *   host.createFolder(payload)      -> string           （新建文件夹；返回创建结果文案）
 *   host.searchDocs(query)          -> [{ title, snippet, id }]
 *   host.openSurface(args)          -> string           （切换 app 主界面）
 *   host.openWorkspaceItem(args)    -> string           （打开工作区里的文档或文件夹）
 *   host.getDailyOverview(args)     -> { ... }          （读取 Daily / 待办概况）
 *   host.openCanvas()               -> string           （切到灵感白板）
 *   host.appendCanvasCards(args)    -> string           （往灵感白板追加卡片）
 *   host.replaceCanvas(args)        -> string           （整体替换灵感白板内容）
 *   host.clearCanvas()              -> string           （清空灵感白板）
 */

import { extractRecallKeywords, rankRelatedDocs } from './contextRecall.js';

const MAX_SEARCH_RESULTS = 8;
const MAX_SNIPPET_CHARS = 200;
const MAX_RECALL_RESULTS = 5; // 主动召回返回的相关旧文条数
const MAX_RECALL_KEYWORDS = 6; // 用于召回搜索的关键词条数
const MAX_RECENT_DOCS = 6;
const OPENABLE_SURFACES = new Set([
  'overview',
  'paper',
  'daily',
  'canvas',
  'creation-board',
  'publishing',
  'search',
  'graph',
  'sync',
  'settings',
]);

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
      name: 'open_surface',
      description: '切换 app 主界面。可用于打开总览、文档工作区、今日速记、灵感白板、创作看板、发布队列、知识库搜索、关系图谱、同步中心或设置。',
      parameters: {
        type: 'object',
        properties: {
          surface: {
            type: 'string',
            description: '目标界面：overview、paper、daily、canvas、creation-board、publishing、search、graph、sync、settings',
          },
        },
        required: ['surface'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_canvas',
      description: '切换到灵感白板页面。适合处理“打开白板”“切到白板”这类请求。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'append_canvas_cards',
      description: '往灵感白板追加几张卡片，不清空已有内容。适合处理“往白板加几个点子/卡片”这类请求。',
      parameters: {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            description: '要追加到白板上的卡片列表。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '可选，卡片 id。后续关系连线可引用它。' },
                title: { type: 'string', description: '卡片标题' },
                summary: { type: 'string', description: '卡片正文/备注' },
                typeLabel: { type: 'string', description: '卡片类型标签，如 节点/问题/结论' },
                nodeType: { type: 'string', description: '内部节点类型标记，可选' },
                x: { type: 'number', description: '可选，卡片横坐标' },
                y: { type: 'number', description: '可选，卡片纵坐标' },
              },
              required: [],
            },
          },
        },
        required: ['cards'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'replace_canvas',
      description: '用一组卡片和箭头整体替换当前灵感白板。适合画流程图、关系图、脑图骨架等。会清空白板旧内容后重建。',
      parameters: {
        type: 'object',
        properties: {
          cards: {
            type: 'array',
            description: '白板上的卡片列表；如果后面有 edges，建议给每张卡片显式 id。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '卡片 id，供 edges 的 source/target 引用' },
                title: { type: 'string', description: '卡片标题' },
                summary: { type: 'string', description: '卡片正文/备注' },
                typeLabel: { type: 'string', description: '卡片类型标签，如 开始/步骤/分支' },
                nodeType: { type: 'string', description: '内部节点类型标记，可选' },
                x: { type: 'number', description: '可选，卡片横坐标' },
                y: { type: 'number', description: '可选，卡片纵坐标' },
              },
              required: [],
            },
          },
          edges: {
            type: 'array',
            description: '卡片之间的连线；source/target 填卡片 id，或直接填卡片标题。',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', description: '可选，连线 id' },
                source: { type: 'string', description: '起点卡片 id 或标题' },
                target: { type: 'string', description: '终点卡片 id 或标题' },
                label: { type: 'string', description: '可选，箭头上的文字' },
              },
              required: ['source', 'target'],
            },
          },
        },
        required: ['cards'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'clear_canvas',
      description: '清空灵感白板的当前内容。适合处理“清空白板”“重来一张空白板”这类请求。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
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
      name: 'get_active_doc_meta',
      description: '读取当前文档的标题、摘要、状态、标签、平台等元数据，不返回全文。当你要先理解当前稿件处于什么阶段时调用。',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_daily_entry',
      description: '向今日速记 / Daily 面板添加一条任务、事件或笔记。适合处理“加个今天待办”“记个今天的会议”“补一条今日记录”这类请求。',
      parameters: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            description: '条目类型：task、event 或 note',
            enum: ['task', 'event', 'note'],
          },
          text: { type: 'string', description: '条目内容' },
          dateKey: { type: 'string', description: '可选，目标日期，格式 YYYY-MM-DD；不传则默认当前 Daily 日期/今天' },
        },
        required: ['type', 'text'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_todo_entry',
      description: '往 Daily 的待办池添加一条待办。适合处理“先记个待办，稍后再安排到哪天”这类请求。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '待办内容' },
        },
        required: ['text'],
      },
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
          sourceMaterialIds: {
            type: 'array',
            description: '可选，明确标记这个新文档来源于哪些已有文档 id；不传时默认关联当前文档',
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
      name: 'create_folder',
      description: '在当前工作区位置新建一个文件夹。适合处理“建个文件夹”“新建目录整理资料”这类请求。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '可选，文件夹名称' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_content_entry',
      description: '新建一个内容条目，用于开选题、开稿、建资料单或建待发布稿。会创建一篇新的 Markdown 文档，并写入对应的稿件状态元数据。',
      parameters: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            description: '条目类型：topic=选题，draft=稿件，material=资料单，ready=待发布稿',
            enum: ['topic', 'draft', 'material', 'ready'],
          },
          name: { type: 'string', description: '可选，文档名称' },
          summary: { type: 'string', description: '可选，摘要/一句话说明' },
          content: { type: 'string', description: '可选，初始 Markdown 正文' },
          targetPlatforms: {
            type: 'array',
            description: '可选，目标平台标识列表，如 wechat / xiaohongshu / zhihu',
            items: { type: 'string' },
          },
        },
        required: ['kind'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_workspace_item',
      description: '按 id 打开工作区里的文档或文件夹。通常先用 search_docs、list_recent_docs 或 get_workspace_brief 拿到 id，再调用它。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '工作区条目 id' },
        },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'read_doc_by_id',
      description: '按文档 id 精确读取工作区里的某篇文档全文和元数据。当你已经知道要看哪一篇时调用，避免盲搜。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '文档 id' },
        },
        required: ['id'],
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
      name: 'list_recent_docs',
      description: '列出最近活跃的几篇文档及其简要元数据。当你需要快速判断近期工作上下文时调用。',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: '返回条数，默认 4，最大 6' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_workspace_brief',
      description: '获取当前工作区的简报，包括文档总数、高频标签和最近文档。适合先快速了解整个工作区概况。',
      parameters: { type: 'object', properties: {}, required: [] },
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
  open_surface: async (args, host) => {
    const surface = String(args?.surface ?? '').trim();
    if (!surface) return '切换失败：目标界面为空。';
    if (!OPENABLE_SURFACES.has(surface)) {
      return `切换失败：不支持界面「${surface}」。`;
    }
    const result = await host.openSurface?.({ surface });
    return typeof result === 'string' ? result : `已切换到${surface}。`;
  },

  open_canvas: async (_args, host) => {
    const result = await host.openCanvas?.();
    return typeof result === 'string' ? result : '已打开灵感白板。';
  },

  append_canvas_cards: async (args, host) => {
    const cards = Array.isArray(args?.cards) ? args.cards : [];
    if (!cards.length) return '添加失败：没有可添加的卡片。';
    const result = await host.appendCanvasCards?.({ cards });
    return typeof result === 'string' ? result : `已添加 ${cards.length} 张白板卡片。`;
  },

  replace_canvas: async (args, host) => {
    const cards = Array.isArray(args?.cards) ? args.cards : [];
    const edges = Array.isArray(args?.edges) ? args.edges : [];
    if (!cards.length) return '绘制失败：没有可用的白板卡片。';
    const result = await host.replaceCanvas?.({ cards, edges });
    return typeof result === 'string' ? result : `已重建白板，包含 ${cards.length} 张卡片。`;
  },

  clear_canvas: async (_args, host) => {
    const result = await host.clearCanvas?.();
    return typeof result === 'string' ? result : '已清空灵感白板。';
  },

  read_active_doc: async (_args, host) => {
    const doc = await host.readActiveDoc();
    if (!doc || !String(doc.content ?? '').trim()) {
      return '当前文档为空。';
    }
    return JSON.stringify({ title: doc.title ?? '', content: doc.content ?? '' });
  },

  get_active_doc_meta: async (_args, host) => {
    const doc = await host.getActiveDocMeta?.();
    if (!doc?.title) return '当前没有打开的文档。';
    return JSON.stringify(doc);
  },

  add_daily_entry: async (args, host) => {
    const type = String(args?.type ?? '').trim();
    const text = String(args?.text ?? '').trim();
    if (!type || !text) return '添加失败：条目类型或内容为空。';
    const result = await host.addDailyEntry?.({
      type,
      text,
      dateKey: args?.dateKey,
    });
    return typeof result === 'string' ? result : '已添加到今日速记。';
  },

  add_todo_entry: async (args, host) => {
    const text = String(args?.text ?? '').trim();
    if (!text) return '添加失败：待办内容为空。';
    const result = await host.addTodoEntry?.({ text });
    return typeof result === 'string' ? result : '已加入待办池。';
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
      sourceMaterialIds: args?.sourceMaterialIds,
    });
    return typeof result === 'string' ? result : '已创建新文档。';
  },

  create_folder: async (args, host) => {
    const result = await host.createFolder?.({
      name: args?.name,
    });
    return typeof result === 'string' ? result : '已创建文件夹。';
  },

  create_content_entry: async (args, host) => {
    const kind = String(args?.kind ?? '').trim();
    if (!kind) return '创建失败：条目类型为空。';
    const result = await host.createContentEntry?.({
      kind,
      name: args?.name,
      summary: args?.summary,
      content: args?.content,
      targetPlatforms: args?.targetPlatforms,
    });
    return typeof result === 'string' ? result : '已创建内容条目。';
  },

  read_doc_by_id: async (args, host) => {
    const id = String(args?.id ?? '').trim();
    if (!id) return '读取失败：文档 id 为空。';
    const doc = await host.readDocById?.(id);
    if (!doc) return `未找到 id 为「${id}」的文档。`;
    return JSON.stringify(doc);
  },

  open_workspace_item: async (args, host) => {
    const id = String(args?.id ?? '').trim();
    if (!id) return '打开失败：条目 id 为空。';
    const result = await host.openWorkspaceItem?.({ id });
    return typeof result === 'string' ? result : '已打开工作区条目。';
  },

  search_docs: async (args, host) => {
    const query = String(args?.query ?? '').trim();
    if (!query) return '搜索失败：关键词为空。';
    const results = (await host.searchDocs(query)) || [];
    if (!results.length) return `未找到与「${query}」相关的文档。`;
    const top = results.slice(0, MAX_SEARCH_RESULTS).map((r) => ({
      id: r.id ?? '',
      title: r.title ?? '未命名',
      snippet: truncate(r.snippet ?? '', MAX_SNIPPET_CHARS),
    }));
    return JSON.stringify(top);
  },

  list_recent_docs: async (args, host) => {
    const rawLimit = Number(args?.limit);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(MAX_RECENT_DOCS, Math.floor(rawLimit)))
      : 4;
    const results = (await host.listRecentDocs?.(limit)) || [];
    if (!results.length) return '当前工作区里还没有最近文档。';
    return JSON.stringify(results.slice(0, limit));
  },

  get_workspace_brief: async (_args, host) => {
    const brief = await host.getWorkspaceBrief?.();
    if (!brief) return '当前工作区不可用。';
    return JSON.stringify(brief);
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
  open_surface: '切换界面',
  open_canvas: '打开灵感白板',
  append_canvas_cards: '追加白板卡片',
  replace_canvas: '重建白板图',
  clear_canvas: '清空灵感白板',
  read_active_doc: '读取当前文档',
  get_active_doc_meta: '读取稿件元数据',
  add_daily_entry: '添加今日条目',
  add_todo_entry: '添加待办',
  get_daily_overview: '查看 Daily 概况',
  write_active_doc: '写入当前文档',
  create_new_doc: '新建文档',
  create_folder: '新建文件夹',
  create_content_entry: '创建内容条目',
  open_workspace_item: '打开工作区条目',
  read_doc_by_id: '读取指定文档',
  search_docs: '搜索工作区',
  list_recent_docs: '查看最近文档',
  get_workspace_brief: '查看工作区简报',
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
