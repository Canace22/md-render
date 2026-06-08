/**
 * 编辑器搜索栏（Ctrl+F）
 * Enter: 下一个，Shift+Enter: 上一个，Esc: 关闭
 *
 * 通用组件，无业务依赖。
 */

import React, { useRef, useEffect } from 'react';
import { Search, ChevronUp, ChevronDown, X } from 'lucide-react';
import './FindBar.css';

interface FindBarProps {
  visible: boolean;
  query: string;
  totalMatches: number;
  currentMatchIndex: number;
  onQueryChange: (q: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onClose: () => void;
}

export const FindBar: React.FC<FindBarProps> = ({
  visible,
  query,
  totalMatches,
  currentMatchIndex,
  onQueryChange,
  onNext,
  onPrev,
  onClose,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
  }, [visible]);

  if (!visible) return null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.shiftKey ? onPrev() : onNext();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
    }
  };

  const matchLabel = query
    ? totalMatches > 0
      ? `${currentMatchIndex + 1} / ${totalMatches}`
      : '无结果'
    : '';

  return (
    <div className="find-bar">
      <Search size={14} className="find-bar__icon" />
      <input
        ref={inputRef}
        type="text"
        className="find-bar__input"
        placeholder="搜索…"
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {matchLabel && (
        <span className={`find-bar__count${totalMatches === 0 ? ' find-bar__count--empty' : ''}`}>
          {matchLabel}
        </span>
      )}
      <button
        className="find-bar__nav-btn"
        onClick={onPrev}
        title="上一个 (Shift+Enter)"
        disabled={totalMatches === 0}
        type="button"
      >
        <ChevronUp size={13} />
      </button>
      <button
        className="find-bar__nav-btn"
        onClick={onNext}
        title="下一个 (Enter)"
        disabled={totalMatches === 0}
        type="button"
      >
        <ChevronDown size={13} />
      </button>
      <button className="find-bar__close-btn" onClick={onClose} title="关闭 (Esc)" type="button">
        <X size={13} />
      </button>
    </div>
  );
};
