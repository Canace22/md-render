import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const FIND_SHORTCUT_KEY = 'f';
const FALLBACK_LINE_HEIGHT = 21;

const collectMatchPositions = (source, query) => {
  const normalizedQuery = query.toLocaleLowerCase();
  if (!normalizedQuery) return [];

  const normalizedSource = source.toLocaleLowerCase();
  const positions = [];
  let cursor = 0;

  while (cursor <= normalizedSource.length - normalizedQuery.length) {
    const position = normalizedSource.indexOf(normalizedQuery, cursor);
    if (position === -1) break;
    positions.push(position);
    cursor = position + normalizedQuery.length;
  }

  return positions;
};

export default function useJsonSearch({ source, editorRef }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef(null);
  const matches = useMemo(() => collectMatchPositions(source, query), [query, source]);

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  const openSearch = useCallback(() => {
    setIsOpen(true);
    focusSearchInput();
  }, [focusSearchInput]);

  const closeSearch = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => editorRef.current?.focus());
  }, [editorRef]);

  const updateQuery = useCallback((nextQuery) => {
    setQuery(nextQuery);
    setActiveIndex(nextQuery ? 0 : -1);
  }, []);

  const navigate = useCallback((direction) => {
    if (matches.length === 0) return;
    setActiveIndex((current) => {
      const safeCurrent = current < 0 ? 0 : current;
      return (safeCurrent + direction + matches.length) % matches.length;
    });
  }, [matches.length]);

  useEffect(() => {
    const handleShortcut = (event) => {
      const isFindShortcut = (event.ctrlKey || event.metaKey)
        && !event.shiftKey
        && !event.altKey
        && event.key.toLocaleLowerCase() === FIND_SHORTCUT_KEY;

      if (isFindShortcut) {
        event.preventDefault();
        openSearch();
      } else if (isOpen && event.key === 'Escape') {
        event.preventDefault();
        closeSearch();
      }
    };

    document.addEventListener('keydown', handleShortcut);
    return () => document.removeEventListener('keydown', handleShortcut);
  }, [closeSearch, isOpen, openSearch]);

  useEffect(() => {
    if (matches.length === 0) {
      setActiveIndex(-1);
    } else if (activeIndex < 0 || activeIndex >= matches.length) {
      setActiveIndex(0);
    }
  }, [activeIndex, matches.length]);

  useEffect(() => {
    const editor = editorRef.current;
    const position = matches[activeIndex];
    if (!isOpen || !editor || position == null || !query) return;

    const lineIndex = source.slice(0, position).split('\n').length - 1;
    const lineHeight = Number.parseFloat(window.getComputedStyle(editor).lineHeight)
      || FALLBACK_LINE_HEIGHT;
    editor.setSelectionRange(position, position + query.length);
    editor.scrollTop = Math.max(0, (lineIndex - 2) * lineHeight);
  }, [activeIndex, editorRef, isOpen, matches, query, source]);

  return {
    activeIndex,
    closeSearch,
    inputRef,
    isOpen,
    matchCount: matches.length,
    navigate,
    query,
    updateQuery,
  };
}
