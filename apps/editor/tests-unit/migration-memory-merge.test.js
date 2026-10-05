import { describe, expect, it } from 'vitest';
import { mergeEditorialMemories } from '../shared/migration/memoryMerge.js';
import { appendMemoryEntry, buildMemoryTemplate } from '../renderer/src/core/agent/editorialMemory.js';

const withEntries = (entries) => entries.reduce(
  (content, entry) => appendMemoryEntry(content, entry).content,
  buildMemoryTemplate(),
);

describe('合并编辑部记忆副本', () => {
  it('同一条只留一次，副本独有的条目都保留', () => {
    const a = withEntries([
      { category: 'experience', text: '公众号标题 20 字内', dateKey: '2026-09-01' },
      { category: 'persona', text: '偏好短句', dateKey: '2026-09-02' },
    ]);
    const b = withEntries([
      { category: 'experience', text: '公众号标题 20 字内', dateKey: '2026-09-01' },
      { category: 'retro', text: '周末发阅读低\n工作日早上更好', dateKey: '2026-09-03' },
    ]);
    const { content, entryCount, duplicateCount } = mergeEditorialMemories([a, b]);
    expect(entryCount).toBe(3);
    expect(duplicateCount).toBe(1);
    expect(content.match(/公众号标题 20 字内/g)).toHaveLength(1);
    expect(content).toContain('  工作日早上更好');
    expect(content.startsWith('# 编辑部记忆')).toBe(true);
  });

  it('用户自加的小节和段落不丢；空输入返回空', () => {
    const custom = '# 编辑部记忆\n\n## 我的备注\n\n一段说明文字\n- 一条';
    expect(mergeEditorialMemories([custom]).content).toContain('一段说明文字');
    expect(mergeEditorialMemories(['', null]).content).toBe('');
  });

  it('合并结果仍能继续 appendMemoryEntry', () => {
    const merged = mergeEditorialMemories([withEntries([{ category: 'knowledge', text: '本地优先', dateKey: '2026-09-01' }])]).content;
    const next = appendMemoryEntry(merged, { category: 'knowledge', text: '文件为真相', dateKey: '2026-10-05' });
    expect(next.ok).toBe(true);
    expect(next.content.indexOf('文件为真相')).toBeGreaterThan(next.content.indexOf('本地优先'));
  });
});
