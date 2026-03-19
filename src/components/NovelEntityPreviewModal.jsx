import { Modal } from 'antd';
import { X } from 'lucide-react';
import NovelEntityMark from './NovelEntityMark.jsx';

const STATUS_LABELS = {
  pending: '待确认',
  confirmed: '已确认',
  accepted: '已接受',
  dismissed: '已忽略',
};

export default function NovelEntityPreviewModal({
  open,
  entity,
  currentFileId,
  currentFileName,
  onClose,
}) {
  if (!entity) return null;

  const currentFileMentions = entity.mentionsByFile?.[currentFileId] ?? entity.mentionCount ?? 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      centered
      destroyOnClose
      footer={null}
      maskClosable
      keyboard
      width={860}
      className={`novel-entity-preview-modal is-${entity.type}`}
      rootClassName="novel-entity-preview-ant-modal"
      closeIcon={<X size={18} strokeWidth={1.8} />}
      data-testid="novel-entity-preview-overlay"
    >
      <div className="novel-entity-preview-hero">
        <div className="novel-entity-preview-header">
          <NovelEntityMark type={entity.type} showLabel className="novel-entity-preview-mark" />
          <div className="novel-entity-preview-heading">
            <h3>{entity.name}</h3>
            <p>
              <span>{STATUS_LABELS[entity.status] ?? '待确认'}</span>
              <span> · </span>
              <span>{entity.mentionCount ?? 0} 次提及</span>
            </p>
          </div>
        </div>

        <div className="novel-entity-preview-summary">
          {entity.summary || '这条实体还没有补全简介。你可以先继续写，稍后再回来补设定。'}
        </div>
      </div>

      <div className="novel-entity-preview-grid">
        <section className="novel-entity-preview-section">
          <div className="novel-entity-preview-section-title">别名</div>
          <div className="novel-entity-preview-section-body">
            {entity.aliases?.length ? entity.aliases.join('、') : '暂无'}
          </div>
        </section>

        <section className="novel-entity-preview-section">
          <div className="novel-entity-preview-section-title">特征</div>
          <div className="novel-entity-preview-section-body">
            {entity.traits?.length ? entity.traits.join('、') : '暂无'}
          </div>
        </section>

        <section className="novel-entity-preview-section">
          <div className="novel-entity-preview-section-title">当前文档提及</div>
          <div className="novel-entity-preview-section-body">{currentFileMentions}</div>
        </section>

        <section className="novel-entity-preview-section">
          <div className="novel-entity-preview-section-title">来源文档</div>
          <div className="novel-entity-preview-section-body">{currentFileName || '当前文档'}</div>
        </section>
      </div>
    </Modal>
  );
}
