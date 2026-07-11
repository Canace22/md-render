import { describe, expect, it } from 'vitest';
import {
  EDITORIAL_BOARD_SPEC,
  EDITORIAL_REVIEW_PROMPT,
  HEADLINE_ANALYSIS_PROMPT,
  PUBLISH_RETRO_PROMPT,
  extractEditorialSection,
  stripFrontmatter,
} from '../renderer/src/core/agent/editorialBoard.js';

describe('editorialBoard 规范加载', () => {
  it('SKILL.md 内联成功且 frontmatter 已剥离', () => {
    expect(EDITORIAL_BOARD_SPEC.startsWith('---')).toBe(false);
    expect(EDITORIAL_BOARD_SPEC).toContain('AI 是编辑，不是作者');
  });

  it('规范包含宪法、9 个角色和输出规范', () => {
    const requiredParts = [
      '编辑部宪法',
      '总编辑',
      '热点编辑',
      '选题编辑',
      '读者编辑',
      '结构编辑',
      '标题编辑',
      '品牌编辑',
      '发布编辑',
      '复盘编辑',
      '固定审稿流程',
      '最终结论',
    ];
    for (const part of requiredParts) {
      expect(EDITORIAL_BOARD_SPEC).toContain(part);
    }
  });

  it('stripFrontmatter 对无 frontmatter 文本原样返回', () => {
    expect(stripFrontmatter('# 标题\n正文')).toBe('# 标题\n正文');
    expect(stripFrontmatter(null)).toBe('');
  });
});

describe('extractEditorialSection', () => {
  it('提取标题编辑一节，止于下一个角色', () => {
    const section = extractEditorialSection(EDITORIAL_BOARD_SPEC, '标题编辑');
    expect(section).toContain('优点');
    expect(section).toContain('公众号版');
    expect(section).not.toContain('品牌编辑');
  });

  it('跳过代码块里的伪标题，不截断当前节', () => {
    const text = '## 目标节\n开头\n```text\n## 假标题\n```\n结尾\n## 下一节\n其他';
    const section = extractEditorialSection(text, '目标节');
    expect(section).toContain('## 假标题');
    expect(section).toContain('结尾');
    expect(section).not.toContain('下一节');
  });

  it('找不到关键字时返回空串', () => {
    expect(extractEditorialSection(EDITORIAL_BOARD_SPEC, '不存在的角色')).toBe('');
  });
});

describe('三个 slash skill prompt', () => {
  it('审稿 prompt 接线 app 工具且含完整规范', () => {
    expect(EDITORIAL_REVIEW_PROMPT).toContain('read_active_doc');
    expect(EDITORIAL_REVIEW_PROMPT).toContain('recall_related_docs');
    expect(EDITORIAL_REVIEW_PROMPT).toContain('禁止调用 write_active_doc');
    expect(EDITORIAL_REVIEW_PROMPT).toContain('最终结论');
  });

  it('审稿 prompt 闭环：先读记忆，结尾给选择卡片和审稿报告归档', () => {
    expect(EDITORIAL_REVIEW_PROMPT).toContain('read_editorial_memory');
    expect(EDITORIAL_REVIEW_PROMPT).toContain('agent-choice');
    expect(EDITORIAL_REVIEW_PROMPT).toContain('editorial_review');
  });

  it('标题分析 prompt 只带标题编辑角色', () => {
    expect(HEADLINE_ANALYSIS_PROMPT).toContain('标题编辑');
    expect(HEADLINE_ANALYSIS_PROMPT).toContain('编辑部宪法');
    expect(HEADLINE_ANALYSIS_PROMPT).not.toContain('结构编辑');
  });

  it('复盘 prompt 要求真实数据并带复盘角色', () => {
    expect(PUBLISH_RETRO_PROMPT).toContain('不得编造数据');
    expect(PUBLISH_RETRO_PROMPT).toContain('复盘编辑');
    expect(PUBLISH_RETRO_PROMPT).toContain('create_agent_artifact');
  });

  it('复盘 prompt 闭环：经验写回记忆并区分分类', () => {
    expect(PUBLISH_RETRO_PROMPT).toContain('update_editorial_memory');
    expect(PUBLISH_RETRO_PROMPT).toContain('category=experience');
  });
});
