import { useEffect, useState } from 'react';
import { message } from 'antd';
import { ClipboardCopy, FileText, FolderOpen, RefreshCw } from 'lucide-react';
import { fetchVaultAgentInfo, openVaultLocation } from '../utils/vaultBridge.js';
import { syncVaultAgentFiles } from '../utils/skillFilesBridge.js';
import { BUILTIN_SKILL_ENTRIES } from '../core/agent/builtinSkills.js';
import { buildMcpConfig, MCP_ENTRY_PLACEHOLDER } from '../utils/mcpConfig.js';

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
      await navigator.clipboard.writeText(buildMcpConfig(info ?? {}));
      message.success(info?.mcpBridgeEntry ? 'MCP 配置已复制' : `已复制，记得把 ${MCP_ENTRY_PLACEHOLDER} 换成实际路径`);
    } catch {
      message.error('复制失败');
    }
  };

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
        Claude Desktop 等只能走 MCP 的客户端，复制下面的配置加进它的 MCP 设置。
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
          <span>复制 MCP 配置</span>
        </button>
      </div>
    </div>
  );
}
