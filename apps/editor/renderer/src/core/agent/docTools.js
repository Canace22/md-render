/**
 * 按 id 操作文档的工具（不依赖「当前打开的是哪篇」）：
 * read_doc / propose_edit / update_doc_meta / list_docs / get_proposal_status。
 * read_active_doc / write_active_doc 仍保留，相当于不传 id 的 read_doc / 等确认的 propose_edit。
 *
 * 定义是纯数据；执行器只通过 host 拿能力（见 createHost.js）。
 */

export const DOC_STATUSES = Object.freeze(['idea', 'collecting', 'drafting', 'revising', 'ready', 'published']);
const MAX_LIST_LIMIT = 50;
const DEFAULT_LIST_LIMIT = 20;

const fn = (name, description, properties = {}, required = []) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});

export const DOC_TOOL_DEFINITIONS = Object.freeze([
  fn(
    'read_doc',
    '按 id 读取一篇文档的正文、元数据和 baseHash；不传 id 时读当前打开的文档。改正文前先用它拿 baseHash。',
    { id: { type: 'string', description: '文档 id；不传表示当前文档' } },
  ),
  fn(
    'propose_edit',
    '提交一次改正文提案（整篇替换），立即返回 proposalId 和 pending，不等用户确认。用户在收件箱或编辑器里应用/放弃后，用 get_proposal_status 查结果。baseHash 和当前内容不一致会被拒绝，需要重新 read_doc。',
    {
      id: { type: 'string', description: '目标文档 id；不传表示当前文档' },
      content: { type: 'string', description: '新的完整 Markdown 正文' },
      baseHash: { type: 'string', description: 'read_doc 返回的 baseHash，防止覆盖用户刚改的内容' },
    },
    ['content'],
  ),
  fn(
    'update_doc_meta',
    '修改文档元数据（可逆操作，直接生效）：标题、摘要、状态、标签、目标平台、计划发布时间、别名、来源素材。只传要改的字段。',
    {
      id: { type: 'string', description: '文档 id' },
      title: { type: 'string' },
      summary: { type: 'string' },
      status: { type: 'string', enum: DOC_STATUSES, description: '稿件状态' },
      tags: { type: 'array', items: { type: 'string' } },
      targetPlatforms: { type: 'array', items: { type: 'string' }, description: '如 wechat / xiaohongshu / zhihu' },
      scheduledPublishAt: { type: 'string', description: 'YYYY-MM-DD 或 YYYY-MM-DDTHH:mm' },
      aliases: { type: 'array', items: { type: 'string' } },
      sourceMaterialIds: { type: 'array', items: { type: 'string' } },
    },
    ['id'],
  ),
  fn(
    'list_docs',
    '按条件列出工作区文档（只返回 id、标题、状态等指针，不含正文）。',
    {
      status: { type: 'string', enum: DOC_STATUSES },
      tag: { type: 'string' },
      platform: { type: 'string' },
      folderId: { type: 'string', description: '只列这个文件夹（含子文件夹）里的文档' },
      query: { type: 'string', description: '标题包含的关键词' },
      limit: { type: 'number', description: `最多返回多少条，默认 ${DEFAULT_LIST_LIMIT}，上限 ${MAX_LIST_LIMIT}` },
    },
  ),
  fn(
    'render_platform_html',
    '把文档渲染成公众号可直接粘贴的 HTML（样式已内联，和编辑器「复制公众号」一致）。只读，不改文档。',
    {
      id: { type: 'string', description: '文档 id；不传表示当前文档' },
      template: { type: 'string', description: '排版模板 id：default / infoq / dark / juejin，默认 default' },
    },
  ),
  fn(
    'get_proposal_status',
    '查询一个提案的状态：pending（等待确认）/ applied（已应用）/ discarded（已放弃）/ conflict（提案后文档被改过，未应用）。',
    { proposalId: { type: 'string' } },
    ['proposalId'],
  ),
]);

export const DOC_TOOL_LABELS = Object.freeze({
  read_doc: '读取文档',
  propose_edit: '提交改动提案',
  update_doc_meta: '修改文档元数据',
  list_docs: '列出文档',
  get_proposal_status: '查询提案状态',
  render_platform_html: '渲染公众号排版',
  disk_change: '文件被外部修改',
});

const META_KEYS = ['title', 'summary', 'status', 'tags', 'targetPlatforms', 'scheduledPublishAt', 'aliases', 'sourceMaterialIds'];
const clean = (value) => String(value ?? '').trim();
const toJson = (value) => JSON.stringify(value);

/** 只挑允许改的元数据字段 */
export const pickDocMetaPatch = (args = {}) => {
  const patch = {};
  META_KEYS.forEach((key) => {
    if (Object.prototype.hasOwnProperty.call(args, key)) patch[key] = args[key];
  });
  return patch;
};

export const clampListLimit = (limit) => {
  const value = Number(limit);
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIST_LIMIT;
  return Math.min(Math.floor(value), MAX_LIST_LIMIT);
};

export const DOC_TOOL_EXECUTORS = Object.freeze({
  read_doc: async (args, host) => {
    const doc = await host.readDoc?.(clean(args?.id));
    return doc ? toJson(doc) : `读取失败：未找到文档${clean(args?.id) ? `「${clean(args.id)}」` : '（当前没有打开的文档）'}。`;
  },

  propose_edit: async (args, host) => {
    const content = String(args?.content ?? '');
    if (!content.trim()) return '提交失败：内容为空。';
    const result = await host.proposeEdit?.({ id: clean(args?.id), content, baseHash: clean(args?.baseHash) });
    return typeof result === 'string' ? result : toJson(result ?? { ok: false, error: '当前环境不支持提案' });
  },

  update_doc_meta: async (args, host) => {
    const id = clean(args?.id);
    if (!id) return '修改失败：文档 id 为空。';
    const patch = pickDocMetaPatch(args);
    if (!Object.keys(patch).length) return '修改失败：没有要改的字段。';
    if (patch.status && !DOC_STATUSES.includes(patch.status)) return `修改失败：状态只能是 ${DOC_STATUSES.join(' / ')}。`;
    return host.updateDocMeta?.({ id, patch }) ?? '修改失败：当前环境不支持。';
  },

  list_docs: async (args, host) => {
    const docs = await host.listDocs?.({
      status: clean(args?.status),
      tag: clean(args?.tag),
      platform: clean(args?.platform),
      folderId: clean(args?.folderId),
      query: clean(args?.query),
      limit: clampListLimit(args?.limit),
    });
    return toJson({ ok: true, docs: docs ?? [] });
  },

  render_platform_html: async (args, host) => {
    const result = await host.renderPlatformHtml?.({ id: clean(args?.id), template: clean(args?.template) || 'default' });
    return toJson(result ?? { ok: false, error: '当前环境不支持排版渲染' });
  },

  get_proposal_status: async (args, host) => {
    const id = clean(args?.proposalId);
    if (!id) return '查询失败：proposalId 为空。';
    return toJson(await host.getProposalStatus?.(id) ?? { ok: false, error: '当前环境不支持提案' });
  },
});
