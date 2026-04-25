import { ArrowLeft, Cloud, CloudUpload, Link2, Loader2 } from 'lucide-react';
import { isLocalDevMode } from '../utils/notionService.js';

export default function NotionPanel({
  selectedFileName,
  canSync,
  token,
  pageId,
  onTokenChange,
  onPageIdChange,
  onPull,
  onPush,
  onClose,
  pullLoading,
  pushLoading,
  message,
  error,
}) {
  const dev = isLocalDevMode();
  const busy = pullLoading || pushLoading;

  return (
    <section className="notion-panel settings-panel" data-testid="notion-panel">
      <div className="settings-panel-header">
        <button type="button" className="settings-back-btn" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.8} />
          <span>返回文稿</span>
        </button>
        <div className="settings-panel-intro">
          <p className="settings-kicker">NOTION</p>
          <h2>Notion 页面同步</h2>
          <p>当前文档：{selectedFileName ?? '未命名'}</p>
        </div>
      </div>

      {!dev && (
        <div className="notion-dev-warning settings-group" role="status">
          <p>
            Notion 同步仅在本机开发（<code>localhost</code>）时可用。通过 Vite 代理访问 Notion API；部署到
            GitHub Pages 后无法使用。
          </p>
        </div>
      )}

      <div className="settings-group">
        <div className="settings-group-title">连接</div>
        <label className="notion-field">
          <span>Integration Secret（Token）</span>
          <input
            type="password"
            className="notion-input"
            autoComplete="off"
            placeholder="secret_…"
            value={token}
            onChange={(e) => onTokenChange(e.target.value)}
            disabled={!dev}
          />
        </label>
        <p className="notion-hint">在 Notion 集成中创建并授予目标页面访问权限。</p>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">当前文件的 Notion 页面</div>
        <label className="notion-field">
          <span>页面 ID 或 URL</span>
          <input
            className="notion-input"
            placeholder="32 位 ID 或完整页面链接"
            value={pageId}
            onChange={(e) => onPageIdChange(e.target.value)}
            disabled={!dev || !canSync}
          />
        </label>
        <p className="notion-hint">每个本地 .md 文件可绑定一个 Notion 页面，用于拉取与推送。</p>
      </div>

      {message && (
        <p className="notion-panel-message" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="notion-panel-error" role="alert">
          {error}
        </p>
      )}

      <div className="settings-group">
        <div className="settings-group-title">同步</div>
        <div className="notion-action-row">
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onPull}
            disabled={!dev || busy || !token?.trim() || !pageId?.trim() || !canSync}
          >
            {pullLoading ? <Loader2 className="notion-btn-spinner" size={18} /> : <Cloud size={18} strokeWidth={1.6} />}
            <span>从 Notion 拉取</span>
          </button>
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onPush}
            disabled={!dev || busy || !token?.trim() || !pageId?.trim() || !canSync}
          >
            {pushLoading ? <Loader2 className="notion-btn-spinner" size={18} /> : <CloudUpload size={18} strokeWidth={1.6} />}
            <span>推送到 Notion</span>
          </button>
        </div>
        <p className="notion-hint small">
          <Link2 size={14} className="notion-hint-icon" strokeWidth={1.8} />
          拉取会覆盖当前编辑器中的正文；推送会用当前正文覆盖 Notion 中的页面内容块。
        </p>
      </div>
    </section>
  );
}
