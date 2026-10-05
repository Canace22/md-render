/**
 * Agent Bridge 对外工具 —— 按风险分级放行，不再单独维护白名单。
 *
 * 「别的 AI」通过 MCP → 控制桥 → renderer 调用本 app 的工具。
 * 规则来自 shared/capabilities/riskLevels.js（app 内 AI 用同一份）：
 * 读 / 导航 / 可逆写直接放行；覆盖和删除只放行走提案的工具；重建清空白板、安全修复等不对外。
 *
 * 本文件放在 shared 层，主进程（agentBridge.js，安全网关）
 * 和 renderer（bridgeListener.js，纵深防御）共用，避免漂移。
 */

import { TOOL_RISKS, isExternallyAllowed } from './capabilities/riskLevels.js';

/** 对外放行的全部工具名集合（由风险分级推出） */
export const SAFE_TOOL_NAMES = Object.freeze(
  new Set(Object.keys(TOOL_RISKS).filter((name) => isExternallyAllowed(name))),
);

/** 不对外的工具（仅用于文档与测试可读性，运行时以风险分级为准） */
export const BLOCKED_TOOLS = Object.freeze(
  Object.keys(TOOL_RISKS).filter((name) => !isExternallyAllowed(name)),
);

/** 特殊指令：拉取「安全工具」的 schema 列表（不是真实工具） */
export const LIST_TOOLS_NAME = '__list_tools__';

/** renderer 执行一次工具的超时（毫秒） */
export const INVOKE_TIMEOUT_MS = 30000;

/** 结果开头（第一个冒号/句号前）出现这些词，视为失败 */
const FAILURE_HEAD_PATTERN = /失败|出错|拒绝/;
/** 只看开头这么多字，避免正文里偶然出现「失败」被误判 */
const FAILURE_HEAD_MAX_CHARS = 24;

const parseJsonObject = (text) => {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
};

/**
 * 工具结果是否表示失败（用于给 MCP 客户端标记 isError）。
 * 规则：对象或 JSON 字符串看 ok:false；普通文案看开头一句（去掉「」引用）里有没有「失败 / 出错 / 拒绝」。
 */
export const isFailureResult = (result) => {
  if (result && typeof result === 'object') return result.ok === false;
  const text = String(result ?? '').trim();
  if (text.startsWith('{')) return parseJsonObject(text)?.ok === false;
  // 去掉「」里的引用内容（多是用户输入的关键词 / 文档名），只看工具自己的措辞
  const head = text.split(/[：:。\n]/)[0].replace(/「[^」]*」/g, '').slice(0, FAILURE_HEAD_MAX_CHARS);
  return FAILURE_HEAD_PATTERN.test(head);
};

/** 该工具是否允许对外调用（没登记风险级别的一律不放行） */
export const isSafeTool = (name) => SAFE_TOOL_NAMES.has(String(name ?? '').trim());

/** 从 OpenAI 风格的工具定义数组里，只保留白名单内的 */
export const filterSafeToolDefs = (defs = []) =>
  (Array.isArray(defs) ? defs : []).filter((def) => isSafeTool(def?.function?.name));

/**
 * 校验 /invoke 请求体。
 * @returns {{ok:true,name:string,args:object}|{ok:false,error:string}}
 */
export const validateInvoke = (body) => {
  if (!body || typeof body !== 'object') return { ok: false, error: 'body 必须是 JSON 对象' };
  const name = String(body.name ?? '').trim();
  if (!name) return { ok: false, error: '缺少工具名 name' };
  if (!isSafeTool(name)) return { ok: false, error: `工具「${name}」不对外部 agent 开放` };
  const args = body.args && typeof body.args === 'object' ? body.args : {};
  return { ok: true, name, args };
};
