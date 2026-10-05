import { getPublishingPlatformLabel } from './publishingPlatforms.js';
import { BUILTIN_SKILL_ENTRIES } from '../core/agent/builtinSkills.js';
import { buildSkillRegistry, findSkillById } from '../core/agent/skillRegistry.js';

// 一稿多发：把同一篇正文，按目标平台改写成「对应平台版本」。
// 改写指令的单一事实源是内置 skill（resources/skills/<平台>-version/SKILL.md），
// 这里只负责「平台 value → skill」的映射，保留原有 API 供 AgentPanel 使用。

export const PLATFORM_VARIANT_KEYS = Object.freeze({
  WECHAT: 'wechat',
  XIAOHONGSHU: 'xiaohongshu',
  ZHIHU: 'zhihu',
});

const PLATFORM_SKILL_IDS = Object.freeze({
  [PLATFORM_VARIANT_KEYS.WECHAT]: 'wechat-version',
  [PLATFORM_VARIANT_KEYS.XIAOHONGSHU]: 'xiaohongshu-version',
  [PLATFORM_VARIANT_KEYS.ZHIHU]: 'zhihu-version',
});

// 知乎不在发布平台枚举里，单独兜底中文名
const FALLBACK_LABELS = Object.freeze({ [PLATFORM_VARIANT_KEYS.ZHIHU]: '知乎' });

const DEFAULT_VARIANT_KEY = PLATFORM_VARIANT_KEYS.WECHAT;
const { skills: BUILTIN_SKILLS } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });

const normalizePlatformValue = (value) =>
  String(value ?? '').trim().toLowerCase();

const getVariantSkill = (platformValue) => {
  const skillId = PLATFORM_SKILL_IDS[normalizePlatformValue(platformValue)];
  return skillId ? findSkillById(BUILTIN_SKILLS, skillId) : null;
};

const resolvePlatformLabel = (platformValue) => {
  const fromEnum = getPublishingPlatformLabel(platformValue);
  if (fromEnum && fromEnum !== platformValue) return fromEnum;
  return FALLBACK_LABELS[platformValue] || platformValue;
};

/**
 * 生成「把当前正文改写成某平台版本」的 AI 指令（即对应 skill 的正文）。
 * 不内嵌正文——交给 agent 通过 read_active_doc 自取。
 * @param {string} platformValue 平台标识（wechat / xiaohongshu / zhihu）
 * @param {object} [options]
 * @param {boolean} [options.strict] 为 true 时遇到未知平台抛错；默认兜底到微信版本
 * @returns {string} 指令字符串
 */
export const buildPlatformVariantInstruction = (platformValue, options = {}) => {
  const skill = getVariantSkill(platformValue);
  if (!skill && options.strict) {
    throw new Error(`不支持的平台：${platformValue}`);
  }
  return (skill || getVariantSkill(DEFAULT_VARIANT_KEY))?.prompt || '';
};

/**
 * 返回支持的平台版本列表，供 UI 使用。
 * @returns {Array<{value: string, label: string}>}
 */
export const listPlatformVariants = () =>
  Object.keys(PLATFORM_SKILL_IDS)
    .filter((value) => getVariantSkill(value))
    .map((value) => ({ value, label: resolvePlatformLabel(value) }));

export const isSupportedPlatformVariant = (platformValue) =>
  getVariantSkill(platformValue) !== null;
