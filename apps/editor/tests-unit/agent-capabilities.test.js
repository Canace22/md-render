import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hashContent, isSameContentHash } from '@shared/capabilities/contentHash.js';
import { getToolRisk, isExternallyAllowed, shouldLogActivity, RISK_LEVELS } from '@shared/capabilities/riskLevels.js';
import {
  PROPOSAL_STATUS,
  buildDeleteProposal,
  buildEditProposal,
  checkProposalApplicable,
  createProposalId,
  resolveProposal,
  summarizeProposal,
  toProposalStatus,
} from '@shared/capabilities/proposals.js';
import { activityDateKey, buildActivityEntry, pickActivityTarget, summarizeResult } from '@shared/capabilities/activity.js';
import {
  appendActivityEntry,
  readActivityEntries,
  readProposalFiles,
  writeProposalFile,
} from '../main/capabilities/agentDataFiles.js';
import { isInsideHiddenDirectory } from '../main/localProjectWatcher.js';

const NOW = Date.UTC(2026, 9, 5, 4, 0, 0);

describe('hashContent', () => {
  it('同一内容稳定，改一个字就变，统一换行', () => {
    expect(hashContent('abc')).toBe(hashContent('abc'));
    expect(hashContent('abc')).not.toBe(hashContent('abd'));
    expect(hashContent('a\r\nb')).toBe(hashContent('a\nb'));
    expect(isSameContentHash('abc', hashContent('abc'))).toBe(true);
    expect(isSameContentHash('abc', '')).toBe(true);
    expect(isSameContentHash('abc', hashContent('x'))).toBe(false);
  });
});

describe('风险分级', () => {
  it('按可逆性分级，未登记的工具不对外', () => {
    expect(getToolRisk('read_doc')).toBe(RISK_LEVELS.READ);
    expect(getToolRisk('move_workspace_item')).toBe(RISK_LEVELS.REVERSIBLE);
    expect(getToolRisk('delete_workspace_items')).toBe(RISK_LEVELS.PROPOSAL);
    expect(getToolRisk('pdf_to_docx')).toBe(RISK_LEVELS.ENVIRONMENT);
    expect(isExternallyAllowed('rename_workspace_item')).toBe(true);
    expect(isExternallyAllowed('propose_edit')).toBe(true);
    expect(isExternallyAllowed('clear_canvas')).toBe(false);
    expect(isExternallyAllowed('apply_safe_repair')).toBe(false);
  });

  it('读和导航不记活动日志', () => {
    expect(shouldLogActivity('search_docs')).toBe(false);
    expect(shouldLogActivity('open_surface')).toBe(false);
    expect(shouldLogActivity('create_new_doc')).toBe(true);
  });
});

describe('提案', () => {
  const target = { id: 'doc-1', name: '稿子', content: '原文' };

  it('改正文提案记下原文和 hash，id 可预测格式', () => {
    const proposal = buildEditProposal({ target, newText: '新文', who: 'mcp', tool: 'propose_edit', now: NOW });
    expect(proposal).toMatchObject({ kind: 'edit', status: 'pending', targetId: 'doc-1', oldText: '原文', newText: '新文', who: 'mcp' });
    expect(proposal.baseHash).toBe(hashContent('原文'));
    expect(proposal.id).toMatch(/^p-[a-z0-9]+-[a-z0-9]+$/);
    expect(createProposalId(NOW, () => 0.5)).toMatch(/^p-/);
  });

  it('内容没变可以应用；提案后被改过判为冲突；处理过的不能再处理', () => {
    const proposal = buildEditProposal({ target, newText: '新文', now: NOW });
    expect(checkProposalApplicable(proposal, '原文')).toEqual({ ok: true });
    expect(checkProposalApplicable(proposal, '用户又改了')).toMatchObject({ ok: false, status: PROPOSAL_STATUS.CONFLICT });
    const applied = resolveProposal(proposal, PROPOSAL_STATUS.APPLIED, NOW);
    expect(checkProposalApplicable(applied, '原文').ok).toBe(false);
    expect(applied.resolvedAt).toBe(new Date(NOW).toISOString());
  });

  it('删除提案与摘要', () => {
    const proposal = buildDeleteProposal({ targets: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'd', name: 'D' }], now: NOW });
    expect(summarizeProposal(proposal)).toBe('删除 「A」、「B」、「C」 等 4 个');
    expect(checkProposalApplicable(proposal, '').ok).toBe(true);
    expect(toProposalStatus(proposal)).toMatchObject({ ok: true, status: 'pending', kind: 'delete' });
    expect(toProposalStatus(null).ok).toBe(false);
  });
});

describe('活动日志条目', () => {
  it('只记定位字段，不记正文', () => {
    expect(pickActivityTarget({ id: 'x', content: '正文', cards: [1] })).toEqual({ id: 'x' });
    const entry = buildActivityEntry({ who: 'mcp', client: 'Claude', tool: 'propose_edit', args: { id: 'x', content: '很长的正文' }, result: '{"ok":true,"status":"pending","proposalId":"p-1"}', now: NOW });
    expect(entry).toMatchObject({ who: 'mcp', client: 'Claude', tool: 'propose_edit', target: { id: 'x' }, ok: true, summary: 'pending · p-1' });
    expect(JSON.stringify(entry)).not.toContain('很长的正文');
  });

  it('失败结果标 ok=false，长文案截断', () => {
    expect(buildActivityEntry({ tool: 't', result: '写入失败：内容为空。' }).ok).toBe(false);
    expect(summarizeResult('x'.repeat(200)).length).toBe(80);
    expect(activityDateKey(new Date(2026, 9, 5, 23, 30).getTime())).toBe('2026-10-05');
  });
});

describe('.agent 文件读写', () => {
  let agentDir;
  beforeEach(async () => {
    agentDir = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'md-render-agent-')), '.agent');
  });
  afterEach(async () => {
    await fs.rm(path.dirname(agentDir), { recursive: true, force: true });
  });

  it('提案写入再读回，按时间倒序，坏文件跳过', async () => {
    const older = buildEditProposal({ target: { id: 'a', content: '' }, newText: 'x', now: NOW });
    const newer = buildEditProposal({ target: { id: 'b', content: '' }, newText: 'y', now: NOW + 1000 });
    await writeProposalFile(agentDir, older);
    await writeProposalFile(agentDir, newer);
    await fs.writeFile(path.join(agentDir, 'proposals', 'broken.json'), '{', 'utf8');
    const list = await readProposalFiles(agentDir);
    expect(list.map((p) => p.targetId)).toEqual(['b', 'a']);
    await expect(writeProposalFile(agentDir, { id: '../evil' })).rejects.toThrow('不合法');
  });

  it('活动日志按天追加，读出来最新的在前', async () => {
    const ts = new Date(2026, 9, 5, 10).toISOString();
    await appendActivityEntry(agentDir, { ts, tool: 'a' });
    await appendActivityEntry(agentDir, { ts, tool: 'b' });
    expect((await readActivityEntries(agentDir, { dateKey: '2026-10-05' })).map((e) => e.tool)).toEqual(['b', 'a']);
    expect(await readActivityEntries(agentDir, { dateKey: '2026-10-06' })).toEqual([]);
    await expect(readActivityEntries(agentDir, { dateKey: '../x' })).rejects.toThrow('不合法');
  });
});

describe('watcher 忽略隐藏目录', () => {
  it('.agent / .git 里的变化不触发重读，隐藏的 sidecar 文件本身不算', () => {
    expect(isInsideHiddenDirectory('.agent/activity/2026-10-05.jsonl')).toBe(true);
    expect(isInsideHiddenDirectory('Projects/.git/index')).toBe(true);
    expect(isInsideHiddenDirectory('Projects/a.md')).toBe(false);
    expect(isInsideHiddenDirectory('Projects/.a.md.meta.json')).toBe(false);
  });
});
