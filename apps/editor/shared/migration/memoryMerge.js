/**
 * 合并多份「编辑部记忆」副本：按小节收集条目，同一条（去空白后相同）只留一次，
 * 副本里独有的条目和小节都保留。结果写到内容库 .agent/memory/editorial.md。纯函数。
 */

export const EDITORIAL_MEMORY_PATH = '.agent/memory/editorial.md';

const SECTION_RE = /^##\s+(.+?)\s*$/;
const ENTRY_RE = /^\s*-\s+/;
const TITLE_RE = /^#\s/;

const normalizeEntry = (lines) => lines.join('\n').replace(/\s+/g, ' ').trim();

/** 一份记忆 → { preamble: string[], sections: Map<标题, string[][]> } */
const parseMemory = (content) => {
  const preamble = [];
  const sections = new Map();
  let current = null;
  let entry = null;
  String(content ?? '').replace(/\r\n/g, '\n').split('\n').forEach((line) => {
    const heading = line.match(SECTION_RE);
    if (heading) {
      current = heading[1];
      if (!sections.has(current)) sections.set(current, []);
      entry = null;
      return;
    }
    if (!current) {
      preamble.push(line);
      return;
    }
    if (ENTRY_RE.test(line)) {
      entry = [line];
      sections.get(current).push(entry);
    } else if (entry && line.trim()) {
      entry.push(line);
    } else if (!line.trim()) {
      entry = null;
    } else {
      // 小节里的普通段落也当一条，避免丢内容
      entry = [line];
      sections.get(current).push(entry);
    }
  });
  return { preamble, sections };
};

/**
 * @param {string[]} contents 各副本正文，第一份为主（它的开头说明和小节顺序优先）
 * @returns {{ content: string, entryCount: number, duplicateCount: number }}
 */
export const mergeEditorialMemories = (contents = []) => {
  const parsed = contents.filter((text) => String(text ?? '').trim()).map(parseMemory);
  if (!parsed.length) return { content: '', entryCount: 0, duplicateCount: 0 };

  const order = [];
  const merged = new Map();
  let duplicateCount = 0;
  parsed.forEach(({ sections }) => {
    sections.forEach((entries, title) => {
      if (!merged.has(title)) {
        merged.set(title, { seen: new Set(), entries: [] });
        order.push(title);
      }
      const bucket = merged.get(title);
      entries.forEach((lines) => {
        const key = normalizeEntry(lines);
        if (bucket.seen.has(key)) {
          duplicateCount += 1;
          return;
        }
        bucket.seen.add(key);
        bucket.entries.push(lines);
      });
    });
  });

  const preamble = parsed[0].preamble.join('\n').trim();
  const body = order.map((title) => [
    `## ${title}`,
    '',
    ...merged.get(title).entries.flat(),
  ].join('\n').trimEnd());
  const entryCount = order.reduce((sum, title) => sum + merged.get(title).entries.length, 0);
  const content = `${[preamble, ...body].filter(Boolean).join('\n\n')}\n`;
  return { content, entryCount, duplicateCount };
};

export const hasMemoryTitle = (content) => String(content ?? '').split('\n').some((line) => TITLE_RE.test(line));
