import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { syncVaultAgentFiles, MANAGED_MARKER_FILE } from '../main/vaultAgentFiles.js';
import { readSkillEntries } from '../main/skillFiles.js';
import { MANAGED_END, mergeAgentsMd } from '../shared/vaultAgentsMd.js';
import { buildSkillRegistry, findSkillById } from '../renderer/src/core/agent/skillRegistry.js';
import { BUILTIN_SKILL_ENTRIES } from '../renderer/src/core/agent/builtinSkills.js';

let vault;
let skillsDir;
beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'md-render-agents-'));
  skillsDir = path.join(vault, '.agents', 'skills');
});
afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true });
});

const polish = BUILTIN_SKILL_ENTRIES.find((entry) => entry.dirName === 'polish');

describe('AGENTS.md', () => {
  it('首次生成；用户在标记外写的内容保留；重复生成不变', () => {
    const first = mergeAgentsMd('');
    expect(first).toContain('# MD Render 内容库');
    expect(first).toContain('Daily/YYYY-MM-DD.md');
    expect(first).toContain('read_active_doc');
    const withUser = `${first}\n## 我的规则\n- 用短句\n`;
    const again = mergeAgentsMd(withUser);
    expect(again).toBe(withUser);
    expect(mergeAgentsMd('# 我原来的 AGENTS.md')).toMatch(new RegExp(`${MANAGED_END}\\n\\n# 我原来的 AGENTS.md`));
  });
});

describe('同步内置技能到内容库', () => {
  it('首次写入带托管标记；没改过的副本不算用户覆盖；软链接建好', async () => {
    const result = await syncVaultAgentFiles(vault, { builtinSkills: [polish], skillsDir });
    expect(result.skills.written).toEqual(['polish']);
    expect(result.linkCreated).toBe(true);
    expect(await fs.readFile(path.join(vault, '.claude/skills/polish/SKILL.md'), 'utf8')).toBe(polish.skillMarkdown);
    await fs.access(path.join(skillsDir, 'polish', MANAGED_MARKER_FILE));

    const entries = await readSkillEntries(skillsDir);
    expect(entries[0]).toMatchObject({ managed: true, modified: false });
    const { skills } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES, vault: entries });
    expect(findSkillById(skills, 'polish').source).toBe('builtin');
  });

  it('用户改过的副本：变成用户版本，app 不再覆盖', async () => {
    await syncVaultAgentFiles(vault, { builtinSkills: [polish], skillsDir });
    const skillPath = path.join(skillsDir, 'polish', 'SKILL.md');
    await fs.writeFile(skillPath, polish.skillMarkdown.replace('请润色内容', '请按我的口味润色内容'), 'utf8');
    const second = await syncVaultAgentFiles(vault, { builtinSkills: [{ ...polish, skillMarkdown: `${polish.skillMarkdown}\n新版` }], skillsDir });
    expect(second.skills.kept).toEqual(['polish']);
    expect(await fs.readFile(skillPath, 'utf8')).toContain('按我的口味');
    const { skills } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES, vault: await readSkillEntries(skillsDir) });
    expect(findSkillById(skills, 'polish')).toMatchObject({ source: 'vault' });
  });

  it('没改过的副本随 app 更新；用户自己的同名技能（没有标记）不碰', async () => {
    await syncVaultAgentFiles(vault, { builtinSkills: [polish], skillsDir });
    const updated = await syncVaultAgentFiles(vault, { builtinSkills: [{ ...polish, skillMarkdown: `${polish.skillMarkdown}\n新版` }], skillsDir });
    expect(updated.skills.updated).toEqual(['polish']);
    const same = await syncVaultAgentFiles(vault, { builtinSkills: [{ ...polish, skillMarkdown: `${polish.skillMarkdown}\n新版` }], skillsDir });
    expect(same.skills.unchanged).toEqual(['polish']);

    await fs.mkdir(path.join(skillsDir, 'compress'), { recursive: true });
    await fs.writeFile(path.join(skillsDir, 'compress', 'SKILL.md'), '我的压缩', 'utf8');
    const compress = BUILTIN_SKILL_ENTRIES.find((entry) => entry.dirName === 'compress');
    const kept = await syncVaultAgentFiles(vault, { builtinSkills: [compress], skillsDir });
    expect(kept.skills.kept).toEqual(['compress']);
    expect(await fs.readFile(path.join(skillsDir, 'compress', 'SKILL.md'), 'utf8')).toBe('我的压缩');
  });
});
