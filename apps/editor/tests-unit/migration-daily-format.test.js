import { describe, expect, it } from 'vitest';
import {
  findDailyRoundTripMismatches,
  parseDailyEntry,
  parseDailyWorkspace,
  parseTodoPool,
  serializeDailyEntry,
  serializeDailyWorkspace,
  serializeTodoPool,
} from '../shared/migration/dailyFormat.js';
import { normalizeDailyWorkspace } from '../renderer/src/utils/dailyWorkspace.js';

const T1 = Date.UTC(2026, 9, 5, 1, 2, 3, 456);
const T2 = T1 + 60000;

const richBlocks = [{ type: 'paragraph', content: [{ type: 'text', text: '「不同步」', styles: { bold: true, textColor: 'red' } }, { type: 'text', text: '才是最好的同步', styles: {} }] }];

const day = normalizeDailyWorkspace({
  currentDate: '2026-10-05',
  entries: {
    '2026-10-05': {
      items: [
        { id: 'task-1', type: 'task', priority: 'high', category: 'creation', done: false, text: '写公众号初稿', createdAt: T1, updatedAt: T2 },
        { id: 'task-2', type: 'task', done: true, text: '回复读者留言', createdAt: T1, updatedAt: T1 },
        { id: 'event-1', type: 'event', text: '14:00 选题会', createdAt: T1, updatedAt: T1 },
        { id: 'note-1', type: 'note', category: 'learning', text: '第一行\n第二行\n\n空行后的第三行', createdAt: T1, updatedAt: T2 },
        { id: 'note-2', type: 'note', text: '「不同步」才是最好的同步', richText: richBlocks, createdAt: T1, updatedAt: T1 },
        { id: 'note-3', type: 'note', text: '像字段的文字 [type:: task]', createdAt: T1, updatedAt: T1 },
      ],
    },
  },
  todoPool: [
    { id: 'todo-1', text: '整理选题库', sourceDate: '2026-10-01', category: 'work', createdAt: T1, updatedAt: T2 },
    { id: 'todo-2', text: '带颜色的待办', richText: richBlocks, createdAt: T1, updatedAt: T1 },
  ],
}, '2026-10-05');

describe('Daily ↔ Markdown', () => {
  it('往返完全一致（含富文本、多行、优先级、分类、完成状态）', () => {
    expect(findDailyRoundTripMismatches(day)).toEqual([]);
    const entry = day.entries['2026-10-05'];
    expect(parseDailyEntry(serializeDailyEntry(entry), '2026-10-05')).toEqual(entry);
    expect(parseTodoPool(serializeTodoPool(day.todoPool))).toEqual(day.todoPool);
  });

  it('生成的 Markdown 在 Obsidian 里可读：任务是复选框，属性是 Dataview 字段', () => {
    const md = serializeDailyEntry(day.entries['2026-10-05']);
    expect(md).toContain('date: 2026-10-05');
    expect(md).toContain('- [ ] 写公众号初稿 [type:: task] [priority:: high] [category:: creation] [id:: task-1]');
    expect(md).toContain('- [x] 回复读者留言 [type:: task] [id:: task-2]');
    expect(md).toContain('- 14:00 选题会 [type:: event] [id:: event-1]');
    expect(md).toContain('<!-- md-render:data');
  });

  it('在 Obsidian 里勾选任务，读回来就是已完成', () => {
    const md = serializeDailyEntry(day.entries['2026-10-05']).replace('- [ ] 写公众号初稿', '- [x] 写公众号初稿');
    expect(parseDailyEntry(md, '2026-10-05').items[0].done).toBe(true);
  });

  it('外部改了带富文本的文字：以文件文字为准，丢掉旧富文本', () => {
    const md = serializeDailyEntry(day.entries['2026-10-05']).replace('- 「不同步」才是最好的同步', '- 改过的文字');
    const note = parseDailyEntry(md, '2026-10-05').items.find((item) => item.id === 'note-2');
    expect(note.text).toBe('改过的文字');
    expect(note.richText).toBeUndefined();
  });

  it('外部手写的新条目（没有 id）也能读进来', () => {
    const md = `${serializeDailyEntry(day.entries['2026-10-05'])}\n- [ ] Obsidian 里加的任务\n`;
    const items = parseDailyEntry(md, '2026-10-05').items;
    expect(items.at(-1)).toMatchObject({ type: 'task', text: 'Obsidian 里加的任务', done: false, priority: 'medium' });
  });

  it('整个工作区：空的日子不写文件，Todo.md 总是写；读回来一致', () => {
    const files = serializeDailyWorkspace({ ...day, entries: { ...day.entries, '2026-10-06': { date: '2026-10-06', items: [] } } });
    expect(files.map((f) => f.relativePath)).toEqual(['Daily/2026-10-05.md', 'Todo.md']);
    const back = parseDailyWorkspace({
      dailyFiles: [{ fileName: '2026-10-05.md', content: files[0].content }, { fileName: 'README.md', content: '' }],
      todoContent: files[1].content,
    }, '2026-10-05');
    expect(back).toEqual(day);
  });
});
