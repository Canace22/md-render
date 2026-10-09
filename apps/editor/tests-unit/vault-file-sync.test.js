import { describe, expect, it } from 'vitest';
import { buildDailyFileMap, buildLoadedDailyCache, diffFileMaps, dailyFilesToMap, buildCanvasFileMap } from '../renderer/src/utils/vaultFileSync.js';

const dw = (blocks) => ({
  currentDate: '2026-10-05',
  entries: blocks.length ? { '2026-10-05': { date: '2026-10-05', blocks } } : {},
});
const item = (id, text) => ({ id, type: 'bulletListItem', props: {}, content: [{ type: 'text', text, styles: {} }], children: [] });

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
    expect(writes[0].content).not.toContain('一');
  });

  it('读回来的文件 map 和写出的 map 形状一致；白板也能比对', () => {
    const map = buildDailyFileMap(dw([item('a', '一')]));
    const back = dailyFilesToMap({ dailyFiles: [{ fileName: '2026-10-05.md', content: map.get('Daily/2026-10-05.md') }], todoContent: map.get('Todo.md') });
    expect(diffFileMaps(map, back)).toEqual([]);
    expect([...buildCanvasFileMap({ nodes: [], edges: [] }).keys()]).toEqual(['Canvas/白板.canvas']);
  });

  it('加载后的缓存：Todo.md 记磁盘原样，下次写回会把旧待办改成「已并入」说明', () => {
    const disk = new Map([['Todo.md', '# 待办池\n\n- 旧待办 [id:: t1]\n']]);
    const cache = buildLoadedDailyCache(dw([item('a', '一')]), disk);
    const writes = diffFileMaps(cache, buildDailyFileMap(dw([item('a', '一')])));
    expect(writes.map((w) => w.relativePath)).toEqual(['Todo.md']);
    expect(writes[0].content).toContain('已并入');
  });
});
