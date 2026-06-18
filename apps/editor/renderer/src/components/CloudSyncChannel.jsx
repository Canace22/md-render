import { CloudUpload, Download, Loader2 } from 'lucide-react';

export default function CloudSyncChannel({
  baseUrl,
  workspaceId,
  lastSyncedRevision,
  lastSyncedAt,
  loading,
  message,
  error,
  conflict,
  onBaseUrlChange,
  onWorkspaceIdChange,
  onUpload,
  onPull,
  onForceUpload,
  onUseRemote,
}) {
  const canSync = Boolean(baseUrl?.trim() && workspaceId?.trim());

  return (
    <>
      <div className="settings-group">
        <div className="settings-group-title">云端工作区</div>
        <label className="notion-field">
          <span>服务地址（默认读取 .env）</span>
          <input
            className="notion-input"
            placeholder="留空则使用 VITE_CLOUD_SYNC_API"
            value={baseUrl}
            onChange={(e) => onBaseUrlChange(e.target.value)}
          />
        </label>
        <label className="notion-field">
          <span>工作区 ID</span>
          <input
            className="notion-input"
            placeholder="my-workspace"
            value={workspaceId}
            onChange={(e) => onWorkspaceIdChange(e.target.value)}
          />
        </label>
        <p className="notion-hint">
          手动同步当前工作区快照；服务地址通常由 .env 提供，这里只用于临时覆盖。
        </p>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">手动同步</div>
        <div className="notion-action-row">
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onUpload}
            disabled={!canSync || loading}
          >
            {loading
              ? <Loader2 className="notion-btn-spinner" size={18} />
              : <CloudUpload size={18} strokeWidth={1.6} />}
            <span>上传到云端</span>
          </button>
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onPull}
            disabled={!canSync || loading}
          >
            {loading
              ? <Loader2 className="notion-btn-spinner" size={18} />
              : <Download size={18} strokeWidth={1.6} />}
            <span>从云端拉取</span>
          </button>
        </div>
        <p className="notion-hint small">
          当前 revision：{lastSyncedRevision ?? 0}
          {lastSyncedAt ? `；最近同步：${new Date(lastSyncedAt).toLocaleString()}` : '；尚未同步'}
        </p>
      </div>

      {conflict && (
        <div className="settings-group">
          <div className="settings-group-title">冲突保护</div>
          <p className="notion-panel-error" role="alert">
            云端 revision {conflict.remoteRevision ?? '未知'} 与本地记录不一致，请选择处理方式。
          </p>
          <div className="notion-action-row">
            <button type="button" className="notion-primary-btn" onClick={onUseRemote} disabled={loading}>
              <Download size={18} strokeWidth={1.6} />
              <span>使用云端版本</span>
            </button>
            <button type="button" className="notion-primary-btn" onClick={onForceUpload} disabled={loading}>
              <CloudUpload size={18} strokeWidth={1.6} />
              <span>覆盖云端</span>
            </button>
          </div>
        </div>
      )}

      {message && <p className="notion-panel-message" role="status">{message}</p>}
      {error && <p className="notion-panel-error" role="alert">{error}</p>}
    </>
  );
}
