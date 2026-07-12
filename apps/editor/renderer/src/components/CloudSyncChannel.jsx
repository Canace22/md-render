import { CloudUpload, Download, Loader2, Settings } from 'lucide-react';

/**
 * 云端工作区快照（工作区级）。
 * 服务地址在「编辑器设置 → 同步连接」里维护（默认读 .env），这里只读取。
 */
export default function CloudSyncChannel({
  baseUrl,
  workspaceId,
  lastSyncedRevision,
  lastSyncedAt,
  loading,
  message,
  error,
  conflict,
  onWorkspaceIdChange,
  onUpload,
  onPull,
  onForceUpload,
  onUseRemote,
  onOpenSettings,
}) {
  const hasBaseUrl = Boolean(baseUrl?.trim());
  const canSync = hasBaseUrl && Boolean(workspaceId?.trim());

  return (
    <>
      <div className="settings-group">
        <div className="settings-group-title">云端快照</div>
        {!hasBaseUrl && (
          <p className="notion-hint sync-config-hint" role="status">
            <span>尚未配置云端同步服务地址（也可在 .env 里配 VITE_CLOUD_SYNC_API）。</span>
            {onOpenSettings && (
              <button type="button" className="sync-inline-link" onClick={onOpenSettings}>
                <Settings size={13} strokeWidth={1.8} />
                <span>去设置</span>
              </button>
            )}
          </p>
        )}
        <label className="notion-field">
          <span>工作区 ID</span>
          <input
            className="notion-input"
            placeholder="my-workspace"
            value={workspaceId}
            onChange={(e) => onWorkspaceIdChange(e.target.value)}
          />
        </label>
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

        {conflict && (
          <>
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
          </>
        )}
      </div>

      {message && <p className="notion-panel-message" role="status">{message}</p>}
      {error && <p className="notion-panel-error" role="alert">{error}</p>}
    </>
  );
}
