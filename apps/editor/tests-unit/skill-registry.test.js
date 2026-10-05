import { describe, expect, it } from 'vitest';
import {
  buildSkill,
  buildSkillRegistry,
  filterSkillsByEntry,
  findSkillById,
  parseSkillManifest,
  parseSkillMarkdown,
} from '../renderer/src/core/agent/skillRegistry.js';
import { toBuiltinSkillEntries } from '../renderer/src/core/agent/builtinSkills.js';

const skillMd = (name, body = '读取当前文档并改写。') => [
  '---',
  ...(name ? [`name: ${name}`] : []),
  `description: ${name || '无名'} 的说明`,
  '---',
  '',
  body,
].join('\n');

const entry = (dirName, overrides = {}) => ({
  dirName,
  skillPath: `/x/${dirName}/SKILL.md`,
  skillMarkdown: skillMd(dirName),
  manifestYaml: null,
  ...overrides,
});

describe('parseSkillMarkdown', () => {
  it('读出 name / description / 正文', () => {
    const result = parseSkillMarkdown(skillMd('wechat-version', '第一步\n第二步'));
    expect(result).toEqual({
      name: 'wechat-version',
      description: 'wechat-version 的说明',
      body: '第一步\n第二步',
    });
  });

  it('没有 frontmatter 时整段都是正文', () => {
    expect(parseSkillMarkdown('只有正文')).toEqual({ name: '', description: '', body: '只有正文' });
  });
});

describe('parseSkillManifest', () => {
  it('文件不存在时用缺省值', () => {
    const { ok, manifest } = parseSkillManifest(null);
    expect(ok).toBe(true);
    expect(manifest).toEqual({ label: '', group: '', aliases: [], entry: ['slash'], input: 'none', tools: [], output: 'answer' });
  });

  it('支持行内列表、行尾注释和 - 列表', () => {
    const yaml = [
      'label: 公众号版   # 显示名',
      'entry: [slash, doc-toolbar]   # 入口',
      'input: active_doc',
      'tools:',
      '  - read_active_doc',
      '  - create_agent_artifact',
      'output: artifact',
      'future_field: 以后再说',
    ].join('\n');
    const { ok, manifest, errors } = parseSkillManifest(yaml);
    expect(errors).toEqual([]);
    expect(ok).toBe(true);
    expect(manifest).toMatchObject({
      label: '公众号版',
      entry: ['slash', 'doc-toolbar'],
      input: 'active_doc',
      tools: ['read_active_doc', 'create_agent_artifact'],
      output: 'artifact',
    });
  });

  it('引号里的 # 不当注释', () => {
    const { manifest } = parseSkillManifest('label: "C# 版本"');
    expect(manifest.label).toBe('C# 版本');
  });

  it('取值不合法时给出具体原因', () => {
    const { ok, errors } = parseSkillManifest('entry: [sidebar]\ninput: clipboard\noutput: file\ntools: [Read File]');
    expect(ok).toBe(false);
    expect(errors.join('\n')).toMatch(/entry 不支持「sidebar」/);
    expect(errors.join('\n')).toMatch(/input 只能是/);
    expect(errors.join('\n')).toMatch(/output 只能是/);
    expect(errors.join('\n')).toMatch(/不是合法的工具名/);
  });

  it('嵌套对象和看不懂的行都算格式错误', () => {
    expect(parseSkillManifest('label:\n  zh: 公众号').ok).toBe(false);
    expect(parseSkillManifest('  缩进开头的一行').ok).toBe(false);
  });
});

describe('buildSkill', () => {
  it('name 缺省用目录名，label 缺省用 id', () => {
    const result = buildSkill({ ...entry('jike-version', { skillMarkdown: skillMd('') }), source: 'vault' });
    expect(result.ok).toBe(true);
    expect(result.skill).toMatchObject({ id: 'jike-version', label: 'jike-version', source: 'vault', prompt: '读取当前文档并改写。' });
  });

  it('正文为空、name 不合法、读取失败都跳过并说明原因', () => {
    expect(buildSkill({ ...entry('a', { skillMarkdown: skillMd('a', '') }), source: 'builtin' }).warning).toMatch(/正文为空/);
    expect(buildSkill({ ...entry('Bad Name', { skillMarkdown: skillMd('') }), source: 'builtin' }).warning).toMatch(/不合法/);
    expect(buildSkill({ dirName: 'x', source: 'vault', error: 'EACCES' }).warning).toMatch(/内容库 skill「x」 读取失败：EACCES/);
  });
});

describe('buildSkillRegistry', () => {
  it('内容库同名覆盖内置，位置不变', () => {
    const { skills, warnings } = buildSkillRegistry({
      builtin: [entry('polish'), entry('wechat-version')],
      vault: [entry('polish', { skillMarkdown: skillMd('polish', '我的润色规则') }), entry('jike-version')],
    });
    expect(warnings).toEqual([]);
    expect(skills.map((s) => s.id)).toEqual(['polish', 'wechat-version', 'jike-version']);
    expect(findSkillById(skills, 'polish')).toMatchObject({ source: 'vault', prompt: '我的润色规则' });
  });

  it('一个 skill 写错不影响其他 skill', () => {
    const { skills, warnings } = buildSkillRegistry({
      vault: [entry('broken', { manifestYaml: 'entry: [nowhere]' }), entry('ok-skill')],
    });
    expect(skills.map((s) => s.id)).toEqual(['ok-skill']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/broken/);
  });

  it('同一来源里重名只用第一个并提示', () => {
    const { skills, warnings } = buildSkillRegistry({
      vault: [entry('a', { skillMarkdown: skillMd('same') }), entry('b', { skillMarkdown: skillMd('same') })],
    });
    expect(skills).toHaveLength(1);
    expect(skills[0].skillPath).toBe('/x/a/SKILL.md');
    expect(warnings[0]).toMatch(/两个同名 skill「same」/);
  });

  it('按入口筛选', () => {
    const { skills } = buildSkillRegistry({
      builtin: [entry('a', { manifestYaml: 'entry: [doc-toolbar]' }), entry('b')],
    });
    expect(filterSkillsByEntry(skills, 'slash').map((s) => s.id)).toEqual(['b']);
    expect(filterSkillsByEntry(skills, 'doc-toolbar').map((s) => s.id)).toEqual(['a']);
  });
});

describe('toBuiltinSkillEntries', () => {
  it('按目录把 SKILL.md 和 md-render.yaml 配对', () => {
    const entries = toBuiltinSkillEntries(
      {
        '../../../../resources/skills/b/SKILL.md': 'B',
        '../../../../resources/skills/a/SKILL.md': 'A',
      },
      { '../../../../resources/skills/a/agents/md-render.yaml': 'label: 甲' },
    );
    expect(entries).toEqual([
      { dirName: 'a', skillPath: 'resources/skills/a/SKILL.md', skillMarkdown: 'A', manifestYaml: 'label: 甲' },
      { dirName: 'b', skillPath: 'resources/skills/b/SKILL.md', skillMarkdown: 'B', manifestYaml: null },
    ]);
  });
});

describe('内置 skill', () => {
  it('内置 skill 全部能通过校验，没有警告', async () => {
    const { BUILTIN_SKILL_ENTRIES } = await import('../renderer/src/core/agent/builtinSkills.js');
    const { skills, warnings } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });
    expect(warnings).toEqual([]);
    expect(skills.length).toBe(BUILTIN_SKILL_ENTRIES.length);
  });

  it('平台版 skill 带上工具白名单和产出形态', async () => {
    const { BUILTIN_SKILL_ENTRIES } = await import('../renderer/src/core/agent/builtinSkills.js');
    const { skills } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });
    ['wechat-version', 'xiaohongshu-version', 'zhihu-version'].forEach((id) => {
      expect(findSkillById(skills, id)).toMatchObject({
        group: '平台版本',
        input: 'active_doc',
        output: 'artifact',
        tools: ['read_active_doc', 'create_agent_artifact'],
      });
    });
  });
});
