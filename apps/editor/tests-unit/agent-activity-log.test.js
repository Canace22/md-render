import { beforeEach, describe, expect, it, vi } from 'vitest';

const saved = [];
vi.mock('../renderer/src/utils/agentDataBridge.js', () => ({
  saveActivityEntry: vi.fn(async (entry) => { saved.push(entry); }),
}));

import {
  getRecentActivity,
  recordToolActivity,
  resetActivityMemory,
  subscribeActivity,
  withActivityLog,
} from '../renderer/src/core/agent/activityLog.js';

beforeEach(() => {
  saved.length = 0;
  resetActivityMemory();
});

describe('活动日志', () => {
  it('记录一条：写盘 + 内存 + 通知订阅者，不含正文', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActivity(listener);
    recordToolActivity({ who: 'app', name: 'write_active_doc', args: '{"content":"很长的正文"}', result: '改动已应用到当前文档。' });
    unsubscribe();

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ who: 'app', tool: 'write_active_doc', ok: true });
    expect(JSON.stringify(saved[0])).not.toContain('很长的正文');
    expect(getRecentActivity()).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('withActivityLog 包住 executeTool：结果原样返回，来源记为 mcp', async () => {
    const execute = vi.fn(async () => '已创建文件夹「a」。');
    const wrapped = withActivityLog(execute, { who: 'mcp' });
    const result = await wrapped({ function: { name: 'create_folder', arguments: '{"name":"a"}' } }, {});
    expect(result).toBe('已创建文件夹「a」。');
    expect(saved[0]).toMatchObject({ who: 'mcp', tool: 'create_folder', ok: true });
  });

  it('坏参数不影响记录；失败结果 ok=false', () => {
    recordToolActivity({ who: 'app', name: 't', args: '{坏', result: '删除失败：没有找到任何对应条目' });
    expect(saved[0]).toMatchObject({ ok: false, target: {} });
  });
});
