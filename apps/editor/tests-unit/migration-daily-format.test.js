import { describe, expect, it } from 'vitest';
import {
  findDailyRoundTripMismatches,
  parseDailyEntry,
  parseDailyWorkspace,
  parseTodoPool,
  serializeDailyEntry,
  serializeDailyWorkspace,
} from '../shared/migration/dailyFormat.js';
import { markdownToBlocks } from '../shared/daily/dailyMarkdown.js';
import { normalizeDailyWorkspace } from '../renderer/src/utils/dailyWorkspace.js';

const DATE = '2026-10-05';
const coloredBlocks = [
  ...markdownToBlocks('## 📝 今日任务\n\n- [ ] 写公众号初稿\n  - 列提纲\n- [x] 回复读者留言\n\n## 💡 笔记\n\n- 第一行'),
  { id: 'rich-1', type: 'paragraph', props: { textColor: 'red' }, content: [{ type: 'text', text: '「不同步」', styles: { bold: true, textColor: 'red' } }], children: [] },
];
const entry = { date: DATE, blocks: coloredBlocks };

describe('Daily 大纲 ↔ Markdown 文件', () => {
  it('往返完全一致（颜色、id 靠数据块保住）', () => {
    expect(parseDailyEntry(serializeDailyEntry(entry), DATE)).toEqual(entry);
    expect(findDailyRoundTripMismatches({ entries: { [DATE]: entry } })).toEqual([]);
  });

  it('正文是干净的大纲 Markdown，AI / Obsidian 直接能读', () => {
    const md = serializeDailyEntry(entry);
    expect(md.startsWith('---\ndate: 2026-10-05\n---\n\n## 📝 今日任务\n\n- [ ] 写公众号初稿\n  - 列提纲\n- [x] 回复读者留言')).toBe(true);
    expect(md).toContain('**「不同步」**');
    expect(md).not.toContain('[type::');
    expect(md).toContain('<!-- md-render:data');
  });

  it('外部勾选任务：按正文重新解析，读回来已完成', () => {
    const md = serializeDailyEntry(entry).replace('- [ ] 写公众号初稿', '- [x] 写公众号初稿');
    const blocks = parseDailyEntry(md, DATE).blocks;
    expect(blocks[1]).toMatchObject({ type: 'checkListItem', props: { checked: true } });
    expect(blocks[1].children[0].content[0].text).toBe('列提纲');
  });

  it('外部手写的新行也能读进来', () => {
    const md = serializeDailyEntry(entry).replace('- 第一行', '- 第一行\n- Obsidian 里加的');
    expect(parseDailyEntry(md, DATE).blocks.some((b) => b.content?.[0]?.text === 'Obsidian 里加的')).toBe(true);
  });

  it('旧格式文件（Dataview 字段 + 富文本数据块）能读成大纲，id 保留', () => {
    const legacy = [
      '---', `date: ${DATE}`, '---', '', '## 记录', '',
      '- [ ] 写稿 [type:: task] [id:: task-1] [created:: 2026-10-05T01:00:00.000Z]',
      '- 选题会 [type:: event] [id:: event-1]',
      '- 想法 [type:: note] [id:: note-1]',
    ].join('\n');
    const blocks = parseDailyEntry(legacy, DATE).blocks;
    expect(blocks.map((b) => b.id)).toEqual([
      `${DATE}-section-task`, 'task-1', `${DATE}-section-event`, 'event-1', `${DATE}-section-note`, 'note-1',
    ]);
  });

  it('整个工作区：空的日子不写文件；Todo.md 写成「已并入」说明，读回来没有待办', () => {
    const files = serializeDailyWorkspace({ currentDate: DATE, entries: { [DATE]: entry, '2026-10-06': { date: '2026-10-06', blocks: [] } } });
    expect(files.map((f) => f.relativePath)).toEqual(['Daily/2026-10-05.md', 'Todo.md']);
    expect(parseTodoPool(files[1].content)).toEqual([]);
    const back = parseDailyWorkspace({
      dailyFiles: [{ fileName: '2026-10-05.md', content: files[0].content }, { fileName: 'README.md', content: '' }],
      todoContent: files[1].content,
    }, DATE);
    expect(back).toEqual({ currentDate: DATE, entries: { [DATE]: entry }, todoPool: [] });
  });

  it('旧 Todo.md 读出来的待办会被 normalize 并进今日任务', () => {
    const back = parseDailyWorkspace({ dailyFiles: [], todoContent: '# 待办池\n\n- 整理选题库 [id:: todo-1]\n' }, DATE);
    const ws = normalizeDailyWorkspace(back, DATE);
    expect(ws.entries[DATE].blocks.find((b) => b.id === 'todo-1')).toMatchObject({ type: 'checkListItem', props: { checked: false } });
  });
});
