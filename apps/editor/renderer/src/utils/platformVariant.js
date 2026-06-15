import { getPublishingPlatformLabel } from './publishingPlatforms.js';

// 一稿多发：把同一篇正文，按目标平台改写成「对应平台版本」。
// 第一版只生成给 AI 助手用的改写指令（prompt 策略），不做真正一键发布。
// 复用 publishingPlatforms.js 的 value 体系（wechat / xiaohongshu），知乎本模块自带 'zhihu' 策略。

export const PLATFORM_VARIANT_KEYS = Object.freeze({
  WECHAT: 'wechat',
  XIAOHONGSHU: 'xiaohongshu',
  ZHIHU: 'zhihu',
});

// 每个平台一套改写策略：label 兜底用、task 一句话目标、outputRules 排版/语气/长度要求。
const PLATFORM_VARIANT_CONFIG = Object.freeze({
  [PLATFORM_VARIANT_KEYS.WECHAT]: {
    label: '微信公众号',
    task: '请把正文改写成微信公众号版本，正式但亲和，重点突出、适合手机阅读。',
    outputRules: [
      '语气正式又亲切，像跟读者面对面聊，避免生硬官腔。',
      '多分段、每段不要太长；适当加小标题帮读者把握结构。',
      '重点信息突出，可用短句或独立成段强调。',
      '结尾可加一句温和的引导关注或互动，但不要硬广。',
    ],
  },
  [PLATFORM_VARIANT_KEYS.XIAOHONGSHU]: {
    label: '小红书',
    task: '请把正文改写成小红书版本，口语化、强种草感、适合快速刷读。',
    outputRules: [
      '开头用痛点或共鸣场景抓人，口语化、短句为主。',
      '正文分点呈现，每点简短直给，适度穿插 emoji 但不要泛滥。',
      '整体篇幅偏短，去掉冗长论证，留干货和情绪。',
      '结尾带 2-4 个相关话题标签（以 # 开头）。',
    ],
  },
  [PLATFORM_VARIANT_KEYS.ZHIHU]: {
    label: '知乎',
    task: '请把正文改写成知乎版本，逻辑严谨、有论证、适合深度长文阅读。',
    outputRules: [
      '结构清晰，先抛观点或结论，再分点展开论证。',
      '论证有据，可保留或补充数据、案例、推理链条。',
      '篇幅可适当加长，把因果和前提讲透，避免空泛口号。',
      '语气理性专业，少用情绪化表达和营销话术。',
    ],
  },
});

const DEFAULT_VARIANT_KEY = PLATFORM_VARIANT_KEYS.WECHAT;

const normalizePlatformValue = (value) =>
  String(value ?? '').trim().toLowerCase();

const getVariantConfig = (platformValue) => {
  const key = normalizePlatformValue(platformValue);
  return PLATFORM_VARIANT_CONFIG[key] || null;
};

// 平台中文名：优先用枚举里的 label，没有就用本模块策略表里的 label 兜底。
const resolvePlatformLabel = (platformValue, config) => {
  const fromEnum = getPublishingPlatformLabel(platformValue);
  if (fromEnum && fromEnum !== platformValue) return fromEnum;
  return config?.label || platformValue;
};

// 改写类动作的写回引导：让 agent 读整篇 → 改写 → 写回（弹 diff 给用户确认）。
const buildWriteBackLine = () =>
  '改写完成后，调用 read_active_doc 拿到整篇正文，'
    + '把它整体替换成改写后的版本，再调用 write_active_doc 写回（会弹 diff 让用户确认）。';

/**
 * 生成「把当前正文改写成某平台版本」的 AI 指令。
 * 不内嵌正文——交给 agent 通过 read_active_doc 自取，避免重复拼正文。
 * @param {string} platformValue 平台标识（wechat / xiaohongshu / zhihu）
 * @param {object} [options]
 * @param {boolean} [options.strict] 为 true 时遇到未知平台抛错；默认兜底到微信版本
 * @returns {string} 指令字符串
 */
export const buildPlatformVariantInstruction = (platformValue, options = {}) => {
  const config = getVariantConfig(platformValue);
  if (!config && options.strict) {
    throw new Error(`不支持的平台：${platformValue}`);
  }
  const resolved = config || PLATFORM_VARIANT_CONFIG[DEFAULT_VARIANT_KEY];
  const targetValue = config ? platformValue : DEFAULT_VARIANT_KEY;
  const label = resolvePlatformLabel(targetValue, resolved);
  const rules = resolved.outputRules.map((rule) => `- ${rule}`).join('\n');

  return [
    `请先读取当前文档，然后把整篇正文改写成「${label}」平台版本。`,
    resolved.task,
    `输出要求：\n${rules}`,
    '保持原文核心观点与事实不变，只调整语气、结构、长度和排版以贴合该平台。',
    buildWriteBackLine(),
  ].join('\n\n');
};

/**
 * 返回支持的平台版本列表，供后续 UI 使用。
 * @returns {Array<{value: string, label: string}>}
 */
export const listPlatformVariants = () =>
  Object.keys(PLATFORM_VARIANT_CONFIG).map((value) => ({
    value,
    label: resolvePlatformLabel(value, PLATFORM_VARIANT_CONFIG[value]),
  }));

export const isSupportedPlatformVariant = (platformValue) =>
  getVariantConfig(platformValue) !== null;
