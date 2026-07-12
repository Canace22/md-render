import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { TEMPLATES } from '../utils/wechatTemplates';

export default function SettingsPanel({
  selectedFileName,
  copyStyle,
  publishingPlatforms = [],
  storageMode,
  projectRootPath,
  notionProxyBase = '',
  onNotionProxyBaseChange,
  notionToken = '',
  onNotionTokenChange,
  cloudSyncBaseUrl = '',
  onCloudSyncBaseUrlChange,
  onCopyStyleChange,
  onPublishingPlatformsChange,
  onClose,
}) {
  const [platformDrafts, setPlatformDrafts] = useState(publishingPlatforms);
  const [newPlatformLabel, setNewPlatformLabel] = useState('');
  const [proxyDraft, setProxyDraft] = useState(notionProxyBase);
  const [tokenDraft, setTokenDraft] = useState(notionToken);
  const [cloudUrlDraft, setCloudUrlDraft] = useState(cloudSyncBaseUrl);

  useEffect(() => {
    setPlatformDrafts(publishingPlatforms);
  }, [publishingPlatforms]);

  useEffect(() => {
    setProxyDraft(notionProxyBase);
  }, [notionProxyBase]);

  useEffect(() => {
    setTokenDraft(notionToken);
  }, [notionToken]);

  useEffect(() => {
    setCloudUrlDraft(cloudSyncBaseUrl);
  }, [cloudSyncBaseUrl]);

  const commitProxyDraft = () => {
    const next = proxyDraft.trim();
    if (next === (notionProxyBase ?? '').trim()) return;
    onNotionProxyBaseChange?.(next);
  };

  const commitTokenDraft = () => {
    const next = tokenDraft.trim();
    if (next === (notionToken ?? '').trim()) return;
    onNotionTokenChange?.(next);
  };

  const commitCloudUrlDraft = () => {
    const next = cloudUrlDraft.trim();
    if (next === (cloudSyncBaseUrl ?? '').trim()) return;
    onCloudSyncBaseUrlChange?.(next);
  };

  const handlePlatformDraftChange = (value, index) => {
    setPlatformDrafts((current) => current.map((item, itemIndex) => {
      if (itemIndex !== index) return item;
      return { ...item, label: value };
    }));
  };

  const commitPlatformDraft = (index) => {
    const nextLabel = String(platformDrafts[index]?.label ?? '').trim();
    const currentOption = publishingPlatforms[index];
    if (!currentOption) return;
    if (!nextLabel) {
      setPlatformDrafts(publishingPlatforms);
      return;
    }
    if (nextLabel === currentOption.label) return;
    const nextPlatforms = publishingPlatforms.map((item, itemIndex) => (
      itemIndex === index ? { ...item, label: nextLabel } : item
    ));
    onPublishingPlatformsChange?.(nextPlatforms);
  };

  const handleRemovePlatform = (value) => {
    if (!value || publishingPlatforms.length <= 1) return;
    onPublishingPlatformsChange?.(
      publishingPlatforms.filter((item) => item.value !== value),
    );
  };

  const handleAddPlatform = () => {
    const nextLabel = newPlatformLabel.trim();
    if (!nextLabel) return;
    onPublishingPlatformsChange?.([
      ...publishingPlatforms,
      { label: nextLabel },
    ]);
    setNewPlatformLabel('');
  };

  return (
    <section className="settings-panel" data-testid="settings-panel">
      <div className="settings-panel-header">
        <button type="button" className="settings-back-btn" onClick={onClose}>
          <ArrowLeft size={16} strokeWidth={1.8} />
          <span>返回文稿</span>
        </button>
        <div className="settings-panel-intro">
          <p className="settings-kicker">SETTINGS</p>
          <h2>编辑器设置</h2>
          <p>当前文档：{selectedFileName ?? '未命名'}</p>
          <p className="settings-panel-meta">
            {storageMode === 'project'
              ? `当前项目：${projectRootPath || '未命名项目'}`
              : '当前模式：临时工作区'}
          </p>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">排版风格</div>
        <div className="settings-template-list">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className={`settings-template-item ${copyStyle === template.id ? 'active' : ''}`}
              onClick={() => onCopyStyleChange(template.id)}
              aria-label={`切换到${template.name}风格`}
            >
              <span>{template.name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">发布平台</div>
        <div className="settings-platform-list">
          {platformDrafts.map((platform, index) => (
            <div key={platform.value || index} className="settings-platform-row">
              <input
                className="settings-platform-input"
                value={platform.label ?? ''}
                placeholder="例如：知乎 / 即刻 / 个人博客"
                onChange={(event) => handlePlatformDraftChange(event.target.value, index)}
                onBlur={() => commitPlatformDraft(index)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    commitPlatformDraft(index);
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setPlatformDrafts(publishingPlatforms);
                  }
                }}
              />
              <button
                type="button"
                className="settings-platform-remove"
                onClick={() => handleRemovePlatform(platform.value)}
                disabled={publishingPlatforms.length <= 1}
                title={publishingPlatforms.length <= 1 ? '至少保留一个平台' : `删除 ${platform.label}`}
              >
                <Trash2 size={15} strokeWidth={1.8} />
                <span>删除</span>
              </button>
            </div>
          ))}
        </div>
        <div className="settings-platform-create">
          <input
            className="settings-platform-input"
            value={newPlatformLabel}
            placeholder="新增一个发布平台"
            onChange={(event) => setNewPlatformLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                handleAddPlatform();
              }
            }}
          />
          <button
            type="button"
            className="settings-platform-add"
            onClick={handleAddPlatform}
            disabled={!newPlatformLabel.trim()}
          >
            <Plus size={15} strokeWidth={1.8} />
            <span>新增平台</span>
          </button>
        </div>
        <div className="settings-platform-hint">
          这里改的是全局平台配置，稿件元数据、待发布列表和看板会同步使用这份配置。
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">Notion 反代地址</div>
        <input
          className="settings-platform-input"
          data-testid="notion-proxy-input"
          value={proxyDraft}
          placeholder="https://你的服务器/notion-api/v1"
          onChange={(event) => setProxyDraft(event.target.value)}
          onBlur={commitProxyDraft}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              commitProxyDraft();
            }
            if (event.key === 'Escape') {
              event.preventDefault();
              setProxyDraft(notionProxyBase);
            }
          }}
        />
        <div className="settings-platform-hint">
          填你自己部署的 Notion 转发服务地址（末尾到 <code>/v1</code>），用于绕过浏览器跨域限制。
          只保存在本机、不会打进安装包；留空则仅本机开发模式可用。部署见 <code>server/notion-proxy/README.md</code>。
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-group-title">同步连接</div>
        <label className="notion-field">
          <span>Notion Integration Secret（Token）</span>
          <input
            type="password"
            className="settings-platform-input"
            data-testid="notion-token-input"
            autoComplete="off"
            placeholder="secret_…"
            value={tokenDraft}
            onChange={(event) => setTokenDraft(event.target.value)}
            onBlur={commitTokenDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitTokenDraft();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setTokenDraft(notionToken);
              }
            }}
          />
        </label>
        <div className="settings-platform-hint">
          在 Notion 集成中创建并授予目标页面访问权限，「同步」页的拉取/推送都用这一个 Token。
        </div>
        <label className="notion-field">
          <span>云端同步服务地址</span>
          <input
            className="settings-platform-input"
            data-testid="cloud-sync-url-input"
            placeholder="留空则使用 VITE_CLOUD_SYNC_API"
            value={cloudUrlDraft}
            onChange={(event) => setCloudUrlDraft(event.target.value)}
            onBlur={commitCloudUrlDraft}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                commitCloudUrlDraft();
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setCloudUrlDraft(cloudSyncBaseUrl);
              }
            }}
          />
        </label>
        <div className="settings-platform-hint">
          工作区云端快照的上传/拉取地址，通常由 <code>.env</code> 提供，这里填写会临时覆盖。
        </div>
      </div>

    </section>
  );
}
