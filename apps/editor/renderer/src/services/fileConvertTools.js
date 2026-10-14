/**
 * 文件转换工具（PDF→Word、视频→音频）：不需要 AI，弹文件选择后交给 ai-proxy server 上的脚本执行。
 * 入口在命令面板（Cmd/Ctrl+K）；这里只负责「选文件 → 执行」，提示文案交给调用方。
 */

import { hasAiBridge, readAiServerBase } from '../core/agent/aiClient.js';
import {
  aiExecTool,
  hasFilePickerBridge,
  pickFile,
  pickSavePath,
} from './electronBridge.js';

const VIDEO_EXTENSIONS = ['mp4', 'mov', 'mkv', 'avi', 'flv', 'webm', 'm4v'];

export const FILE_CONVERT_TOOLS = Object.freeze([
  {
    id: 'pdf_to_docx',
    label: 'PDF 转 Word',
    keywords: ['pdf', 'word', 'docx', 'zhuanhuan', '转换'],
    toolName: 'pdf_to_docx',
    pickInput: { title: '选择 PDF 文件', extensions: ['pdf'] },
    pickOutput: { title: '保存为 Word 文档', extensions: ['docx'] },
    toOutputName: (inputPath) => inputPath.replace(/\.pdf$/i, '.docx'),
  },
  {
    id: 'video_to_audio',
    label: '视频提取音频',
    keywords: ['video', 'audio', 'mp3', 'yinpin', 'shipin', '音频', '视频', '转换'],
    toolName: 'video_to_audio',
    pickInput: { title: '选择视频文件', extensions: VIDEO_EXTENSIONS },
    pickOutput: { title: '保存为 MP3', extensions: ['mp3'] },
    toOutputName: (inputPath) => `${inputPath.replace(/\.[^./]+$/, '')}.mp3`,
  },
]);

export const isFileConvertSupported = () => hasAiBridge() && hasFilePickerBridge();

/**
 * 选输入 → 选输出 → 执行。
 * @returns {Promise<{ status: 'canceled' } | { status: 'ok', outputPath: string } | { status: 'error', error: string }>}
 */
export async function runFileConvertTool(tool, { onStart } = {}) {
  const inputPick = await pickFile(tool.pickInput);
  if (!inputPick || inputPick.canceled) return { status: 'canceled' };

  const outputPick = await pickSavePath({
    title: tool.pickOutput.title,
    defaultName: tool.toOutputName(inputPick.filePath),
    extensions: tool.pickOutput.extensions,
  });
  if (!outputPick || outputPick.canceled) return { status: 'canceled' };

  onStart?.();
  try {
    const res = await aiExecTool({
      toolName: tool.toolName,
      args: { input: inputPick.filePath, output: outputPick.filePath },
      aiProxyBase: readAiServerBase(),
    });
    if (res?.ok) return { status: 'ok', outputPath: outputPick.filePath };
    return { status: 'error', error: res?.error || `退出码 ${res?.exitCode}` };
  } catch (err) {
    return { status: 'error', error: err?.message ?? String(err) };
  }
}
