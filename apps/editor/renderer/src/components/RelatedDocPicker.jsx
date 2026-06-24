import { useMemo, useState } from 'react';
import { Select } from 'antd';
import { Plus } from 'lucide-react';
import { searchRelatedDocCandidates } from '../core/agent/contextRecall.js';

export default function RelatedDocPicker({
  selectedFile,
  allFiles = [],
  onAdd,
  disabled = false,
  controlsClassName = 'doc-meta-related-controls',
  selectClassName = 'doc-meta-related-select',
  placeholder = '搜索或选择文档…',
}) {
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');

  const options = useMemo(() => {
    const candidates = searchRelatedDocCandidates(selectedFile, allFiles, { searchQuery: search });
    return candidates.map((file) => ({
      value: file.id,
      label: file._name ?? file.title ?? '未命名',
    }));
  }, [selectedFile, allFiles, search]);

  const handleAdd = () => {
    if (!draft) return;
    onAdd?.(draft);
    setDraft('');
    setSearch('');
  };

  return (
    <div className={controlsClassName}>
      <Select
        showSearch
        size="small"
        className={selectClassName}
        popupClassName="doc-meta-related-select-dropdown"
        value={draft || undefined}
        placeholder={placeholder}
        options={options}
        filterOption={false}
        onSearch={setSearch}
        onChange={(value) => setDraft(value ?? '')}
        disabled={disabled}
        notFoundContent={search.trim() ? '无匹配文档' : '暂无可选文档'}
      />
      <button type="button" onClick={handleAdd} disabled={!draft || disabled}>
        <Plus size={13} strokeWidth={1.8} />
      </button>
    </div>
  );
}
