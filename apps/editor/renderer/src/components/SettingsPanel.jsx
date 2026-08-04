import { useEffect, useState } from 'react';
import {
  ArrowLeft, Cloud, Download, Loader2, Plus, Trash2, Upload,
} from 'lucide-react';
import { TEMPLATES } from '../utils/wechatTemplates';

export default function SettingsPanel({
  selectedFileName,
  copyStyle,
  publishingPlatforms = [],
  storageMode,
  projectRootPath,
  local,
  backup,
  onCopyStyleChange,
  onPublishingPlatformsChange,
  onClose,
}) {
  const [platformDrafts, setPlatformDrafts] = useState(publishingPlatforms);
  const [newPlatformLabel, setNewPlatformLabel] = useState('');

  useEffect(() => {
    setPlatformDrafts(publishingPlatforms);
  }, [publishingPlatforms]);

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

      {local?.localProjectSupported && (
        <div className="settings-group">
          <div className="settings-group-title">本地项目目录</div>
          <div className="settings-platform-hint">
            把本地文件夹作为工作区，编辑直接落盘；也可从磁盘把外部改动同步回编辑器。
            版本管理交给该目录自己的 Git 仓库。
          </div>
          <div className="settings-action-list">
            <button
              type="button"
              className="settings-action-btn"
              data-testid="open-local-project"
              onClick={local.onOpenLocalProject}
              title="打开本地项目文件夹"
            >
              <Upload size={16} strokeWidth={1.6} />
              <span>打开本地项目文件夹</span>
            </button>
            <button
              type="button"
              className="settings-action-btn"
              data-testid="sync-from-disk"
              onClick={() => local.onSyncFromDisk?.()}
              disabled={!local.canSyncFromDisk || local.syncLoading}
              title={local.canSyncFromDisk ? '把当前工作区从磁盘同步最新内容' : '工作区里还没有本地项目'}
            >
              {local.syncLoading
                ? <Loader2 className="settings-btn-spinner" size={16} />
                : <Cloud size={16} strokeWidth={1.6} />}
              <span>从磁盘同步</span>
            </button>
          </div>
        </div>
      )}

      {backup && (
        <div className="settings-group">
          <div className="settings-group-title">备份（JSON）</div>
          <div className="settings-action-list">
            <button
              type="button"
              className="settings-action-btn"
              data-testid="import-workspace-json"
              onClick={backup.onImport}
            >
              <Upload size={16} strokeWidth={1.6} />
              <span>导入工作区 JSON</span>
            </button>
            <button
              type="button"
              className="settings-action-btn"
              data-testid="export-workspace-json"
              onClick={backup.onExport}
            >
              <Download size={16} strokeWidth={1.6} />
              <span>导出当前工作区</span>
            </button>
          </div>
        </div>
      )}

    </section>
  );
}
