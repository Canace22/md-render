import { useMemo, useState } from 'react';
import { Cascader, Select } from 'antd';
import { Brain, ChevronDown, Cpu } from 'lucide-react';
import { getEffortChoices } from '../core/agent/aiSources.js';

const EFFORT_LABELS = Object.freeze({
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '超高',
  max: '最高',
  ultra: '极限',
});

const effortLabel = (effort) => EFFORT_LABELS[effort] ?? effort;

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

/** 本机 agent 跟随默认时显示本机配置里的真实模型，读不到才写「默认」 */
export const getSourceModelLabel = (activeSource, modelInfo) => {
  if (activeSource.kind === 'local') return activeSource.model || modelInfo?.defaultModel || '默认';
  return activeSource.model || '';
};

/** 思考强度选项：首项跟随本机配置；存过但当前模型列表里没有的值也保留，避免显示空白 */
export const buildEffortOptions = (choices = [], defaultEffort = '', currentEffort = '') => {
  const list = currentEffort && !choices.includes(currentEffort) ? [...choices, currentEffort] : choices;
  const follow = defaultEffort ? `跟随默认（${effortLabel(defaultEffort)}）` : '跟随默认';
  return [{ value: '', label: follow }, ...list.map((effort) => ({ value: effort, label: effortLabel(effort) }))];
};

/** 本机 agent 的思考强度切换（Cursor 等不支持单独 effort 的不显示） */
function EffortPicker({ activeSource, modelInfo, onSelectEffort, disabled }) {
  const choices = getEffortChoices(modelInfo, activeSource.model);
  if (!choices.length) return null;
  const options = buildEffortOptions(choices, modelInfo?.defaultEffort, activeSource.effort);
  const current = activeSource.effort || modelInfo?.defaultEffort || '';
  const label = current ? `思考 · ${effortLabel(current)}` : '思考 · 默认';
  return (
    <div className="agent-panel__effort-picker" title={`思考强度：${label}`}>
      <Brain size={13} />
      <Select
        aria-label="切换思考强度"
        className="agent-panel__source-select"
        classNames={{ popup: { root: 'agent-panel__source-popup' } }}
        placement="topRight"
        variant="borderless"
        size="small"
        disabled={disabled}
        popupMatchSelectWidth={false}
        options={options}
        value={activeSource.effort || ''}
        labelRender={() => label}
        onChange={(effort) => onSelectEffort(activeSource.sourceId, effort)}
        suffixIcon={<ChevronDown size={12} />}
      />
    </div>
  );
}

/**
 * 输入框旁的「来源 · 模型」切换器（U1）：一级选来源，本机 agent 的二级选模型；不可用的置灰并写明原因。
 */
export default function AgentSourcePicker({ sources, activeSource, modelOptions, onSelectSource, onSelectModel, onSelectEffort, disabled }) {
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

  const modelInfo = modelOptions[activeSource.sourceId];
  const modelLabel = getSourceModelLabel(activeSource, modelInfo);
  const label = `${activeSource.label}${modelLabel ? ` · ${modelLabel}` : ''}`;
  const value = activeSource.kind === 'local'
    ? [activeSource.sourceId, activeSource.model || '']
    : [activeSource.sourceId];

  return (
    <>
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
      {activeSource.kind === 'local' && onSelectEffort && (
        <EffortPicker activeSource={activeSource} modelInfo={modelInfo} onSelectEffort={onSelectEffort} disabled={disabled} />
      )}
    </>
  );
}
