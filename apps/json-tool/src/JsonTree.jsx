import { memo, useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';

const DEFAULT_EXPANDED_DEPTH = 2;

const isContainer = (value) => value !== null && typeof value === 'object';

const getContainerMeta = (value) => {
  if (Array.isArray(value)) {
    return {
      entries: value.map((child, index) => [index, child]),
      opening: '[',
      closing: ']',
      label: `${value.length} 项`,
    };
  }

  const entries = Object.entries(value);
  return {
    entries,
    opening: '{',
    closing: '}',
    label: `${entries.length} 个字段`,
  };
};

const getPrimitiveClassName = (value) => {
  if (value === null) return 'json-tree-value--null';
  if (typeof value === 'string') return 'json-tree-value--string';
  if (typeof value === 'number') return 'json-tree-value--number';
  return 'json-tree-value--boolean';
};

const renderPrimitive = (value) => {
  if (typeof value === 'string') return JSON.stringify(value);
  if (value === null) return 'null';
  return String(value);
};

const JsonTreeNode = memo(function JsonTreeNode({
  value,
  nodeKey,
  depth,
  path,
  expansionSignal,
}) {
  const container = isContainer(value);
  const [expanded, setExpanded] = useState(
    container && (expansionSignal.expanded ?? depth < DEFAULT_EXPANDED_DEPTH),
  );

  useEffect(() => {
    if (container && expansionSignal.expanded != null) {
      setExpanded(expansionSignal.expanded);
    }
  }, [container, expansionSignal.expanded, expansionSignal.version]);

  const keyLabel = nodeKey == null
    ? null
    : typeof nodeKey === 'number'
      ? `[${nodeKey}]`
      : JSON.stringify(nodeKey);

  if (!container) {
    return (
      <div className="json-tree-line" style={{ '--json-tree-depth': depth }} title={path}>
        <span className="json-tree-toggle-placeholder" />
        {keyLabel != null && <span className="json-tree-key">{keyLabel}</span>}
        {keyLabel != null && <span className="json-tree-punctuation">: </span>}
        <span className={`json-tree-value ${getPrimitiveClassName(value)}`}>
          {renderPrimitive(value)}
        </span>
      </div>
    );
  }

  const meta = getContainerMeta(value);
  const isEmpty = meta.entries.length === 0;

  return (
    <div className="json-tree-node">
      <div className="json-tree-line" style={{ '--json-tree-depth': depth }} title={path}>
        {isEmpty ? (
          <span className="json-tree-toggle-placeholder" />
        ) : (
          <button
            type="button"
            className={`json-tree-toggle${expanded ? ' is-expanded' : ''}`}
            onClick={() => setExpanded((current) => !current)}
            aria-label={expanded ? `收起 ${path}` : `展开 ${path}`}
          >
            <ChevronRight size={14} strokeWidth={1.8} />
          </button>
        )}
        {keyLabel != null && <span className="json-tree-key">{keyLabel}</span>}
        {keyLabel != null && <span className="json-tree-punctuation">: </span>}
        <span className="json-tree-bracket">{meta.opening}</span>
        {!expanded && !isEmpty && (
          <>
            <span className="json-tree-collapsed">… {meta.label}</span>
            <span className="json-tree-bracket">{meta.closing}</span>
          </>
        )}
        {isEmpty && <span className="json-tree-bracket">{meta.closing}</span>}
      </div>

      {expanded && !isEmpty && (
        <>
          {meta.entries.map(([childKey, childValue]) => {
            const childPath = typeof childKey === 'number'
              ? `${path}[${childKey}]`
              : `${path}.${childKey}`;
            return (
              <JsonTreeNode
                key={childKey}
                value={childValue}
                nodeKey={childKey}
                depth={depth + 1}
                path={childPath}
                expansionSignal={expansionSignal}
              />
            );
          })}
          <div className="json-tree-line" style={{ '--json-tree-depth': depth }}>
            <span className="json-tree-toggle-placeholder" />
            <span className="json-tree-bracket">{meta.closing}</span>
          </div>
        </>
      )}
    </div>
  );
});

export default function JsonTree({ value, expansionSignal }) {
  return (
    <div className="json-tree" role="tree" aria-label="JSON 树形结构">
      <JsonTreeNode
        value={value}
        nodeKey={null}
        depth={0}
        path="$"
        expansionSignal={expansionSignal}
      />
    </div>
  );
}
