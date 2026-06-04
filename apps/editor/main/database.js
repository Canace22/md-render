import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';

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
    updated_at  INTEGER
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
  console.log('[db] initialized at', dbPath);
  return db;
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call initDatabase() first.');
  return db;
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

const STATE_KEYS = [
  'workspace_json',
  'selected_id',
  'theme',
  'copy_style',
  'surface',
  'storage_mode',
  'project_root_path',
  'notion_token',
  'notion_file_pages',
  'notion_database_id',
];

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
    });
  }
  if (Array.isArray(node.children)) {
    for (const child of node.children) flattenWorkspace(child, id, result);
  }
  return result;
}

export function syncDocuments(workspace) {
  const docs = flattenWorkspace(workspace);
  if (docs.length === 0) return;

  const upsert = getDb().prepare(`
    INSERT OR REPLACE INTO documents
      (id, parent_id, type, name, content, node_type, summary, aliases, tags, related_ids, created_at, updated_at)
    VALUES
      (@id, @parent_id, @type, @name, @content, @node_type, @summary, @aliases, @tags, @related_ids, @created_at, @updated_at)
  `);
  const syncAll = getDb().transaction((rows) => {
    for (const row of rows) upsert.run(row);
  });
  syncAll(docs);
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

export function closeDatabase() {
  if (db) {
    db.close();
    db = null;
  }
}
