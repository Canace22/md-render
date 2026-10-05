import { useCallback } from 'react';
import { message } from 'antd';
import { isFileConvertSupported, runFileConvertTool } from '../services/fileConvertTools.js';

/** 运行文件转换工具并用 antd message 提示结果 */
export function useFileConvertTool() {
  return useCallback(async (tool) => {
    if (!isFileConvertSupported()) {
      message.warning('文件转换需要连接 ai-proxy server');
      return;
    }
    let hide = null;
    const result = await runFileConvertTool(tool, {
      onStart: () => { hide = message.loading(`正在执行 ${tool.label}...`, 0); },
    });
    hide?.();
    if (result.status === 'ok') message.success(`${tool.label} 完成：${result.outputPath}`, 5);
    if (result.status === 'error') message.error(`${tool.label} 失败：${result.error}`, 8);
  }, []);
}
