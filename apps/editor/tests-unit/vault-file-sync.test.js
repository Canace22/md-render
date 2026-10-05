import { describe, expect, it } from 'vitest';
import { buildDailyFileMap, diffFileMaps, dailyFilesToMap, buildCanvasFileMap } from '../renderer/src/utils/vaultFileSync.js';

const T = Date.UTC(2026, 9, 5);
const dw = (items) => ({
  currentDate: '2026-10-05',
  entries: { '2026-10-05': { date: '2026-10-05', items } },
  todoPool: [],
});
const item = (id, text) => ({ id, type: 'note', priority: 'medium', done: false, createdAt: T, updatedAt: T, text });

describe('迁移后写回文件的增量', () => {
  it('没变化不写；改了一天只写那一天', () => {
    const before = buildDailyFileMap(dw([item('a', '一')]));
    expect(diffFileMaps(before, buildDailyFileMap(dw([item('a', '一')])))).toEqual([]);
    const writes = diffFileMaps(before, buildDailyFileMap(dw([item('a', '一'), item('b', '二')])));
    expect(writes.map((w) => w.relativePath)).toEqual(['Daily/2026-10-05.md']);
  });

  it('一天的条目全删了：写成空记录，不删文件', () => {
    const before = buildDailyFileMap(dw([item('a', '一')]));
    const writes = diffFileMaps(before, buildDailyFileMap(dw([])));
    expect(writes).toHaveLength(1);
    expect(writes[0].content).toContain('date: 2026-10-05');
    expect(writes[0].content).not.toContain('[id:: a]');
  });

  it('读回来的文件 map 和写出的 map 形状一致；白板也能比对', () => {
    const map = buildDailyFileMap(dw([item('a', '一')]));
    const back = dailyFilesToMap({ dailyFiles: [{ fileName: '2026-10-05.md', content: map.get('Daily/2026-10-05.md') }], todoContent: map.get('Todo.md') });
    expect(diffFileMaps(map, back)).toEqual([]);
    expect([...buildCanvasFileMap({ nodes: [], edges: [] }).keys()]).toEqual(['Canvas/白板.canvas']);
  });
});
