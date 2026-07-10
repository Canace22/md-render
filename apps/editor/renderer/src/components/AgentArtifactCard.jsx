import { ExternalLink, FileText } from 'lucide-react';
import { parseAgentArtifactResult } from '../core/agent/artifactUtils.js';

export default function AgentArtifactCard({ result, onOpen }) {
  const artifact = parseAgentArtifactResult(result);
  if (!artifact) return null;

  return (
    <div className="agent-panel__artifact-card">
      <span className="agent-panel__artifact-icon"><FileText size={15} /></span>
      <span className="agent-panel__artifact-main">
        <span className="agent-panel__artifact-kind">{artifact.artifactLabel || '产出物'}</span>
        <span className="agent-panel__artifact-name">{artifact.name || '未命名文档'}</span>
      </span>
      {artifact.fileId && onOpen && (
        <button
          type="button"
          className="agent-panel__artifact-open"
          onClick={() => onOpen(artifact.fileId)}
        >
          <ExternalLink size={13} /> 打开
        </button>
      )}
    </div>
  );
}
