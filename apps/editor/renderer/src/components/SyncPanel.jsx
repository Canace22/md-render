import { useState } from 'react';
import {
  ArrowLeft, Cloud, CloudUpload, Database, Download, FileText,
  Loader2, Link2, Settings, Upload,
} from 'lucide-react';
import { isNotionAvailable } from '../utils/notionService.js';
import CloudSyncChannel from './CloudSyncChannel.jsx';

/**
 * 同步页：按操作对象分两组——
 * - 当前文档：Notion 页面绑定 + 拉取/推送 + 自动推送
 * - 整个工作区：云端快照 / Notion 数据库 / 本地项目 / JSON 备份
 * 连接配置（Token、服务地址）在「编辑器设置」里维护，这里只读取。
 * 所有 handler 复用上层传入，不在此重写任何同步逻辑。
 */

const CHANNELS = [
  { id: 'doc', label: '当前文档', icon: FileText },
  { id: 'workspace', label: '整个工作区', icon: Cloud },
];

// 兼容旧的 initialChannel 取值（notion/cloud/local/workspace）
function normalizeChannel(id) {
  if (id === 'doc' || id === 'notion') return 'doc';
  return 'workspace';
}

function ConfigHint({ text, onOpenSettings }) {
  return (
    <p className="notion-hint sync-config-hint" role="status">
      <span>{text}</span>
      {onOpenSettings && (
        <button type="button" className="sync-inline-link" onClick={onOpenSettings}>
          <Settings size={13} strokeWidth={1.8} />
          <span>去设置</span>
        </button>
      )}
    </p>
  );
}

/** 顶部状态条：一眼回答「我的东西同步到哪了」 */
function SyncStatusBar({ notion, cloud }) {
  const docBound = Boolean(notion?.pageId?.trim());
  return (
    <div className="sync-status-bar" data-testid="sync-status-bar">
      <div className="sync-status-item">
        <span className="sync-status-label">当前文档</span>
        <span className="sync-status-value">
          {docBound ? '已绑定 Notion 页面' : '未绑定 Notion 页面'}
          {notion?.autoPushEnabled ? ' · 自动推送开' : ''}
        </span>
      </div>
      <div className="sync-status-item">
        <span className="sync-status-label">工作区云端</span>
        <span className="sync-status-value">
          {cloud?.lastSyncedAt
            ? `revision ${cloud.lastSyncedRevision ?? 0} · ${new Date(cloud.lastSyncedAt).toLocaleString()}`
            : '尚未同步'}
        </span>
      </div>
    </div>
  );
}

/** 当前文档：Notion 单文件绑定 + 拉/推 + 自动推送 */
function DocChannel(props) {
  const {
    canSync, token, pageId,
    onPageIdChange, onPull, onPush,
    pullLoading, pushLoading,
    autoPushEnabled, onAutoPushChange,
    message, error, onOpenSettings,
  } = props;
  const available = isNotionAvailable();
  const busy = pullLoading || pushLoading;
  const hasToken = Boolean(token?.trim());

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
        <div className="settings-group-title">Notion 页面同步</div>
        {!hasToken && (
          <ConfigHint text="尚未配置 Notion Token，配置后才能拉取/推送。" onOpenSettings={onOpenSettings} />
        )}
        <label className="notion-field">
          <span>绑定页面（ID 或 URL）</span>
          <input
            className="notion-input"
            placeholder="32 位 ID 或完整页面链接"
            value={pageId}
            onChange={(e) => onPageIdChange(e.target.value)}
            disabled={!available || !canSync}
          />
        </label>
        <div className="notion-action-row">
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onPull}
            disabled={!available || busy || !hasToken || !pageId?.trim() || !canSync}
          >
            {pullLoading ? <Loader2 className="notion-btn-spinner" size={18} /> : <Cloud size={18} strokeWidth={1.6} />}
            <span>从 Notion 拉取</span>
          </button>
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onPush}
            disabled={!available || busy || !hasToken || !pageId?.trim() || !canSync}
          >
            {pushLoading ? <Loader2 className="notion-btn-spinner" size={18} /> : <CloudUpload size={18} strokeWidth={1.6} />}
            <span>推送到 Notion</span>
          </button>
        </div>
        <p className="notion-hint small">
          <Link2 size={14} className="notion-hint-icon" strokeWidth={1.8} />
          拉取会覆盖编辑器中的正文；推送会用当前正文覆盖 Notion 页面内容。
        </p>

        {onAutoPushChange && (
          <>
            <label className="notion-field notion-field-inline">
              <input
                type="checkbox"
                checked={Boolean(autoPushEnabled)}
                onChange={(e) => onAutoPushChange(e.target.checked)}
                disabled={!available || !hasToken}
              />
              <span>保存后自动同步到 Notion</span>
            </label>
            <p className="notion-hint small">
              编辑保存约 30 秒后自动推送：配置了数据库的文件推到数据库（已推送过的原地更新）；
              从数据库拉取的页面则直接写回原 Notion 页面。
            </p>
          </>
        )}
      </div>

      {message && <p className="notion-panel-message" role="status">{message}</p>}
      {error && <p className="notion-panel-error" role="alert">{error}</p>}
    </>
  );
}

/** 整个工作区：Notion 数据库部分 */
function NotionDatabaseGroup(props) {
  const {
    token, databaseId, onDatabaseIdChange,
    onDatabasePull, onDatabasePush, onOpenNotionWorkspace,
    databasePullLoading, databasePushLoading,
    incrementalActive, batchProgress, onOpenSettings,
  } = props;
  const available = isNotionAvailable();
  const hasToken = Boolean(token?.trim());
  const busy = databasePullLoading || databasePushLoading;

  return (
    <div className="settings-group">
      <div className="settings-group-title">Notion 数据库</div>
      {!hasToken && (
        <ConfigHint text="尚未配置 Notion Token。" onOpenSettings={onOpenSettings} />
      )}
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

      {batchProgress && (
        <div className="notion-batch-progress" role="status">
          <Loader2 className="notion-btn-spinner" size={14} />
          <span>
            {batchProgress.current}/{batchProgress.total}：{batchProgress.title}
          </span>
        </div>
      )}

      <div className="notion-action-row">
        {onOpenNotionWorkspace && (
          <button
            type="button"
            className="notion-primary-btn"
            onClick={onOpenNotionWorkspace}
            disabled={!available || busy || !hasToken || !databaseId?.trim()}
            title="只拉页面清单秒开，点开文件时才加载正文"
          >
            {databasePullLoading
              ? <Loader2 className="notion-btn-spinner" size={18} />
              : <Database size={18} strokeWidth={1.6} />}
            <span>打开为工作区</span>
          </button>
        )}
        <button
          type="button"
          className="notion-primary-btn"
          onClick={onDatabasePull}
          disabled={!available || busy || !hasToken || !databaseId?.trim()}
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
          disabled={!available || busy || !hasToken || !databaseId?.trim()}
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
  );
}

/** 整个工作区：本地项目（仅桌面版） */
function LocalProjectGroup({ canSyncFromDisk, syncLoading, onOpenLocalProject, onSyncFromDisk }) {
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

/** 整个工作区：JSON 备份 */
function BackupGroup({ onImport, onExport }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">备份（JSON）</div>
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
  initialChannel = 'doc',
  selectedFileName,
  localProjectSupported = false,
  onClose,
  onOpenSettings,
  notion,
  cloud,
  local,
  workspace,
}) {
  const [channel, setChannel] = useState(normalizeChannel(initialChannel));

  return (
    <section className="sync-panel settings-panel" data-testid="sync-panel">
      <div className="settings-panel-header">
        <button type="button" className="settings-back-btn" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.8} />
          <span>返回文稿</span>
        </button>
        <div className="settings-panel-intro">
          <p className="settings-kicker">SYNC</p>
          <h2>同步</h2>
          <p>当前文档：{selectedFileName ?? '未命名'}</p>
        </div>
        <SyncStatusBar notion={notion} cloud={cloud} />
      </div>

      <div className="sync-channel-tabs" role="tablist">
        {CHANNELS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={channel === id}
            className={`sync-channel-tab ${channel === id ? 'active' : ''}`}
            data-testid={`sync-tab-${id}`}
            onClick={() => setChannel(id)}
          >
            <Icon size={16} strokeWidth={1.6} />
            <span>{label}</span>
          </button>
        ))}
      </div>

      <div className="sync-channel-body">
        {channel === 'doc' && (
          <DocChannel {...notion} onOpenSettings={onOpenSettings} />
        )}
        {channel === 'workspace' && (
          <>
            <CloudSyncChannel {...cloud} onOpenSettings={onOpenSettings} />
            <NotionDatabaseGroup {...notion} onOpenSettings={onOpenSettings} />
            {localProjectSupported && <LocalProjectGroup {...local} />}
            <BackupGroup {...workspace} />
            {notion?.message && <p className="notion-panel-message" role="status">{notion.message}</p>}
            {notion?.error && <p className="notion-panel-error" role="alert">{notion.error}</p>}
          </>
        )}
      </div>
    </section>
  );
}
