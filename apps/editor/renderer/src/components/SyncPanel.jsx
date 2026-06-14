import { useState } from 'react';
import {
  ArrowLeft, Cloud, CloudUpload, Database, Download, FileText,
  Loader2, Link2, MessageSquare, Upload,
} from 'lucide-react';
import { isNotionAvailable } from '../utils/notionService.js';

/**
 * 统一同步页：把 Notion / 本地项目 / 导入导出 三个渠道
 * 聚合到一个页面，左侧切渠道、右侧操作区。各渠道只复用上层传入的
 * handler，不在此重写任何同步逻辑。
 */

const CHANNELS = [
  { id: 'notion', label: 'Notion', icon: Cloud },
  { id: 'local', label: '本地项目', icon: FileText },
  { id: 'workspace', label: '导入导出', icon: Download },
];

function NotionChannel(props) {
  const {
    selectedFileName, canSync, token, pageId, databaseId,
    onTokenChange, onPageIdChange, onDatabaseIdChange,
    onPull, onPush, onDatabasePull, onDatabasePush,
    pullLoading, pushLoading, databasePullLoading, databasePushLoading,
    incrementalActive, batchProgress, message, error,
  } = props;
  const available = isNotionAvailable();
  const busy = pullLoading || pushLoading || databasePullLoading || databasePushLoading;

  return (
    <>
      {!available && (
        <div className="notion-dev-warning settings-group" role="status">
          <p>
            未检测到 Notion 代理。请到「编辑器设置 → Notion 反代地址」填入你的转发服务地址，
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
        <div className="settings-group-title">数据库同步</div>
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
      </div>

      {message && <p className="notion-panel-message" role="status">{message}</p>}
      {error && <p className="notion-panel-error" role="alert">{error}</p>}
    </>
  );
}

function WechatChannel({ canCopy, copyStyleName, onCopyWeChat, onCopyRichText, onPreviewWeChat }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">公众号格式化复制</div>
      <p className="notion-hint">
        把当前文档按所选排版风格转成公众号可直接粘贴的富文本。当前风格：{copyStyleName}。
      </p>
      {!canCopy && (
        <p className="notion-hint small">请先在文稿中选中一个文档，再进行复制。</p>
      )}
      <div className="notion-action-row">
        <button
          type="button"
          className="notion-primary-btn"
          onClick={onCopyWeChat}
          disabled={!canCopy}
        >
          <MessageSquare size={18} strokeWidth={1.6} />
          <span>复制到公众号</span>
        </button>
        <button
          type="button"
          className="notion-primary-btn"
          onClick={onCopyRichText}
          disabled={!canCopy}
        >
          <CloudUpload size={18} strokeWidth={1.6} />
          <span>复制富文本</span>
        </button>
        <button
          type="button"
          className="notion-primary-btn"
          onClick={onPreviewWeChat}
          disabled={!canCopy}
        >
          <FileText size={18} strokeWidth={1.6} />
          <span>预览公众号样式</span>
        </button>
      </div>
    </div>
  );
}

// 仅在 localProjectSupported 为真时渲染（渠道标签同样会被隐藏）。
function LocalChannel({ canSyncFromDisk, syncLoading, onOpenLocalProject, onSyncFromDisk }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">本地项目目录</div>
      <p className="notion-hint">
        把本地文件夹作为工作区，编辑直接落盘；也可从磁盘把外部改动同步回编辑器。
      </p>
      <div className="settings-action-list">
        <button
          type="button"
          className="settings-action-btn"
          onClick={onOpenLocalProject}
          title="打开本地项目文件夹"
        >
          <Upload size={16} strokeWidth={1.6} />
          <span>打开本地项目文件夹</span>
        </button>
        <button
          type="button"
          className="settings-action-btn"
          onClick={() => onSyncFromDisk()}
          disabled={!canSyncFromDisk || syncLoading}
          title={canSyncFromDisk ? '把当前工作区从磁盘同步最新内容' : '工作区里还没有本地项目'}
        >
          {syncLoading
            ? <Loader2 className="notion-btn-spinner" size={16} />
            : <Cloud size={16} strokeWidth={1.6} />}
          <span>从磁盘同步</span>
        </button>
      </div>
    </div>
  );
}

function WorkspaceChannel({ onImport, onExport }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">工作区导入导出</div>
      <div className="settings-action-list">
        <button type="button" className="settings-action-btn" onClick={onImport}>
          <Upload size={16} strokeWidth={1.6} />
          <span>导入工作区 JSON</span>
        </button>
        <button type="button" className="settings-action-btn" onClick={onExport}>
          <Download size={16} strokeWidth={1.6} />
          <span>导出当前工作区</span>
        </button>
      </div>
    </div>
  );
}

export default function SyncPanel({
  initialChannel = 'notion',
  selectedFileName,
  localProjectSupported = false,
  onClose,
  notion,
  local,
  workspace,
}) {
  // 用不了的渠道直接不显示：本地项目仅桌面版有。
  const channels = CHANNELS.filter((c) => c.id !== 'local' || localProjectSupported);
  const fallbackChannel = channels[0]?.id ?? 'notion';
  const safeInitial = channels.some((c) => c.id === initialChannel) ? initialChannel : fallbackChannel;
  const [channel, setChannel] = useState(safeInitial);
  const activeChannel = channels.some((c) => c.id === channel) ? channel : fallbackChannel;

  return (
    <section className="sync-panel settings-panel" data-testid="sync-panel">
      <div className="settings-panel-header">
        <button type="button" className="settings-back-btn" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.8} />
          <span>返回文稿</span>
        </button>
        <div className="settings-panel-intro">
          <p className="settings-kicker">SYNC</p>
          <h2>渠道同步</h2>
          <p>当前文档：{selectedFileName ?? '未命名'}</p>
        </div>
      </div>

      <div className="sync-channel-tabs" role="tablist">
        {channels.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeChannel === id}
            className={`sync-channel-tab ${activeChannel === id ? 'active' : ''}`}
            data-testid={`sync-tab-${id}`}
            onClick={() => setChannel(id)}
          >
            <Icon size={16} strokeWidth={1.6} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="sync-channel-body">
        {activeChannel === 'notion' && <NotionChannel selectedFileName={selectedFileName} {...notion} />}
        {activeChannel === 'local' && <LocalChannel {...local} />}
        {activeChannel === 'workspace' && <WorkspaceChannel {...workspace} />}
      </div>
    </section>
  );
}
