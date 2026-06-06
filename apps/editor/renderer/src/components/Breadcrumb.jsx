import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { findNodeById, findParentId } from '../store/workspaceUtils.js';

/**
 * 面包屑导航 — 显示当前文件的路径层级
 * @param {{ workspace: object, selectedId: string, onNavigate: function }} props
 */
export default function Breadcrumb({ workspace, selectedId, onNavigate }) {
  const pathChain = useMemo(() => {
    if (!workspace || !selectedId) return [];
    const chain = [];
    let currentId = selectedId;
    while (currentId && currentId !== 'root') {
      const node = findNodeById(workspace, currentId);
      if (node) chain.unshift({ id: node.id, name: node.name, type: node.type });
      currentId = findParentId(workspace, currentId);
    }
    return chain;
  }, [workspace, selectedId]);

  if (!pathChain.length) {
    return <div className="breadcrumb-bar breadcrumb-bar-empty" aria-hidden="true" />;
  }

  const currentNode = pathChain[pathChain.length - 1];
  const visiblePath = currentNode?.type === 'file'
    ? pathChain.slice(0, -1)
    : pathChain;

  if (!visiblePath.length) {
    return <div className="breadcrumb-bar breadcrumb-bar-empty" aria-hidden="true" />;
  }

  return (
    <nav className="breadcrumb-bar" aria-label="文件路径">
      {visiblePath.map((item, i) => (
        <span key={item.id} className="breadcrumb-segment">
          {i > 0 && <ChevronRight size={12} strokeWidth={1.5} className="breadcrumb-sep" aria-hidden />}
          <button
            type="button"
            className="breadcrumb-link"
            onClick={() => onNavigate(item.id)}
          >
            {item.name}
          </button>
        </span>
      ))}
    </nav>
  );
}
