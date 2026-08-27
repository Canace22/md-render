import { useEffect, useMemo, useRef, useState } from 'react';
import { Input, Modal } from 'antd';
import { CornerDownLeft, Search } from 'lucide-react';
import { filterCommands } from '../core/commands/commandRegistry.js';
import { recordCommandUse, sortByUsage } from '../utils/commandUsage.js';

/**
 * 命令面板 —— 所有低频入口的统一通道。
 *
 * 空查询时按历史使用次数倒序，用得多的自然浮到最上面；
 * 输入后走标题 + 关键词包含匹配，不引模糊搜索库。
 */
export default function CommandPalette({ open, onClose, commands = [] }) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const activeItemRef = useRef(null);

  // 每次打开都从干净状态开始
  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  // 排序只在打开的那一刻取一次使用数据，避免执行命令后列表在眼皮底下跳动
  const orderedCommands = useMemo(
    () => (open ? sortByUsage(commands) : commands),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, commands],
  );

  const results = useMemo(
    () => filterCommands(orderedCommands, query),
    [orderedCommands, query],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    activeItemRef.current?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  const runCommand = (command) => {
    if (!command) return;
    recordCommandUse(command.id);
    onClose?.();
    command.run?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      runCommand(results[activeIndex]);
    }
  };

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      closable={false}
      width={560}
      destroyOnHidden
      wrapClassName="command-palette-wrap"
      styles={{ body: { padding: 0 } }}
    >
      <div className="command-palette" data-testid="command-palette">
        <div className="command-palette-search">
          <Search size={16} strokeWidth={1.8} className="command-palette-search-icon" />
          <Input
            autoFocus
            variant="borderless"
            value={query}
            placeholder="搜索命令…"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            aria-label="搜索命令"
          />
        </div>

        {results.length > 0 ? (
          <ul className="command-palette-list" role="listbox">
            {results.map((command, index) => (
              <li
                key={command.id}
                ref={index === activeIndex ? activeItemRef : null}
                role="option"
                aria-selected={index === activeIndex}
                className={`command-palette-item${index === activeIndex ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => runCommand(command)}
              >
                <span className="command-palette-item-title">{command.title}</span>
                <span className="command-palette-item-group">{command.group}</span>
                {index === activeIndex && (
                  <CornerDownLeft size={13} strokeWidth={1.8} className="command-palette-item-enter" />
                )}
              </li>
            ))}
          </ul>
        ) : (
          <div className="command-palette-empty">没有匹配的命令</div>
        )}
      </div>
    </Modal>
  );
}
