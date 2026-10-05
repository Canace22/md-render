import { useMemo, useState } from 'react';
import { Cascader } from 'antd';
import { ChevronDown, Cpu } from 'lucide-react';

const withReason = (source) => (source.reason ? `${source.label}（${source.reason}）` : source.label);

/** 本机 agent 的二级菜单：跟随默认 + 预设/真实列表；用户存过的自定义模型也要能看到 */
const buildModelItems = (options = [], currentModel = '') => {
  const list = options.length ? options : [{ value: '', label: '跟随默认' }];
  const withCustom = currentModel && !list.some((option) => option.value === currentModel)
    ? [...list, { value: currentModel, label: `${currentModel}（自定义）` }]
    : list;
  return withCustom.map((option) => ({
    value: option.value,
    label: option.label,
  }));
};

const filterSourceModel = (input, path) => {
  const keywords = input.trim().toLowerCase().split(/\s+/);
  const text = path.map((option) => `${option.label} ${option.value}`).join(' ').toLowerCase();
  return keywords.every((keyword) => text.includes(keyword));
};

const SOURCE_SEARCH = { filter: filterSourceModel, limit: false, matchInputWidth: false };

export const getSourceModelLabel = (activeSource) => {
  if (activeSource.kind === 'local') return activeSource.model || '默认';
  return activeSource.model || '';
};

/**
 * 输入框旁的「来源 · 模型」切换器（U1）：一级选来源，本机 agent 的二级选模型；不可用的置灰并写明原因。
 */
export default function AgentSourcePicker({ sources, activeSource, modelOptions, onSelectSource, onSelectModel, disabled }) {
  const [search, setSearch] = useState('');
  const options = useMemo(() => sources.map((source) => ({
    value: source.id,
    label: withReason(source),
    disabled: source.kind === 'local' && !source.available,
    ...(source.kind === 'local' && source.available ? {
      children: buildModelItems(
        modelOptions[source.id]?.options,
        source.id === activeSource.sourceId ? activeSource.model : '',
      ),
    } : {}),
  })), [sources, modelOptions, activeSource]);

  const handleChange = ([sourceId, model]) => {
    onSelectSource(sourceId);
    if (model !== undefined) onSelectModel(sourceId, model);
  };

  const modelLabel = getSourceModelLabel(activeSource);
  const label = `${activeSource.label}${modelLabel ? ` · ${modelLabel}` : ''}`;
  const value = activeSource.kind === 'local'
    ? [activeSource.sourceId, activeSource.model || '']
    : [activeSource.sourceId];

  return (
    <div className="agent-panel__source-picker" title={label}>
      <Cpu size={13} />
      <Cascader
        aria-label="搜索并切换 AI 来源和模型"
        className="agent-panel__source-select"
        classNames={{ popup: { root: 'agent-panel__source-popup' } }}
        placement="topRight"
        variant="borderless"
        size="small"
        disabled={disabled}
        allowClear={false}
        options={options}
        value={value}
        displayRender={() => label}
        showSearch={SOURCE_SEARCH}
        searchValue={search}
        onSearch={setSearch}
        onOpenChange={(open) => { if (!open) setSearch(''); }}
        onChange={handleChange}
        suffixIcon={<ChevronDown size={12} />}
        notFoundContent="没有匹配的来源或模型"
        popupRender={(menus) => (
          <>
            <div className="agent-panel__source-search-hint">输入名称搜索来源或模型</div>
            {menus}
          </>
        )}
      />
    </div>
  );
}
