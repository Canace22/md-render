import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { planMigration } from '../main/migration/planMigration.js';
import { executeMigration, rollbackMigration } from '../main/migration/executeMigration.js';
import { isStepOnFiles, readDailyFiles, readMigrationState, readVaultText, writeVaultText } from '../main/migration/vaultFiles.js';
import { parseDailyWorkspace } from '../shared/migration/dailyFormat.js';
import { normalizeDailyWorkspace } from '../renderer/src/utils/dailyWorkspace.js';

const T = Date.UTC(2026, 9, 5, 1, 0, 0);

const payload = () => ({
  workspace: {
    id: 'root',
    type: 'folder',
    children: [
      { id: 'doc-1', type: 'file', name: '周报', content: '旧内容 A' },
      { id: 'f', type: 'folder', name: '个人', children: [{ id: 'doc-2', type: 'file', name: '周报', content: '旧内容 B' }] },
      { id: 'doc-3', type: 'file', name: '索引', content: '见 [[周报]]' },
    ],
  },
  // renderer 交给主进程前已 normalize 成大纲（旧待办并进当天）
  dailyWorkspace: normalizeDailyWorkspace({
    currentDate: '2026-10-05',
    entries: { '2026-10-05': { date: '2026-10-05', items: [{ id: 'task-1', type: 'task', priority: 'medium', done: false, createdAt: T, updatedAt: T, text: '写稿' }] } },
    todoPool: [{ id: 'todo-1', sourceDate: '', createdAt: T, updatedAt: T, text: '待办' }],
  }),
  canvasState: { nodes: [{ id: 'c1', sourceId: 'doc-1', position: { x: 0, y: 0 } }], edges: [] },
  memoryContents: ['# 编辑部记忆\n\n## 平台经验库\n\n- 2026-09-01：标题要短'],
  localStorageExport: { 'md-renderer-theme': 'dark' },
});

let vault;
beforeEach(async () => {
  vault = await fs.mkdtemp(path.join(os.tmpdir(), 'md-render-vault-'));
  await fs.mkdir(path.join(vault, 'Artifacts'), { recursive: true });
  await fs.writeFile(path.join(vault, 'Artifacts', '周报.md'), '旧内容 B', 'utf8'); // 后写的覆盖先写的
  await fs.writeFile(path.join(vault, 'Artifacts', '手写.md'), '我自己放的', 'utf8');
});
afterEach(async () => {
  await fs.rm(vault, { recursive: true, force: true });
});

describe('迁移预演', () => {
  it('只读：不写任何文件，报告列出改名、链接改写、Artifacts 处理', async () => {
    const plan = await planMigration({ payload: payload(), vaultRoot: vault });
    expect(plan.blockers).toEqual({});
    expect(plan.report).toContain('改名：「周报」');
    expect(plan.report).toContain('[[周报 (2)|周报]]');
    expect(plan.artifacts.moves).toEqual([{ from: 'Artifacts/周报.md', to: '.agent/migration/legacy-artifacts/周报.md' }]);
    expect(plan.artifacts.kept.map((k) => k.relativePath)).toEqual(['Artifacts/手写.md']);
    await expect(fs.access(path.join(vault, 'Projects'))).rejects.toThrow();
  });
});

describe('正式迁移', () => {
  it('写到目标位置、备份、状态切到文件；Daily 读回一致', async () => {
    const backupDatabase = vi.fn(async (dest) => fs.writeFile(dest, 'db'));
    const progress = [];
    const result = await executeMigration({ payload: payload(), vaultRoot: vault, backupDatabase, onProgress: (p) => progress.push(p.phase) });

    expect(result.steps.sort()).toEqual(['artifacts', 'canvas', 'daily', 'docs', 'memory']);
    expect(await fs.readFile(path.join(vault, 'Projects/内置文档/个人/周报 (2).md'), 'utf8')).toContain('旧内容 B');
    expect(await readVaultText(vault, '.agent/memory/editorial.md')).toContain('标题要短');
    expect(await fs.readFile(path.join(vault, 'Canvas/白板.canvas'), 'utf8')).toContain('"c1"');
    expect(await fs.readFile(path.join(vault, '.agent/migration/legacy-artifacts/周报.md'), 'utf8')).toBe('旧内容 B');
    expect(await fs.readFile(path.join(vault, 'Artifacts/手写.md'), 'utf8')).toBe('我自己放的');
    expect(backupDatabase).toHaveBeenCalledTimes(1);
    expect(progress).toContain('校验');

    const back = parseDailyWorkspace(await readDailyFiles(vault), '2026-10-05');
    expect(back.entries).toEqual(payload().dailyWorkspace.entries);
    expect(back.todoPool).toEqual([]);

    const state = await readMigrationState(vault);
    expect(isStepOnFiles(state, 'daily')).toBe(true);
    const staging = (await fs.readdir(path.join(vault, '.agent/migration'))).filter((n) => n.startsWith('staging'));
    expect(staging).toEqual([]);
  });

  it('重复执行：文档不重复生成，Daily 不丢条目', async () => {
    await executeMigration({ payload: payload(), vaultRoot: vault, now: new Date(T) });
    const second = await executeMigration({ payload: payload(), vaultRoot: vault, now: new Date(T + 1000) });
    const files = await fs.readdir(path.join(vault, 'Projects/内置文档'));
    expect(files.filter((n) => n.startsWith('周报'))).toEqual(['周报.md']);
    expect(second.conflicts).toEqual([]);
  });

  it('白板目标文件已存在且不同：这一步不执行，其它照常', async () => {
    await fs.mkdir(path.join(vault, 'Canvas'), { recursive: true });
    await fs.writeFile(path.join(vault, 'Canvas/白板.canvas'), '{"nodes":[]}', 'utf8');
    const result = await executeMigration({ payload: payload(), vaultRoot: vault });
    expect(result.steps).not.toContain('canvas');
    expect(result.blockers.canvas).toContain('已存在');
    expect(await fs.readFile(path.join(vault, 'Canvas/白板.canvas'), 'utf8')).toBe('{"nodes":[]}');
  });

  it('数据库备份失败就停止，内容库不写任何内容文件', async () => {
    await expect(executeMigration({
      payload: payload(), vaultRoot: vault, backupDatabase: async () => { throw new Error('磁盘满'); },
    })).rejects.toThrow('数据库备份失败');
    await expect(fs.access(path.join(vault, 'Projects'))).rejects.toThrow();
  });

  it('回滚只改状态，文件保留', async () => {
    await executeMigration({ payload: payload(), vaultRoot: vault });
    const state = await rollbackMigration({ vaultRoot: vault });
    expect(isStepOnFiles(state, 'daily')).toBe(false);
    expect(await readVaultText(vault, 'Todo.md')).toContain('待办');
    // 内置文档目录挪走（不删），侧栏不会和回灌的内置文档重复
    await expect(fs.access(path.join(vault, 'Projects/内置文档'))).rejects.toThrow();
    expect(await fs.readFile(path.join(vault, state.rollbackDocsPath, '周报.md'), 'utf8')).toContain('旧内容 A');
  });
});

describe('白名单读写', () => {
  it('只允许约定路径', async () => {
    await writeVaultText(vault, 'Daily/2026-10-05.md', 'x');
    await expect(writeVaultText(vault, 'Projects/a.md', 'x')).rejects.toThrow('不允许写入');
    await expect(readVaultText(vault, '../etc/passwd')).rejects.toThrow('不允许读取');
  });
});

describe('补写 frontmatter id（M-base-4）', () => {
  it('只给 Projects 下缺 id 的 Markdown 补；坏 frontmatter 和隐藏目录不碰', async () => {
    const { ensureFrontmatterIds, isBrokenFrontmatter } = await import('../main/migration/frontmatterIds.js');
    await fs.mkdir(path.join(vault, 'Projects/a/.obsidian'), { recursive: true });
    await fs.writeFile(path.join(vault, 'Projects/a/新稿.md'), '正文', 'utf8');
    await fs.writeFile(path.join(vault, 'Projects/a/有id.md'), '---\nid: keep\n---\n正文', 'utf8');
    await fs.writeFile(path.join(vault, 'Projects/a/坏的.md'), '---\n  : :\n---\n正文', 'utf8');
    await fs.writeFile(path.join(vault, 'Projects/a/.obsidian/x.md'), '正文', 'utf8');
    const ignored = [];
    const fixed = await ensureFrontmatterIds(vault, { markIgnored: (p) => ignored.push(p), createId: () => 'doc-new' });
    expect(fixed).toEqual(['Projects/a/新稿.md']);
    expect(await fs.readFile(path.join(vault, 'Projects/a/新稿.md'), 'utf8')).toBe('---\nid: doc-new\n---\n\n正文');
    expect(ignored).toHaveLength(1);
    expect(isBrokenFrontmatter('---\n  : :\n---\n正文')).toBe(true);
  });
});

describe('frontmatter 损坏判断', () => {
  it('只有成对 --- 块里解析不出 key 才算坏；分割线开头不算', async () => {
    const { isBrokenFrontmatter } = await import('../main/migration/frontmatterIds.js');
    expect(isBrokenFrontmatter('---\n\n正文')).toBe(false);
    expect(isBrokenFrontmatter('---\ntitle: a\n---\n正文')).toBe(false);
    expect(isBrokenFrontmatter('---\n乱写一通\n---\n正文')).toBe(true);
    expect(isBrokenFrontmatter('正文')).toBe(false);
  });
});

describe('工作区：内置节点 ↔ 磁盘节点', () => {
  it('findNodeById 找不到 id 时按 docId 找；stripBuiltinNodes 只留磁盘和隐藏节点；diskNodeToBuiltin 恢复原 id', async () => {
    const { findNodeById, stripBuiltinNodes, diskNodeToBuiltin } = await import('../renderer/src/store/workspaceUtils.js');
    const ws = {
      id: 'root',
      type: 'folder',
      children: [
        { id: 'old', type: 'file', name: '旧文' },
        { id: '.agent', type: 'folder', name: '.agent', agentMetaFolder: true, children: [] },
        { id: 'project:/v:folder:Projects/内置文档', type: 'folder', name: '内置文档', projectRootPath: '/v', relativePath: 'Projects/内置文档', children: [
          { id: 'project:/v:file:Projects/内置文档/周报.md', type: 'file', name: '周报.md', docId: 'doc-1', projectRootPath: '/v', relativePath: 'Projects/内置文档/周报.md', content: 'x', frontmatter: { id: 'doc-1', tags: ['a'] } },
        ] },
      ],
    };
    expect(findNodeById(ws, 'doc-1').name).toBe('周报.md');
    const { workspace, removedCount } = stripBuiltinNodes(ws);
    expect(removedCount).toBe(1);
    expect(workspace.children.map((c) => c.name)).toEqual(['.agent', '内置文档']);
    let n = 0;
    const restored = diskNodeToBuiltin(ws.children[2], (kind) => `${kind}-${(n += 1)}`);
    expect(restored).toMatchObject({ id: 'folder-1', type: 'folder', name: '内置文档' });
    expect(restored.children[0]).toEqual({ id: 'doc-1', type: 'file', name: '周报.md', content: 'x', frontmatter: { tags: ['a'] } });
  });
});
