import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

var mockUserDataPath = '';

vi.mock('electron', () => ({
  app: {
    getPath: () => mockUserDataPath,
  },
}));

import {
  closeDatabase,
  getVersionById,
  getVersions,
  initDatabase,
  saveVersions,
  saveVersionSnapshot,
  shouldSaveVersion,
  syncDocuments,
} from '../main/database.js';
import { VERSION_RETENTION_MS, VERSION_SNAPSHOT_INTERVAL_MS } from '@shared/versionHistory.js';
import { formatVersionTime } from '../renderer/src/utils/versionHistory.js';

const T0 = new Date(2026, 9, 8, 10, 0).getTime();

const workspaceWith = (content, updatedAt = T0) => ({
  id: 'root',
  type: 'folder',
  name: 'root',
  children: [{ id: 'doc-1', type: 'file', name: 'a.md', content, updatedAt }],
});

/** 模拟一次 db:save：先存快照，再覆盖正文 */
const save = (content, now, updatedAt = now) => {
  const workspace = workspaceWith(content, updatedAt);
  saveVersions(workspace, now);
  syncDocuments(workspace);
};

const contents = () => getVersions('doc-1').map((v) => getVersionById(v.id).content);

describe('shouldSaveVersion', () => {
  it('空旧正文不存', () => {
    expect(shouldSaveVersion('', null, T0)).toBe(false);
  });
  it('没有快照时存', () => {
    expect(shouldSaveVersion('A', null, T0)).toBe(true);
  });
  it('和最新快照相同不存', () => {
    expect(shouldSaveVersion('A', { content: 'A', created_at: 0 }, T0)).toBe(false);
  });
  it('不满间隔不存，满间隔存（不再要求改动 ≥50 字）', () => {
    const last = { content: 'A', created_at: T0 };
    expect(shouldSaveVersion('AB', last, T0 + VERSION_SNAPSHOT_INTERVAL_MS - 1)).toBe(false);
    expect(shouldSaveVersion('AB', last, T0 + VERSION_SNAPSHOT_INTERVAL_MS)).toBe(true);
  });
});

describe('version history storage', () => {
  beforeEach(() => {
    mockUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'md-render-ver-'));
    initDatabase();
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    mockUserDataPath = '';
  });

  it('新建文档首次保存不产生快照', () => {
    save('A', T0);
    expect(getVersions('doc-1')).toHaveLength(0);
  });

  it('第一次改动时保存被覆盖的原稿，时间为快照时间', () => {
    save('原稿', T0, T0);
    save('改了一个字', T0 + 1000);
    const [version] = getVersions('doc-1');
    expect(getVersionById(version.id).content).toBe('原稿');
    expect(version.created_at).toBe(T0 + 1000);
  });

  it('连续编辑 5 分钟内只存一份，满 5 分钟再存一份', () => {
    save('v1', T0);
    save('v2', T0 + 1000);
    save('v3', T0 + 2000);
    expect(contents()).toEqual(['v1']);
    save('v4', T0 + 1000 + VERSION_SNAPSHOT_INTERVAL_MS);
    expect(contents()).toEqual(['v3', 'v1']);
  });

  it('内容没变不存快照', () => {
    save('A', T0);
    save('A', T0 + VERSION_SNAPSHOT_INTERVAL_MS * 2);
    expect(getVersions('doc-1')).toHaveLength(0);
  });

  it('手动快照：和最新快照相同则跳过', () => {
    save('A', T0);
    expect(saveVersionSnapshot('doc-1', 'A', T0)).toEqual({ saved: true });
    expect(saveVersionSnapshot('doc-1', 'A', T0 + 1)).toEqual({ saved: false });
    expect(saveVersionSnapshot('doc-1', '', T0 + 2)).toEqual({ saved: false });
  });

  it('超过保留期的快照会被清理', () => {
    save('old', T0);
    save('new', T0 + 1000);
    expect(getVersions('doc-1')).toHaveLength(1);
    save('newer', T0 + VERSION_RETENTION_MS + VERSION_SNAPSHOT_INTERVAL_MS * 2);
    expect(contents()).toEqual(['new']);
  });
});

describe('formatVersionTime', () => {
  const now = new Date(2026, 9, 8, 15, 30).getTime();
  it('今天 / 昨天 / 更早 / 跨年', () => {
    expect(formatVersionTime(new Date(2026, 9, 8, 9, 5).getTime(), now)).toBe('今天 09:05');
    expect(formatVersionTime(new Date(2026, 9, 7, 23, 59).getTime(), now)).toBe('昨天 23:59');
    expect(formatVersionTime(new Date(2026, 9, 3, 18, 20).getTime(), now)).toBe('10月3日 18:20');
    expect(formatVersionTime(new Date(2025, 11, 31, 8, 0).getTime(), now)).toBe('2025年12月31日 08:00');
  });
  it('非法时间', () => {
    expect(formatVersionTime(null, now)).toBe('未知时间');
  });
});
