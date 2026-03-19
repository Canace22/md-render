import { useEffect, useMemo, useRef, useState } from 'react';

const CATEGORY_ORDER = ['all', 'character', 'location', 'faction', 'item', 'mission'];

const CATEGORY_LABELS = {
  all: '全部',
  character: '角色',
  location: '地点',
  faction: '势力',
  item: '物件',
  mission: '任务',
};

function EmptyState() {
  return (
    <div className="novel-mention-empty">
      <div>没有匹配到实体</div>
      <p>继续输入角色名、地点名或任务关键词试试。</p>
    </div>
  );
}

function MentionItem({ item, isSelected, onClick, itemIndex }) {
  return (
    <button
      id={`bn-suggestion-menu-item-${itemIndex}`}
      type="button"
      className={`novel-mention-item ${isSelected ? 'selected' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onClick?.(item)}
    >
      <span className="novel-mention-item-icon">{item.icon}</span>
      <span className="novel-mention-item-body">
        <span className="novel-mention-item-title-row">
          <span className="novel-mention-item-title">{item.title}</span>
          <span className="novel-mention-item-badge">{item.badge}</span>
        </span>
        <span className="novel-mention-item-subtext">{item.subtext || '插入到正文'}</span>
      </span>
    </button>
  );
}

function CategorySidebar({ categories, activeCategory, onChange }) {
  return (
    <div className="novel-mention-sidebar">
      {categories.map((category) => (
        <button
          key={category.id}
          type="button"
          className={`novel-mention-category ${activeCategory === category.id ? 'active' : ''}`}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(category.id)}
        >
          <span>{category.label}</span>
          <span>{category.count}</span>
        </button>
      ))}
    </div>
  );
}

function MentionSections({ items, selectedIndex, onItemClick }) {
  const groupedItems = useMemo(() => {
    return CATEGORY_ORDER
      .filter((category) => category !== 'all')
      .map((category) => ({
        id: category,
        label: CATEGORY_LABELS[category],
        items: items.filter((item) => item.entityType === category),
      }))
      .filter((group) => group.items.length > 0);
  }, [items]);

  if (items.length === 0) return <EmptyState />;

  return (
    <div className="novel-mention-section-list">
      {groupedItems.map((group) => (
        <section key={group.id} className="novel-mention-section">
          <div className="novel-mention-section-title">{group.label}</div>
          <div className="novel-mention-list">
            {group.items.map((item) => (
              <MentionItem
                key={item.entityId}
                item={item}
                itemIndex={item.itemIndex}
                isSelected={item.itemIndex === selectedIndex}
                onClick={onItemClick}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function NovelMentionMenu(props) {
  const { items, selectedIndex, onItemClick } = props;
  const indexedItems = useMemo(() => {
    return items.map((item, index) => ({
      ...item,
      itemIndex: index,
    }));
  }, [items]);

  const categories = useMemo(() => {
    const counts = {
      all: indexedItems.length,
      character: 0,
      location: 0,
      faction: 0,
      item: 0,
      mission: 0,
    };

    indexedItems.forEach((item) => {
      if (counts[item.entityType] != null) {
        counts[item.entityType] += 1;
      }
    });

    return CATEGORY_ORDER.filter((category) => counts[category] > 0).map((category) => ({
      id: category,
      label: CATEGORY_LABELS[category],
      count: counts[category],
    }));
  }, [indexedItems]);

  const [activeCategory, setActiveCategory] = useState('all');
  const lastSelectedItemRef = useRef({
    index: null,
    entityId: null,
  });

  useEffect(() => {
    if (!categories.some((category) => category.id === activeCategory)) {
      setActiveCategory(categories[0]?.id ?? 'all');
    }
  }, [categories, activeCategory]);

  useEffect(() => {
    const selectedItem = indexedItems[selectedIndex ?? -1];
    if (!selectedItem) return;
    const hasSelectionChanged =
      lastSelectedItemRef.current.index !== selectedIndex ||
      lastSelectedItemRef.current.entityId !== selectedItem.entityId;

    lastSelectedItemRef.current = {
      index: selectedIndex,
      entityId: selectedItem.entityId,
    };

    if (!hasSelectionChanged) return;
    if (activeCategory !== 'all' && selectedItem.entityType !== activeCategory) {
      setActiveCategory(selectedItem.entityType);
    }
  }, [selectedIndex, indexedItems, activeCategory]);

  const visibleItems = useMemo(() => {
    if (activeCategory === 'all') return indexedItems;
    return indexedItems.filter((item) => item.entityType === activeCategory);
  }, [indexedItems, activeCategory]);

  return (
    <div id="bn-suggestion-menu" className="novel-mention-menu">
      <CategorySidebar
        categories={categories}
        activeCategory={activeCategory}
        onChange={setActiveCategory}
      />
      <div className="novel-mention-content">
        <div className="novel-mention-content-header">
          {activeCategory === 'all'
            ? `全部实体 (${indexedItems.length})`
            : `${CATEGORY_LABELS[activeCategory]} (${visibleItems.length})`}
        </div>

        {activeCategory === 'all' ? (
          <MentionSections
            items={visibleItems}
            selectedIndex={selectedIndex}
            onItemClick={onItemClick}
          />
        ) : visibleItems.length > 0 ? (
          <div className="novel-mention-list">
            {visibleItems.map((item) => (
              <MentionItem
                key={item.entityId}
                item={item}
                itemIndex={item.itemIndex}
                isSelected={item.itemIndex === selectedIndex}
                onClick={onItemClick}
              />
            ))}
          </div>
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
