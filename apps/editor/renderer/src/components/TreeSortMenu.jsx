import { Dropdown } from 'antd';
import { ArrowUpDown } from 'lucide-react';
import { TREE_SORT_OPTIONS } from '../utils/treeSort.js';

/** 文档目录「排序方式」按钮 + 下拉菜单（当前项由 selectedKeys 高亮） */
const TreeSortMenu = ({ value, onChange }) => {
  const items = TREE_SORT_OPTIONS.map((option) => ({ key: option.value, label: option.label }));

  return (
    <Dropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{ items, onClick: ({ key }) => onChange(key), selectedKeys: [value] }}
    >
      <button
        type="button"
        className="sidebar-add-icon"
        title="排序方式"
        aria-label="排序方式"
        data-testid="tree-sort-trigger"
      >
        <ArrowUpDown size={16} strokeWidth={1.5} />
      </button>
    </Dropdown>
  );
};

export default TreeSortMenu;
