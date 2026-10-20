import { useState } from 'react';
import { ExternalLink, Plus, Trash2 } from 'lucide-react';
import {
  canAddKnowledgeSource,
  createUserKnowledgeSource,
} from '../core/agent/knowledgeSources.js';

export default function AgentKnowledgeSources({ sources, onChange }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');

  const handleAdd = () => {
    if (!canAddKnowledgeSource(sources)) {
      setError('最多添加 8 个外挂知识库。');
      return;
    }
    const result = createUserKnowledgeSource({ name, url });
    if (!result.ok) {
      setError(result.error);
      return;
    }
    const duplicated = sources.some((source) => source.url === result.source.url);
    if (duplicated) {
      setError('这个知识库地址已经添加过了。');
      return;
    }
    onChange([...sources, result.source]);
    setName('');
    setUrl('');
    setError('');
  };

  const handleToggle = (id, enabled) => {
    onChange(sources.map((source) => (
      source.id === id && !source.builtIn ? { ...source, enabled } : source
    )));
  };

  const handleRemove = (id) => {
    onChange(sources.filter((source) => source.builtIn || source.id !== id));
  };

  return (
    <div className="agent-knowledge-settings">
      <div className="agent-knowledge-settings__head">
        <strong>外挂知识库</strong>
        <span>Agent 会按需检索公开网页，不复制进工作区。</span>
      </div>

      <div className="agent-knowledge-settings__list">
        {sources.map((source) => (
          <div key={source.id} className="agent-knowledge-settings__item">
            <input
              type="checkbox"
              checked={source.enabled !== false}
              disabled={source.builtIn}
              onChange={(event) => handleToggle(source.id, event.target.checked)}
              aria-label={`启用 ${source.name}`}
            />
            <div className="agent-knowledge-settings__meta">
              <span>
                {source.name}
                {source.builtIn ? <em>内置</em> : null}
              </span>
              <div className="agent-knowledge-settings__links">
                <a href={source.url} target="_blank" rel="noreferrer">
                  网页
                  <ExternalLink size={11} />
                </a>
                {source.repositoryUrl ? (
                  <a href={source.repositoryUrl} target="_blank" rel="noreferrer">
                    GitHub
                    <ExternalLink size={11} />
                  </a>
                ) : (
                  <span title={source.url}>{source.url}</span>
                )}
              </div>
            </div>
            {!source.builtIn ? (
              <button type="button" onClick={() => handleRemove(source.id)} title="删除知识库">
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      <div className="agent-knowledge-settings__add">
        <input
          value={name}
          placeholder="名称（可选）"
          onChange={(event) => setName(event.target.value)}
        />
        <div className="agent-knowledge-settings__url-row">
          <input
            value={url}
            placeholder="https://example.com/docs/"
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAdd();
              }
            }}
          />
          <button type="button" onClick={handleAdd} title="添加知识库">
            <Plus size={14} />
          </button>
        </div>
        {error ? <span className="agent-knowledge-settings__error">{error}</span> : null}
      </div>
    </div>
  );
}
