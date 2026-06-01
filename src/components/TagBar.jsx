import { useState } from 'react';
import { Tag, X, Plus } from 'lucide-react';

/**
 * 文档标签条：手动添加/删除标签。
 * tags 来自当前文件，onChange(nextTags) 回写到 store。
 */
export default function TagBar({ tags = [], onChange, disabled }) {
  const [draft, setDraft] = useState('');
  const [adding, setAdding] = useState(false);

  const commit = () => {
    const value = draft.trim();
    if (value && !tags.includes(value)) {
      onChange([...tags, value]);
    }
    setDraft('');
    setAdding(false);
  };

  const removeTag = (target) => {
    onChange(tags.filter((t) => t !== target));
  };

  if (disabled) return null;

  return (
    <div className="tag-bar" data-testid="tag-bar">
      <Tag size={14} strokeWidth={1.5} className="tag-bar-icon" aria-hidden />
      {tags.map((tag) => (
        <span key={tag} className="tag-chip" data-testid="tag-chip">
          {tag}
          <button
            type="button"
            className="tag-chip-remove"
            onClick={() => removeTag(tag)}
            aria-label={`删除标签 ${tag}`}
          >
            <X size={12} strokeWidth={2} />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          className="tag-add-input"
          value={draft}
          placeholder="标签名…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commit();
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setDraft('');
              setAdding(false);
            }
          }}
          aria-label="输入标签名"
        />
      ) : (
        <button
          type="button"
          className="tag-add-btn"
          onClick={() => setAdding(true)}
          data-testid="tag-add-btn"
        >
          <Plus size={12} strokeWidth={2} /> 标签
        </button>
      )}
    </div>
  );
}
