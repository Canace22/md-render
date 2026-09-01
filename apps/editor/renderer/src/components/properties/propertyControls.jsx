import { useEffect, useState } from 'react';
import { Select } from 'antd';
import { GitBranch, X } from 'lucide-react';
import { normalizeDate, normalizeDateTime } from '../../../../shared/properties.js';
import { hasCoverImagePicker, selectCoverImage } from '../../services/electronBridge.js';
import RelatedDocPicker from '../RelatedDocPicker.jsx';

/** 输入类控件共用：本地草稿 + 失焦提交，避免每个按键都落盘 */
const useCommitDraft = (value, onCommit) => {
  const [draft, setDraft] = useState('');
  useEffect(() => { setDraft(value ?? ''); }, [value]);

  const commit = (transform = (text) => text) => {
    const next = transform(String(draft ?? '').trim());
    if (next === (value ?? '')) return;
    setDraft(next);
    onCommit(next);
  };

  return [draft, setDraft, commit];
};

export function TextControl({ value, onCommit, disabled, placeholder, multiline, transform }) {
  const [draft, setDraft, commit] = useCommitDraft(value, onCommit);

  if (multiline) {
    return (
      <textarea
        className="doc-meta-textarea"
        value={draft}
        placeholder={placeholder}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => commit()}
        disabled={disabled}
      />
    );
  }

  return (
    <input
      className="doc-meta-input"
      value={draft}
      placeholder={placeholder}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit(transform)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') { event.preventDefault(); commit(transform); }
        if (event.key === 'Escape') { event.preventDefault(); setDraft(value ?? ''); }
      }}
      disabled={disabled}
    />
  );
}

export function SelectControl({ value, options, onChange, disabled }) {
  return (
    <select
      className="doc-meta-select"
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

export function MultiSelectControl({ value = [], options, onChange, disabled, label }) {
  const toggle = (item) => {
    onChange(value.includes(item) ? value.filter((one) => one !== item) : [...value, item]);
  };

  return (
    <div className="doc-meta-platform-list" role="group" aria-label={label}>
      {options.map((option) => {
        const checked = value.includes(option.value);
        return (
          <label key={option.value} className={`doc-meta-platform-chip${checked ? ' is-selected' : ''}`}>
            <input
              type="checkbox"
              className="doc-meta-platform-input"
              checked={checked}
              onChange={() => toggle(option.value)}
              disabled={disabled}
            />
            <span>{option.label}</span>
          </label>
        );
      })}
    </div>
  );
}

export function TagsControl({ value = [], options = [], onChange, disabled, placeholder }) {
  return (
    <Select
      mode="tags"
      size="small"
      className="doc-meta-tag-select"
      value={value}
      options={options}
      placeholder={placeholder}
      onChange={onChange}
      disabled={disabled}
      maxTagCount="responsive"
      open={options.length > 0 ? undefined : false}
      popupClassName="doc-meta-tag-select-dropdown"
    />
  );
}

export function CheckboxControl({ value, onChange, disabled }) {
  return (
    <label className="doc-meta-checkbox">
      <input
        type="checkbox"
        checked={value === true || value === 'true'}
        onChange={(event) => onChange(event.target.checked)}
        disabled={disabled}
      />
    </label>
  );
}

export function NumberControl({ value, onCommit, disabled }) {
  const [draft, setDraft, commit] = useCommitDraft(value == null ? '' : String(value), (next) => {
    const num = Number(next);
    onCommit(next === '' || !Number.isFinite(num) ? '' : num);
  });

  return (
    <input
      type="number"
      className="doc-meta-input"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => commit()}
      disabled={disabled}
    />
  );
}

/** 日期：能认出来就规范成 Obsidian 认的格式，认不出就保留用户原文 */
export function DateControl({ value, onCommit, disabled, placeholder, dateOnly = false }) {
  const normalize = dateOnly ? normalizeDate : normalizeDateTime;
  return (
    <TextControl
      value={normalize(value)}
      onCommit={onCommit}
      disabled={disabled}
      placeholder={placeholder ?? '2026-09-03 20:00'}
      transform={normalize}
    />
  );
}

const toPreviewSrc = (value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('data:')) return value;
  if (value.startsWith('/') || /^[A-Z]:\\/i.test(value)) return `file://${value}`;
  return value;
};

export function ImageControl({ value, onCommit, disabled }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [value]);

  const pickLocalImage = async () => {
    const result = await selectCoverImage();
    if (result?.canceled || !result?.filePath) return;
    onCommit(result.filePath);
  };

  return (
    <>
      <div className="doc-meta-cover-actions">
        {hasCoverImagePicker() && (
          <button type="button" className="doc-meta-action" onClick={pickLocalImage} disabled={disabled}>选择图片</button>
        )}
        {value && (
          <button type="button" className="doc-meta-action" onClick={() => onCommit('')} disabled={disabled}>清除</button>
        )}
      </div>
      <TextControl value={value} onCommit={onCommit} disabled={disabled} placeholder="输入图片 URL 或本地路径" />
      {value && (
        <div className="doc-meta-cover-preview">
          {failed
            ? <div className="doc-meta-cover-fallback">图片加载失败</div>
            : <img src={toPreviewSrc(value)} alt="封面预览" className="doc-meta-cover-thumb" onError={() => setFailed(true)} />}
        </div>
      )}
    </>
  );
}

/**
 * 关联类属性：值是节点 id；找不到对应文件时降级成灰色纯文本，不丢数据。
 */
export function RelationControl({
  value = [], filesById, selectedFile, allFiles, onChange, onOpenFile, disabled,
}) {
  const items = value.map((id) => ({ id, file: filesById.get(id) }));

  return (
    <>
      <RelatedDocPicker
        key={selectedFile.id}
        selectedFile={selectedFile}
        allFiles={allFiles}
        onAdd={(targetId) => targetId && !value.includes(targetId) && onChange([...value, targetId])}
        disabled={disabled}
      />
      {items.length > 0 && (
        <div className="doc-meta-chip-list">
          {items.map(({ id, file }) => (
            <span key={id} className={`doc-meta-chip doc-meta-chip--${file ? 'linked' : 'plain'}`}>
              <GitBranch size={11} strokeWidth={1.8} />
              {file
                ? <button type="button" onClick={() => onOpenFile?.(id)}><span>{file.name}</span></button>
                : <span title="找不到这个文件了">{id.replace(/^.*:file:/, '')}</span>}
              <button
                type="button"
                onClick={() => onChange(value.filter((one) => one !== id))}
                aria-label="删除关联"
                disabled={disabled}
              >
                <X size={11} strokeWidth={2} />
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}
