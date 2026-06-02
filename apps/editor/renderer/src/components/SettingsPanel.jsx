import { ArrowLeft, Cloud, Download, Upload } from 'lucide-react';
import { THEME_OPTIONS } from '../utils/themeUtils';
import { TEMPLATES } from '../utils/wechatTemplates';

export default function SettingsPanel({
  selectedFileName,
  theme,
  copyStyle,
  onThemeChange,
  onCopyStyleChange,
  onImport,
  onExport,
  onOpenNotion,
  onClose,
}) {
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
        <div className="settings-group-title">工作区</div>
        <div className="settings-action-list">
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
