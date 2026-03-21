import { useEffect, useState } from 'react';
import { Input, Modal } from 'antd';
import { X } from 'lucide-react';
import NovelEntityMark from './NovelEntityMark.jsx';

const { TextArea } = Input;

const STATUS_LABELS = {
  pending: '待确认',
  confirmed: '已确认',
  accepted: '已接受',
  dismissed: '已忽略',
};

function parseTextList(value = '') {
  return value
    .split(/[，,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function NovelEntityPreviewModal({
  open,
  entity,
  currentFileId,
  currentFileName,
  onClose,
  onEntityUpdate,
}) {
  const [name, setName] = useState(entity?.name ?? '');
  const [summary, setSummary] = useState(entity?.summary ?? '');
  const [aliasesText, setAliasesText] = useState((entity?.aliases ?? []).join('，'));
  const [traitsText, setTraitsText] = useState((entity?.traits ?? []).join('，'));

  useEffect(() => {
    setName(entity?.name ?? '');
    setSummary(entity?.summary ?? '');
    setAliasesText((entity?.aliases ?? []).join('，'));
    setTraitsText((entity?.traits ?? []).join('，'));
  }, [entity?.id, entity?.name, entity?.summary, entity?.aliases, entity?.traits]);

  if (!entity) return null;

  const currentFileMentions = entity.mentionsByFile?.[currentFileId] ?? entity.mentionCount ?? 0;

  const handleNameBlur = () => {
    const nextName = name.trim();
    if (!nextName || nextName === (entity.name ?? '')) {
      setName(entity.name ?? '');
      return;
    }
    onEntityUpdate?.(entity.id, { name: nextName });
  };

  const handleSummaryBlur = () => {
    const nextSummary = summary.trim();
    if (nextSummary === (entity.summary ?? '')) return;
    onEntityUpdate?.(entity.id, { summary: nextSummary });
  };

  const handleAliasesBlur = () => {
    const nextAliases = parseTextList(aliasesText);
    const currentAliases = (entity.aliases ?? []).join('|');
    if (nextAliases.join('|') === currentAliases) return;
    onEntityUpdate?.(entity.id, { aliases: nextAliases });
  };

  const handleTraitsBlur = () => {
    const nextTraits = parseTextList(traitsText);
    const currentTraits = (entity.traits ?? []).join('|');
    if (nextTraits.join('|') === currentTraits) return;
    onEntityUpdate?.(entity.id, { traits: nextTraits });
  };

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
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={handleNameBlur}
              variant="borderless"
              className="novel-entity-preview-name-input"
              data-testid="novel-entity-preview-name-input"
              placeholder="实体名称"
            />
            <p>
              <span>{STATUS_LABELS[entity.status] ?? '待确认'}</span>
              <span> · </span>
              <span>{entity.mentionCount ?? 0} 次提及</span>
            </p>
          </div>
        </div>

        <label className="novel-entity-preview-editor">
          <span className="novel-entity-preview-section-title">简介</span>
          <TextArea
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
            onBlur={handleSummaryBlur}
            autoSize={{ minRows: 3, maxRows: 6 }}
            className="novel-entity-preview-textarea"
            data-testid="novel-entity-preview-summary-input"
            placeholder="补一句人物、地点或任务简介"
          />
        </label>
      </div>

      <div className="novel-entity-preview-grid">
        <section className="novel-entity-preview-section">
          <div className="novel-entity-preview-section-title">别名</div>
          <Input
            value={aliasesText}
            onChange={(event) => setAliasesText(event.target.value)}
            onBlur={handleAliasesBlur}
            className="novel-entity-preview-input"
            data-testid="novel-entity-preview-aliases-input"
            placeholder="多个别名用逗号分隔"
          />
        </section>

        <section className="novel-entity-preview-section">
          <div className="novel-entity-preview-section-title">特征</div>
          <Input
            value={traitsText}
            onChange={(event) => setTraitsText(event.target.value)}
            onBlur={handleTraitsBlur}
            className="novel-entity-preview-input"
            data-testid="novel-entity-preview-traits-input"
            placeholder="多个特征用逗号分隔"
          />
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
