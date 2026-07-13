/**
 * md-render 产品知识：给 Agent 的稳定产品事实与行为边界。
 *
 * 这里只放与 UI / store / IPC 无关的纯数据，既能组装 system prompt，
 * 也能被后续的能力页复用，避免同一套产品说明散落在组件里。
 */

export const APP_SURFACES = Object.freeze([
  { id: 'overview', label: '总览', description: '查看工作区和近期内容概况' },
  { id: 'paper', label: '文档工作区', description: '编辑 Markdown 稿件与管理文档目录' },
  { id: 'daily', label: '今日速记', description: '管理任务、事件、笔记和待办池' },
  { id: 'canvas', label: '灵感白板', description: '用卡片和连线整理点子与结构' },
  { id: 'creation-board', label: '创作看板', description: '按稿件状态管理内容流程' },
  { id: 'publishing', label: '发布队列', description: '查看待发布内容和目标平台' },
  { id: 'search', label: '知识库搜索', description: '全文检索工作区内容' },
  { id: 'graph', label: '关系图谱', description: '查看内容引用与关联关系' },
  { id: 'sync', label: '同步中心', description: '管理外部同步与工作区快照' },
  { id: 'settings', label: '设置', description: '管理应用、排版和服务配置' },
]);

export const APP_CORE_OBJECTS = Object.freeze([
  '当前稿件与文档目录',
  '稿件状态、标签、目标平台等元数据',
  '知识库条目、相关旧文与来源素材',
  '派生稿、平台版本与 AI 产出物',
  'Daily 任务、事件、笔记与待办',
  '白板卡片、连线与视图',
  '本地项目、发布队列与同步配置',
]);

/** 可供能力页 / 空状态等 UI 直接复用的简短摘要。 */
export const APP_CAPABILITY_SUMMARY = Object.freeze([
  {
    id: 'content',
    label: '内容创作',
    description: '读取、改写当前稿件，或生成保留来源关系的新产出物。',
  },
  {
    id: 'context',
    label: '内容上下文',
    description: '搜索工作区、召回相关旧文，并按需查询已启用的外挂知识库。',
  },
  {
    id: 'workspace',
    label: '工作台操作',
    description: '打开文档或文件夹、切换主要界面，操作 Daily 与灵感白板。',
  },
  {
    id: 'incident',
    label: '故障处置',
    description: '先采集运行健康信息，再候选白名单修复；代码缺陷沉淀为可追踪报告。',
  },
  {
    id: 'server-tools',
    label: '服务端工具',
    description: '通过 ai-proxy 执行已注册的转换工具，不等同于用户本机诊断或修复。',
  },
]);

const APP_OPERATING_PRINCIPLES = Object.freeze([
  'md-render 是本地优先的内容创作工作台，不是通用聊天框；工作区内容和本地资产是核心，同步、发布和 AI 代理是显式的外部适配能力。',
  '文档工作区偏创作，其他界面偏工作台操作；先根据当前界面和用户意图选择模式。',
  '系统给出的任务简报只是摘要；需要细节时应调用读取或搜索工具，不根据摘要猜测全文。',
  '新稿、平台版本、研究报告、清单等独立内容产出，默认建立新的可追溯资产并保留来源关系；只有用户明确要就地修改当前正文时才覆盖原文，且必须走 diff 确认。',
  '处理 app 异常时必须先诊断、再修复、最后验证；只能执行 inspect_app_health 明确返回的 availableRepairs，并通过 apply_safe_repair 进入宿主强制确认。',
  '如果没有安全修复、修复后仍异常，或问题属于代码缺陷，应通过 create_agent_artifact 生成 artifactType=incident_report 的结构化 Bug 报告，不得谎称已修复，也不得尝试自行修改已安装的 app 或签名包。',
  'server 工具在 ai-proxy 所在环境执行，只能用于其明确声明的转换任务；不能把它们当作用户本机日志、文件系统或安装包的诊断与修复工具。',
]);

const formatSurface = (surface) => `${surface.label}（${surface.id}：${surface.description}）`;
const formatCapability = (capability) => `${capability.label}：${capability.description}`;

export const buildAppKnowledgePrompt = () => [
  'md-render 产品知识：',
  `主要界面：${APP_SURFACES.map(formatSurface).join('、')}。`,
  `核心对象：${APP_CORE_OBJECTS.join('、')}。`,
  `能力边界：${APP_CAPABILITY_SUMMARY.map(formatCapability).join('；')}。`,
  '工作原则：',
  ...APP_OPERATING_PRINCIPLES.map((rule) => `- ${rule}`),
].join('\n');

export const APP_KNOWLEDGE_PROMPT = buildAppKnowledgePrompt();
