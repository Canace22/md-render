import { ArrowLeft, Cloud, CloudUpload, Database, Link2, Loader2 } from 'lucide-react';
import { isNotionAvailable } from '../utils/notionService.js';

export default function NotionPanel({
  selectedFileName,
  canSync,
  token,
  pageId,
  databaseId,
  parentPageId,
  onTokenChange,
  onPageIdChange,
  onDatabaseIdChange,
  onPull,
  onPush,
  onDatabasePull,
  onDatabasePush,
  onClose,
  pullLoading,
  pushLoading,
  databasePullLoading,
  databasePushLoading,
  incrementalActive,
  batchProgress,
  message,
  error,
}) {
  const available = isNotionAvailable();
  const busy = pullLoading || pushLoading || databasePullLoading || databasePushLoading;

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

      {!available && (
        <div className="notion-dev-warning settings-group" role="status">
          <p>
            未检测到 Notion 代理。请到「设置 → Notion 反代地址」填入你的转发服务地址，
            或在本机开发（<code>localhost</code>）模式下使用。部署见 <code>server/notion-proxy/README.md</code>。
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
            disabled={!available}
          />
        </label>
        <p className="notion-hint">在 Notion 集成中创建并授予目标页面访问权限。</p>
      </div>

      {/* ── 单文件同步 ── */}
      <div className="settings-group">
        <div className="settings-group-title">单文件同步</div>
        <label className="notion-field">
          <span>页面 ID 或 URL</span>
          <input
            className="notion-input"
            placeholder="32 位 ID 或完整页面链接"
            value={pageId}
            onChange={(e) => onPageIdChange(e.target.value)}
            disabled={!available || !canSync}
          />
        </label>
        <p className="notion-hint">每个本地 .md 文件可绑定一个 Notion 页面，用于拉取与推送。</p>
        <div className="notion-action-row">
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onPull}
            disabled={!available || busy || !token?.trim() || !pageId?.trim() || !canSync}
          >
            {pullLoading ? <Loader2 className="notion-btn-spinner" size={18} /> : <Cloud size={18} strokeWidth={1.6} />}
            <span>从 Notion 拉取</span>
          </button>
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onPush}
            disabled={!available || busy || !token?.trim() || !pageId?.trim() || !canSync}
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

      {/* ── 数据库同步 ── */}
      <div className="settings-group">
        <div className="settings-group-title">从数据库拉取</div>
        <label className="notion-field">
          <span>数据库 ID 或 URL</span>
          <input
            className="notion-input"
            placeholder="32 位数据库 ID 或完整链接"
            value={databaseId}
            onChange={(e) => onDatabaseIdChange(e.target.value)}
            disabled={!available}
          />
        </label>
        <p className="notion-hint">指定一个 Notion 数据库，一键拉取其中所有页面到本地。</p>

        {batchProgress && (
          <div className="notion-batch-progress" role="status">
            <Loader2 className="notion-btn-spinner" size={14} />
            <span>
              {batchProgress.current}/{batchProgress.total}：{batchProgress.title}
            </span>
          </div>
        )}

        <div className="notion-action-row">
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onDatabasePull}
            disabled={!available || busy || !token?.trim() || !databaseId?.trim()}
          >
            {databasePullLoading
              ? <Loader2 className="notion-btn-spinner" size={18} />
              : <Database size={18} strokeWidth={1.6} />}
            <span>从数据库拉取</span>
          </button>
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onDatabasePush}
            disabled={!available || busy || !token?.trim() || !databaseId?.trim()}
          >
            {databasePushLoading
              ? <Loader2 className="notion-btn-spinner" size={18} />
              : <CloudUpload size={18} strokeWidth={1.6} />}
            <span>推送到数据库</span>
          </button>
        </div>
        <p className="notion-hint small">
          <Database size={14} className="notion-hint-icon" strokeWidth={1.8} />
          {incrementalActive
            ? '增量同步：同一目录原地更新，只动有变化的页面，不会重复堆文件夹。'
            : '会在工作区创建「Notion 同步」文件夹，存放拉取到的页面。'}
        </p>
        <p className="notion-hint small">
          <CloudUpload size={14} className="notion-hint-icon" strokeWidth={1.8} />
          把选中文件夹推回这个数据库：已拉取过的页面原地更新，新文件在库中新建页面。
        </p>
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
    </section>
  );
}
