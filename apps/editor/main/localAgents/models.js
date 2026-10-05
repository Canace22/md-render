/**
 * 本地 agent 的模型列表（L2-3）。
 * - Codex：预设 + `~/.codex/config.toml` 顶层的 model（作为「跟随默认」的展示值）
 * - Claude Code：预设别名
 * - Cursor：`agent models` 的真实列表，失败退回预设
 * 「跟随默认」= 不传模型参数，这里只负责给出可选项。
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

/** 只读 config.toml 第一个表之前的顶层 model（profile 里的不算） */
export const parseCodexDefaultModel = (toml) => {
  for (const line of String(toml ?? '').split(/\r?\n/)) {
    if (TOML_TABLE_HEADER.test(line)) return '';
    const match = line.match(TOML_TOP_LEVEL_MODEL);
    if (match) return match[1];
  }
  return '';
};

const presetModels = (agent) => (agent?.modelPresets ?? []).map((id) => ({ id, label: id }));

const readCodexDefaultModel = async (env) => {
  const codexHome = env.CODEX_HOME || path.join(os.homedir(), '.codex');
  try {
    return parseCodexDefaultModel(await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8'));
  } catch {
    return '';
  }
};

/**
 * @returns {Promise<{ models: Array<{id,label}>, defaultModel: string, error?: string }>}
 */
export const listLocalAgentModels = async ({ id, binPath }) => {
  const agent = getLocalAgent(id);
  if (!agent?.supported) return { models: [], defaultModel: '' };
  const env = await getAgentEnv();
  if (id === 'codex') return { models: presetModels(agent), defaultModel: await readCodexDefaultModel(env) };
  if (id === 'cursor' && binPath) {
    const result = await runShortCommand(binPath, ['models'], { env, timeout: CURSOR_MODELS_TIMEOUT_MS });
    const models = result.ok ? parseCursorModels(result.output) : [];
    if (models.length) return { models, defaultModel: '' };
    return { models: presetModels(agent), defaultModel: '', error: '读取 Cursor 模型列表失败，已显示预设' };
  }
  return { models: presetModels(agent), defaultModel: '' };
};
