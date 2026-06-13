/**
 * Notion 数据库「增量」拉取到本地磁盘目录
 *
 * 与 notionBatchSync.batchPull 的区别：
 *   - batchPull：每次全量拉，生成随机 id 的内存树，下次=重拉。
 *   - 本模块：落到固定磁盘目录，维护一份 .notion-sync.json 索引
 *     （pageId → { relativePath, lastEditedTime }）。下次拉取时按
 *     last_edited_time 比对，只对「变了的页面」重新 fetchBlocks，没变的跳过。
 *
 * 设计：所有副作用（读写磁盘、调 Notion API）都通过参数注入，
 * 本模块只做编排，纯逻辑可单测。
 *
 * 索引文件相对路径：<dbDirRelative>/.notion-sync.json
 * 页面文件相对路径：<dbDirRelative>/<标题清洗>.md
 */

const INDEX_FILE_NAME = '.notion-sync.json';
const INDEX_VERSION = 1;

/** 文件名/目录名清洗：去掉非法字符，空则回退「无标题」 */
function sanitizeBaseName(title) {
  const base = String(title ?? '无标题')
    .trim()
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\.(md|markdown)$/i, '')
    .trim();
  return base || '无标题';
}

/** 在已用名集合内生成不冲突的 .md 文件名 */
function uniqueMarkdownName(title, usedNames) {
  const base = sanitizeBaseName(title);
  let name = `${base}.md`;
  let i = 1;
  while (usedNames.has(name.toLowerCase())) {
    name = `${base} ${i}.md`;
    i += 1;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

/** 拼接数据库子目录下的相对路径，统一用 / 分隔 */
function joinRelative(dirRelative, name) {
  return dirRelative ? `${dirRelative.replace(/\/+$/, '')}/${name}` : name;
}

/**
 * 解析索引文件内容（JSON 字符串）为 { pageId → entry } 映射。
 * 容错：内容缺失/损坏时返回空映射，等价于首次拉取。
 */
export function parseIndex(rawJson) {
  if (!rawJson) return {};
  try {
    const parsed = JSON.parse(rawJson);
    const pages = parsed?.pages;
    return pages && typeof pages === 'object' ? pages : {};
  } catch {
    return {};
  }
}

/** 把页面索引序列化成要写盘的 JSON 字符串 */
export function serializeIndex(pages) {
  return `${JSON.stringify({ version: INDEX_VERSION, pages }, null, 2)}\n`;
}

/**
 * 纯函数：对比远端页面列表与本地索引，算出每个页面的动作。
 *
 * @param {Array<{id,title,lastEditedTime}>} remotePages 远端页面（已抽好标题和时间）
 * @param {Record<string,{relativePath,lastEditedTime}>} index 本地索引
 * @returns {{ plans: Array, deletedPageIds: string[] }}
 *   plans 每项：{ pageId, title, action: 'create'|'update'|'skip', relativePath? }
 *   deletedPageIds：索引里有、但远端这次没出现的页面（远端已删）
 */
export function diffPages(remotePages, index) {
  const plans = [];
  const seen = new Set();

  for (const page of remotePages) {
    seen.add(page.id);
    const known = index[page.id];
    if (!known) {
      plans.push({ pageId: page.id, title: page.title, action: 'create' });
    } else if (known.lastEditedTime !== page.lastEditedTime) {
      plans.push({
        pageId: page.id,
        title: page.title,
        action: 'update',
        relativePath: known.relativePath,
      });
    } else {
      plans.push({
        pageId: page.id,
        title: page.title,
        action: 'skip',
        relativePath: known.relativePath,
      });
    }
  }

  const deletedPageIds = Object.keys(index).filter((id) => !seen.has(id));
  return { plans, deletedPageIds };
}

/**
 * 增量拉取主流程。
 *
 * @param {object} args
 * @param {string} args.databaseId         Notion 数据库 ID
 * @param {string} args.token              Notion token
 * @param {string} args.dbDirRelative      数据库落盘子目录（相对项目根，如 'Projects/notion-sync/我的库'）
 * @param {object} args.io                 磁盘 IO 适配器
 *   io.readFile(relativePath) → Promise<string|null>   读不到返回 null（不抛）
 *   io.writeFile(relativePath, content) → Promise<void> 自动建目录、覆写
 *   io.ensureDir(relativePath) → Promise<void>
 * @param {object} args.notion             Notion 适配器
 *   notion.queryPages(databaseId) → Promise<Array<page原始对象，含 id/last_edited_time/properties>>
 *   notion.fetchPageMarkdown(pageId) → Promise<string>  拉 blocks 并转 md
 * @param {Function} [args.onProgress]     (current,total,title)
 * @returns {{ created, updated, skipped, deleted, failed }}
 */
export async function incrementalPull({
  databaseId,
  dbDirRelative,
  io,
  notion,
  onProgress,
}) {
  await io.ensureDir(dbDirRelative);

  const indexPath = joinRelative(dbDirRelative, INDEX_FILE_NAME);
  const index = parseIndex(await io.readFile(indexPath));

  const rawPages = await notion.queryPages(databaseId);
  const remotePages = rawPages.map((page) => ({
    id: page.id,
    title: notion.extractTitle(page),
    lastEditedTime: page.last_edited_time ?? '',
  }));

  const { plans, deletedPageIds } = diffPages(remotePages, index);

  // 用已存在的文件名（来自旧索引）初始化占用集合，避免新建时撞名
  const usedNames = new Set(
    Object.values(index)
      .map((e) => e.relativePath?.split('/').pop()?.toLowerCase())
      .filter(Boolean),
  );

  const nextIndex = { ...index };
  const failed = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;
  let done = 0;

  for (const plan of plans) {
    onProgress?.(done, plans.length, plan.title);
    try {
      if (plan.action === 'skip') {
        skipped += 1;
      } else {
        const md = await notion.fetchPageMarkdown(plan.pageId);
        let relativePath = plan.relativePath;
        if (plan.action === 'create') {
          relativePath = joinRelative(dbDirRelative, uniqueMarkdownName(plan.title, usedNames));
          created += 1;
        } else {
          updated += 1;
        }
        await io.writeFile(relativePath, md);
        nextIndex[plan.pageId] = {
          relativePath,
          lastEditedTime: remotePages.find((p) => p.id === plan.pageId)?.lastEditedTime ?? '',
          title: plan.title,
        };
      }
    } catch (err) {
      failed.push({ title: plan.title, error: err.message });
    }
    done += 1;
  }

  // 远端已删除：标记不删本地文件，仅在索引里打 deletedRemote 标
  for (const pageId of deletedPageIds) {
    nextIndex[pageId] = { ...nextIndex[pageId], deletedRemote: true };
  }

  await io.writeFile(indexPath, serializeIndex(nextIndex));
  onProgress?.(plans.length, plans.length, '完成');

  return {
    created,
    updated,
    skipped,
    deleted: deletedPageIds.length,
    failed,
    dbDirRelative,
  };
}
