import { memo } from 'react';
import { Segmented } from 'antd';
import { List, Network } from 'lucide-react';

export const OUTLINE_VIEW = 'outline';
export const MINDMAP_VIEW = 'mindmap';

const ICON_SIZE = 14;

const OPTIONS = [
  { value: OUTLINE_VIEW, label: '大纲', icon: <List size={ICON_SIZE} /> },
  { value: MINDMAP_VIEW, label: '导图', icon: <Network size={ICON_SIZE} /> },
];

/** 大纲 / 思维导图 切换（大纲页面和今日速记共用） */
function OutlineViewSwitch({ value, onChange }) {
  return (
    <Segmented
      size="small"
      className="outline-view-switch"
      data-testid="outline-view-switch"
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  );
}

export default memo(OutlineViewSwitch);
