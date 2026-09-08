import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DailyNotebook from '../renderer/src/components/DailyNotebook.jsx';
import DailyEntryList from '../renderer/src/components/daily/DailyEntryList.jsx';
import DailyItemRow from '../renderer/src/components/daily/DailyItemRow.jsx';
import {
  addDailyEntryItem,
  getDailyEntry,
  moveDailyEntryItem,
  toggleDailyEntryTaskDone,
} from '../renderer/src/utils/dailyWorkspace.js';

const DATE = '2026-09-08';
const TARGET_DATE = '2026-09-09';
const TEXT = { task: '测试任务甲', note: '测试笔记乙', event: '测试事件丙' };
const TYPES = ['task', 'note', 'event'];

function createWorkspace() {
  return TYPES.reduce((workspace, type) => addDailyEntryItem(workspace, DATE, {
    type, text: TEXT[type],
  }), { currentDate: DATE, entries: {}, todoPool: [] });
}

const renderNotebook = (workspace) => renderToStaticMarkup(<DailyNotebook dailyWorkspace={workspace} />);

describe('今日记录合并列表（组件静态渲染与数据动作回归）', () => {
  it('三类记录只渲染一个今日记录列表，每行有类型标签', () => {
    const html = renderNotebook(createWorkspace());
    expect(html.match(/class="daily-notebook-list"/g)).toHaveLength(1);
    expect(html.match(/class="ant-tag[^\"]*daily-notebook-type-tag/g)).toHaveLength(3);
    expect(html).toContain('今日记录');
    expect(html).toContain('全部 3');
    for (const type of TYPES) expect(html).toContain(TEXT[type]);
    expect(html.indexOf(TEXT.task)).toBeLessThan(html.indexOf(TEXT.event));
    expect(html.indexOf(TEXT.event)).toBeLessThan(html.indexOf(TEXT.note));
  });

  it('完成任务后，任务显示在事件和笔记之后', () => {
    const workspace = createWorkspace();
    const task = getDailyEntry(workspace, DATE).items.find((item) => item.type === 'task');
    const html = renderNotebook(toggleDailyEntryTaskDone(workspace, DATE, task.id));
    expect(html.indexOf(TEXT.task)).toBeGreaterThan(html.indexOf(TEXT.note));
    expect(html).toContain('标记为未完成');
  });

  it('未完成任务按优先级排序', () => {
    let workspace = createWorkspace();
    workspace = addDailyEntryItem(workspace, DATE, { type: 'task', text: '低优先级任务', priority: 'low' });
    workspace = addDailyEntryItem(workspace, DATE, { type: 'task', text: '高优先级任务', priority: 'high' });
    const html = renderNotebook(workspace);
    expect(html.indexOf('高优先级任务')).toBeLessThan(html.indexOf(TEXT.task));
    expect(html.indexOf(TEXT.task)).toBeLessThan(html.indexOf('低优先级任务'));
  });

  it('空日期显示添加提示并保留待办池', () => {
    const html = renderNotebook({ currentDate: DATE, entries: {}, todoPool: [] });
    expect(html).toContain('今天还没有记录');
    expect(html).toContain('添加记录');
    expect(html).toContain('待办池');
    expect(html).not.toContain('daily-notebook-type-filter');
  });

  it('筛选结果为空时仍保留类型筛选入口', () => {
    const html = renderToStaticMarkup(<DailyEntryList
      items={[]} countByType={{ task: 1 }} totalCount={1} typeFilter="note"
    />);
    expect(html).toContain('当前类型下还没有记录');
    expect(html).toContain('daily-notebook-type-filter');
    expect(html).toContain('任务 1');
    expect(html).toContain('笔记 0');
  });

  it.each(TYPES)('%s 草稿有类型标签，类别和优先级按类型显示', (type) => {
    const html = renderToStaticMarkup(<DailyItemRow
      item={{ id: 'pending', type, text: '', isPending: true }}
      currentDate={DATE} isEditing editingDraft={{ text: '', richText: [] }}
    />);
    expect(html).toContain('daily-notebook-type-tag');
    expect(html).toMatch(/删\s*除/);
    expect(html.includes('daily-notebook-category-placeholder')).toBe(type !== 'event');
    expect(html.includes('daily-notebook-priority-trigger')).toBe(type === 'task');
  });

  it.each(TYPES)('编辑已保存的 %s 时仍显示类型标签', (type) => {
    const html = renderToStaticMarkup(<DailyItemRow
      item={{ id: 'saved', type, text: TEXT[type] }}
      currentDate={DATE} isEditing editingDraft={{ text: TEXT[type], richText: [] }}
    />);
    expect(html.match(/class="ant-tag[^\"]*daily-notebook-type-tag/g)).toHaveLength(1);
    expect(html).toMatch(/保\s*存/);
  });

  it('三类记录都可以迁移日期，原日期清空且目标类型保留', () => {
    let workspace = createWorkspace();
    const original = workspace;
    for (const item of getDailyEntry(workspace, DATE).items) {
      workspace = moveDailyEntryItem(workspace, DATE, item.id, TARGET_DATE);
    }
    expect(getDailyEntry(workspace, DATE).items).toHaveLength(0);
    expect(getDailyEntry(workspace, TARGET_DATE).items.map((item) => item.type).sort()).toEqual([...TYPES].sort());
    expect(getDailyEntry(original, DATE).items).toHaveLength(3);
  });

  it('特殊字符与长文本按文本渲染，不插入 HTML 标签', () => {
    const text = '<script>unsafe</script> & 中文'.repeat(20);
    const workspace = addDailyEntryItem(createWorkspace(), DATE, { type: 'note', text });
    const html = renderNotebook(workspace);
    expect(html).not.toContain('<script>unsafe</script>');
    expect(html).toContain('&lt;script&gt;unsafe&lt;/script&gt; &amp; 中文');
  });
});
