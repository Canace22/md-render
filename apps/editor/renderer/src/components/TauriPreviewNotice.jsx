import { Alert } from 'antd';

export default function TauriPreviewNotice() {
  return (
    <Alert
      className="tauri-preview-notice"
      type="warning"
      showIcon
      message="Tauri 预览版 · 数据隔离"
      description="不会自动读取或覆盖正式版资料；需要查看文件时，请在设置中手动以只读方式打开目录。"
    />
  );
}
