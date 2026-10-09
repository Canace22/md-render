import { ChevronRight, Copy, Download, History } from 'lucide-react';
import { getWorkspaceFileKind, SIDEBAR_FILE_KIND_DOCUMENT } from '../store/workspaceUtils.js';
import { needsConversion } from '../utils/fileConverters.js';

export const EXPORT_FORMATS = Object.freeze([
  { key: 'md', label: 'Markdown' },
  { key: 'html', label: 'HTML' },
  { key: 'pdf', label: 'PDF' },
  { key: 'docx', label: 'Word' },
]);

/** 只有能在正文编辑器里打开的文档才有这组操作（图片、视频、待转换的 docx/pdf 等排除） */
export const isEditableDocNode = (node) => (
  getWorkspaceFileKind(node) === SIDEBAR_FILE_KIND_DOCUMENT
  && node.nodeType !== 'bookmark'
  && !needsConversion(node.name)
);

/**
 * 文件右键菜单里的文档操作：版本历史、导出、复制公众号。
 * 右键时节点已被选中，所以 docActions 里的 handler 直接作用于当前文档。
 */
export default function DocActionMenuItems({ node, docActions, runAndClose }) {
  if (!docActions || !isEditableDocNode(node)) return null;

  return (
    <>
      <div className="tree-context-menu-divider" />
      <button type="button" onClick={runAndClose(() => docActions.openVersionHistory?.())}>
        <History size={14} strokeWidth={1.5} /> 版本历史
      </button>
      <div className="tree-context-submenu">
        <button type="button" className="tree-context-submenu-trigger">
          <Download size={14} strokeWidth={1.5} /> 导出为
          <ChevronRight size={14} strokeWidth={1.5} className="tree-context-submenu-arrow" />
        </button>
        <div className="tree-node-context-menu tree-context-submenu-panel">
          {EXPORT_FORMATS.map((format) => (
            <button
              key={format.key}
              type="button"
              onClick={runAndClose(() => docActions.exportAs?.(format.key))}
            >
              {format.label}
            </button>
          ))}
        </div>
      </div>
      <button type="button" onClick={runAndClose(() => docActions.copyToWechat?.())}>
        <Copy size={14} strokeWidth={1.5} /> 复制公众号
      </button>
    </>
  );
}
