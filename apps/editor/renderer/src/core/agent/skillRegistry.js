/**
 * 产品 skill 注册表：把「SKILL.md + agents/md-render.yaml」解析成 app 可用的 skill 列表。
 *
 * 来源有两处：内置（resources/skills）和内容库（MdRender/.agents/skills），
 * 同名时内容库覆盖内置。格式说明见 `.agents/skills/README.md`「产品 skill 格式」。
 *
 * 纯模块：不读文件、不碰 IPC / store，读取由调用方完成后把原始文本传进来。
 */

import { parseFrontmatterDocument } from '../../../../shared/frontmatterDocument.js';

export const SKILL_SOURCES = Object.freeze({ BUILTIN: 'builtin', VAULT: 'vault' });
export const SKILL_ENTRIES = Object.freeze(['slash', 'welcome', 'composer', 'doc-toolbar']);
export const SKILL_INPUTS = Object.freeze(['active_doc', 'selection', 'none']);
export const SKILL_OUTPUTS = Object.freeze(['artifact', 'proposal', 'answer']);

const DEFAULT_MANIFEST = Object.freeze({
  label: '',
  group: '',
  aliases: [],
  entry: ['slash'],
  input: 'none',
  tools: [],
  output: 'answer',
});

const SKILL_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const TOOL_NAME_RE = /^[a-z][a-z0-9_]*$/;
const COMMENT_START_RE = /\s#/;

/* ── SKILL.md ─────────────────────────────────────────────── */

/** 解析 SKILL.md，返回 frontmatter 里的 name/description 和正文 */
export const parseSkillMarkdown = (text = '') => {
  const doc = parseFrontmatterDocument(text);
  const pick = (key) => (typeof doc.frontmatter[key] === 'string' ? doc.frontmatter[key].trim() : '');
  return {
    name: pick('name'),
    description: pick('description'),
    body: doc.content.trim(),
  };
};

/* ── agents/md-render.yaml ────────────────────────────────── */

/** 去掉行尾注释（引号里的 # 不算） */
const stripLineComment = (line) => {
  let quote = '';
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === '\'') quote = ch;
    else if (ch === '#' && (i === 0 || COMMENT_START_RE.test(line.slice(i - 1, i + 1)))) {
      return line.slice(0, i).trimEnd();
    }
  }
  return line;
};

const isMeaningfulLine = (line) => line.trim() !== '' && !line.trimStart().startsWith('#');

/** 把简单 YAML 读成扁平对象；遇到看不懂的行或嵌套对象就报错 */
const readYamlFields = (yamlText) => {
  const cleaned = String(yamlText ?? '').replace(/\r\n/g, '\n').split('\n').map(stripLineComment).join('\n');
  const doc = parseFrontmatterDocument(`---\n${cleaned}\n---\n`);
  const errors = [];

  doc.blocks.forEach((block) => {
    if (block.type === 'raw') {
      block.lines.filter(isMeaningfulLine).forEach((line) => errors.push(`无法解析的行：${line.trim()}`));
    } else if (block.kind === 'nested' || block.kind === 'block') {
      errors.push(`${block.key} 不支持嵌套或多行写法`);
    }
  });

  return { fields: doc.frontmatter, errors };
};

const toList = (value) => {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
};

const validateEnum = (key, value, allowed, errors) => {
  if (!allowed.includes(value)) errors.push(`${key} 只能是 ${allowed.join(' / ')}，收到「${value}」`);
};

const validateEnumList = (key, values, allowed, errors) => {
  values.filter((item) => !allowed.includes(item))
    .forEach((item) => errors.push(`${key} 不支持「${item}」，可选 ${allowed.join(' / ')}`));
};

/**
 * 解析并校验 md-render.yaml。文件不存在（null/空）时用缺省值。
 * @returns {{ ok: boolean, manifest: object, errors: string[] }}
 */
export const parseSkillManifest = (yamlText) => {
  if (yamlText == null || String(yamlText).trim() === '') {
    return { ok: true, manifest: { ...DEFAULT_MANIFEST }, errors: [] };
  }

  const { fields, errors } = readYamlFields(yamlText);
  const has = (key) => Object.prototype.hasOwnProperty.call(fields, key);
  const text = (key) => (has(key) ? String(fields[key] ?? '').trim() : DEFAULT_MANIFEST[key]);

  const manifest = {
    label: text('label'),
    group: text('group'),
    aliases: toList(fields.aliases),
    entry: has('entry') ? toList(fields.entry) : [...DEFAULT_MANIFEST.entry],
    input: text('input') || DEFAULT_MANIFEST.input,
    tools: has('tools') ? toList(fields.tools) : [],
    output: text('output') || DEFAULT_MANIFEST.output,
  };

  validateEnumList('entry', manifest.entry, SKILL_ENTRIES, errors);
  validateEnum('input', manifest.input, SKILL_INPUTS, errors);
  validateEnum('output', manifest.output, SKILL_OUTPUTS, errors);
  manifest.tools.filter((tool) => !TOOL_NAME_RE.test(tool))
    .forEach((tool) => errors.push(`tools 里的「${tool}」不是合法的工具名`));

  return { ok: errors.length === 0, manifest, errors };
};

/* ── 组装 ─────────────────────────────────────────────────── */

/**
 * 把一条原始记录变成 skill。
 * @param {{ dirName: string, source: string, skillPath?: string, skillMarkdown?: string, manifestYaml?: string|null, error?: string }} entry
 * @returns {{ ok: true, skill: object } | { ok: false, warning: string }}
 */
export const buildSkill = (entry = {}) => {
  const where = `${entry.source === SKILL_SOURCES.VAULT ? '内容库' : '内置'} skill「${entry.dirName}」`;
  if (entry.error) return { ok: false, warning: `${where} 读取失败：${entry.error}` };

  const { name, description, body } = parseSkillMarkdown(entry.skillMarkdown);
  const id = name || String(entry.dirName ?? '').trim();
  if (!SKILL_ID_RE.test(id)) return { ok: false, warning: `${where} 的 name「${id}」不合法，只能用小写字母、数字和 -` };
  if (!body) return { ok: false, warning: `${where} 的 SKILL.md 正文为空` };

  const parsed = parseSkillManifest(entry.manifestYaml);
  if (!parsed.ok) return { ok: false, warning: `${where} 的 md-render.yaml 有误：${parsed.errors.join('；')}` };

  return {
    ok: true,
    skill: {
      id,
      ...parsed.manifest,
      label: parsed.manifest.label || id,
      description,
      prompt: body,
      source: entry.source,
      skillPath: entry.skillPath || '',
    },
  };
};

const collect = (entries, source, byId, warnings) => {
  (entries || []).forEach((entry) => {
    const result = buildSkill({ ...entry, source });
    if (!result.ok) {
      warnings.push(result.warning);
      return;
    }
    const existing = byId.get(result.skill.id);
    if (existing && existing.source === source) {
      warnings.push(`${source === SKILL_SOURCES.VAULT ? '内容库' : '内置'}里有两个同名 skill「${result.skill.id}」，只用第一个`);
      return;
    }
    byId.set(result.skill.id, result.skill);
  });
};

/**
 * 合并内置和内容库两处 skill，内容库同名覆盖内置。
 * @param {{ builtin?: object[], vault?: object[] }} sources 各自是原始记录数组
 * @returns {{ skills: object[], warnings: string[] }}
 */
export const buildSkillRegistry = ({ builtin = [], vault = [] } = {}) => {
  const byId = new Map();
  const warnings = [];
  collect(builtin, SKILL_SOURCES.BUILTIN, byId, warnings);
  collect(vault, SKILL_SOURCES.VAULT, byId, warnings);
  return { skills: Array.from(byId.values()), warnings };
};

/** 按入口筛选，如 slash 列表只要 entry 含 slash 的 */
export const filterSkillsByEntry = (skills = [], entry) =>
  skills.filter((skill) => skill.entry.includes(entry));

export const findSkillById = (skills = [], id) =>
  skills.find((skill) => skill.id === id) || null;
