import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import { EDITOR_STATE_KEYS } from '../shared/stateKeys.js';

let db = null;

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

  CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, name, content, summary, aliases, tags)
    VALUES ('delete', old.rowid, old.name, old.content, old.summary, old.aliases, old.tags);
    INSERT INTO documents_fts(rowid, name, content, summary, aliases, tags)
    VALUES (new.rowid, new.name, new.content, new.summary, new.aliases, new.tags);
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
      quickCheck: null,
      counts: null,
      error: {
        code: 'DB_NOT_INITIALIZED',
        message: '数据库尚未初始化。',
      },
    };
  }

  try {
    const quickCheck = String(db.pragma('quick_check', { simple: true }) ?? '');
    const counts = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM app_state) AS appState,
        (SELECT COUNT(*) FROM documents) AS documents,
        (SELECT COUNT(*) FROM links) AS links,
        (SELECT COUNT(*) FROM versions) AS versions
    `).get();
    const ok = quickCheck.toLowerCase() === 'ok';

    return {
      ok,
      initialized: true,
      quickCheck,
      counts,
      error: ok
        ? null
        : {
          code: 'DB_QUICK_CHECK_FAILED',
          message: '数据库快速检查未通过。',
        },
    };
  } catch (error) {
    return {
      ok: false,
      initialized: true,
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
    INSERT OR REPLACE INTO documents
      (id, parent_id, type, name, content, node_type, summary, aliases, tags, related_ids, created_at, updated_at, disk_path, url)
    VALUES
      (@id, @parent_id, @type, @name, @content, @node_type, @summary, @aliases, @tags, @related_ids, @created_at, @updated_at, @disk_path, @url)
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
  const update = getDb().prepare('UPDATE documents SET disk_path = ? WHERE id = ?');
  const updateAll = getDb().transaction((entries) => {
    for (const [id, diskPath] of entries) update.run(diskPath, id);
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

const FIVE_MIN_MS = 5 * 60 * 1000;
const MIN_DIFF_CHARS = 50;

export function saveVersions(workspace) {
  const docs = flattenWorkspace(workspace);
  const now = Date.now();

  const lastVer = getDb().prepare(
    'SELECT content, created_at FROM versions WHERE document_id = ? ORDER BY created_at DESC LIMIT 1',
  );
  const insert = getDb().prepare(
    'INSERT INTO versions (document_id, content, created_at) VALUES (?, ?, ?)',
  );

  const saveAll = getDb().transaction(() => {
    for (const doc of docs) {
      if (doc.type !== 'file' || !doc.content) continue;
      const last = lastVer.get(doc.id);
      if (!last) {
        insert.run(doc.id, doc.content, now);
        continue;
      }
      if (last.content === doc.content) continue;
      const elapsed = now - (last.created_at ?? 0);
      const diffLen = Math.abs(doc.content.length - (last.content?.length ?? 0));
      if (elapsed >= FIVE_MIN_MS && diffLen >= MIN_DIFF_CHARS) {
        insert.run(doc.id, doc.content, now);
      }
    }
  });
  saveAll();
}

export function getVersions(docId) {
  if (!docId) return [];
  return getDb().prepare(`
    SELECT id, created_at, length(content) AS char_count
    FROM versions
    WHERE document_id = ?
    ORDER BY created_at DESC
    LIMIT 30
  `).all(docId);
}

export function getVersionById(versionId) {
  if (!versionId) return null;
  return getDb().prepare(
    'SELECT id, content, created_at FROM versions WHERE id = ?',
  ).get(versionId);
}

// ── full-text search ──────────────────────────────────────────────────────────

export function searchDocuments(query) {
  if (!query?.trim()) return [];
  try {
    const escaped = query.trim().replace(/["*]/g, '') + '*';
    return getDb().prepare(`
      SELECT d.id, d.name, d.type,
             snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) AS excerpt
      FROM documents_fts fts
      JOIN documents d ON d.rowid = fts.rowid
      WHERE documents_fts MATCH ?
      ORDER BY rank
      LIMIT 50
    `).all(escaped);
  } catch (err) {
    console.error('[db] search error:', err);
    return [];
  }
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

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
