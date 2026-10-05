import { callChatCompletion, getActiveSource, isAiConfigured } from './aiClient.js';
import { stripPrivateReasoning } from './assistantResponse.js';
import { composeEditorialPrompt, EDITORIAL_SKILL_IDS } from './editorialBoard.js';
import { runLocalAgent } from './localAgentClient.js';
import { findSkillById } from './skillRegistry.js';

export const PUBLISH_PLATFORM_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'wechat', label: '微信公众号', skillId: 'wechat-version' }),
  Object.freeze({ id: 'xiaohongshu', label: '小红书', skillId: 'xiaohongshu-version' }),
  Object.freeze({ id: 'zhihu', label: '知乎', skillId: 'zhihu-version' }),
]);

const PLATFORM_SYSTEM_PROMPT = [
  '你是内容平台编辑。只能基于原稿改写，不得编造原稿没有的事实、数据、来源或结论。',
  '严格返回一个 JSON 对象，不要加 Markdown 围栏或解释。',
].join('\n');

const REVIEW_FALLBACK_PROMPT = '作为发布前编辑，只指出会影响理解、事实可信度或发布质量的具体问题。';

const cleanText = (value) => String(value ?? '').trim();

const cleanTag = (value) => cleanText(value).replace(/^#+/, '');

const completeWithActiveSource = async ({ messages, signal, projectRoot = '' }) => {
  if (!isAiConfigured()) throw new Error('当前 AI 来源不可用，请先在 AI 助手设置中完成配置');
  const source = getActiveSource();
  if (source.kind !== 'local') {
    return callChatCompletion({ messages, config: source, signal });
  }

  const systemPrompt = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const userInput = messages
    .filter((message) => message.role !== 'system')
    .map((message) => message.content)
    .join('\n\n');
  const result = await runLocalAgent({
    userInput,
    history: [],
    config: {
      ...source,
      externalSessionId: '',
      projectRoot,
      readOnly: true,
    },
    modeSystemPrompt: systemPrompt,
    allowedTools: [],
    signal,
  });
  return { content: result.finalText };
};

const toStringList = (value) => {
  const items = Array.isArray(value) ? value : (typeof value === 'string' ? value.split(/[,\n，]/) : []);
  return Array.from(new Set(items.map(cleanText).filter(Boolean)));
};

const parseJsonObject = (value) => {
  const text = stripPrivateReasoning(value);
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('AI 没有返回可识别的结构化结果');
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error('AI 返回的 JSON 格式有误，请重试');
  }
};

export const normalizePublishResult = (value) => {
  const parsed = typeof value === 'string' ? parseJsonObject(value) : value;
  const titles = toStringList(parsed?.titles ?? parsed?.title).slice(0, 3);
  const summary = cleanText(parsed?.summary);
  const tags = Array.from(new Set(toStringList(parsed?.tags).map(cleanTag).filter(Boolean)));
  const body = cleanText(parsed?.body ?? parsed?.content);

  if (titles.length !== 3 || !summary || !tags.length || !body) {
    throw new Error('生成结果缺少 3 个标题、摘要、标签或正文');
  }
  return { titles, summary, tags, body };
};

const buildPlatformMessages = ({ sourceContent, definition, skill }) => ([
  { role: 'system', content: PLATFORM_SYSTEM_PROMPT },
  {
    role: 'user',
    content: [
      `目标平台：${definition.label}`,
      '以下是现有平台 skill 规范，保留其中的改写原则：',
      skill.prompt,
      [
        '当前流程只生成预览结果，不要调用工具、不要保存文件，原稿已在下方提供。',
        '请返回这个结构：',
        '{"titles":["标题1","标题2","标题3"],"summary":"摘要","tags":["标签1","标签2"],"body":"平台正文"}',
        'titles 必须恰好 3 个；body 不要重复标题、摘要和标签。',
      ].join('\n'),
      `原稿：\n${sourceContent}`,
    ].join('\n\n'),
  },
]);

const generatePlatformResult = async ({ sourceContent, definition, skills, signal, complete }) => {
  const skill = findSkillById(skills, definition.skillId);
  if (!skill) throw new Error(`缺少平台 skill：${definition.skillId}`);
  const response = await complete({
    messages: buildPlatformMessages({ sourceContent, definition, skill }),
    signal,
  });
  if (signal?.aborted) throw new Error('已取消');
  return normalizePublishResult(response?.content);
};

const normalizeReviewWarnings = (value) => {
  const parsed = parseJsonObject(value);
  return (Array.isArray(parsed?.warnings) ? parsed.warnings : [])
    .map((item) => cleanText(typeof item === 'string' ? item : item?.message ?? item?.issue))
    .filter(Boolean)
    .slice(0, 6);
};

const runPublishReview = async ({ sourceContent, skills, signal, complete }) => {
  const editorialPrompt = composeEditorialPrompt(EDITORIAL_SKILL_IDS.REVIEW, skills)
    || REVIEW_FALLBACK_PROMPT;
  const response = await complete({
    messages: [
      {
        role: 'system',
        content: '你是发布前审稿编辑。只返回 JSON，不调用工具，不改写原稿。',
      },
      {
        role: 'user',
        content: [
          editorialPrompt,
          '这是「准备发布」里的轻量审稿。忽略上述读取文档、召回旧文、保存报告和 agent-choice 要求。',
          '最多提 6 条可操作的发布前提醒。没有明显问题时返回空数组。',
          '严格格式：{"warnings":["提醒1","提醒2"]}',
          `原稿：\n${sourceContent}`,
        ].join('\n\n'),
      },
    ],
    signal,
  });
  if (signal?.aborted) throw new Error('已取消');
  return normalizeReviewWarnings(response?.content);
};

/** 平台生成和可选审稿同时发起；单个平台失败不会丢掉其他结果。 */
export const runPublishPreparation = async ({
  sourceContent,
  platformIds,
  includeReview = false,
  skills = [],
  signal,
  projectRoot = '',
  complete = (params) => completeWithActiveSource({ ...params, projectRoot }),
} = {}) => {
  const content = cleanText(sourceContent);
  if (!content) throw new Error('当前稿件没有可发布的正文');

  const selected = PUBLISH_PLATFORM_DEFINITIONS.filter((item) => platformIds?.includes(item.id));
  if (!selected.length) throw new Error('请至少选择一个发布平台');

  const reviewTask = includeReview
    ? runPublishReview({ sourceContent: content, skills, signal, complete })
      .then((warnings) => ({ warnings, error: '' }))
      .catch((error) => ({ warnings: [], error: error?.message || '审稿失败' }))
    : Promise.resolve({ warnings: [], error: '' });

  const platformTasks = selected.map(async (definition) => {
    try {
      const result = await generatePlatformResult({ sourceContent: content, definition, skills, signal, complete });
      return { ...definition, result, error: '' };
    } catch (error) {
      return { ...definition, result: null, error: error?.message || '生成失败' };
    }
  });

  const [review, ...platforms] = await Promise.all([reviewTask, ...platformTasks]);
  return { review, platforms };
};

export const buildPlatformDraftContent = ({ titles = [], summary = '', tags = [], body = '' } = {}) => [
  titles[0] ? `# ${titles[0]}` : '',
  summary ? `> 摘要：${summary}` : '',
  cleanText(body),
  titles.length > 1 ? `## 备选标题\n${titles.slice(1).map((title, index) => `${index + 1}. ${title}`).join('\n')}` : '',
  tags.length ? `标签：${tags.map((tag) => `#${cleanTag(tag)}`).join(' ')}` : '',
].filter(Boolean).join('\n\n');

export const buildPlatformDraftFileName = (sourceName, platformLabel) => {
  const baseName = cleanText(sourceName).replace(/\.[^.]+$/, '') || '未命名';
  return `${baseName} - ${platformLabel}.md`;
};
