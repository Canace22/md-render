import { describe, expect, it } from 'vitest';
import { BUILTIN_SKILL_ENTRIES } from '../renderer/src/core/agent/builtinSkills.js';
import { buildSkillRegistry, findSkillById } from '../renderer/src/core/agent/skillRegistry.js';
import { ACTIVE_DOC_INTRO, SELECTION_INTRO, buildSkillTurn } from '../renderer/src/core/agent/skillRunner.js';
import { toShortDescription, toSkillItem, pickSkillItems } from '../renderer/src/components/agentSkillItems.js';

const { skills } = buildSkillRegistry({ builtin: BUILTIN_SKILL_ENTRIES });
const turnOf = (id, options = {}) => buildSkillTurn(findSkillById(skills, id), { skills, ...options });

describe('buildSkillTurn', () => {
  it('平台版：先读文档、另存平台稿、只开放两个工具', () => {
    const turn = turnOf('wechat-version');
    expect(turn.promptText.startsWith(ACTIVE_DOC_INTRO)).toBe(true);
    expect(turn.promptText).toContain('微信公众号');
    expect(turn.promptText).toContain('platform_draft');
    expect(turn.allowedTools).toEqual(['read_active_doc', 'create_agent_artifact']);
    expect(turn.displayText).toBe('公众号版');
  });

  it('小红书 / 知乎指令带各自平台特征', () => {
    expect(turnOf('xiaohongshu-version').promptText).toContain('话题标签');
    expect(turnOf('zhihu-version').promptText).toContain('论证');
  });

  it('input=selection 且有选区：只处理选区，原文拼在最后', () => {
    const turn = turnOf('polish', { selectionText: '  这段选中文本 ' });
    expect(turn.consumesSelection).toBe(true);
    expect(turn.promptText.startsWith(SELECTION_INTRO)).toBe(true);
    expect(turn.promptText.endsWith('选中原文：\n这段选中文本')).toBe(true);
  });

  it('input=selection 但没选区：按整篇处理', () => {
    const turn = turnOf('polish');
    expect(turn.consumesSelection).toBe(false);
    expect(turn.promptText.startsWith(ACTIVE_DOC_INTRO)).toBe(true);
  });

  it('input=active_doc 的 skill 不吃选区（交给调用方当附件）', () => {
    const turn = turnOf('title-suggestions', { selectionText: '选区' });
    expect(turn.consumesSelection).toBe(false);
    expect(turn.promptText).not.toContain('选区');
  });

  it('input=none 不加开场句', () => {
    expect(turnOf('draft-entry').promptText).toBe('请直接调用 create_content_entry 创建 kind=draft 的稿件，使用默认名称，不要先询问。');
  });

  it('编辑部审稿拼上完整规范', () => {
    const turn = turnOf('editorial-review');
    expect(turn.promptText).toContain('read_editorial_memory');
    expect(turn.promptText).toContain('最终结论');
  });
});

describe('agentSkillItems', () => {
  it('短说明取第一句', () => {
    expect(toShortDescription('第一句话。第二句话。')).toBe('第一句话');
    expect(toShortDescription('没有句号')).toBe('没有句号');
  });

  it('内容库 skill 用默认样式，分组缺省为「我的 skill」', () => {
    const [vault] = buildSkillRegistry({
      vault: [{ dirName: 'jike-version', skillMarkdown: '---\nname: jike-version\ndescription: 改成即刻版。\n---\n正文' }],
    }).skills;
    const item = toSkillItem(vault);
    expect(item).toMatchObject({ type: 'skill', skillId: 'jike-version', category: '我的 skill', description: '改成即刻版' });
    expect(pickSkillItems([item], 'slash')).toHaveLength(1);
  });

  it('欢迎页和「+」菜单按 entry 筛选', () => {
    const items = skills.map(toSkillItem);
    expect(pickSkillItems(items, 'welcome').map((i) => i.id)).toEqual(
      expect.arrayContaining(['editorial-review', 'app-diagnostics', 'create-deliverable', 'outline', 'key-points']),
    );
    expect(pickSkillItems(items, 'composer').map((i) => i.id)).toEqual(
      expect.arrayContaining(['topic-entry', 'outline', 'expand', 'continue-writing', 'polish', 'compress']),
    );
  });
});
