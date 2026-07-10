import { Button, Input } from 'antd';
import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';

export default function JsonSearchBar({
  activeIndex,
  inputRef,
  matchCount,
  onClose,
  onNavigate,
  onQueryChange,
  open,
  query,
}) {
  if (!open) return null;

  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onNavigate(event.shiftKey ? -1 : 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  return (
    <div className="json-tool-search" role="search" aria-label="在 JSON 中查找">
      <Input
        ref={inputRef}
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={handleKeyDown}
        prefix={<Search size={14} strokeWidth={1.7} />}
        suffix={(
          <span className={`json-tool-search-count${query && matchCount === 0 ? ' is-empty' : ''}`}>
            {matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : '0/0'}
          </span>
        )}
        placeholder="查找 JSON"
        allowClear
        aria-label="查找 JSON"
      />
      <Button
        type="text"
        size="small"
        icon={<ChevronUp size={15} />}
        onClick={() => onNavigate(-1)}
        disabled={matchCount === 0}
        aria-label="上一个匹配项"
      />
      <Button
        type="text"
        size="small"
        icon={<ChevronDown size={15} />}
        onClick={() => onNavigate(1)}
        disabled={matchCount === 0}
        aria-label="下一个匹配项"
      />
      <Button
        type="text"
        size="small"
        icon={<X size={15} />}
        onClick={onClose}
        aria-label="关闭查找"
      />
    </div>
  );
}
