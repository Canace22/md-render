import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readSkillEntries, watchSkillsDir } from '../main/skillFiles.js';
import { registerSkillHandlers, SKILLS_CHANGED_CHANNEL } from '../main/ipc/skillHandlers.js';

const WAIT_TIMEOUT_MS = 3000;

const writeFile = async (filePath, text) => {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
};

const waitFor = (check) => new Promise((resolve, reject) => {
  const started = Date.now();
  const tick = () => {
    if (check()) return resolve();
    if (Date.now() - started > WAIT_TIMEOUT_MS) return reject(new Error('等待超时'));
    return setTimeout(tick, 50);
  };
  tick();
});

let skillsDir;

beforeEach(async () => {
  skillsDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md-render-skills-'));
});

afterEach(async () => {
  await fs.rm(skillsDir, { recursive: true, force: true });
});

describe('readSkillEntries', () => {
  it('目录不存在返回空数组', async () => {
    expect(await readSkillEntries(path.join(skillsDir, 'nope'))).toEqual([]);
  });

  it('按目录名排序，带上 manifest；跳过隐藏目录、没有 SKILL.md 的目录和散落文件', async () => {
    await writeFile(path.join(skillsDir, 'b-skill', 'SKILL.md'), 'B');
    await writeFile(path.join(skillsDir, 'a-skill', 'SKILL.md'), 'A');
    await writeFile(path.join(skillsDir, 'a-skill', 'agents', 'md-render.yaml'), 'label: 甲');
    await writeFile(path.join(skillsDir, '.hidden', 'SKILL.md'), 'H');
    await writeFile(path.join(skillsDir, 'empty-dir', 'notes.md'), 'x');
    await writeFile(path.join(skillsDir, 'README.md'), 'x');

    const entries = await readSkillEntries(skillsDir);
    expect(entries.map((e) => e.dirName)).toEqual(['a-skill', 'b-skill']);
    expect(entries[0]).toMatchObject({ skillMarkdown: 'A', manifestYaml: 'label: 甲' });
    expect(entries[1]).toMatchObject({ skillMarkdown: 'B', manifestYaml: null });
    expect(entries[1].skillPath).toBe(path.join(skillsDir, 'b-skill', 'SKILL.md'));
  });
});

describe('watchSkillsDir', () => {
  it('目录不存在时先建好；子目录里的文件变化会触发回调', async () => {
    const target = path.join(skillsDir, '.agents', 'skills');
    let calls = 0;
    const stop = watchSkillsDir(target, () => { calls += 1; });
    try {
      await fs.access(target);
      await writeFile(path.join(target, 'jike', 'SKILL.md'), '即刻版');
      await waitFor(() => calls > 0);
    } finally {
      stop();
    }
  });
});

describe('registerSkillHandlers', () => {
  it('skills:list 返回原始记录，之后目录变化会通知 renderer', async () => {
    const handlers = {};
    const sent = [];
    const ipcMain = { handle: (channel, fn) => { handlers[channel] = fn; } };
    const getMainWindow = () => ({ webContents: { send: (channel, payload) => sent.push({ channel, payload }) } });
    const stop = registerSkillHandlers({ ipcMain, getMainWindow, getSkillsDir: () => skillsDir });

    try {
      await writeFile(path.join(skillsDir, 'polish', 'SKILL.md'), '润色');
      const result = await handlers['skills:list']();
      expect(result.ok).toBe(true);
      expect(result.entries.map((e) => e.dirName)).toEqual(['polish']);

      await writeFile(path.join(skillsDir, 'polish', 'SKILL.md'), '新的润色');
      await waitFor(() => sent.length > 0);
      expect(sent[0].channel).toBe(SKILLS_CHANGED_CHANNEL);
    } finally {
      stop();
    }
  });
});
