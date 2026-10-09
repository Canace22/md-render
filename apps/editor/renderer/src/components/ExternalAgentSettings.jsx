import { useEffect, useState } from 'react';
import { message } from 'antd';
import { ClipboardCopy, FileText, FolderOpen, RefreshCw, Terminal } from 'lucide-react';
import { fetchVaultAgentInfo, openVaultLocation } from '../utils/vaultBridge.js';
import { syncVaultAgentFiles } from '../utils/skillFilesBridge.js';
import { BUILTIN_SKILL_ENTRIES } from '../core/agent/builtinSkills.js';
import { buildClaudeCodeCommand, buildClaudeDesktopConfig, buildHttpMcpConfig, MCP_ENTRY_PLACEHOLDER } from '../utils/mcpConfig.js';

/**
 * 设置 → 内容库与外部 agent 接入（U8）：内容库路径、复制 MCP 配置、打开 / 重新生成 AGENTS.md。
 */
export default function ExternalAgentSettings() {
  const [info, setInfo] = useState(null);
  const [busy, setBusy] = useState(false);

  const reload = () => fetchVaultAgentInfo().then(setInfo).catch((error) => message.error(error.message));
  useEffect(() => { reload(); }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(buildClaudeDesktopConfig(info ?? {}));
      const ready = info?.mcpBridgeEntry || info?.mcpHttp;
      message.success(ready ? '已复制，粘到 Claude Desktop → 设置 → Developer → Edit Config' : `已复制，记得把 ${MCP_ENTRY_PLACEHOLDER} 换成实际路径`);
    } catch {
      message.error('复制失败');
    }
  };

  const copyText = async (text, okMessage) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success(okMessage);
    } catch {
      message.error('复制失败');
    }
  };

  const mcpHttp = info?.mcpHttp;

  const handleRegenerate = async () => {
    setBusy(true);
    try {
      const result = await syncVaultAgentFiles(BUILTIN_SKILL_ENTRIES);
      const written = result.skills.written.length + result.skills.updated.length;
      message.success(`AGENTS.md ${result.agentsMdUpdated ? '已更新' : '已是最新'}；技能更新 ${written} 个，保留你改过的 ${result.skills.kept.length} 个`);
      await reload();
    } catch (error) {
      message.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const open = (target) => openVaultLocation(target).catch((error) => message.error(error.message));

  return (
    <div className="settings-group">
      <div className="settings-group-title">内容库与外部 agent</div>
      <div className="settings-platform-hint">
        内容库：<code>{info?.vaultRoot ?? '…'}</code>
        <br />
        用 Claude Code、Codex 等打开这个目录，它们会读 <code>AGENTS.md</code> 了解约定，并能用 <code>.agents/skills</code> 里的技能；app 不开也能用。
        Claude Desktop：点「复制 Claude Desktop 配置」，粘到它的 设置 → Developer → Edit Config（不要用「添加自定义连接器」，那里只认公网 https）。
        <br />
        本机 HTTP MCP：{mcpHttp ? <code>{mcpHttp.url}</code> : '未启动（端口可能被占用）'}，Claude Code、Codex、Cursor、Cherry Studio 可直连，app 需开着。
      </div>
      <div className="settings-action-list">
        <button type="button" className="settings-action-btn" onClick={() => open('vault')}>
          <FolderOpen size={16} strokeWidth={1.6} />
          <span>打开内容库</span>
        </button>
        <button type="button" className="settings-action-btn" onClick={() => open('agents-md')} disabled={!info?.agentsMdExists}>
          <FileText size={16} strokeWidth={1.6} />
          <span>打开 AGENTS.md</span>
        </button>
        <button type="button" className="settings-action-btn" onClick={handleRegenerate} disabled={busy}>
          <RefreshCw size={16} strokeWidth={1.6} />
          <span>重新生成 AGENTS.md 和技能</span>
        </button>
        <button type="button" className="settings-action-btn" onClick={handleCopy}>
          <ClipboardCopy size={16} strokeWidth={1.6} />
          <span>复制 Claude Desktop 配置</span>
        </button>
        <button type="button" className="settings-action-btn" disabled={!mcpHttp} onClick={() => copyText(buildHttpMcpConfig(mcpHttp), 'HTTP MCP 配置已复制')}>
          <ClipboardCopy size={16} strokeWidth={1.6} />
          <span>复制 HTTP MCP 配置</span>
        </button>
        <button type="button" className="settings-action-btn" disabled={!mcpHttp} onClick={() => copyText(buildClaudeCodeCommand(mcpHttp), 'Claude Code 命令已复制')}>
          <Terminal size={16} strokeWidth={1.6} />
          <span>复制 Claude Code 命令</span>
        </button>
      </div>
    </div>
  );
}
