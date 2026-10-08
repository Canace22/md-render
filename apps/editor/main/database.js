import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');
import path from 'path';
import { app } from 'electron';
import { EDITOR_STATE_KEYS } from '../shared/stateKeys.js';
import {
  VERSION_LIST_LIMIT,
  VERSION_PRUNE_INTERVAL_MS,
  VERSION_RETENTION_MS,
  VERSION_SNAPSHOT_INTERVAL_MS,
} from '../shared/versionHistory.js';

let db = null;

const DOCUMENT_UPDATE_COLUMNS = Object.freeze([
  'parent_id', 'type', 'name', 'content', 'node_type', 'summary', 'aliases',
  'tags', 'related_ids', 'created_at', 'updated_at', 'disk_path', 'url',
]);

const DOCUMENT_FTS_UPDATE_TRIGGER = `
  CREATE TRIGGER documents_au
  AFTER UPDATE OF name, content, summary, aliases, tags ON documents
  WHEN old.name IS NOT new.name OR old.content IS NOT new.content
    OR old.summary IS NOT new.summary OR old.aliases IS NOT new.aliases
    OR old.tags IS NOT new.tags
  BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, name, content, summary, aliases, tags)
    VALUES ('delete', old.rowid, old.name, old.content, old.summary, old.aliases, old.tags);
    INSERT INTO documents_fts(rowid, name, content, summary, aliases, tags)
    VALUES (new.rowid, new.name, new.content, new.summary, new.aliases, new.tags);
  END;
`;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS app_state (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS documents (
    id          TEXT PRIMARY KEY,
    parent_id   TEXT,
    type        TEXT NOT NULL DEFAULT 'file',
    name        TEXT NOT NULL,
    content     TEXT,
    node_type   TEXT DEFAULT 'document',
    summary     TEXT,
    aliases     TEXT,
    tags        TEXT,
    related_ids TEXT,
    created_at  INTEGER,
    updated_at  INTEGER,
    disk_path   TEXT,
    url         TEXT
  );

  CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    name, content, summary, aliases, tags,
    content=documents,
    content_rowid=rowid,
    tokenize='unicode61'
  );

  CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, name, content, summary, aliases, tags)
    VALUES (new.rowid, new.name, new.content, new.summary, new.aliases, new.tags);
  END;

  CREATE TRIGGER IF NOT EXISTS documents_ad AFTER DELETE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, name, content, summary, aliases, tags)
    VALUES ('delete', old.rowid, old.name, old.content, old.summary, old.aliases, old.tags);
  END;

  CREATE TABLE IF NOT EXISTS links (
    source_id TEXT NOT NULL,
    target_id TEXT NOT NULL,
    context   TEXT,
    PRIMARY KEY (source_id, target_id)
  );

  CREATE TABLE IF NOT EXISTS versions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    document_id TEXT NOT NULL,
    content     TEXT,
    created_at  INTEGER,
    FOREIGN KEY (document_id) REFERENCES documents(id)
  );

  CREATE INDEX IF NOT EXISTS idx_versions_doc_time ON versions(document_id, created_at);
`;

export function initDatabase() {
  if (db) return db;
  const dbPath = path.join(app.getPath('userData'), 'knowledge.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  // Migration: add disk_path column if it doesn't exist (for DBs created before P0.2)
  try { db.exec('ALTER TABLE documents ADD COLUMN disk_path TEXT'); } catch { /* already exists */ }
  // Migration: add url column for bookmark nodes
  try { db.exec('ALTER TABLE documents ADD COLUMN url TEXT'); } catch { /* already exists */ }
  // 升级老库的更新触发器：元数据或相同内容的保存不应反复重建全文索引。
  db.transaction(() => {
    db.exec('DROP TRIGGER IF EXISTS documents_au');
    db.exec(DOCUMENT_FTS_UPDATE_TRIGGER);
  })();
  console.log('[db] initialized at', dbPath);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
}

export function getDatabaseDiagnostics() {
  if (!db) {
    return {
      ok: false,
      initialized: false,
      readable: false,
      quickCheck: null,
      counts: null,
      error: {
        code: 'DB_NOT_INITIALIZED',
        message: '数据库尚未初始化。',
      },
    };
  }

  try {
    // 健康快照运行在 Electron 主线程，不能执行会扫描整库的 quick_check / COUNT(*)。
    // schema_version 只读取数据库头，足以确认当前连接仍可读，耗时不随数据库体积增长。
    const schemaVersion = Number(db.pragma('schema_version', { simple: true }));
    const readable = Number.isFinite(schemaVersion);

    return {
      ok: readable,
      initialized: true,
      readable,
      schemaVersion,
      quickCheck: null,
      counts: null,
      error: readable ? null : {
        code: 'DB_READ_CHECK_FAILED',
        message: '数据库轻量可读性检查未通过。',
      },
    };
  } catch (error) {
    return {
      ok: false,
      initialized: true,
      readable: false,
      quickCheck: null,
      counts: null,
      error: {
        code: 'DB_DIAGNOSTICS_FAILED',
        message: error?.message || String(error),
      },
    };
  }
}

// ── app_state helpers ─────────────────────────────────────────────────────────

function getState(key) {
  const row = getDb().prepare('SELECT value FROM app_state WHERE key = ?').get(key);
  return row ? row.value : null;
}

function setState(key, value) {
  getDb().prepare('INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)').run(key, value);
}

export function isMigratedFromLocalStorage() {
  return getState('migrated_from_localstorage') === 'done';
}

export function markMigratedFromLocalStorage() {
  setState('migrated_from_localstorage', 'done');
}

// ── editor state ─────────────────────────────────────────────────────────────

export const STATE_KEYS = EDITOR_STATE_KEYS;

export function loadEditorState() {
  const result = {};
  for (const key of STATE_KEYS) {
    const v = getState(key);
    if (v != null) result[key] = v;
  }
  return result;
}

export function saveEditorState(stateMap) {
  const insert = getDb().prepare(
    'INSERT OR REPLACE INTO app_state (key, value) VALUES (?, ?)',
  );
  const saveAll = getDb().transaction((entries) => {
    for (const [key, value] of entries) {
      if (value != null && STATE_KEYS.includes(key)) insert.run(key, String(value));
    }
  });
  saveAll(Object.entries(stateMap));
}

// ── document sync (for FTS) ───────────────────────────────────────────────────

function flattenWorkspace(node, parentId = null, result = []) {
  if (!node) return result;
  const id = node.id;
  if (id && id !== 'root') {
    const diskPath = (node.projectRootPath && node.relativePath)
      ? path.join(node.projectRootPath, node.relativePath)
      : null;
    result.push({
      id,
      parent_id: parentId === 'root' ? null : parentId,
      type: node.type ?? 'file',
      name: node.name ?? '',
      content: node.content ?? null,
      node_type: node.nodeType ?? 'document',
      summary: node.summary ?? null,
      aliases: node.aliases?.length ? JSON.stringify(node.aliases) : null,
      tags: node.tags?.length ? JSON.stringify(node.tags) : null,
      related_ids: node.relatedIds?.length ? JSON.stringify(node.relatedIds) : null,
      created_at: node.createdAt ?? null,
      updated_at: node.updatedAt ?? null,
      disk_path: diskPath,
      url: node.url ?? null,
    });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) flattenWorkspace(child, id, result);
  }
  return result;
}

function buildNotInClause(ids, columnName) {
  if (!ids.length) return { sql: '', params: [] };
  const placeholders = ids.map(() => '?').join(', ');
  return {
    sql: `${columnName} NOT IN (${placeholders})`,
    params: ids,
  };
}

export function syncDocuments(workspace) {
  const docs = flattenWorkspace(workspace);
  const upsert = getDb().prepare(`
    INSERT INTO documents
      (id, parent_id, type, name, content, node_type, summary, aliases, tags, related_ids, created_at, updated_at, disk_path, url)
    VALUES
      (@id, @parent_id, @type, @name, @content, @node_type, @summary, @aliases, @tags, @related_ids, @created_at, @updated_at, @disk_path, @url)
    ON CONFLICT(id) DO UPDATE SET
      ${DOCUMENT_UPDATE_COLUMNS.map((column) => `${column} = excluded.${column}`).join(', ')}
    WHERE ${DOCUMENT_UPDATE_COLUMNS.map((column) => `documents.${column} IS NOT excluded.${column}`).join(' OR ')}
  `);
  const deleteAllLinks = getDb().prepare('DELETE FROM links');
  const deleteAllVersions = getDb().prepare('DELETE FROM versions');
  const deleteAllDocuments = getDb().prepare('DELETE FROM documents');

  const syncAll = getDb().transaction((rows) => {
    for (const row of rows) upsert.run(row);

    const docIds = rows.map((row) => row.id).filter(Boolean);
    if (!docIds.length) {
      deleteAllLinks.run();
      deleteAllVersions.run();
      deleteAllDocuments.run();
      return;
    }

    const staleDocumentClause = buildNotInClause(docIds, 'id');
    const staleVersionClause = buildNotInClause(docIds, 'document_id');
    const staleLinkSourceClause = buildNotInClause(docIds, 'source_id');
    const staleLinkTargetClause = buildNotInClause(docIds, 'target_id');

    getDb().prepare(
      `DELETE FROM links WHERE ${staleLinkSourceClause.sql} OR ${staleLinkTargetClause.sql}`,
    ).run(...staleLinkSourceClause.params, ...staleLinkTargetClause.params);
    getDb().prepare(`DELETE FROM versions WHERE ${staleVersionClause.sql}`)
      .run(...staleVersionClause.params);
    getDb().prepare(`DELETE FROM documents WHERE ${staleDocumentClause.sql}`)
      .run(...staleDocumentClause.params);
  });
  syncAll(docs);
}

export function updateDocumentDiskPaths(diskPaths) {
  const update = getDb().prepare('UPDATE documents SET disk_path = ? WHERE id = ? AND disk_path IS NOT ?');
  const updateAll = getDb().transaction((entries) => {
    for (const [id, diskPath] of entries) update.run(diskPath, id, diskPath);
  });
  updateAll(Object.entries(diskPaths));
}

// ── wikilink / bidirectional links ───────────────────────────────────────────

const WIKILINK_RE = /\[\[([^\]|]{1,200})(?:\|[^\]]{0,200})?\]\]/g;

function extractWikilinks(content) {
  if (!content) return [];
  const names = new Set();
  WIKILINK_RE.lastIndex = 0;
  let match;
  while ((match = WIKILINK_RE.exec(content)) !== null) {
    const name = match[1].trim();
    if (name) names.add(name);
  }
  return [...names];
}

export function syncAllLinks(workspace) {
  const docs = flattenWorkspace(workspace);
  const nameToId = new Map();
  for (const d of docs) {
    nameToId.set(d.name, d.id);
    if (d.name.endsWith('.md')) nameToId.set(d.name.slice(0, -3), d.id);
  }

  const deleteLinks = getDb().prepare('DELETE FROM links WHERE source_id = ?');
  const insertLink = getDb().prepare(
    'INSERT OR IGNORE INTO links (source_id, target_id) VALUES (?, ?)',
  );

  const syncAll = getDb().transaction(() => {
    for (const doc of docs) {
      if (doc.type !== 'file' || !doc.content) continue;
      deleteLinks.run(doc.id);
      const names = extractWikilinks(doc.content);
      for (const name of names) {
        const targetId = nameToId.get(name) ?? nameToId.get(`${name}.md`);
        if (targetId && targetId !== doc.id) insertLink.run(doc.id, targetId);
      }
    }
  });
  syncAll();
}

export function getBacklinks(docId) {
  if (!docId) return [];
  return getDb().prepare(`
    SELECT d.id, d.name, d.type
    FROM links l
    JOIN documents d ON d.id = l.source_id
    WHERE l.target_id = ?
    ORDER BY d.name
  `).all(docId);
}

function parseIdList(value) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

// ── version history ───────────────────────────────────────────────────────────
// 参照 Obsidian「文件恢复」：正文被覆盖前，若距该文档上个快照已满间隔，就把旧正文存一份；
// 快照只保留最近 N 天。存的是「被覆盖前」的内容，所以停笔很久后的第一次编辑也能找回原稿。

let lastVersionPruneAt = 0;

/** 纯函数：旧正文是否需要存成新快照 */
export function shouldSaveVersion(previousContent, lastVersion, now) {
  if (!previousContent) return false;
  if (!lastVersion) return true;
  if (lastVersion.content === previousContent) return false;
  return now - (lastVersion.created_at ?? 0) >= VERSION_SNAPSHOT_INTERVAL_MS;
}

function pruneOldVersions(now) {
  if (now - lastVersionPruneAt < VERSION_PRUNE_INTERVAL_MS) return;
  lastVersionPruneAt = now;
  getDb().prepare('DELETE FROM versions WHERE created_at < ?').run(now - VERSION_RETENTION_MS);
}

/** 必须在 syncDocuments 之前调用：此时 documents 里还是旧正文 */
export function saveVersions(workspace, now = Date.now()) {
  const docs = flattenWorkspace(workspace);
  const prevDoc = getDb().prepare('SELECT content FROM documents WHERE id = ?');
  const lastVer = getDb().prepare(
    'SELECT content, created_at FROM versions WHERE document_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
  );
  const insert = getDb().prepare(
    'INSERT INTO versions (document_id, content, created_at) VALUES (?, ?, ?)',
  );

  getDb().transaction(() => {
    for (const doc of docs) {
      if (doc.type !== 'file') continue;
      const prev = prevDoc.get(doc.id);
      if (!prev || prev.content === doc.content) continue;
      if (!shouldSaveVersion(prev.content, lastVer.get(doc.id), now)) continue;
      insert.run(doc.id, prev.content, now);
    }
    pruneOldVersions(now);
  })();
}

/** 手动存一份快照（恢复旧版本前先存当前内容，保证可反悔）。与最新快照相同则跳过 */
export function saveVersionSnapshot(docId, content, now = Date.now()) {
  if (!docId || !content) return { saved: false };
  const last = getDb().prepare(
    'SELECT content FROM versions WHERE document_id = ? ORDER BY created_at DESC, id DESC LIMIT 1',
  ).get(docId);
  if (last?.content === content) return { saved: false };
  getDb().prepare('INSERT INTO versions (document_id, content, created_at) VALUES (?, ?, ?)')
    .run(docId, content, now);
  return { saved: true };
}

export function getVersions(docId) {
  if (!docId) return [];
  return getDb().prepare(`
    SELECT id, created_at, length(content) AS char_count
    FROM versions
    WHERE document_id = ?
    ORDER BY created_at DESC, id DESC
    LIMIT ?
  `).all(docId, VERSION_LIST_LIMIT);
}

export function getVersionById(versionId) {
  if (!versionId) return null;
  return getDb().prepare(
    'SELECT id, content, created_at FROM versions WHERE id = ?',
  ).get(versionId);
}

// ── graph data ────────────────────────────────────────────────────────────────

export function getGraphData() {
  const rawNodes = getDb().prepare(
    "SELECT id, name, type, node_type, related_ids FROM documents WHERE type = 'file' LIMIT 1000",
  ).all();
  const nodeIds = new Set(rawNodes.map((node) => node.id));
  const nodes = rawNodes.map(({ related_ids, ...node }) => node);
  const seenEdges = new Set();
  const edges = [];

  const pushEdge = (sourceId, targetId) => {
    if (!sourceId || !targetId || sourceId === targetId) return;
    if (!nodeIds.has(sourceId) || !nodeIds.has(targetId)) return;
    const edgeKey = `${sourceId}::${targetId}`;
    if (seenEdges.has(edgeKey)) return;
    seenEdges.add(edgeKey);
    edges.push({ source_id: sourceId, target_id: targetId });
  };

  for (const node of rawNodes) {
    for (const targetId of parseIdList(node.related_ids)) {
      pushEdge(node.id, targetId);
    }
  }

  const linkRows = getDb().prepare('SELECT source_id, target_id FROM links').all();
  for (const edge of linkRows) {
    pushEdge(edge.source_id, edge.target_id);
  }
  return { nodes, edges };
}

/** 在线备份（WAL 模式下也一致），迁移前用 */
export function backupDatabase(destPath) {
  return getDb().backup(destPath);
}

/** 从当前工作区（文件为真相后就是磁盘内容）重建全文索引和链接 */
export function rebuildIndexFromWorkspace(workspace) {
  syncDocuments(workspace);
  syncAllLinks(workspace);
}

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
