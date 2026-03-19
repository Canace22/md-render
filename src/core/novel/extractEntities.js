import {
  LOCATION_SUFFIXES,
  FACTION_SUFFIXES,
  ITEM_SUFFIXES,
  TASK_VERBS,
  collectChineseChunks,
  countOccurrences,
  createNovelId,
  isLikelyNameCandidate,
  mergeAliases,
  normalizeName,
  pickSummary,
  sanitizeEntityName,
  toPlainSentences,
  uniqueList,
} from './shared.js';

const CHARACTER_VERBS = ['来到', '回到', '进入', '离开', '走进', '望向', '看向', '看着', '说道', '问道', '低声', '抬手', '必须', '决定', '负责', '发现', '握住'];
const LOCATION_CLUES = ['来到', '回到', '进入', '离开', '潜入', '前往', '驻守于', '藏在'];
const ITEM_CONTEXTS = ['握住', '拿起', '带着', '丢下', '寻找', '得到', '偷走', '藏着', '夺回', '展开'];
const INVALID_LOCATION_PREFIXES = ['潜入', '调查', '必须', '发现', '当夜', '次日', '却发', '已经'];
const TASK_SENTENCE_PATTERN = new RegExp(`(?:${TASK_VERBS.join('|')})([^，。！？\\n]{1,14})`, 'g');
const CHARACTER_VERB_PATTERN = new RegExp(`(?:${CHARACTER_VERBS.join('|')})`, 'g');
const CHARACTER_ROLE_TAIL_CHARS = new Set(['子', '兄', '姐', '主', '老', '人', '卫', '客', '者']);
const CHARACTER_TITLE_PREFIXES = [
  '弟子',
  '公子',
  '姑娘',
  '少主',
  '门主',
  '盟主',
  '宗主',
  '长老',
  '掌柜',
  '将军',
  '大人',
  '师兄',
  '师姐',
  '护卫',
  '侍卫',
];
const CHARACTER_INVALID_PREFIXES = ['决定', '说道', '随后', '必须', '继续', '已经', '然后', '准备', '开始', '为了', '当夜', '次日'];
const CHARACTER_INVALID_SUFFIXES = ['明日', '今日', '今夜', '今晚', '次日', '当夜', '这里', '那里'];
const LEADING_NOISE_CHARS = new Set(['的', '把', '一', '两', '个', '这', '那', '该', '只', '张', '份', '封', '本', '枚', '柄', '间', '座', '道']);
const INVALID_FACTION_NAMES = new Set(['木门', '房门', '城门', '院门', '大门', '小门', '石门']);

function createEmptyCandidateMap() {
  return new Map();
}

function trimLeadingNoise(name = '') {
  let cleaned = sanitizeEntityName(name);
  while (cleaned.length > 2 && LEADING_NOISE_CHARS.has(cleaned[0])) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

function isLikelyFactionCandidate(name = '') {
  const cleaned = trimLeadingNoise(name);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 8) return false;
  if (!/^[\u4e00-\u9fa5]+$/.test(cleaned)) return false;
  if (INVALID_FACTION_NAMES.has(cleaned)) return false;
  if (cleaned.endsWith('门') && cleaned.length < 3) return false;
  return true;
}

function isLikelyItemCandidate(name = '') {
  const cleaned = trimLeadingNoise(name);
  if (!cleaned || cleaned.length < 2 || cleaned.length > 6) return false;
  if (!/^[\u4e00-\u9fa5]+$/.test(cleaned)) return false;
  return true;
}

function refineCharacterCandidate(name = '') {
  let cleaned = sanitizeEntityName(name);
  while (cleaned.length > 2 && CHARACTER_ROLE_TAIL_CHARS.has(cleaned[0])) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

function hasCharacterBoundary(sentence = '', startIndex = 0) {
  if (startIndex <= 0) return true;

  const previousChar = sentence[startIndex - 1];
  if (/[，。！？、“”"'‘’（）()《》〈〉【】\s]/.test(previousChar)) {
    return true;
  }

  const prefix = sentence.slice(Math.max(0, startIndex - 2), startIndex);
  return CHARACTER_TITLE_PREFIXES.some((title) => prefix.endsWith(title));
}

function isLikelyCharacterEntity(name = '') {
  const cleaned = refineCharacterCandidate(name);
  if (!isLikelyNameCandidate(cleaned)) return false;
  if (CHARACTER_INVALID_PREFIXES.some((prefix) => cleaned.startsWith(prefix))) return false;
  if (CHARACTER_INVALID_SUFFIXES.some((suffix) => cleaned.endsWith(suffix))) return false;
  return true;
}

function findCharacterCandidateBeforeVerb(sentence = '', verbIndex = 0) {
  const prefix = sentence.slice(Math.max(0, verbIndex - 4), verbIndex);

  for (let rawLength = Math.min(4, prefix.length); rawLength >= 2; rawLength -= 1) {
    const rawCandidate = prefix.slice(prefix.length - rawLength);
    const refined = refineCharacterCandidate(rawCandidate);
    const candidateStart = verbIndex - rawLength + (rawCandidate.length - refined.length);

    if (!hasCharacterBoundary(sentence, candidateStart)) continue;
    if (!isLikelyCharacterEntity(refined)) continue;
    return refined;
  }

  return '';
}

function ensureCandidate(candidateMap, type, name, payload = {}) {
  const cleanedName = sanitizeEntityName(name);
  if (!cleanedName) return null;

  const key = `${type}:${normalizeName(cleanedName)}`;
  if (!candidateMap.has(key)) {
    candidateMap.set(key, {
      id: createNovelId('entity', key),
      type,
      name: cleanedName,
      aliases: [],
      summary: '',
      traits: [],
      relations: [],
      mentionCount: 0,
      sourceFileId: payload.fileId ?? '',
      status: 'pending',
      contexts: [],
    });
  }

  return candidateMap.get(key);
}

function addEntityMention(candidateMap, type, name, sentence, payload = {}) {
  const candidate = ensureCandidate(candidateMap, type, name, payload);
  if (!candidate) return;

  candidate.mentionCount += 1;
  if (sentence) {
    candidate.contexts.push(sentence);
    if (!candidate.summary) {
      candidate.summary = pickSummary([sentence], candidate.name);
    }
  }
  if (Array.isArray(payload.aliases)) {
    candidate.aliases = mergeAliases(candidate.aliases, payload.aliases);
  }
}

function extractBySuffix(candidateMap, sentences, type, suffixes, fileId) {
  const pattern = new RegExp(`([\\u4e00-\\u9fa5]{2,8}(?:${suffixes.join('|')}))`, 'g');
  sentences.forEach((sentence) => {
    const matches = sentence.match(pattern) ?? [];
    matches.forEach((match) => {
      const maxPrefixLength = type === 'faction' ? 2 : 4;
      let refined =
        match.match(
          new RegExp(`([\\u4e00-\\u9fa5]{1,${maxPrefixLength}}(?:${suffixes.join('|')}))$`),
        )?.[1] ?? match;
      if (type === 'faction' && refined.startsWith('调')) {
        refined = refined.slice(1);
      }
      refined = trimLeadingNoise(refined);
      if (type === 'faction' && !isLikelyFactionCandidate(refined)) return;
      addEntityMention(candidateMap, type, refined, sentence, { fileId });
    });
  });
}

function extractKnownEntities(candidateMap, plainText, sentences, knownEntities, fileId) {
  knownEntities.forEach((entity) => {
    const allNames = uniqueList([entity.name, ...(entity.aliases ?? [])]);
    const matchCount = allNames.reduce((total, name) => total + countOccurrences(plainText, name), 0);
    if (matchCount <= 0) return;

    const bestSentence = sentences.find((sentence) =>
      allNames.some((name) => sentence.includes(name)),
    );

    const candidate = ensureCandidate(candidateMap, entity.type, entity.name, { fileId });
    if (!candidate) return;
    candidate.mentionCount += matchCount;
    candidate.aliases = mergeAliases(candidate.aliases, entity.aliases ?? []);
    if (!candidate.summary && bestSentence) {
      candidate.summary = pickSummary([bestSentence], entity.name);
    }
  });
}

function extractCharacters(candidateMap, sentences, fileId) {
  sentences.forEach((sentence) => {
    let verbMatch = CHARACTER_VERB_PATTERN.exec(sentence);
    while (verbMatch) {
      const candidate = findCharacterCandidateBeforeVerb(sentence, verbMatch.index);
      if (candidate) {
        addEntityMention(candidateMap, 'character', candidate, sentence, { fileId });
      }
      verbMatch = CHARACTER_VERB_PATTERN.exec(sentence);
    }
    CHARACTER_VERB_PATTERN.lastIndex = 0;
  });

  const phraseCountMap = new Map();
  collectChineseChunks(sentences.join(' '))
    .filter((chunk) => chunk.length >= 2 && chunk.length <= 4 && isLikelyCharacterEntity(chunk))
    .forEach((chunk) => {
      phraseCountMap.set(chunk, (phraseCountMap.get(chunk) ?? 0) + 1);
    });

  phraseCountMap.forEach((count, phrase) => {
    if (count < 2) return;
    const sentence = sentences.find((item) => item.includes(phrase));
    addEntityMention(candidateMap, 'character', phrase, sentence, { fileId });
  });
}

function extractItems(candidateMap, sentences, fileId) {
  const itemPattern = new RegExp(`([\\u4e00-\\u9fa5]{1,5}(?:${ITEM_SUFFIXES.join('|')}))`, 'g');
  const itemContextPattern = new RegExp(`(?:${ITEM_CONTEXTS.join('|')})([\\u4e00-\\u9fa5]{1,6})`, 'g');
  const commonItems = ['地图', '令牌', '密信', '玉佩', '卷轴', '兵符', '玉简'];

  sentences.forEach((sentence) => {
    const directMatches = sentence.match(itemPattern) ?? [];
    directMatches.forEach((match) => {
      if (LOCATION_SUFFIXES.some((suffix) => match.endsWith(suffix))) return;
      let refined =
        match.match(new RegExp(`([\\u4e00-\\u9fa5]{1,2}(?:${ITEM_SUFFIXES.join('|')}))$`))?.[1] ?? match;
      refined = trimLeadingNoise(refined);
      if (!isLikelyItemCandidate(refined)) return;
      addEntityMention(candidateMap, 'item', refined, sentence, { fileId });
    });

    let contextualMatch = itemContextPattern.exec(sentence);
    while (contextualMatch) {
      const name = trimLeadingNoise(contextualMatch[1]);
      if (
        commonItems.includes(name) ||
        (ITEM_SUFFIXES.some((suffix) => name.endsWith(suffix)) &&
          !LOCATION_SUFFIXES.some((suffix) => name.endsWith(suffix)) &&
          isLikelyItemCandidate(name))
      ) {
        addEntityMention(candidateMap, 'item', name, sentence, { fileId });
      }
      contextualMatch = itemContextPattern.exec(sentence);
    }
    itemContextPattern.lastIndex = 0;

    commonItems.forEach((itemName) => {
      if (sentence.includes(itemName)) {
        addEntityMention(candidateMap, 'item', itemName, sentence, { fileId });
      }
    });
  });
}

function extractLocations(candidateMap, sentences, fileId) {
  const locationContextPattern = new RegExp(
    `(?:${LOCATION_CLUES.join('|')})([\\u4e00-\\u9fa5]{1,6}(?:${LOCATION_SUFFIXES.join('|')}))`,
    'g',
  );

  sentences.forEach((sentence) => {
    let locationMatch = locationContextPattern.exec(sentence);
    while (locationMatch) {
      addEntityMention(candidateMap, 'location', locationMatch[1], sentence, { fileId });
      locationMatch = locationContextPattern.exec(sentence);
    }
    locationContextPattern.lastIndex = 0;
  });
}

function extractMissions(candidateMap, sentences, fileId) {
  sentences.forEach((sentence) => {
    let taskMatch = TASK_SENTENCE_PATTERN.exec(sentence);
    while (taskMatch) {
      const missionName = sanitizeEntityName(`${taskMatch[0]}`);
      if (missionName.length >= 2) {
        addEntityMention(candidateMap, 'mission', missionName, sentence, { fileId });
      }
      taskMatch = TASK_SENTENCE_PATTERN.exec(sentence);
    }
    TASK_SENTENCE_PATTERN.lastIndex = 0;
  });
}

function finalizeCandidates(candidateMap, plainText) {
  return Array.from(candidateMap.values())
    .filter((candidate) => {
      if (candidate.type === 'character') {
        return candidate.mentionCount >= 2 || candidate.contexts.length >= 1;
      }
      return candidate.mentionCount >= 1;
    })
    .map((candidate) => {
      const aliases = uniqueList(candidate.aliases);
      const traits = uniqueList(
        candidate.contexts
          .flatMap((sentence) => {
            const matches = sentence.match(/(?:冷静|谨慎|急躁|沉默|狠厉|警觉|疲惫|狼狈|镇定|强硬)/g);
            return matches ?? [];
          }),
      );

      return {
        id: candidate.id,
        type: candidate.type,
        name: candidate.name,
        aliases,
        summary: candidate.summary || pickSummary(candidate.contexts, candidate.name),
        traits,
        relations: [],
        mentionCount: countOccurrences(plainText, candidate.name) || candidate.mentionCount,
        sourceFileId: candidate.sourceFileId,
        status: 'pending',
      };
    })
    .sort((left, right) => right.mentionCount - left.mentionCount);
}

export function extractEntities(markdown, options = {}) {
  const { fileId = '', knownEntities = [] } = options;
  const plainText = markdown ?? '';
  const sentences = toPlainSentences(markdown);
  const candidateMap = createEmptyCandidateMap();

  extractKnownEntities(candidateMap, plainText, sentences, knownEntities, fileId);
  extractBySuffix(candidateMap, sentences, 'faction', FACTION_SUFFIXES, fileId);
  extractCharacters(candidateMap, sentences, fileId);
  extractItems(candidateMap, sentences, fileId);
  extractMissions(candidateMap, sentences, fileId);
  extractLocations(candidateMap, sentences, fileId);

  return finalizeCandidates(candidateMap, plainText);
}
