const HIGHLIGHT_KEYS = [
  'novel-entity-character',
  'novel-entity-location',
  'novel-entity-faction',
  'novel-entity-item',
  'novel-entity-mission',
  'novel-entity-active',
];

function collectEntityKeywords(entities = []) {
  return entities
    .flatMap((entity) => {
      const keywords = [entity.name, ...(entity.aliases ?? [])]
        .map((item) => `${item ?? ''}`.trim())
        .filter(Boolean);
      return Array.from(new Set(keywords)).map((keyword) => ({
        entityId: entity.id,
        entityType: entity.type,
        entityName: entity.name,
        keyword,
      }));
    })
    .sort((left, right) => right.keyword.length - left.keyword.length);
}

function findKeywordMatches(text, entityKeywords) {
  const matches = [];

  entityKeywords.forEach((entityKeyword) => {
    let searchIndex = 0;
    while (searchIndex < text.length) {
      const matchIndex = text.indexOf(entityKeyword.keyword, searchIndex);
      if (matchIndex < 0) break;
      matches.push({
        start: matchIndex,
        end: matchIndex + entityKeyword.keyword.length,
        ...entityKeyword,
      });
      searchIndex = matchIndex + entityKeyword.keyword.length;
    }
  });

  matches.sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    return (right.end - right.start) - (left.end - left.start);
  });

  const accepted = [];
  let occupiedUntil = -1;
  matches.forEach((match) => {
    if (match.start < occupiedUntil) return;
    accepted.push(match);
    occupiedUntil = match.end;
  });

  return accepted;
}

function getHighlightNameByType(type) {
  if (type === 'character') return 'novel-entity-character';
  if (type === 'location') return 'novel-entity-location';
  if (type === 'faction') return 'novel-entity-faction';
  if (type === 'item') return 'novel-entity-item';
  if (type === 'mission') return 'novel-entity-mission';
  return null;
}

function clearHighlights() {
  if (!globalThis.CSS?.highlights) return;
  HIGHLIGHT_KEYS.forEach((key) => {
    globalThis.CSS.highlights.delete(key);
  });
}

function createPositionFromPoint(root, event) {
  const view = root.ownerDocument.defaultView;
  if (!view) return null;

  if (typeof root.ownerDocument.caretPositionFromPoint === 'function') {
    const position = root.ownerDocument.caretPositionFromPoint(event.clientX, event.clientY);
    if (!position) return null;
    return {
      node: position.offsetNode,
      offset: position.offset,
    };
  }

  if (typeof root.ownerDocument.caretRangeFromPoint === 'function') {
    const range = root.ownerDocument.caretRangeFromPoint(event.clientX, event.clientY);
    if (!range) return null;
    return {
      node: range.startContainer,
      offset: range.startOffset,
    };
  }

  return null;
}

export function applyNovelEntityHighlights(root, entities, activeEntityId) {
  clearHighlights();

  if (!root || !globalThis.CSS?.highlights || typeof globalThis.Highlight !== 'function') {
    return [];
  }

  const editorRoot = root.querySelector('.ProseMirror');
  if (!editorRoot) return [];

  const entityKeywords = collectEntityKeywords(entities);
  if (entityKeywords.length === 0) return [];

  const highlightRanges = new Map();
  const activeRanges = [];
  const matches = [];

  const textWalker = root.ownerDocument.createTreeWalker(
    editorRoot,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest('pre, code, [data-content-type="codeBlock"]')) {
          return NodeFilter.FILTER_REJECT;
        }
        if (!node.textContent?.trim()) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let currentNode = textWalker.nextNode();
  while (currentNode) {
    const text = currentNode.textContent ?? '';
    const nodeMatches = findKeywordMatches(text, entityKeywords);
    nodeMatches.forEach((match) => {
      const range = root.ownerDocument.createRange();
      range.setStart(currentNode, match.start);
      range.setEnd(currentNode, match.end);
      const highlightName = getHighlightNameByType(match.entityType);
      if (highlightName) {
        const ranges = highlightRanges.get(highlightName) ?? [];
        ranges.push(range);
        highlightRanges.set(highlightName, ranges);
      }
      if (activeEntityId && match.entityId === activeEntityId) {
        activeRanges.push(range);
      }
      matches.push({
        ...match,
        node: currentNode,
      });
    });
    currentNode = textWalker.nextNode();
  }

  highlightRanges.forEach((ranges, key) => {
    if (ranges.length > 0) {
      globalThis.CSS.highlights.set(key, new globalThis.Highlight(...ranges));
    }
  });

  if (activeRanges.length > 0) {
    globalThis.CSS.highlights.set('novel-entity-active', new globalThis.Highlight(...activeRanges));
  }

  return matches;
}

export function clearNovelEntityHighlights() {
  clearHighlights();
}

export function findClickedNovelEntity(event, root, matches = []) {
  if (!root || matches.length === 0) return null;
  const position = createPositionFromPoint(root, event);
  if (!position) return null;

  const matched = matches.find((match) => {
    if (match.node !== position.node) return false;
    return position.offset >= match.start && position.offset <= match.end;
  });

  return matched?.entityId ?? null;
}
