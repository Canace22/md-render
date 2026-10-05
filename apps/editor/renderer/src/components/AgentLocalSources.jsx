import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { LOCAL_AGENTS, LOCAL_AGENT_KINDS, isRunnableAgent } from '../../../shared/localAgents.js';

const STATUS_TEXT = Object.freeze({
  ready: '可用',
  unverified: '可用（登录状态首轮确认）',
  'needs-login': '未登录',
  unsupported: '即将支持',
  missing: '未安装',
});

const describeAgent = (agent, detected) => {
  if (!detected?.installed) return STATUS_TEXT.missing;
  if (!agent.supported) return STATUS_TEXT.unsupported;
  return STATUS_TEXT[detected.status] || detected.status;
};

/** 当前本机 agent 的自定义模型：留空 = 跟随本机配置 */
function LocalModelInput({ activeSource, onSelectModel }) {
  const [value, setValue] = useState(activeSource.model);
  useEffect(() => { setValue(activeSource.model); }, [activeSource.sourceId, activeSource.model]);
  return (
    <label>{activeSource.label} 模型
      <input
        value={value}
        placeholder="留空 = 跟随本机默认配置"
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onSelectModel(activeSource.sourceId, value.trim())}
      />
    </label>
  );
}

/**
 * 设置页「AI 来源」（U2）：选来源、本机 agent 检测结果、重新检测、安全模式、安装指引。
 */
export default function AgentLocalSources({
  sources,
  activeSource,
  detected,
  detecting,
  safeMode,
  onSelectSource,
  onSelectModel,
  onRedetect,
  onSafeModeChange,
}) {
  const byId = new Map(detected.map((item) => [item.id, item]));
  const anyRunnable = detected.some((item) => isRunnableAgent(item));
  const agents = LOCAL_AGENTS.filter((agent) => agent.kind === LOCAL_AGENT_KINDS.AGENT || byId.get(agent.id)?.installed);

  return (
    <div className="agent-source-settings">
      <label>AI 来源
        <select value={activeSource.sourceId} onChange={(e) => onSelectSource(e.target.value)}>
          {['本机 agent', 'API 服务商'].map((group) => {
            const items = sources.filter((source) => source.group === group);
            if (!items.length) return null;
            return (
              <optgroup key={group} label={group}>
                {items.map((source) => (
                  <option key={source.id} value={source.id} disabled={!source.available}>
                    {source.reason ? `${source.label}（${source.reason}）` : source.label}
                  </option>
                ))}
              </optgroup>
            );
          })}
        </select>
      </label>

      {activeSource.kind === 'local' && <LocalModelInput activeSource={activeSource} onSelectModel={onSelectModel} />}

      <div className="agent-source-settings__head">
        <strong>本机 agent</strong>
        <button type="button" onClick={onRedetect} disabled={detecting} title="重新检测">
          <RefreshCw size={12} className={detecting ? 'is-spinning' : ''} /> {detecting ? '检测中' : '重新检测'}
        </button>
      </div>
      {!anyRunnable && !detecting && (
        <div className="agent-source-settings__hint">
          没检测到可用的本机 agent，当前使用 API 服务商。装好下面任意一个并登录后点「重新检测」，就能用你自己的 agent（含你的配置、skills、MCP）。
        </div>
      )}
      <ul className="agent-source-settings__list">
        {agents.map((agent) => {
          const item = byId.get(agent.id);
          return (
            <li key={agent.id} className={isRunnableAgent(item) ? 'is-ready' : ''}>
              <div className="agent-source-settings__row">
                <span className="agent-source-settings__name">{agent.label}</span>
                {item?.version && <span className="agent-source-settings__version">{item.version}</span>}
                <span className="agent-source-settings__status">{describeAgent(agent, item)}</span>
              </div>
              {item?.path && <div className="agent-source-settings__path" title={item.path}>{item.path}</div>}
              {!item?.installed && agent.installHint && <code className="agent-source-settings__code">{agent.installHint}</code>}
              {item?.status === 'needs-login' && agent.loginHint && <div className="agent-source-settings__path">{agent.loginHint}</div>}
            </li>
          );
        })}
      </ul>

      <label className="agent-source-settings__toggle">
        <input type="checkbox" checked={safeMode} onChange={(e) => onSafeModeChange(e.target.checked)} />
        <span>
          安全模式
          <small>默认关闭：本机 agent 可直接改工作目录里的文件、跑命令，不逐条确认。打开后只允许改文件，命令等操作会被拒绝。</small>
        </span>
      </label>
    </div>
  );
}
