import { useEffect, useState } from 'react';
import { ArrowLeft, Cloud, Download, Plus, Trash2, Upload } from 'lucide-react';
import { THEME_OPTIONS } from '../utils/themeUtils';
import { TEMPLATES } from '../utils/wechatTemplates';

export default function SettingsPanel({
  selectedFileName,
  theme,
  copyStyle,
  publishingPlatforms = [],
  storageMode,
  projectRootPath,
  localProjectSupported = false,
  onThemeChange,
  onCopyStyleChange,
  onPublishingPlatformsChange,
  onOpenLocalProject,
  onImport,
  onExport,
  onOpenNotion,
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
        <div className="settings-group-title">主题</div>
        <div className="settings-option-grid">
          {THEME_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                className={`settings-option-card ${theme === option.id ? 'active' : ''}`}
                onClick={() => onThemeChange(option.id)}
                aria-label={`切换到${option.label}`}
              >
                <Icon size={18} strokeWidth={1.6} />
                <span>{option.label}</span>
              </button>
            );
          })}
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
        <div className="settings-group-title">工作区</div>
        <div className="settings-action-list">
          <button
            type="button"
            className="settings-action-btn"
            onClick={onOpenLocalProject}
            disabled={!localProjectSupported}
            title={localProjectSupported ? '打开本地项目文件夹' : '仅桌面版应用支持'}
          >
            <Upload size={16} strokeWidth={1.6} />
            <span>{localProjectSupported ? '打开本地项目文件夹' : '打开本地项目文件夹（仅桌面版）'}</span>
          </button>
          <button type="button" className="settings-action-btn" onClick={onImport}>
            <Upload size={16} strokeWidth={1.6} />
            <span>导入工作区 JSON</span>
          </button>
          <button type="button" className="settings-action-btn" onClick={onExport}>
            <Download size={16} strokeWidth={1.6} />
            <span>导出当前工作区</span>
          </button>
          {onOpenNotion && (
            <button
              type="button"
              className="settings-action-btn"
              data-testid="open-notion-from-settings"
              onClick={onOpenNotion}
            >
              <Cloud size={16} strokeWidth={1.6} />
              <span>Notion 页面同步</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
