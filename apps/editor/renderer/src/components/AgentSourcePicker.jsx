import { useMemo } from 'react';
import { Dropdown } from 'antd';
import { ChevronDown, Cpu } from 'lucide-react';

const MODEL_KEY_SEPARATOR = '|';

const withReason = (source) => (source.reason ? `${source.label}（${source.reason}）` : source.label);

/** 本机 agent 的二级菜单：跟随默认 + 预设/真实列表；用户存过的自定义模型也要能看到 */
const buildModelItems = (source, options = [], currentModel = '') => {
  const list = options.length ? options : [{ value: '', label: '跟随默认' }];
  const withCustom = currentModel && !list.some((option) => option.value === currentModel)
    ? [...list, { value: currentModel, label: `${currentModel}（自定义）` }]
    : list;
  return withCustom.map((option) => ({
    key: `${source.id}${MODEL_KEY_SEPARATOR}${option.value}`,
    label: option.label,
  }));
};

export const getSourceModelLabel = (activeSource) => {
  if (activeSource.kind === 'local') return activeSource.model || '默认';
  return activeSource.model || '';
};

/**
 * 输入框旁的「来源 · 模型」切换器（U1）：一级选来源，本机 agent 的二级选模型；不可用的置灰并写明原因。
 */
export default function AgentSourcePicker({ sources, activeSource, modelOptions, onSelectSource, onSelectModel, disabled }) {
  const items = useMemo(() => {
    const local = sources.filter((source) => source.kind === 'local');
    const api = sources.filter((source) => source.kind === 'api');
    const groups = [];
    if (local.length) {
      groups.push({
        type: 'group',
        label: '本机 agent',
        children: local.map((source) => (source.available
          ? {
            key: source.id,
            label: source.label,
            children: buildModelItems(
              source,
              modelOptions[source.id]?.options,
              source.id === activeSource.sourceId ? activeSource.model : '',
            ),
          }
          : { key: source.id, label: withReason(source), disabled: true })),
      });
    }
    groups.push({
      type: 'group',
      label: 'API 服务商',
      children: api.map((source) => ({ key: source.id, label: source.label })),
    });
    return groups;
  }, [sources, modelOptions, activeSource]);

  const handleClick = ({ key }) => {
    const [sourceId, ...rest] = String(key).split(MODEL_KEY_SEPARATOR);
    onSelectSource(sourceId);
    if (rest.length) onSelectModel(sourceId, rest.join(MODEL_KEY_SEPARATOR));
  };

  const modelLabel = getSourceModelLabel(activeSource);
  const selectedKeys = activeSource.kind === 'local'
    ? [`${activeSource.sourceId}${MODEL_KEY_SEPARATOR}${activeSource.model}`]
    : [activeSource.sourceId];

  return (
    <Dropdown
      trigger={['click']}
      placement="topLeft"
      disabled={disabled}
      overlayClassName="agent-panel__composer-dropdown"
      menu={{ items, onClick: handleClick, selectable: true, selectedKeys }}
    >
      <button type="button" className="agent-panel__source-picker" title="切换 AI 来源和模型">
        <Cpu size={13} />
        <span className="agent-panel__source-picker-label">
          {activeSource.label}{modelLabel ? ` · ${modelLabel}` : ''}
        </span>
        <ChevronDown size={12} />
      </button>
    </Dropdown>
  );
}
