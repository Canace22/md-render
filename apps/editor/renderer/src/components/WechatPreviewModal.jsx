import { useEffect, useRef, useState } from 'react';
import { Copy, X } from 'lucide-react';
import { TEMPLATES } from '../utils/wechatTemplates';
import { convertToWeChatHTML, copyToWeChat } from '../utils/wechatCopy';

export default function WechatPreviewModal({
  open,
  onClose,
  sourceHtml,
  initialTemplateId = 'default',
  onTemplateChange,
}) {
  const [templateId, setTemplateId] = useState(initialTemplateId);
  const [copied, setCopied] = useState(false);
  const previewRef = useRef(null);

  // 同步外部选中的模板
  useEffect(() => {
    setTemplateId(initialTemplateId);
  }, [initialTemplateId]);

  // 每次打开或切换模板时刷新预览内容
  useEffect(() => {
    if (!open || !previewRef.current) return;
    const html = sourceHtml?.trim() ? convertToWeChatHTML(sourceHtml, templateId) : '';
    previewRef.current.innerHTML = html || '<p style="color:#9ca3af;font-size:14px;">暂无内容</p>';
  }, [open, sourceHtml, templateId]);

  if (!open) return null;

  const handleSelectTemplate = (id) => {
    setTemplateId(id);
    onTemplateChange?.(id);
  };

  const handleCopy = async () => {
    if (!sourceHtml?.trim()) return;
    try {
      await copyToWeChat(sourceHtml, { templateId });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('复制失败，请重试');
    }
  };

  const handleOverlayClick = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="wechat-preview-overlay"
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-label="微信公众号预览"
    >
      <div className="wechat-preview-modal">
        {/* 头部：模板 tabs + 关闭 */}
        <div className="wechat-preview-header">
          <div className="wechat-preview-tabs" role="tablist">
            {TEMPLATES.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={templateId === t.id}
                className={`wechat-preview-tab ${templateId === t.id ? 'active' : ''}`}
                onClick={() => handleSelectTemplate(t.id)}
              >
                {t.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="wechat-preview-close"
            onClick={onClose}
            aria-label="关闭预览"
          >
            <X size={15} strokeWidth={1.8} />
          </button>
        </div>

        {/* 预览区域 */}
        <div className="wechat-preview-body">
          {/* 模拟手机宽度容器 */}
          <div className="wechat-preview-phone">
            <div ref={previewRef} className="wechat-preview-content" />
          </div>
        </div>

        {/* 底部操作栏 */}
        <div className="wechat-preview-footer">
          <span className="wechat-preview-hint">粘贴到微信公众号编辑器后样式即可还原</span>
          <button
            type="button"
            className={`wechat-preview-copy-btn ${copied ? 'copied' : ''}`}
            onClick={handleCopy}
          >
            <Copy size={13} strokeWidth={1.8} />
            <span>{copied ? '已复制！' : '复制到公众号'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
