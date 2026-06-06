import { Button, Input, Modal, Tag } from 'antd';
import { ClipboardCopy, Sparkles } from 'lucide-react';

const { TextArea } = Input;

const getPreviewText = (value, maxLength = 280) => {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '当前没有可处理的正文。';
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
};

export default function AIActionModal({
  open,
  action,
  sourceText,
  scopeLabel,
  generatedPrompt,
  onClose,
  onCopyPrompt,
  onApplyResult,
  resultDraft,
  onResultDraftChange,
}) {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      width={760}
      destroyOnHidden
      wrapClassName="ai-action-modal-wrap"
      title={(
        <span className="ai-action-modal-title">
          <Sparkles size={16} strokeWidth={1.8} />
          <span>{action?.label || 'AI 动作'}</span>
        </span>
      )}
    >
      <div className="ai-action-modal-body">
        <div className="ai-action-modal-head">
          <div className="ai-action-modal-stack">
            <span className="ai-action-modal-label">当前处理范围</span>
            <div className="ai-action-modal-tags">
              <Tag color="blue">{scopeLabel || '整篇文稿'}</Tag>
              {action?.promptLabel ? <Tag>{action.promptLabel}</Tag> : null}
            </div>
          </div>
          <Button icon={<ClipboardCopy size={14} strokeWidth={1.8} />} onClick={onCopyPrompt}>
            复制 Prompt
          </Button>
        </div>

        <div className="ai-action-modal-stack">
          <span className="ai-action-modal-label">来源内容预览</span>
          <div className="ai-action-modal-preview">{getPreviewText(sourceText)}</div>
        </div>

        <div className="ai-action-modal-stack">
          <span className="ai-action-modal-label">生成的 Prompt</span>
          <TextArea value={generatedPrompt} autoSize={{ minRows: 8, maxRows: 14 }} readOnly />
        </div>

        <div className="ai-action-modal-stack">
          <span className="ai-action-modal-label">AI 返回结果</span>
          <TextArea
            value={resultDraft}
            onChange={(event) => onResultDraftChange?.(event.target.value)}
            autoSize={{ minRows: 8, maxRows: 16 }}
            placeholder="把外部 AI 返回的内容粘贴到这里，然后点“插入到文档”。"
          />
        </div>

        <div className="ai-action-modal-actions">
          <Button onClick={onClose}>关闭</Button>
          <Button type="primary" onClick={onApplyResult} disabled={!String(resultDraft ?? '').trim()}>
            插入到文档
          </Button>
        </div>
      </div>
    </Modal>
  );
}
