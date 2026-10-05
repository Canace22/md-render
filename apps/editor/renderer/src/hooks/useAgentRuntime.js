import { useEffect } from 'react';
import { useEditorStore } from '../store/useEditorStore.js';
import { createHost } from '../core/agent/createHost.js';
import { installAgentBridgeListener } from '../core/agent/bridgeListener.js';
import { executeTool, TOOL_DEFINITIONS } from '../core/agent/toolRegistry.js';
import { fetchProposalFiles } from '../utils/agentDataBridge.js';
import { withActivityLog } from '../core/agent/activityLog.js';
import { BUILTIN_SKILL_ENTRIES } from '../core/agent/builtinSkills.js';
import { isVaultSkillsSupported, syncVaultAgentFiles } from '../utils/skillFilesBridge.js';

/**
 * app 级的 agent 运行时，不依赖 AI 面板是否打开：
 * - 启动时把内容库 .agent/proposals 里的提案并入收件箱
 * - 安装 MCP 控制桥监听：外部 agent 的工具请求用同一套 host 执行
 * - 在内容库生成 / 更新 AGENTS.md 和内置技能副本，Claude Code 等直接打开目录也能用
 * @param {{ dialogs: { confirmDelete: Function, confirmSafeRepair: Function } }} options
 */
export function useAgentRuntime({ dialogs }) {
  useEffect(() => {
    fetchProposalFiles()
      .then((proposals) => useEditorStore.getState().mergeAgentProposals(proposals))
      .catch((error) => console.warn('[agent-runtime] 读取提案失败:', error?.message));
  }, []);

  // 内容库给外部 agent 用的文件：AGENTS.md、内置技能副本、.claude/skills 软链接（P4-1）
  useEffect(() => {
    if (!isVaultSkillsSupported()) return;
    syncVaultAgentFiles(BUILTIN_SKILL_ENTRIES)
      .catch((error) => console.warn('[agent-runtime] 同步 AGENTS.md / 技能失败:', error?.message));
  }, []);

  useEffect(() => {
    const api = typeof window !== 'undefined' ? window.electronAPI : null;
    if (!api?.agentBridge) return undefined;
    const host = createHost({ getState: useEditorStore.getState, ...dialogs });
    return installAgentBridgeListener({
      electronAPI: api,
      getHost: () => host,
      // 外部 agent 的每次调用都记活动日志（来源 mcp）
      executeTool: withActivityLog(executeTool, { who: 'mcp' }),
      toolDefs: TOOL_DEFINITIONS,
    });
  }, [dialogs]);
}
