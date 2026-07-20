import { FileText, Plus } from 'lucide-react';

/**
 * 文档区空状态：所有标签页都关闭后展示，引导用户从左侧目录打开或新建文档。
 */
export default function DocEmptyState({ onCreate }) {
  return (
    <div className="doc-empty-state">
      <FileText size={44} strokeWidth={1.2} className="doc-empty-state-icon" />
      <h2 className="doc-empty-state-title">没有打开的文档</h2>
      <p className="doc-empty-state-text">从左侧目录选择一个文档，或新建一篇开始写作。</p>
      {onCreate && (
        <button type="button" className="doc-empty-state-btn" onClick={onCreate}>
          <Plus size={15} strokeWidth={2} />
          新建文档
        </button>
      )}
    </div>
  );
}
