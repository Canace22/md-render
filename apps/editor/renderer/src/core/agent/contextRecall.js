/**
 * 知识库主动上下文召回（纯函数）。
 *
 * 用途：写作时根据当前文档的标题 + 正文，提取关键词，
 * 用关键词去工作区其它文档里召回相关旧文，供写作引用参考。
 *
 * 设计原则：纯函数、无副作用、可单测。不引第三方分词 / NLP 库，
 * 只用轻量启发式（标题词 + 正文前若干行的高频词 - 停用词）。
 *
 * 扩展点（TODO，本期不实现）：
 *   - 书签召回：把浏览器书签 / 剪藏作为候选源参与 rankRelatedDocs。
 *   - Notion 召回：把 Notion 页面标题 / 摘要作为候选源参与排序。
 *   两者只要按 candidate 形状 { title, content/snippet, id } 喂进来即可复用排序。
 */

// 召回相关常量
const DEFAULT_LIMIT = 5; // 默认返回相关旧文条数
const DEFAULT_MAX_KEYWORDS = 8; // 默认提取关键词上限
const CONTENT_HEAD_LINES = 12; // 正文只看前若干行，抓住主题即可
const MIN_TOKEN_LEN = 2; // 词最短长度（过滤单字噪声）
const TITLE_WEIGHT = 3; // 标题词权重（标题信号比正文强）

// 轻量中文 + 英文停用词，够用即可，不追求完备
const STOP_WORDS = new Set([
  '的', '了', '和', '与', '是', '在', '我', '你', '他', '她', '它',
  '我们', '你们', '他们', '这', '那', '这个', '那个', '一个', '一些',
  '什么', '怎么', '为什么', '如何', '可以', '不是', '没有', '就是',
  '但是', '因为', '所以', '如果', '然后', '还有', '已经', '这样',
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for',
  'is', 'are', 'was', 'were', 'be', 'with', 'as', 'by', 'at', 'it',
  'this', 'that', 'how', 'what', 'why',
]);

/** 取正文前若干行，避免长文整篇参与抽词 */
const headLines = (text, lines) =>
  String(text ?? '').split('\n').slice(0, lines).join('\n');

/** 去掉 Markdown 标记符号，把文本切成候选词（中英文混合） */
const CJK_RUN = /[一-鿿]+/g; // 连续中文段
const CJK_CHAR = /[一-鿿]/;

/**
 * 把一段连续中文切成 2-gram（无分词库的轻量近似）：
 * 「微信排版」-> 微信 / 信排 / 排版。单字段原样保留。
 */
const cjkBigrams = (run) => {
  if (run.length < MIN_TOKEN_LEN) return [run];
  const grams = [];
  for (let i = 0; i + 1 < run.length; i += 1) grams.push(run.slice(i, i + 2));
  return grams;
};

/** 把一个原始片段（可能中英混合）展开成最终词：英文整词保留，中文切 2-gram */
const expandFragment = (frag) => {
  if (CJK_CHAR.test(frag)) return (frag.match(CJK_RUN) || []).flatMap(cjkBigrams);
  return [frag];
};

const tokenize = (text) =>
  String(text ?? '')
    .replace(/[#>*`_~\-[\]()!|]/g, ' ') // 去常见 Markdown 标记
    .toLowerCase()
    .split(/[\s，。！？；：、,.!?;:'"“”‘’\d/\\]+/)
    .flatMap(expandFragment)
    .filter((w) => w.length >= MIN_TOKEN_LEN && !STOP_WORDS.has(w));

/** 把词数组累加进权重表 */
const accumulate = (counts, tokens, weight) => {
  tokens.forEach((token) => {
    counts.set(token, (counts.get(token) ?? 0) + weight);
  });
};

/**
 * 从标题 + 正文提取关键词，按权重降序返回。
 * @param {object} doc { title, content }
 * @param {object} [opts] { max }
 * @returns {string[]} 关键词数组（已去重、去停用词、按权重排序）
 */
export const extractRecallKeywords = ({ title, content } = {}, { max = DEFAULT_MAX_KEYWORDS } = {}) => {
  const counts = new Map();
  accumulate(counts, tokenize(title), TITLE_WEIGHT);
  accumulate(counts, tokenize(headLines(content, CONTENT_HEAD_LINES)), 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => word);
};

/** 候选文档是否就是当前文档自身（按 id 或标题判定） */
const isSameDoc = (current, candidate) => {
  if (current?.id != null && candidate?.id != null) return current.id === candidate.id;
  return Boolean(current?.title) && current.title === candidate?.title;
};

/** 单个候选文档对一组关键词的重合度得分：命中几个关键词就加几分 */
const scoreCandidate = (candidate, keywords) => {
  const haystack = `${candidate?.title ?? ''}\n${candidate?.content ?? candidate?.snippet ?? ''}`.toLowerCase();
  return keywords.reduce((score, kw) => (haystack.includes(kw) ? score + 1 : score), 0);
};

/**
 * 给候选文档按与当前文档的关键词重合度打分排序，排除自身，返回 top N。
 * @param {object} currentDoc { title, content, id }
 * @param {Array}  candidates [{ title, content/snippet, id }]
 * @param {object} [opts] { limit, keywords } 不传 keywords 时内部抽取
 * @returns {Array} top N 候选（原对象 + _score），按得分降序
 */
export const rankRelatedDocs = (currentDoc, candidates = [], { limit = DEFAULT_LIMIT, keywords } = {}) => {
  const kws = keywords ?? extractRecallKeywords(currentDoc);
  if (!kws.length) return [];

  return candidates
    .filter((c) => c && !isSameDoc(currentDoc, c))
    .map((c) => ({ ...c, _score: scoreCandidate(c, kws) }))
    .filter((c) => c._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
};
