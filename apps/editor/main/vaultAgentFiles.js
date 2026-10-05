/**
 * 内容库里给外部 agent 用的文件（P4-1）：
 * - AGENTS.md：app 维护标记区，用户自己写的内容保留
 * - .agents/skills/<id>/：内置技能的副本（带 .md-render-managed.json）。没改过的随 app 更新；改过的视为用户版本，不再覆盖
 * - .claude/skills → .agents/skills 软链接，Claude Code 能直接发现技能
 */

import fsp from 'fs/promises';
import path from 'path';
import { hashContent } from '../shared/capabilities/contentHash.js';
import { AGENTS_MD_FILE, mergeAgentsMd } from '../shared/vaultAgentsMd.js';
import { SKILL_FILE_NAME, SKILL_MANIFEST_PATH } from './skillFiles.js';

export const MANAGED_MARKER_FILE = '.md-render-managed.json';
const SKILL_DIR_NAME_RE = /^[a-z0-9][a-z0-9-]*$/;
const MISSING = 'ENOENT';

export const hashSkillFiles = (skillMarkdown, manifestYaml) =>
  hashContent(`${skillMarkdown ?? ''}\n--- md-render.yaml ---\n${manifestYaml ?? ''}`);

const readIfExists = async (filePath) => {
  try {
    return await fsp.readFile(filePath, 'utf8');
  } catch (error) {
    if (error.code === MISSING) return null;
    throw error;
  }
};

/** 读一个技能目录的托管标记，以及当前文件是否被改过 */
export async function readManagedState(skillDir) {
  const markerRaw = await readIfExists(path.join(skillDir, MANAGED_MARKER_FILE));
  if (markerRaw == null) return { managed: false, modified: false };
  let marker = {};
  try {
    marker = JSON.parse(markerRaw);
  } catch {
    return { managed: true, modified: true };
  }
  const current = hashSkillFiles(
    await readIfExists(path.join(skillDir, SKILL_FILE_NAME)),
    await readIfExists(path.join(skillDir, SKILL_MANIFEST_PATH)),
  );
  return { managed: true, modified: current !== marker.hash };
}

const writeManagedSkill = async (skillDir, { skillMarkdown, manifestYaml }) => {
  await fsp.mkdir(path.join(skillDir, path.dirname(SKILL_MANIFEST_PATH)), { recursive: true });
  await fsp.writeFile(path.join(skillDir, SKILL_FILE_NAME), skillMarkdown, 'utf8');
  if (manifestYaml) await fsp.writeFile(path.join(skillDir, SKILL_MANIFEST_PATH), manifestYaml, 'utf8');
  const marker = { source: 'md-render-builtin', hash: hashSkillFiles(skillMarkdown, manifestYaml ?? null) };
  await fsp.writeFile(path.join(skillDir, MANAGED_MARKER_FILE), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
};

/** @returns {'written'|'updated'|'unchanged'|'kept'} */
export async function syncManagedSkill(skillsDir, skill) {
  if (!SKILL_DIR_NAME_RE.test(String(skill?.dirName ?? '')) || !skill.skillMarkdown) return 'kept';
  const skillDir = path.join(skillsDir, skill.dirName);
  const exists = (await readIfExists(path.join(skillDir, SKILL_FILE_NAME))) != null;
  if (!exists) {
    await writeManagedSkill(skillDir, skill);
    return 'written';
  }
  const { managed, modified } = await readManagedState(skillDir);
  if (!managed || modified) return 'kept'; // 用户自己的技能，或改过的副本
  const markerHash = JSON.parse(await fsp.readFile(path.join(skillDir, MANAGED_MARKER_FILE), 'utf8')).hash;
  if (markerHash === hashSkillFiles(skill.skillMarkdown, skill.manifestYaml ?? null)) return 'unchanged';
  await writeManagedSkill(skillDir, skill);
  return 'updated';
}

/** .claude/skills → ../.agents/skills（已存在就不动） */
export async function ensureClaudeSkillsLink(vaultRoot) {
  const linkPath = path.join(vaultRoot, '.claude', 'skills');
  try {
    await fsp.lstat(linkPath);
    return false;
  } catch (error) {
    if (error.code !== MISSING) throw error;
  }
  await fsp.mkdir(path.dirname(linkPath), { recursive: true });
  const isWindows = process.platform === 'win32';
  const target = isWindows ? path.join(vaultRoot, '.agents', 'skills') : path.join('..', '.agents', 'skills');
  await fsp.symlink(target, linkPath, isWindows ? 'junction' : 'dir');
  return true;
}

/**
 * @param {string} vaultRoot
 * @param {{ builtinSkills: Array<{ dirName, skillMarkdown, manifestYaml }>, skillsDir: string }} options
 */
export async function syncVaultAgentFiles(vaultRoot, { builtinSkills = [], skillsDir }) {
  const agentsPath = path.join(vaultRoot, AGENTS_MD_FILE);
  const existing = (await readIfExists(agentsPath)) ?? '';
  const next = mergeAgentsMd(existing);
  const agentsMdUpdated = next !== existing;
  if (agentsMdUpdated) await fsp.writeFile(agentsPath, next, 'utf8');

  await fsp.mkdir(skillsDir, { recursive: true });
  const skills = { written: [], updated: [], unchanged: [], kept: [] };
  for (const skill of builtinSkills) {
    skills[await syncManagedSkill(skillsDir, skill)].push(skill.dirName);
  }

  let linkCreated = false;
  try {
    linkCreated = await ensureClaudeSkillsLink(vaultRoot);
  } catch (error) {
    console.warn('[vault-agent-files] 创建 .claude/skills 软链接失败:', error.message);
  }
  return { agentsPath, agentsMdUpdated, skills, linkCreated };
}
