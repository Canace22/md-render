/**
 * 命令面板注册表 —— 把散落在侧栏、顶栏、纸内工具条上的入口收成一份可搜索的清单。
 *
 * 这里只做"给已接好线的动作起个可搜索的名字"，不写业务逻辑：
 * 可用性判断（有没有选中文档、是不是本地项目）仍由各 handler 自己提示。
 * 纯函数、不 import store，ctx 由调用方注入，便于单测。
 */

/** 视图类命令：surface 字段供单测校验，不参与运行时逻辑 */
const SURFACE_COMMANDS = [
  { id: 'surface.overview', surface: 'overview', title: '创作首页', keywords: ['overview', 'shouye', '总览', '首页'] },
  { id: 'surface.daily', surface: 'daily', title: '今日速记', keywords: ['daily', 'jinri', '待办', '任务', '笔记'] },
  { id: 'surface.paper', surface: 'paper', title: '文档', keywords: ['doc', 'paper', 'wendang', '写作', '编辑器'] },
  { id: 'surface.canvas', surface: 'canvas', title: '画布工作台', keywords: ['canvas', 'huabu', '白板', '灵感'] },
  { id: 'surface.creation-board', surface: 'creation-board', title: '创作看板', keywords: ['board', 'kanban', '选题', '稿件'] },
  { id: 'surface.publishing', surface: 'publishing', title: '发布队列', keywords: ['publish', 'fabu', '排期', '待发布'] },
  { id: 'surface.search', surface: 'search', title: '搜索', keywords: ['search', 'sousuo', '查找', '全文'] },
  { id: 'surface.graph', surface: 'graph', title: '图谱视图', keywords: ['graph', 'tupu', '关系', '双链'] },
  { id: 'surface.json-tool', surface: 'json-tool', title: 'JSON 解析器', keywords: ['json', 'jiexi', '格式化'] },
  { id: 'surface.settings', surface: 'settings', title: '设置', keywords: ['settings', 'shezhi', '配置', '偏好'] },
];

const EXPORT_FORMATS = [
  { key: 'md', label: 'Markdown', keywords: ['md', 'markdown'] },
  { key: 'html', label: 'HTML', keywords: ['html', 'wangye'] },
  { key: 'pdf', label: 'PDF', keywords: ['pdf'] },
  { key: 'docx', label: 'Word', keywords: ['docx', 'word'] },
];

/** 视图切换统一走 openSurface，文档视图要按当前选中的是文件还是目录来解析 */
const buildSurfaceCommand = (entry, ctx) => ({
  id: entry.id,
  surface: entry.surface,
  title: entry.title,
  keywords: entry.keywords,
  group: '视图',
  run: () => {
    if (entry.surface === 'paper') {
      ctx.openCurrentContent?.();
      return;
    }
    if (entry.surface === 'daily') {
      ctx.openDaily?.();
      return;
    }
    ctx.openSurface?.(entry.surface);
  },
});

/**
 * 组装命令清单。
 * @param {object} ctx 由 MarkdownEditor 注入的动作集合，缺失的项对应命令静默跳过
 */
export const createCommands = (ctx = {}) => [
  ...SURFACE_COMMANDS.map((entry) => buildSurfaceCommand(entry, ctx)),

  {
    id: 'panel.agent',
    title: '打开 / 关闭 AI 助手',
    keywords: ['ai', 'agent', 'zhushou', '助手', '改稿'],
    group: '面板',
    run: () => ctx.toggleAgentPanel?.(),
  },
  {
    id: 'panel.wechat-preview',
    title: '预览微信公众号格式',
    keywords: ['wechat', 'weixin', 'gongzhonghao', '公众号', '排版', '预览'],
    group: '面板',
    run: () => ctx.openWechatPreview?.(),
  },
  {
    id: 'panel.bookmark-import',
    title: '导入书签',
    keywords: ['bookmark', 'shuqian', '收藏', '素材'],
    group: '面板',
    run: () => ctx.openBookmarkImport?.(),
  },

  {
    id: 'doc.import-markdown',
    title: '导入 Markdown / Word 文档',
    keywords: ['import', 'daoru', '导入', 'markdown', 'md', 'docx', 'word'],
    group: '文档',
    run: () => ctx.importMarkdown?.(),
  },
  {
    id: 'doc.copy-wechat',
    title: '复制到微信公众号',
    keywords: ['wechat', 'weixin', 'fuzhi', '公众号', '复制'],
    group: '文档',
    run: () => ctx.copyToWechat?.(),
  },
  ...EXPORT_FORMATS.map((format) => ({
    id: `doc.export.${format.key}`,
    title: `导出为 ${format.label}`,
    keywords: ['export', 'daochu', '导出', ...format.keywords],
    group: '文档',
    run: () => ctx.exportAs?.(format.key),
  })),

  {
    id: 'app.toggle-theme',
    title: '切换深色 / 浅色主题',
    keywords: ['theme', 'zhuti', '主题', '深色', '暗色', 'dark'],
    group: '其他',
    run: () => ctx.toggleTheme?.(),
  },
  {
    id: 'app.toggle-sidebar',
    title: '折叠 / 展开侧边栏',
    keywords: ['sidebar', 'cebianlan', '侧栏', '折叠'],
    group: '其他',
    run: () => ctx.toggleSidebar?.(),
  },
  {
    id: 'app.sync-from-disk',
    title: '从磁盘同步本地项目',
    keywords: ['sync', 'tongbu', '同步', '磁盘', '本地'],
    group: '其他',
    run: () => ctx.syncFromDisk?.(),
  },
];

/** 按标题 + 关键词做包含匹配；空查询返回原列表 */
export const filterCommands = (commands, query) => {
  const list = Array.isArray(commands) ? commands : [];
  const keyword = String(query ?? '').trim().toLowerCase();
  if (!keyword) return list;
  return list.filter((command) => {
    const haystack = [command?.title, command?.group, ...(command?.keywords ?? [])]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(keyword);
  });
};
