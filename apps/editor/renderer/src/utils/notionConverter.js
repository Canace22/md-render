/**
 * Notion blocks ↔ Markdown 互转工具
 *
 * blocksToMarkdown：Notion API 返回的块列表 → Markdown 字符串
 * markdownToBlocks：Markdown 字符串 → 可直接提交给 Notion API 的块列表
 * markdownToNotionPayload：带 frontmatter 的 Markdown → { blocks, properties }
 *   blocks 含目录块 + 元数据 callout + 正文；properties 为数据库页面属性映射
 */

import { parseMarkdownFrontmatter } from '../../../shared/frontmatter.js';

// ─── Notion → Markdown ───────────────────────────────────────────────────────

/**
 * 将 Notion rich_text 数组转为 Markdown 行内格式字符串
 */
function richTextToMd(richTexts = []) {
  return richTexts
    .map((rt) => {
      if (!rt.plain_text) return '';
      let text = rt.plain_text;
      const ann = rt.annotations ?? {};
      // 顺序：code > bold > italic > strikethrough > link
      if (ann.code) return `\`${text}\``;
      if (ann.bold && ann.italic) text = `***${text}***`;
      else if (ann.bold) text = `**${text}**`;
      else if (ann.italic) text = `*${text}*`;
      if (ann.strikethrough) text = `~~${text}~~`;
      if (rt.href) text = `[${text}](${rt.href})`;
      return text;
    })
    .join('');
}

/**
 * 递归将单个块转为 Markdown 行数组
 */
function blockToLines(block, depth, numberedCounters) {
  const indent = '  '.repeat(depth);
  const type = block.type;
  const children = block._children ?? [];

  switch (type) {
    case 'paragraph': {
      const text = richTextToMd(block.paragraph?.rich_text);
      const lines = [indent + text];
      if (children.length) {
        lines.push(blocksToMarkdown(children, depth + 1, {}));
      }
      return lines;
    }

    case 'heading_1':
      return [`# ${richTextToMd(block.heading_1?.rich_text)}`];

    case 'heading_2':
      return [`## ${richTextToMd(block.heading_2?.rich_text)}`];

    case 'heading_3':
      return [`### ${richTextToMd(block.heading_3?.rich_text)}`];

    case 'bulleted_list_item': {
      const text = richTextToMd(block.bulleted_list_item?.rich_text);
      const lines = [`${indent}- ${text}`];
      if (children.length) {
        lines.push(blocksToMarkdown(children, depth + 1, {}));
      }
      return lines;
    }

    case 'numbered_list_item': {
      const key = `d${depth}`;
      numberedCounters[key] = (numberedCounters[key] ?? 0) + 1;
      const text = richTextToMd(block.numbered_list_item?.rich_text);
      const lines = [`${indent}${numberedCounters[key]}. ${text}`];
      if (children.length) {
        lines.push(blocksToMarkdown(children, depth + 1, {}));
      }
      return lines;
    }

    case 'to_do': {
      const checked = block.to_do?.checked ? 'x' : ' ';
      const text = richTextToMd(block.to_do?.rich_text);
      return [`${indent}- [${checked}] ${text}`];
    }

    case 'toggle': {
      const text = richTextToMd(block.toggle?.rich_text);
      const lines = [`${indent}**${text}**`];
      if (children.length) {
        lines.push(blocksToMarkdown(children, depth + 1, {}));
      }
      return lines;
    }

    case 'quote': {
      const text = richTextToMd(block.quote?.rich_text);
      const lines = [`> ${text}`];
      for (const child of children) {
        const childLines = blockToLines(child, 0, {});
        lines.push(...childLines.map((l) => `> ${l}`));
      }
      return lines;
    }

    case 'callout': {
      const emoji = block.callout?.icon?.emoji ? `${block.callout.icon.emoji} ` : '';
      const text = richTextToMd(block.callout?.rich_text);
      const lines = [`> ${emoji}${text}`];
      for (const child of children) {
        const childLines = blockToLines(child, 0, {});
        lines.push(...childLines.map((l) => `> ${l}`));
      }
      return lines;
    }

    case 'code': {
      const lang = block.code?.language === 'plain text' ? '' : (block.code?.language ?? '');
      const text = richTextToMd(block.code?.rich_text);
      return ['```' + lang, text, '```'];
    }

    case 'divider':
      return ['---'];

    case 'image': {
      const url =
        block.image?.file?.url ?? block.image?.external?.url ?? '';
      const caption = richTextToMd(block.image?.caption ?? []);
      return [`![${caption}](${url})`];
    }

    case 'video': {
      const url =
        block.video?.file?.url ?? block.video?.external?.url ?? '';
      return url ? [`[视频](${url})`] : [];
    }

    case 'bookmark':
    case 'link_preview': {
      const url = block[type]?.url ?? '';
      const caption = richTextToMd(block[type]?.caption ?? []);
      return url ? [`[${caption || url}](${url})`] : [];
    }

    case 'table': {
      if (!children.length) return [];
      const rows = children.filter((b) => b.type === 'table_row');
      if (!rows.length) return [];
      const headerCells = rows[0].table_row.cells.map((cell) => richTextToMd(cell));
      const mdRows = [
        `| ${headerCells.join(' | ')} |`,
        `| ${headerCells.map(() => '---').join(' | ')} |`,
        ...rows.slice(1).map((row) => {
          const cells = row.table_row.cells.map((cell) => richTextToMd(cell));
          return `| ${cells.join(' | ')} |`;
        }),
      ];
      return mdRows;
    }

    case 'table_row':
      return []; // 由 table 统一处理

    case 'column_list': {
      const lines = [];
      for (const col of children) {
        const colChildren = col._children ?? [];
        if (colChildren.length) {
          lines.push(blocksToMarkdown(colChildren, depth, {}));
        }
      }
      return lines;
    }

    case 'column':
      return []; // 由 column_list 统一处理

    case 'child_page': {
      const title = block.child_page?.title ?? '无标题';
      const lines = [`${indent}- 📄 ${title}`];
      if (children.length) {
        lines.push(blocksToMarkdown(children, depth + 1, {}));
      }
      return lines;
    }

    case 'child_database': {
      const title = block.child_database?.title ?? '无标题数据库';
      return [`${indent}- 📊 ${title}`];
    }

    case 'link_to_page': {
      const ref = block.link_to_page;
      const id = ref?.page_id ?? ref?.database_id ?? '';
      return id ? [`${indent}[链接页面](https://notion.so/${id.replace(/-/g, '')})`] : [];
    }

    case 'synced_block': {
      // 同步块：渲染其子内容
      if (children.length) {
        return [blocksToMarkdown(children, depth, {})];
      }
      return [];
    }

    case 'equation': {
      const expr = block.equation?.expression ?? '';
      return expr ? [`$$${expr}$$`] : [];
    }

    case 'embed': {
      const url = block.embed?.url ?? '';
      return url ? [`[嵌入](${url})`] : [];
    }

    case 'file': {
      const url = block.file?.file?.url ?? block.file?.external?.url ?? '';
      const caption = richTextToMd(block.file?.caption ?? []);
      return url ? [`[${caption || '文件'}](${url})`] : [];
    }

    case 'pdf': {
      const url = block.pdf?.file?.url ?? block.pdf?.external?.url ?? '';
      return url ? [`[PDF](${url})`] : [];
    }

    case 'table_of_contents':
      return [`${indent}[TOC]`];

    case 'breadcrumb':
      return []; // 面包屑无实际文本内容

    default:
      return [];
  }
}

const LIST_TYPES = new Set([
  'bulleted_list_item',
  'numbered_list_item',
  'to_do',
]);

/**
 * 将 Notion 块数组转为 Markdown 字符串
 */
export function blocksToMarkdown(blocks, depth = 0, numberedCounters = {}) {
  const parts = [];
  let prevType = null;

  for (const block of blocks) {
    // 切换到不同类型时重置有序列表计数器
    if (block.type !== 'numbered_list_item') {
      const key = `d${depth}`;
      numberedCounters[key] = 0;
    }

    const lines = blockToLines(block, depth, numberedCounters);
    if (!lines.length) {
      prevType = block.type;
      continue;
    }

    const text = lines.join('\n');

    // 顶层块之间插入空行（列表项相邻时不插空行）
    if (
      depth === 0 &&
      prevType !== null &&
      !(LIST_TYPES.has(prevType) && LIST_TYPES.has(block.type))
    ) {
      parts.push('');
    }

    parts.push(text);
    prevType = block.type;
  }

  return parts.join('\n');
}

// ─── Markdown → Notion ───────────────────────────────────────────────────────

/**
 * 将内联 Markdown 格式文本解析为 Notion rich_text 对象数组
 * 支持：**bold**、*italic*、~~strikethrough~~、`code`、[text](url)
 */
function parseInline(text) {
  const richTexts = [];
  // 按优先级顺序匹配行内格式
  const regex =
    /(\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|~~([^~]+)~~|`([^`]+)`|\[([^\]]+)\]\(([^)]+)\)|([^*~`\[]+|\[))/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      // ***bold+italic***
      richTexts.push({
        type: 'text',
        text: { content: match[2] },
        annotations: { bold: true, italic: true },
      });
    } else if (match[3]) {
      // **bold**
      richTexts.push({
        type: 'text',
        text: { content: match[3] },
        annotations: { bold: true },
      });
    } else if (match[4]) {
      // *italic*
      richTexts.push({
        type: 'text',
        text: { content: match[4] },
        annotations: { italic: true },
      });
    } else if (match[5]) {
      // ~~strikethrough~~
      richTexts.push({
        type: 'text',
        text: { content: match[5] },
        annotations: { strikethrough: true },
      });
    } else if (match[6]) {
      // `code`
      richTexts.push({
        type: 'text',
        text: { content: match[6] },
        annotations: { code: true },
      });
    } else if (match[7]) {
      // [text](url)
      richTexts.push({
        type: 'text',
        text: { content: match[7], link: { url: match[8] } },
      });
    } else if (match[9]) {
      // 纯文本
      richTexts.push({
        type: 'text',
        text: { content: match[9] },
      });
    }
  }
  if (!richTexts.length && text) {
    richTexts.push({ type: 'text', text: { content: text } });
  }
  return richTexts;
}

/**
 * 将超长文本切分为 Notion 允许的 ≤2000 字符的片段
 */
function longText(text, max = 2000) {
  const pieces = [];
  for (let i = 0; i < text.length; i += max) {
    pieces.push({ type: 'text', text: { content: text.slice(i, i + max) } });
  }
  return pieces.length ? pieces : [{ type: 'text', text: { content: '' } }];
}

function mkHeading(level, text) {
  const t = `heading_${level}`;
  return { type: t, [t]: { rich_text: parseInline(text) } };
}

function mkBlock(type, text, extra = {}) {
  return { type, [type]: { rich_text: parseInline(text), ...extra } };
}

/**
 * 将 Markdown 字符串转为 Notion blocks 数组
 */
export function markdownToBlocks(markdown) {
  if (!markdown?.trim()) return [];

  const lines = markdown.split('\n');
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 代码围栏
    if (line.startsWith('```')) {
      const lang = line.slice(3).trim() || 'plain text';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      blocks.push({
        type: 'code',
        code: {
          language: lang,
          rich_text: longText(codeLines.join('\n')),
        },
      });
      i++;
      continue;
    }

    // 标题（H1–H4 全归入 H3）
    if (/^#{4,} /.test(line)) {
      blocks.push(mkHeading(3, line.replace(/^#+\s+/, '')));
    } else if (line.startsWith('### ')) {
      blocks.push(mkHeading(3, line.slice(4)));
    } else if (line.startsWith('## ')) {
      blocks.push(mkHeading(2, line.slice(3)));
    } else if (line.startsWith('# ')) {
      blocks.push(mkHeading(1, line.slice(2)));
    }

    // 分隔线
    else if (/^[-*_]{3,}\s*$/.test(line.trim())) {
      blocks.push({ type: 'divider', divider: {} });
    }

    // 引用
    else if (line.startsWith('> ')) {
      blocks.push(mkBlock('quote', line.slice(2)));
    }

    // 待办事项
    else if (/^[-*+] \[[x ]\] /i.test(line)) {
      const checked = line[3].toLowerCase() === 'x';
      const text = line.slice(6);
      blocks.push({
        type: 'to_do',
        to_do: { checked, rich_text: parseInline(text) },
      });
    }

    // 无序列表
    else if (/^[-*+] /.test(line)) {
      blocks.push(mkBlock('bulleted_list_item', line.slice(2)));
    }

    // 有序列表
    else if (/^\d+\. /.test(line)) {
      const text = line.replace(/^\d+\.\s+/, '');
      blocks.push(mkBlock('numbered_list_item', text));
    }

    // 图片
    else if (/^!\[[^\]]*\]\([^)]+\)/.test(line)) {
      const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
      blocks.push({
        type: 'image',
        image: {
          type: 'external',
          external: { url: m[2] },
          caption: m[1] ? [{ type: 'text', text: { content: m[1] } }] : [],
        },
      });
    }

    // 表格行（简单处理：转为段落，保留 | 分隔文本）
    else if (/^\|.+\|/.test(line) && !/^[|\s:-]+$/.test(line)) {
      const cells = line
        .replace(/^\||\|$/g, '')
        .split('|')
        .map((c) => c.trim());
      blocks.push(mkBlock('paragraph', cells.join('  ·  ')));
    }

    // 跳过 Markdown 表格分隔行（如 | --- | --- |）
    else if (/^[|\s:-]+$/.test(line.trim()) && line.includes('|')) {
      i++;
      continue;
    }

    // 空行 → 跳过：Notion 块自带间距，无需空段落（否则会产生大量空节点）
    else if (!line.trim()) {
      i++;
      continue;
    }

    // 普通段落
    else {
      blocks.push(mkBlock('paragraph', line));
    }

    i++;
  }

  // 去掉尾部多余的空段落
  while (
    blocks.length > 0 &&
    blocks[blocks.length - 1].type === 'paragraph' &&
    blocks[blocks.length - 1].paragraph.rich_text.length === 0
  ) {
    blocks.pop();
  }

  return blocks;
}

// ─── frontmatter → 目录 + 元数据 ──────────────────────────────────────────────

// frontmatter 字段 → 元数据 callout 里展示用的中文标签
const META_LABELS = {
  title: '标题',
  author: '作者',
  published: '发布',
  created: '创建',
  source: '来源',
  description: '摘要',
  tags: '标签',
  cover: '封面',
};
// callout 里展示的字段顺序（title 单独作为页面标题，不重复进 callout）
const META_DISPLAY_ORDER = ['author', 'published', 'created', 'source', 'description', 'tags'];

const asText = (value) => (Array.isArray(value) ? value.join('、') : String(value ?? '')).trim();

/**
 * 把 frontmatter 渲染成一个 callout 块，作为页面正文顶部的元数据卡片。
 * 没有任何可展示字段时返回 null。
 */
function buildMetadataCallout(frontmatter) {
  const lines = META_DISPLAY_ORDER.map((key) => {
    const text = asText(frontmatter[key]);
    if (!text) return null;
    return `${META_LABELS[key]}：${text}`;
  }).filter(Boolean);

  if (!lines.length) return null;

  // 用软换行（\n）把多字段塞进一个 callout 的 rich_text
  return {
    type: 'callout',
    callout: {
      icon: { type: 'emoji', emoji: '🗂️' },
      rich_text: [{ type: 'text', text: { content: lines.join('\n') } }],
    },
  };
}

/**
 * 把 frontmatter 映射为 Notion 数据库页面的 properties。
 * 只映射类型明确、低风险的字段；标题列由调用方按数据库实际标题属性名注入。
 * 返回不含 title 的属性对象（title 仍由 service 层处理）。
 */
function buildPageProperties(frontmatter) {
  const props = {};

  const tags = Array.isArray(frontmatter.tags)
    ? frontmatter.tags
    : asText(frontmatter.tags) ? [asText(frontmatter.tags)] : [];
  if (tags.length) {
    props.Tags = { multi_select: tags.map((name) => ({ name: String(name).slice(0, 100) })) };
  }

  const author = asText(frontmatter.author);
  if (author) props.Author = { rich_text: parseInline(author) };

  const source = asText(frontmatter.source);
  if (source) props.Source = { url: source };

  const description = asText(frontmatter.description);
  if (description) props.Description = { rich_text: longText(description) };

  for (const key of ['published', 'created']) {
    const text = asText(frontmatter[key]);
    if (/^\d{4}-\d{2}-\d{2}/.test(text)) {
      const label = key === 'published' ? 'Published' : 'Created';
      props[label] = { date: { start: text.slice(0, 10) } };
    }
  }

  return props;
}

/**
 * 带 frontmatter 的 Markdown → Notion 推送负载。
 *
 * @param {string} markdown 原始 Markdown（可含 --- frontmatter ---）
 * @param {object} [options]
 * @param {boolean} [options.withToc=true] 是否在正文顶部插入 Notion 原生目录块
 * @returns {{ blocks: Array, properties: object, title: string|null }}
 *   blocks: [目录块?, 元数据 callout?, ...正文块]
 *   properties: 数据库页面属性（不含标题列）
 *   title: frontmatter.title（无则 null，调用方可回退到文件名）
 */
export function markdownToNotionPayload(markdown, { withToc = true } = {}) {
  const { frontmatter, content } = parseMarkdownFrontmatter(markdown ?? '');
  const fm = frontmatter ?? {};

  const blocks = [];
  if (withToc) {
    blocks.push({ type: 'table_of_contents', table_of_contents: {} });
  }
  const callout = buildMetadataCallout(fm);
  if (callout) blocks.push(callout);

  blocks.push(...markdownToBlocks(content));

  return {
    blocks,
    properties: buildPageProperties(fm),
    title: asText(fm.title) || null,
  };
}
