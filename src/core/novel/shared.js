const MARKDOWN_SYNTAX_PATTERN = /[#>*_`~\-\[\]\(\)!|]/g;
const CHINESE_TEXT_PATTERN = /[\u4e00-\u9fa5]+/g;

export const LOCATION_SUFFIXES = ['城', '镇', '村', '山', '谷', '宫', '阁', '殿', '府', '楼', '院', '营'];
export const FACTION_SUFFIXES = ['门', '派', '宗', '司', '堂', '会', '盟', '军'];
export const ITEM_SUFFIXES = ['剑', '刀', '印', '令', '图', '卷', '珠', '匣', '鼎', '符', '钥', '甲'];
export const TASK_VERBS = ['要去', '必须', '负责', '委托', '调查', '寻找', '护送', '潜入', '刺杀', '救出'];
export const SCENE_HINTS = ['次日', '当夜', '不久后', '来到', '回到', '进入', '离开'];

const STOP_WORDS = new Set([
  '这个',
  '那个',
  '这里',
  '那里',
  '自己',
  '我们',
  '你们',
  '他们',
  '她们',
  '已经',
  '还是',
  '不是',
  '就是',
  '然后',
  '因为',
  '所以',
  '如果',
  '但是',
  '然而',
  '没有',
  '不能',
  '不是',
  '一个',
  '一种',
  '一些',
  '时候',
  '事情',
  '什么',
  '为何',
  '如何',
  '如今',
  '突然',
  '随后',
  '立刻',
  '只是',
  '于是',
  '终于',
  '所有',
  '继续',
  '开始',
  '发现',
  '知道',
  '看见',
  '看着',
  '说道',
  '问道',
  '没有人',
  '不能再',
  '示例文档',
  '欢迎使用',
  '功能特性',
  '示例代码',
  '示例链接',
  '示例图片',
  '多行引用',
  '表格示例',
  '嵌套列表示例',
]);

export function stripMarkdown(text = '') {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/\!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(MARKDOWN_SYNTAX_PATTERN, ' ')
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function sanitizeEntityName(name = '') {
  return name.replace(/[，。！？、“”"'：；（）()《》〈〉【】\s]/g, '').trim();
}

export function normalizeName(name = '') {
  return sanitizeEntityName(name).toLowerCase();
}

export function toPlainSentences(text = '') {
  return stripMarkdown(text)
    .split(/[\n。！？!?\r]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function countOccurrences(text = '', keyword = '') {
  const target = sanitizeEntityName(keyword);
  if (!text || !target) return 0;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matches = stripMarkdown(text).match(new RegExp(escaped, 'g'));
  return matches?.length ?? 0;
}

export function uniqueList(items = []) {
  return Array.from(
    new Set(
      items
        .map((item) => sanitizeEntityName(item))
        .filter(Boolean),
    ),
  );
}

export function createNovelId(prefix, raw = '') {
  const seed = `${prefix}:${raw}`;
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 131 + seed.charCodeAt(index)) >>> 0;
  }
  return `${prefix}-${hash.toString(36)}`;
}

export function sumMentionMap(mentionMap = {}) {
  return Object.values(mentionMap).reduce((total, value) => total + (Number(value) || 0), 0);
}

export function getEntityTypeLabel(type) {
  if (type === 'character') return '角色';
  if (type === 'location') return '地点';
  if (type === 'faction') return '势力';
  if (type === 'item') return '物件';
  if (type === 'mission') return '任务';
  return '实体';
}

export function getEntityTypeGlyph(type) {
  if (type === 'character') return '角';
  if (type === 'location') return '地';
  if (type === 'faction') return '势';
  if (type === 'item') return '物';
  if (type === 'mission') return '任';
  return '实';
}

export function detectTypeBySuffix(name = '') {
  const cleaned = sanitizeEntityName(name);
  if (!cleaned) return null;
  if (LOCATION_SUFFIXES.some((suffix) => cleaned.endsWith(suffix))) return 'location';
  if (FACTION_SUFFIXES.some((suffix) => cleaned.endsWith(suffix))) return 'faction';
  if (ITEM_SUFFIXES.some((suffix) => cleaned.endsWith(suffix))) return 'item';
  return null;
}

export function isLikelyNameCandidate(name = '') {
  const cleaned = sanitizeEntityName(name);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 8) return false;
  if (STOP_WORDS.has(cleaned)) return false;
  return /^[\u4e00-\u9fa5]+$/.test(cleaned);
}

export function collectChineseChunks(text = '') {
  return stripMarkdown(text).match(CHINESE_TEXT_PATTERN) ?? [];
}

export function pickSummary(sentences = [], keyword = '') {
  const target = sanitizeEntityName(keyword);
  const matched = sentences.find((sentence) => sentence.includes(target));
  if (!matched) return '';
  return matched.length > 34 ? `${matched.slice(0, 34)}…` : matched;
}

export function mergeAliases(...aliasLists) {
  return uniqueList(aliasLists.flat());
}

export function hasManualField(entity, field) {
  return Boolean(entity?.manualFields?.[field]);
}
