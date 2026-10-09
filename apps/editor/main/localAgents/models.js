/**
 * 本地 agent 的模型与思考强度（effort）列表（L2-3）。
 * - Codex：`~/.codex/models_cache.json` 的真实列表（含每个模型支持的 effort），
 *   `config.toml` 顶层的 model / model_reasoning_effort 作为「跟随默认」的展示值
 * - Claude Code：预设别名 + `~/.claude/settings.json` 的 model / effortLevel
 * - Cursor：`agent models` 的真实列表，失败退回预设；effort 编码在模型名里，不单独提供
 * 「跟随默认」= 不传模型 / effort 参数，这里只负责给出可选项。
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { getLocalAgent } from '../../shared/localAgents.js';
import { runShortCommand } from './detect.js';
import { getAgentEnv } from './shellEnv.js';

const CURSOR_MODELS_TIMEOUT_MS = 15000;
const MODEL_ID_LINE = /^([a-zA-Z0-9][a-zA-Z0-9._:/-]*)\s+-\s+(.+)$/;
const TOML_TOP_LEVEL_MODEL = /^\s*model\s*=\s*["']([^"']+)["']/;
const TOML_TOP_LEVEL_EFFORT = /^\s*model_reasoning_effort\s*=\s*["']([^"']+)["']/;
const CODEX_VISIBLE_MODEL = 'list';
const TOML_TABLE_HEADER = /^\s*\[/;

/** 解析 `agent models` 输出（「id - 名称」每行一个） */
export const parseCursorModels = (output) => {
  const models = new Map();
  stripVTControlCharacters(String(output ?? '')).split(/\r?\n/).forEach((line) => {
    const match = line.trim().replace(/[​-‍﻿]/g, '').match(MODEL_ID_LINE);
    if (!match) return;
    const [, id, rawLabel] = match;
    models.set(id, { id, label: rawLabel.replace(/\s+\((?:default|current)\)/g, '').trim() });
  });
  return [...models.values()];
};

/** 只读 config.toml 第一个表之前的顶层键（profile 里的不算） */
const parseTomlTopLevel = (toml, pattern) => {
  for (const line of String(toml ?? '').split(/\r?\n/)) {
    if (TOML_TABLE_HEADER.test(line)) return '';
    const match = line.match(pattern);
    if (match) return match[1];
  }
  return '';
};

export const parseCodexDefaultModel = (toml) => parseTomlTopLevel(toml, TOML_TOP_LEVEL_MODEL);
export const parseCodexDefaultEffort = (toml) => parseTomlTopLevel(toml, TOML_TOP_LEVEL_EFFORT);

/** models_cache.json → 只留 Codex 选择器里可见的模型，带各自支持的 effort */
export const parseCodexModelsCache = (json) => {
  let data;
  try {
    data = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return [];
  }
  const list = Array.isArray(data?.models) ? data.models : [];
  return list
    .filter((model) => model?.slug && (model.visibility ?? CODEX_VISIBLE_MODEL) === CODEX_VISIBLE_MODEL)
    .sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0))
    .map((model) => ({
      id: model.slug,
      label: model.display_name || model.slug,
      efforts: (model.supported_reasoning_levels ?? []).map((level) => level?.effort).filter(Boolean),
    }));
};

const presetModels = (agent) => (agent?.modelPresets ?? []).map((id) => ({ id, label: id }));

const readTextFile = async (filePath) => {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
};

const readJsonFile = async (filePath) => {
  try {
    return JSON.parse(await readTextFile(filePath));
  } catch {
    return null;
  }
};

const listCodexModels = async (agent, env) => {
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  const [toml, cache] = await Promise.all([
    readTextFile(path.join(codexHome, 'config.toml')),
    readTextFile(path.join(codexHome, 'models_cache.json')),
  ]);
  const cached = parseCodexModelsCache(cache);
  return {
    models: cached.length ? cached : presetModels(agent),
    defaultModel: parseCodexDefaultModel(toml),
    defaultEffort: parseCodexDefaultEffort(toml),
  };
};

/** 只读用户级 settings.json（项目级设置随工作目录变化）；ANTHROPIC_MODEL 环境变量优先 */
const listClaudeModels = async (agent, env) => {
  const configDir = env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const settings = await readJsonFile(path.join(configDir, 'settings.json'));
  return {
    models: presetModels(agent),
    defaultModel: env.ANTHROPIC_MODEL || settings?.model || '',
    defaultEffort: settings?.effortLevel || '',
  };
};

const listCursorModels = async (agent, env, binPath) => {
  const result = await runShortCommand(binPath, ['models'], { env, timeout: CURSOR_MODELS_TIMEOUT_MS });
  const models = result.ok ? parseCursorModels(result.output) : [];
  if (models.length) return { models, defaultModel: '' };
  return { models: presetModels(agent), defaultModel: '', error: '读取 Cursor 模型列表失败，已显示预设' };
};

/**
 * @returns {Promise<{ models: Array<{id,label,efforts?}>, defaultModel: string, efforts: string[], defaultEffort: string, error?: string }>}
 */
export const listLocalAgentModels = async ({ id, binPath }) => {
  const agent = getLocalAgent(id);
  if (!agent?.supported) return { models: [], defaultModel: '', efforts: [], defaultEffort: '' };
  const env = await getAgentEnv();
  let result = { models: presetModels(agent), defaultModel: '' };
  if (id === 'codex') result = await listCodexModels(agent, env);
  else if (id === 'claude') result = await listClaudeModels(agent, env);
  else if (id === 'cursor' && binPath) result = await listCursorModels(agent, env, binPath);
  return { defaultEffort: '', ...result, efforts: agent.effortLevels ?? [] };
};
