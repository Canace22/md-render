import { FileType, Music } from 'lucide-react';
import { FILE_CONVERT_TOOLS, isFileConvertSupported } from '../services/fileConvertTools.js';
import { useFileConvertTool } from '../hooks/useFileConvertTool.js';

const TOOL_ICONS = Object.freeze({ pdf_to_docx: FileType, video_to_audio: Music });

/** 右键菜单里的文件转换项（PDF 转 Word、视频提取音频）；没连 ai-proxy 时不显示 */
export default function FileConvertMenuItems({ onBeforeRun, withDivider = true }) {
  const runTool = useFileConvertTool();
  if (!isFileConvertSupported()) return null;

  return (
    <>
      {withDivider && <div className="tree-context-menu-divider" />}
      {FILE_CONVERT_TOOLS.map((tool) => {
        const Icon = TOOL_ICONS[tool.id] || FileType;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => {
              onBeforeRun?.();
              runTool(tool);
            }}
          >
            <Icon size={14} strokeWidth={1.5} /> {tool.label}…
          </button>
        );
      })}
    </>
  );
}
