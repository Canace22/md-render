import { Alert } from 'antd';

export default function TauriPreviewNotice() {
  return (
    <Alert
      className="tauri-preview-notice"
      type="warning"
      showIcon
      message="Tauri 预览版 · 数据隔离"
      description="这里不会读取或覆盖正式版资料；请在 MD Render 正式版查看原数据。"
    />
  );
}
