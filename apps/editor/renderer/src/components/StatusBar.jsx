import { useMemo } from 'react';
import { countWords } from '../utils/wordCount.js';

/**
 * 底部状态栏 — 显示字数、字符数等统计信息
 * @param {{ content: string, backlinks: number }} props
 */
export default function StatusBar({ content = '', backlinks = 0 }) {
  const stats = useMemo(() => {
    const text = content || '';
    const words = countWords(text);
    const chars = text.length;
    return { words, chars };
  }, [content]);

  return (
    <div className="status-bar">
      <span className="status-bar-item" title="反向链接">
        {backlinks} 条反向链接
      </span>
      <span className="status-bar-spacer" />
      <span className="status-bar-item">{stats.words} 个词</span>
      <span className="status-bar-item">{stats.chars} 个字符</span>
    </div>
  );
}
