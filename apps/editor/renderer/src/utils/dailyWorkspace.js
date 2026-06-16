const DAILY_ITEM_TYPES = new Set(['task', 'event', 'note']);
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const padNumber = (value) => String(value).padStart(2, '0');

const formatDateKey = (date) => {
  return `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`;
};

const createTimestamp = (value) => {
  if (Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const createDailyId = (prefix) => {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const toDateAtNoon = (dateKey) => {
  const [year, month, day] = normalizeDateKey(dateKey).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0, 0);
};

const normalizeText = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const normalizeDailyItem = (item, dateKey, index) => {
  const text = normalizeText(item?.text);
  if (!text) return null;

  const type = DAILY_ITEM_TYPES.has(item?.type) ? item.type : 'note';
  const createdAt = createTimestamp(item?.createdAt);

  return {
    id: typeof item?.id === 'string' && item.id.trim() ? item.id : `${dateKey}-${type}-${index}`,
    type,
    text,
    done: type === 'task' ? Boolean(item?.done) : false,
    createdAt,
    updatedAt: createTimestamp(item?.updatedAt ?? createdAt),
  };
};

const normalizeTodoItem = (item, index) => {
  const text = normalizeText(item?.text);
  if (!text) return null;

  const createdAt = createTimestamp(item?.createdAt);
  const sourceDate = item?.sourceDate ? normalizeDateKey(item.sourceDate, '') : '';

  return {
    id: typeof item?.id === 'string' && item.id.trim() ? item.id : `todo-${index}`,
    text,
    sourceDate,
    createdAt,
    updatedAt: createTimestamp(item?.updatedAt ?? createdAt),
  };
};

export const getTodayDateKey = (baseDate = new Date()) => {
  return formatDateKey(baseDate);
};

export const normalizeDateKey = (value, fallback = getTodayDateKey()) => {
  if (typeof value === 'string' && DATE_KEY_RE.test(value.trim())) {
    return value.trim();
  }

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isFinite(parsed.getTime())) {
    return formatDateKey(parsed);
  }

  return fallback;
};

export const shiftDateKey = (dateKey, offsetDays) => {
  const date = toDateAtNoon(dateKey);
  date.setDate(date.getDate() + Number(offsetDays || 0));
  return formatDateKey(date);
};

export const formatDailyHeading = (dateKey) => {
  return toDateAtNoon(dateKey).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });
};

export const formatDailyMetaDate = (dateKey) => {
  if (!dateKey) return '未记录来源';
  return toDateAtNoon(dateKey).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
  });
};

export const createEmptyDailyWorkspace = (baseDate) => {
  return {
    currentDate: normalizeDateKey(baseDate),
    entries: {},
    todoPool: [],
  };
};

export const createEmptyDailyEntry = (dateKey) => {
  return {
    date: normalizeDateKey(dateKey),
    items: [],
  };
};

export const getDailyEntry = (dailyWorkspace, dateKey) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace, dateKey);
  const key = normalizeDateKey(dateKey, normalized.currentDate);
  return normalized.entries[key] ?? createEmptyDailyEntry(key);
};

export const normalizeDailyWorkspace = (raw, baseDate) => {
  const fallbackDate = normalizeDateKey(baseDate);
  const currentDate = normalizeDateKey(raw?.currentDate, fallbackDate);
  const rawEntries = raw?.entries && typeof raw.entries === 'object' ? raw.entries : {};

  const entries = Object.fromEntries(
    Object.entries(rawEntries)
      .map(([dateKey, entry]) => {
        const normalizedDate = normalizeDateKey(dateKey, currentDate);
        const items = Array.isArray(entry?.items)
          ? entry.items
              .map((item, index) => normalizeDailyItem(item, normalizedDate, index))
              .filter(Boolean)
          : [];
        return [normalizedDate, { date: normalizedDate, items }];
      }),
  );

  const todoPool = Array.isArray(raw?.todoPool)
    ? raw.todoPool.map((item, index) => normalizeTodoItem(item, index)).filter(Boolean)
    : [];

  return {
    currentDate,
    entries,
    todoPool,
  };
};

const pickLatestByTimestamp = (current, incoming) => {
  if (!current) return incoming;
  if (!incoming) return current;
  const currentUpdatedAt = createTimestamp(current.updatedAt ?? current.createdAt);
  const incomingUpdatedAt = createTimestamp(incoming.updatedAt ?? incoming.createdAt);
  return incomingUpdatedAt >= currentUpdatedAt ? incoming : current;
};

const mergeItemLists = (preferredItems, fallbackItems, sorter) => {
  const mergedById = new Map();
  for (const item of fallbackItems) {
    mergedById.set(item.id, item);
  }
  for (const item of preferredItems) {
    mergedById.set(item.id, pickLatestByTimestamp(mergedById.get(item.id), item));
  }
  return [...mergedById.values()].sort(sorter);
};

export const mergeDailyWorkspaces = (preferred, fallback, baseDate) => {
  const primary = normalizeDailyWorkspace(preferred, baseDate);
  const secondary = normalizeDailyWorkspace(fallback, primary.currentDate);
  const allDateKeys = new Set([
    ...Object.keys(secondary.entries),
    ...Object.keys(primary.entries),
  ]);
  const entries = {};

  for (const dateKey of allDateKeys) {
    const primaryEntry = primary.entries[dateKey];
    const secondaryEntry = secondary.entries[dateKey] ?? createEmptyDailyEntry(dateKey);

    if (primaryEntry) {
      // preferred 已有此日期的 entry：以 preferred 为准，
      // 只用 secondary 补充 preferred 里没有的 id（避免已移走/删除的条目复活）
      const primaryIds = new Set(primaryEntry.items.map((i) => i.id));
      const secondaryOnlyItems = secondaryEntry.items.filter((i) => !primaryIds.has(i.id));
      const merged = mergeItemLists(
        primaryEntry.items,
        secondaryOnlyItems,
        (left, right) => left.createdAt - right.createdAt || left.updatedAt - right.updatedAt,
      );
      entries[dateKey] = { date: dateKey, items: merged };
    } else {
      // preferred 没有此日期：直接用 secondary 的数据（跨 session 恢复）
      entries[dateKey] = { date: dateKey, items: secondaryEntry.items };
    }
  }

  return {
    currentDate: primary.currentDate || secondary.currentDate,
    entries,
    todoPool: mergeItemLists(
      primary.todoPool,
      secondary.todoPool,
      (left, right) => right.updatedAt - left.updatedAt || right.createdAt - left.createdAt,
    ),
  };
};

const buildTodoDedupKey = (text, sourceDate) => {
  return `${normalizeText(text)}::${sourceDate}`;
};

// 纯视图切换：只改 currentDate，不搬运/删除任何条目。
// 用于用户手动翻日期（前后箭头、点某天），避免每次切换都触发破坏性结转。
export const setDailyCurrentDate = (dailyWorkspace, dateKey) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace, dateKey);
  return {
    ...normalized,
    currentDate: normalizeDateKey(dateKey, normalized.currentDate),
  };
};

export const carryOverIncompleteTasks = (dailyWorkspace, targetDateKey) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace, targetDateKey);
  const currentDate = normalizeDateKey(targetDateKey, normalized.currentDate);
  const previousDate = shiftDateKey(currentDate, -1);
  const todoPool = [...normalized.todoPool];
  const todoKeys = new Set(
    todoPool.map((item) => buildTodoDedupKey(item.text, item.sourceDate || '')),
  );
  const entries = {};

  // 收集昨天的 note，复制到今天（去重：今天已有相同文本的不重复添加）
  const previousNotes = (normalized.entries[previousDate]?.items ?? []).filter(
    (item) => item.type === 'note',
  );

  for (const [dateKey, entry] of Object.entries(normalized.entries)) {
    if (dateKey >= currentDate) {
      entries[dateKey] = entry;
      continue;
    }

    const nextItems = [];
    for (const item of entry.items) {
      if (item.type === 'task' && !item.done) {
        const dedupKey = buildTodoDedupKey(item.text, dateKey);
        if (!todoKeys.has(dedupKey)) {
          todoKeys.add(dedupKey);
          todoPool.unshift({
            id: createDailyId('todo'),
            text: item.text,
            sourceDate: dateKey,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
        }
        continue;
      }
      nextItems.push(item);
    }

    // 昨天的 note 从昨天移走（不保留在昨天）
    entries[dateKey] = {
      ...entry,
      items: dateKey === previousDate
        ? nextItems.filter((item) => item.type !== 'note')
        : nextItems,
    };
  }

  // 把昨天的笔记移到今天（幂等：已有相同文本的跳过）
  if (previousNotes.length > 0) {
    const todayEntry = entries[currentDate] ?? createEmptyDailyEntry(currentDate);
    const existingNoteTexts = new Set(
      todayEntry.items.filter((i) => i.type === 'note').map((i) => i.text),
    );
    const notesToMove = previousNotes.filter((n) => !existingNoteTexts.has(n.text));
    if (notesToMove.length > 0) {
      entries[currentDate] = {
        ...todayEntry,
        items: [...todayEntry.items, ...notesToMove],
      };
    }
  }

  return {
    ...normalized,
    currentDate,
    entries,
    todoPool,
  };
};

const updateEntry = (dailyWorkspace, dateKey, updater) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace, dateKey);
  const key = normalizeDateKey(dateKey, normalized.currentDate);
  const currentEntry = normalized.entries[key] ?? createEmptyDailyEntry(key);
  const nextEntry = updater(currentEntry, normalized);

  return {
    ...normalized,
    currentDate: key,
    entries: {
      ...normalized.entries,
      [key]: nextEntry,
    },
  };
};

export const addDailyEntryItem = (dailyWorkspace, dateKey, payload) => {
  const type = DAILY_ITEM_TYPES.has(payload?.type) ? payload.type : 'note';
  const text = normalizeText(payload?.text);
  if (!text) return normalizeDailyWorkspace(dailyWorkspace, dateKey);

  return updateEntry(dailyWorkspace, dateKey, (entry) => ({
    ...entry,
    items: [
      ...entry.items,
      {
        id: createDailyId(type),
        type,
        text,
        done: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ],
  }));
};

export const toggleDailyEntryTaskDone = (dailyWorkspace, dateKey, itemId) => {
  return updateEntry(dailyWorkspace, dateKey, (entry) => ({
    ...entry,
    items: entry.items.map((item) => {
      if (item.id !== itemId || item.type !== 'task') return item;
      return {
        ...item,
        done: !item.done,
        updatedAt: Date.now(),
      };
    }),
  }));
};

export const removeDailyEntryItem = (dailyWorkspace, dateKey, itemId) => {
  return updateEntry(dailyWorkspace, dateKey, (entry) => ({
    ...entry,
    items: entry.items.filter((item) => item.id !== itemId),
  }));
};

export const moveDailyEntryItem = (dailyWorkspace, fromDate, itemId, toDate) => {
  const fromNormalized = normalizeDateKey(fromDate);
  const toNormalized = normalizeDateKey(toDate);
  if (!fromNormalized || !toNormalized || fromNormalized === toNormalized) return normalizeDailyWorkspace(dailyWorkspace);

  const normalized = normalizeDailyWorkspace(dailyWorkspace);
  const fromEntry = normalized.entries?.[fromNormalized];
  const item = fromEntry?.items?.find((i) => i.id === itemId);
  if (!item) return normalized;

  const withoutItem = removeDailyEntryItem(normalized, fromNormalized, itemId);
  return updateEntry(withoutItem, toNormalized, (entry) => ({
    ...entry,
    items: [...entry.items, { ...item, updatedAt: Date.now() }],
  }));
};

export const updateDailyEntryItem = (dailyWorkspace, dateKey, itemId, text) => {
  const nextText = normalizeText(text);
  if (!nextText) return normalizeDailyWorkspace(dailyWorkspace, dateKey);

  return updateEntry(dailyWorkspace, dateKey, (entry) => ({
    ...entry,
    items: entry.items.map((item) => {
      if (item.id !== itemId) return item;
      return {
        ...item,
        text: nextText,
        updatedAt: Date.now(),
      };
    }),
  }));
};

export const addTodoPoolItem = (dailyWorkspace, text, sourceDate = '') => {
  const nextText = normalizeText(text);
  if (!nextText) return normalizeDailyWorkspace(dailyWorkspace);

  const normalized = normalizeDailyWorkspace(dailyWorkspace);
  return {
    ...normalized,
    todoPool: [
      {
        id: createDailyId('todo'),
        text: nextText,
        sourceDate: sourceDate ? normalizeDateKey(sourceDate, '') : '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      ...normalized.todoPool,
    ],
  };
};

export const sendDailyEntryTaskToTodo = (dailyWorkspace, dateKey, itemId) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace, dateKey);
  const key = normalizeDateKey(dateKey, normalized.currentDate);
  const entry = normalized.entries[key] ?? createEmptyDailyEntry(key);
  const target = entry.items.find((item) => item.id === itemId && item.type === 'task' && !item.done);
  if (!target) return normalized;

  const withTodo = addTodoPoolItem(normalized, target.text, key);
  return updateEntry(withTodo, key, (currentEntry) => ({
    ...currentEntry,
    items: currentEntry.items.filter((item) => item.id !== itemId),
  }));
};

export const promoteTodoToDaily = (dailyWorkspace, todoId, dateKey) => {
  const normalized = carryOverIncompleteTasks(dailyWorkspace, dateKey);
  const todo = normalized.todoPool.find((item) => item.id === todoId);
  if (!todo) return normalized;

  const withoutTodo = {
    ...normalized,
    todoPool: normalized.todoPool.filter((item) => item.id !== todoId),
  };

  return addDailyEntryItem(withoutTodo, dateKey, { type: 'task', text: todo.text });
};

export const removeTodoPoolItem = (dailyWorkspace, todoId) => {
  const normalized = normalizeDailyWorkspace(dailyWorkspace);
  return {
    ...normalized,
    todoPool: normalized.todoPool.filter((item) => item.id !== todoId),
  };
};
