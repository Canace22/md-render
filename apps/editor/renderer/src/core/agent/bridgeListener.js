/**
 * Agent 控制桥的 renderer 侧监听器。
 *
 * 主进程把「别的 AI」的工具请求（经 MCP + HTTP）转发过来，这里用 app 里现成的
 * host + executeTool 执行，再把结果回帖给主进程。复用现有工具逻辑，不重写业务。
 *
 * 纵深防御：主进程 agentBridge.js 已是安全网关，这里再按同一份白名单校验一次。
 */
import {
  isFailureResult,
  isSafeTool,
  filterSafeToolDefs,
  LIST_TOOLS_NAME,
} from '../../../../shared/agentBridgeTools.js';

/**
 * 桥接调用不能卡在「等用户点应用 / 确认删除」上（MCP 客户端会一直挂着）：
 * 改正文、删除都改成「提交提案即返回」，其余能力原样透传。
 */
const BRIDGE_CALL_OPTIONS = Object.freeze({ wait: false, who: 'mcp' });

export const toBridgeHost = (host) => (host
  ? {
    ...host,
    writeActiveDoc: (content, options = {}) => host.writeActiveDoc?.(content, { ...options, ...BRIDGE_CALL_OPTIONS }),
    deleteWorkspaceItems: (args) => host.deleteWorkspaceItems?.(args, BRIDGE_CALL_OPTIONS),
    proposeEdit: (args) => host.proposeEdit?.(args, BRIDGE_CALL_OPTIONS),
  }
  : host);

/**
 * 处理一次桥接请求（纯函数，方便单测）。
 * @param {{name:string,args?:object}} request
 * @param {{host:object,executeTool:Function,toolDefs:Array}} deps
 * @returns {Promise<{ok:boolean,result:any}>}
 */
export const handleBridgeRequest = async ({ name, args } = {}, { host, executeTool, toolDefs } = {}) => {
  // 特殊指令：返回安全工具的 schema 列表
  if (name === LIST_TOOLS_NAME) {
    return { ok: true, result: filterSafeToolDefs(toolDefs) };
  }
  if (!isSafeTool(name)) {
    return { ok: false, result: `工具「${name}」不在安全白名单内。` };
  }
  const toolCall = {
    id: `bridge-${name}`,
    function: { name, arguments: JSON.stringify(args ?? {}) },
  };
  const result = await executeTool(toolCall, toBridgeHost(host));
  // 工具失败也是「正常返回一段文案」，这里识别出来，让 MCP 端标记 isError
  return { ok: !isFailureResult(result), result };
};

/**
 * 安装监听器。返回取消订阅函数；环境不支持时返回 no-op。
 * @param {object} deps
 * @param {object} deps.electronAPI  window.electronAPI
 * @param {() => object} deps.getHost 取当前 host（用 getter 拿最新闭包）
 * @param {Function} deps.executeTool
 * @param {Array} deps.toolDefs
 * @returns {Function} unsubscribe
 */
export const installAgentBridgeListener = ({ electronAPI, getHost, executeTool, toolDefs } = {}) => {
  if (!electronAPI?.agentBridge?.onInvoke) return () => {};
  return electronAPI.agentBridge.onInvoke(async (payload) => {
    const { id } = payload || {};
    let reply;
    try {
      reply = await handleBridgeRequest(payload, {
        host: getHost?.(),
        executeTool,
        toolDefs,
      });
    } catch (error) {
      reply = { ok: false, result: `工具执行出错：${error?.message ?? String(error)}` };
    }
    electronAPI.agentBridge.reply({ id, ...reply });
  });
};
