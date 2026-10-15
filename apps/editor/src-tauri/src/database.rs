use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

use rusqlite::{
    params,
    types::{Type, ValueRef},
    Connection, OpenFlags, OptionalExtension, Transaction,
};
use serde::Serialize;
use serde_json::{Map as JsonMap, Value as JsonValue};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

const DATABASE_FILE_NAME: &str = "knowledge.db";
const MIGRATION_STATE_KEY: &str = "migrated_from_localstorage";
const MIGRATION_STATE_VALUE: &str = "done";
const BUSY_TIMEOUT_MS: u64 = 5_000;
const MAX_WORKSPACE_DEPTH: usize = 128;
const MAX_WORKSPACE_DOCUMENTS: usize = 50_000;
const MAX_SEARCH_QUERY_CHARS: usize = 500;
const MAX_SEARCH_TERMS: usize = 16;
const SEARCH_RESULT_LIMIT: i64 = 50;
const GRAPH_NODE_LIMIT: i64 = 1_000;
const VERSION_LIST_LIMIT: i64 = 200;
const VERSION_SNAPSHOT_INTERVAL_MS: i64 = 5 * 60 * 1_000;
const VERSION_RETENTION_MS: i64 = 7 * 24 * 60 * 60 * 1_000;
const VERSION_PRUNE_INTERVAL_MS: i64 = 60 * 60 * 1_000;

const EDITOR_STATE_KEYS: &[&str] = &[
    "workspace_json",
    "selected_id",
    "theme",
    "copy_style",
    "surface",
    "publishing_platforms",
    "daily_workspace_json",
    "storage_mode",
    "project_root_path",
    "sidebar_file_kind",
    "sidebar_expanded_folders",
    "sidebar_sort_mode",
    "heading_numbering",
    "daily_notes_open",
    "comment_threads_json",
    "agent_sessions_json",
];

const SCHEMA: &str = r#"
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
"#;

const DOCUMENT_FTS_UPDATE_TRIGGER: &str = r#"
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
"#;

const DOCUMENT_UPSERT_SQL: &str = r#"
INSERT INTO documents (
  id, parent_id, type, name, content, node_type, summary, aliases, tags,
  related_ids, created_at, updated_at, disk_path, url
) VALUES (
  ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14
)
ON CONFLICT(id) DO UPDATE SET
  parent_id = excluded.parent_id,
  type = excluded.type,
  name = excluded.name,
  content = excluded.content,
  node_type = excluded.node_type,
  summary = excluded.summary,
  aliases = excluded.aliases,
  tags = excluded.tags,
  related_ids = excluded.related_ids,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  disk_path = excluded.disk_path,
  url = excluded.url
WHERE documents.parent_id IS NOT excluded.parent_id
   OR documents.type IS NOT excluded.type
   OR documents.name IS NOT excluded.name
   OR documents.content IS NOT excluded.content
   OR documents.node_type IS NOT excluded.node_type
   OR documents.summary IS NOT excluded.summary
   OR documents.aliases IS NOT excluded.aliases
   OR documents.tags IS NOT excluded.tags
   OR documents.related_ids IS NOT excluded.related_ids
   OR documents.created_at IS NOT excluded.created_at
   OR documents.updated_at IS NOT excluded.updated_at
   OR documents.disk_path IS NOT excluded.disk_path
   OR documents.url IS NOT excluded.url
"#;

pub struct DatabaseState {
    path: PathBuf,
    operation_lock: Mutex<()>,
    last_prune_at: Mutex<i64>,
}

#[derive(Debug)]
struct DocumentRow {
    id: String,
    parent_id: Option<String>,
    entry_type: String,
    name: String,
    content: Option<String>,
    node_type: String,
    summary: Option<String>,
    aliases: Option<String>,
    tags: Option<String>,
    related_ids: Option<String>,
    created_at: Option<i64>,
    updated_at: Option<i64>,
    disk_path: Option<String>,
    url: Option<String>,
}

#[derive(Serialize)]
pub struct MutationResponse {
    ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct LoadResponse {
    ok: bool,
    state: HashMap<String, String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct SearchResponse {
    ok: bool,
    results: Vec<SearchResult>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct GraphResponse {
    ok: bool,
    data: GraphData,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct BacklinksResponse {
    ok: bool,
    backlinks: Vec<Backlink>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct VersionsResponse {
    ok: bool,
    versions: Vec<VersionListItem>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct VersionContentResponse {
    ok: bool,
    version: Option<VersionContent>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
pub struct SnapshotResponse {
    ok: bool,
    saved: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LegacyImportResponse {
    ok: bool,
    cancelled: bool,
    documents: i64,
    versions: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    backup_file_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

#[derive(Serialize)]
struct SearchResult {
    id: String,
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
    excerpt: Option<String>,
}

#[derive(Serialize)]
struct Backlink {
    id: String,
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
}

#[derive(Serialize)]
struct VersionListItem {
    id: i64,
    created_at: Option<i64>,
    char_count: i64,
}

#[derive(Serialize)]
struct VersionContent {
    id: i64,
    content: Option<String>,
    created_at: Option<i64>,
}

#[derive(Serialize)]
struct GraphData {
    nodes: Vec<GraphNode>,
    edges: Vec<GraphEdge>,
}

#[derive(Serialize)]
struct GraphNode {
    id: String,
    name: String,
    #[serde(rename = "type")]
    entry_type: String,
    node_type: Option<String>,
}

#[derive(Serialize, Clone)]
struct GraphEdge {
    source_id: String,
    target_id: String,
}

#[derive(Default, Clone, Copy, PartialEq, Eq)]
struct DatabaseCounts {
    app_state: i64,
    documents: i64,
    links: i64,
    versions: i64,
}

#[derive(PartialEq, Eq)]
struct FileFingerprint {
    length: u64,
    modified: Option<SystemTime>,
}

impl DatabaseState {
    pub fn initialize(app: &AppHandle) -> Result<Self, String> {
        let app_data_dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("无法定位 Tauri 数据目录：{error}"))?;
        fs::create_dir_all(&app_data_dir)
            .map_err(|error| format!("无法创建 Tauri 数据目录：{error}"))?;

        let path = app_data_dir.join(DATABASE_FILE_NAME);
        recover_interrupted_switch(&path)?;
        initialize_schema(&path)?;

        Ok(Self {
            path,
            operation_lock: Mutex::new(()),
            last_prune_at: Mutex::new(0),
        })
    }
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or(0)
}

fn initialize_schema(path: &Path) -> Result<(), String> {
    let connection = open_write_connection(path)?;
    let journal_mode = connection
        .pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    if !journal_mode.eq_ignore_ascii_case("wal") {
        return Err(format!("数据库日志模式初始化失败：{journal_mode}"));
    }
    connection
        .pragma_update(None, "synchronous", "NORMAL")
        .map_err(db_error)?;
    connection.execute_batch(SCHEMA).map_err(db_error)?;
    ensure_optional_document_columns(&connection)?;
    install_update_trigger(&connection)?;
    Ok(())
}

fn open_write_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(db_error)?;
    configure_connection(&connection)?;
    Ok(connection)
}

fn open_read_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open_with_flags(
        path,
        OpenFlags::SQLITE_OPEN_READ_WRITE | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(db_error)?;
    connection
        .busy_timeout(std::time::Duration::from_millis(BUSY_TIMEOUT_MS))
        .map_err(db_error)?;
    // WAL 数据库在边车文件不存在时需要创建 -wal / -shm 才能读取。
    // 连接本身仍设为 query_only，业务 SQL 不会改动数据。
    connection
        .pragma_update(None, "query_only", true)
        .map_err(db_error)?;
    Ok(connection)
}

fn open_legacy_read_connection(path: &Path) -> Result<Connection, String> {
    let mut url =
        tauri::Url::from_file_path(path).map_err(|_| "无法生成旧数据库的只读路径。".to_string())?;
    url.query_pairs_mut().append_pair("immutable", "1");
    let connection = Connection::open_with_flags(
        url.as_str(),
        OpenFlags::SQLITE_OPEN_READ_ONLY
            | OpenFlags::SQLITE_OPEN_URI
            | OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .map_err(db_error)?;
    connection
        .pragma_update(None, "query_only", true)
        .map_err(db_error)?;
    Ok(connection)
}

fn configure_connection(connection: &Connection) -> Result<(), String> {
    connection
        .busy_timeout(std::time::Duration::from_millis(BUSY_TIMEOUT_MS))
        .map_err(db_error)?;
    connection
        .pragma_update(None, "foreign_keys", true)
        .map_err(db_error)?;
    Ok(())
}

fn ensure_optional_document_columns(connection: &Connection) -> Result<(), String> {
    let columns = table_columns(connection, "documents")?;
    if !columns.contains("disk_path") {
        connection
            .execute("ALTER TABLE documents ADD COLUMN disk_path TEXT", [])
            .map_err(db_error)?;
    }
    if !columns.contains("url") {
        connection
            .execute("ALTER TABLE documents ADD COLUMN url TEXT", [])
            .map_err(db_error)?;
    }
    Ok(())
}

fn install_update_trigger(connection: &Connection) -> Result<(), String> {
    let transaction = connection.unchecked_transaction().map_err(db_error)?;
    transaction
        .execute("DROP TRIGGER IF EXISTS documents_au", [])
        .map_err(db_error)?;
    transaction
        .execute_batch(DOCUMENT_FTS_UPDATE_TRIGGER)
        .map_err(db_error)?;
    transaction.commit().map_err(db_error)
}

fn db_error(error: rusqlite::Error) -> String {
    format!("数据库操作失败：{error}")
}

fn lock_error() -> String {
    "数据库正在处理其他操作，请重试。".to_string()
}

fn mutation_result(result: Result<(), String>) -> MutationResponse {
    match result {
        Ok(()) => MutationResponse {
            ok: true,
            error: None,
        },
        Err(error) => MutationResponse {
            ok: false,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn db_is_migrated(state: State<'_, DatabaseState>) -> Result<bool, String> {
    let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
    let connection = open_read_connection(&state.path)?;
    let has_existing_state = connection
        .query_row(
            "SELECT EXISTS(
               SELECT 1 FROM app_state WHERE key = ?1 AND value = ?2
             ) OR EXISTS(
               SELECT 1 FROM app_state WHERE key = 'workspace_json'
             ) OR EXISTS(
               SELECT 1 FROM documents LIMIT 1
             )",
            params![MIGRATION_STATE_KEY, MIGRATION_STATE_VALUE],
            |row| row.get::<_, bool>(0),
        )
        .map_err(db_error)?;
    Ok(has_existing_state)
}

#[tauri::command]
pub fn db_load(state: State<'_, DatabaseState>) -> LoadResponse {
    let result = (|| -> Result<HashMap<String, String>, String> {
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let connection = open_read_connection(&state.path)?;
        let mut statement = connection
            .prepare("SELECT key, value FROM app_state")
            .map_err(db_error)?;
        let rows = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(db_error)?;
        let allowed: HashSet<&str> = EDITOR_STATE_KEYS.iter().copied().collect();
        let mut values = HashMap::new();
        for row in rows {
            let (key, value) = row.map_err(db_error)?;
            if allowed.contains(key.as_str()) {
                values.insert(key, value);
            }
        }
        validate_workspace_matches_documents(&connection, "数据库")?;
        Ok(values)
    })();

    match result {
        Ok(state) => LoadResponse {
            ok: true,
            state,
            error: None,
        },
        Err(error) => LoadResponse {
            ok: false,
            state: HashMap::new(),
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn db_migrate(
    state: State<'_, DatabaseState>,
    state_map: Option<HashMap<String, JsonValue>>,
) -> MutationResponse {
    let result = (|| -> Result<(), String> {
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let workspace = workspace_from_state_map(state_map.as_ref())?;
        let documents = flatten_workspace(&workspace)?;
        let mut connection = open_write_connection(&state.path)?;
        let transaction = connection.transaction().map_err(db_error)?;
        if let Some(values) = state_map.as_ref() {
            save_state_map(&transaction, values)?;
        }
        sync_documents(&transaction, &documents)?;
        sync_links(&transaction, &documents)?;
        transaction
            .execute(
                "INSERT OR REPLACE INTO app_state (key, value) VALUES (?1, ?2)",
                params![MIGRATION_STATE_KEY, MIGRATION_STATE_VALUE],
            )
            .map_err(db_error)?;
        transaction.commit().map_err(db_error)
    })();
    mutation_result(result)
}

#[tauri::command]
pub fn db_save(
    state: State<'_, DatabaseState>,
    state_map: Option<HashMap<String, JsonValue>>,
    workspace_json: Option<String>,
) -> MutationResponse {
    let result = (|| -> Result<(), String> {
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let workspace = workspace_from_save_inputs(state_map.as_ref(), workspace_json.as_deref())?;
        let documents = workspace.as_ref().map(flatten_workspace).transpose()?;
        let encoded_workspace = workspace
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| format!("工作区数据无法序列化，已取消保存：{error}"))?;
        let mut connection = open_write_connection(&state.path)?;
        let transaction = connection.transaction().map_err(db_error)?;
        if let Some(values) = state_map.as_ref() {
            save_state_map(&transaction, values)?;
        }
        if let Some(encoded) = encoded_workspace.as_deref() {
            transaction
                .execute(
                    "INSERT OR REPLACE INTO app_state (key, value) VALUES ('workspace_json', ?1)",
                    [encoded],
                )
                .map_err(db_error)?;
        }
        if let Some(documents) = documents.as_ref() {
            let now = now_millis();
            save_versions(&transaction, documents, now)?;
            sync_documents(&transaction, documents)?;
            sync_links(&transaction, documents)?;
            prune_old_versions(&transaction, &state.last_prune_at, now)?;
        }
        transaction.commit().map_err(db_error)
    })();
    mutation_result(result)
}

fn workspace_from_state_map(
    state_map: Option<&HashMap<String, JsonValue>>,
) -> Result<JsonValue, String> {
    let values = state_map.ok_or_else(|| "缺少初始编辑器状态。".to_string())?;
    let encoded = values
        .get("workspace_json")
        .and_then(JsonValue::as_str)
        .ok_or_else(|| "缺少初始工作区数据。".to_string())?;
    serde_json::from_str(encoded).map_err(|error| format!("初始工作区数据无法解析：{error}"))
}

fn workspace_from_save_inputs(
    state_map: Option<&HashMap<String, JsonValue>>,
    workspace_json: Option<&str>,
) -> Result<Option<JsonValue>, String> {
    let explicit_workspace = workspace_json
        .map(|value| {
            serde_json::from_str::<JsonValue>(value)
                .map_err(|error| format!("工作区数据无法解析，已取消保存：{error}"))
        })
        .transpose()?;
    let state_workspace = state_map
        .and_then(|values| values.get("workspace_json"))
        .map(|value| {
            let encoded = value.as_str().ok_or_else(|| {
                "state_map 中的 workspace_json 不是字符串，已取消保存。".to_string()
            })?;
            serde_json::from_str::<JsonValue>(encoded)
                .map_err(|error| format!("工作区数据无法解析，已取消保存：{error}"))
        })
        .transpose()?;

    if let (Some(explicit), Some(from_state)) = (&explicit_workspace, &state_workspace) {
        if explicit != from_state {
            return Err("两份工作区数据不一致，已取消保存。".to_string());
        }
    }

    Ok(explicit_workspace.or(state_workspace))
}

fn save_state_map(
    transaction: &Transaction<'_>,
    state_map: &HashMap<String, JsonValue>,
) -> Result<(), String> {
    let allowed: HashSet<&str> = EDITOR_STATE_KEYS.iter().copied().collect();
    let mut statement = transaction
        .prepare("INSERT OR REPLACE INTO app_state (key, value) VALUES (?1, ?2)")
        .map_err(db_error)?;
    for (key, value) in state_map {
        if !allowed.contains(key.as_str()) || value.is_null() {
            continue;
        }
        let encoded = match value {
            JsonValue::String(text) => text.clone(),
            other => other.to_string(),
        };
        statement.execute(params![key, encoded]).map_err(db_error)?;
    }
    Ok(())
}

fn flatten_workspace(root: &JsonValue) -> Result<Vec<DocumentRow>, String> {
    validate_workspace_structure(root)?;
    let mut documents = Vec::new();
    flatten_node(root, None, 0, &mut documents)?;
    Ok(documents)
}

fn validate_workspace_structure(root: &JsonValue) -> Result<HashSet<String>, String> {
    let root = root
        .as_object()
        .ok_or_else(|| "工作区根节点不是对象，已取消数据库写入。".to_string())?;
    if root.get("id").and_then(JsonValue::as_str) != Some("root") {
        return Err("工作区缺少有效的 root 根节点，已取消数据库写入。".to_string());
    }
    let children = root
        .get("children")
        .and_then(JsonValue::as_array)
        .ok_or_else(|| "工作区根节点缺少 children 数组，已取消数据库写入。".to_string())?;

    let mut ids = HashSet::new();
    collect_workspace_ids(children, 1, &mut ids)?;
    Ok(ids)
}

fn collect_workspace_ids(
    children: &[JsonValue],
    depth: usize,
    ids: &mut HashSet<String>,
) -> Result<(), String> {
    if depth > MAX_WORKSPACE_DEPTH {
        return Err("工作区层级过深，已取消数据库写入。".to_string());
    }

    for child in children {
        if ids.len() >= MAX_WORKSPACE_DOCUMENTS {
            return Err("工作区节点超过安全上限，已取消数据库写入。".to_string());
        }
        let node = child
            .as_object()
            .ok_or_else(|| "工作区 children 包含非对象节点，已取消数据库写入。".to_string())?;
        let id = node
            .get("id")
            .and_then(JsonValue::as_str)
            .filter(|id| !id.trim().is_empty())
            .ok_or_else(|| "工作区包含缺少 id 的节点，已取消数据库写入。".to_string())?;
        if id == "root" {
            return Err("工作区包含重复的 root 节点，已取消数据库写入。".to_string());
        }
        if !ids.insert(id.to_string()) {
            return Err(format!("工作区节点 id 重复：{id}，已取消数据库写入。"));
        }

        match node.get("children") {
            Some(value) if value.is_null() => {}
            Some(value) => {
                let nested = value.as_array().ok_or_else(|| {
                    format!("工作区节点 {id} 的 children 不是数组，已取消数据库写入。")
                })?;
                collect_workspace_ids(nested, depth + 1, ids)?;
            }
            None => {}
        }
    }
    Ok(())
}

fn flatten_node(
    value: &JsonValue,
    parent_id: Option<&str>,
    depth: usize,
    documents: &mut Vec<DocumentRow>,
) -> Result<(), String> {
    if depth > MAX_WORKSPACE_DEPTH {
        return Err("工作区层级过深，已取消数据库写入。".to_string());
    }
    if documents.len() >= MAX_WORKSPACE_DOCUMENTS {
        return Err("工作区文档数超过安全上限，已取消数据库写入。".to_string());
    }

    let Some(node) = value.as_object() else {
        return Ok(());
    };
    let id = json_string(node, "id");
    let is_root = id.as_deref() == Some("root");
    if let Some(id) = id.as_deref().filter(|_| !is_root) {
        let relative_path = json_string(node, "relativePath");
        let project_root_path = json_string(node, "projectRootPath");
        let disk_path = match (project_root_path, relative_path) {
            (Some(root), Some(relative)) if !root.is_empty() && !relative.is_empty() => Some(
                Path::new(&root)
                    .join(relative)
                    .to_string_lossy()
                    .into_owned(),
            ),
            _ => None,
        };
        documents.push(DocumentRow {
            id: id.to_string(),
            parent_id: parent_id.filter(|id| *id != "root").map(str::to_string),
            entry_type: json_string(node, "type").unwrap_or_else(|| "file".to_string()),
            name: json_string(node, "name").unwrap_or_default(),
            content: json_string(node, "content"),
            node_type: json_string(node, "nodeType").unwrap_or_else(|| "document".to_string()),
            summary: json_string(node, "summary"),
            aliases: json_non_empty_array(node, "aliases"),
            tags: json_non_empty_array(node, "tags"),
            related_ids: json_non_empty_array(node, "relatedIds"),
            created_at: json_integer(node, "createdAt"),
            updated_at: json_integer(node, "updatedAt"),
            disk_path,
            url: json_string(node, "url"),
        });
    }

    let child_parent = id.as_deref().or(parent_id);
    if let Some(children) = node.get("children").and_then(JsonValue::as_array) {
        for child in children {
            flatten_node(child, child_parent, depth + 1, documents)?;
        }
    }
    Ok(())
}

fn json_string(node: &JsonMap<String, JsonValue>, key: &str) -> Option<String> {
    node.get(key)
        .and_then(JsonValue::as_str)
        .map(str::to_string)
}

fn json_integer(node: &JsonMap<String, JsonValue>, key: &str) -> Option<i64> {
    node.get(key).and_then(|value| {
        value
            .as_i64()
            .or_else(|| value.as_u64().and_then(|number| i64::try_from(number).ok()))
            .or_else(|| value.as_f64().and_then(integer_from_f64))
    })
}

fn integer_from_f64(value: f64) -> Option<i64> {
    if value.is_finite() && value >= i64::MIN as f64 && value < i64::MAX as f64 {
        Some(value.trunc() as i64)
    } else {
        None
    }
}

fn legacy_optional_integer(row: &rusqlite::Row<'_>, index: usize) -> rusqlite::Result<Option<i64>> {
    match row.get_ref(index)? {
        ValueRef::Null => Ok(None),
        ValueRef::Integer(value) => Ok(Some(value)),
        ValueRef::Real(value) => integer_from_f64(value).map(Some).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                index,
                Type::Real,
                Box::new(std::io::Error::new(
                    std::io::ErrorKind::InvalidData,
                    "时间字段超出整数范围",
                )),
            )
        }),
        value => Err(rusqlite::Error::InvalidColumnType(
            index,
            row.as_ref().column_name(index).unwrap_or("").to_string(),
            value.data_type(),
        )),
    }
}

fn json_non_empty_array(node: &JsonMap<String, JsonValue>, key: &str) -> Option<String> {
    let value = node.get(key)?;
    let array = value.as_array()?;
    if array.is_empty() {
        None
    } else {
        serde_json::to_string(array).ok()
    }
}

fn sync_documents(transaction: &Transaction<'_>, documents: &[DocumentRow]) -> Result<(), String> {
    transaction
        .execute_batch(
            "CREATE TEMP TABLE IF NOT EXISTS current_document_ids (id TEXT PRIMARY KEY);
             DELETE FROM current_document_ids;",
        )
        .map_err(db_error)?;
    let mut id_statement = transaction
        .prepare("INSERT INTO current_document_ids (id) VALUES (?1)")
        .map_err(db_error)?;
    let mut upsert_statement = transaction.prepare(DOCUMENT_UPSERT_SQL).map_err(db_error)?;

    for document in documents {
        id_statement
            .execute([document.id.as_str()])
            .map_err(db_error)?;
        upsert_statement
            .execute(params![
                document.id,
                document.parent_id,
                document.entry_type,
                document.name,
                document.content,
                document.node_type,
                document.summary,
                document.aliases,
                document.tags,
                document.related_ids,
                document.created_at,
                document.updated_at,
                document.disk_path,
                document.url,
            ])
            .map_err(db_error)?;
    }
    drop(id_statement);
    drop(upsert_statement);

    transaction
        .execute_batch(
            "DELETE FROM links
               WHERE NOT EXISTS (SELECT 1 FROM current_document_ids d WHERE d.id = links.source_id)
                  OR NOT EXISTS (SELECT 1 FROM current_document_ids d WHERE d.id = links.target_id);
             DELETE FROM versions
               WHERE NOT EXISTS (SELECT 1 FROM current_document_ids d WHERE d.id = versions.document_id);
             DELETE FROM documents
               WHERE NOT EXISTS (SELECT 1 FROM current_document_ids d WHERE d.id = documents.id);
             DELETE FROM current_document_ids;",
        )
        .map_err(db_error)?;
    Ok(())
}

fn sync_links(transaction: &Transaction<'_>, documents: &[DocumentRow]) -> Result<(), String> {
    let mut name_to_id = HashMap::new();
    for document in documents {
        name_to_id.insert(document.name.clone(), document.id.clone());
        if let Some(name) = document.name.strip_suffix(".md") {
            name_to_id.insert(name.to_string(), document.id.clone());
        }
    }

    let mut delete_statement = transaction
        .prepare("DELETE FROM links WHERE source_id = ?1")
        .map_err(db_error)?;
    let mut insert_statement = transaction
        .prepare("INSERT OR IGNORE INTO links (source_id, target_id) VALUES (?1, ?2)")
        .map_err(db_error)?;
    for document in documents {
        if document.entry_type != "file" {
            continue;
        }
        delete_statement
            .execute([document.id.as_str()])
            .map_err(db_error)?;
        let Some(content) = document.content.as_deref() else {
            continue;
        };
        for name in extract_wikilinks(content) {
            let target = name_to_id
                .get(&name)
                .or_else(|| name_to_id.get(&format!("{name}.md")));
            if let Some(target_id) = target.filter(|target_id| *target_id != &document.id) {
                insert_statement
                    .execute(params![document.id, target_id])
                    .map_err(db_error)?;
            }
        }
    }
    Ok(())
}

fn extract_wikilinks(content: &str) -> Vec<String> {
    let mut names = HashSet::new();
    let mut remaining = content;
    while let Some(start) = remaining.find("[[") {
        remaining = &remaining[start + 2..];
        let Some(end) = remaining.find("]]") else {
            break;
        };
        let raw = &remaining[..end];
        let name = raw.split_once('|').map_or(raw, |(value, _)| value).trim();
        if !name.is_empty() && name.chars().count() <= 200 {
            names.insert(name.to_string());
        }
        remaining = &remaining[end + 2..];
    }
    names.into_iter().collect()
}

fn save_versions(
    transaction: &Transaction<'_>,
    documents: &[DocumentRow],
    now: i64,
) -> Result<(), String> {
    let mut previous_statement = transaction
        .prepare("SELECT content FROM documents WHERE id = ?1")
        .map_err(db_error)?;
    let mut latest_statement = transaction
        .prepare(
            "SELECT content, created_at FROM versions
             WHERE document_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
        )
        .map_err(db_error)?;
    let mut insert_statement = transaction
        .prepare("INSERT INTO versions (document_id, content, created_at) VALUES (?1, ?2, ?3)")
        .map_err(db_error)?;

    for document in documents {
        if document.entry_type != "file" {
            continue;
        }
        let previous = previous_statement
            .query_row([document.id.as_str()], |row| {
                row.get::<_, Option<String>>(0)
            })
            .optional()
            .map_err(db_error)?
            .flatten();
        if previous.as_deref() == document.content.as_deref() {
            continue;
        }
        let Some(previous_content) = previous.filter(|content| !content.is_empty()) else {
            continue;
        };
        let latest = latest_statement
            .query_row([document.id.as_str()], |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<i64>>(1)?,
                ))
            })
            .optional()
            .map_err(db_error)?;
        let should_save = match latest {
            None => true,
            Some((content, _)) if content.as_deref() == Some(previous_content.as_str()) => false,
            Some((_, created_at)) => {
                now - created_at.unwrap_or_default() >= VERSION_SNAPSHOT_INTERVAL_MS
            }
        };
        if should_save {
            insert_statement
                .execute(params![document.id, previous_content, now])
                .map_err(db_error)?;
        }
    }
    Ok(())
}

fn prune_old_versions(
    transaction: &Transaction<'_>,
    last_prune_at: &Mutex<i64>,
    now: i64,
) -> Result<(), String> {
    let mut last_prune = last_prune_at.lock().map_err(|_| lock_error())?;
    if now - *last_prune < VERSION_PRUNE_INTERVAL_MS {
        return Ok(());
    }
    transaction
        .execute(
            "DELETE FROM versions WHERE created_at < ?1",
            [now - VERSION_RETENTION_MS],
        )
        .map_err(db_error)?;
    *last_prune = now;
    Ok(())
}

#[tauri::command]
pub fn db_search(state: State<'_, DatabaseState>, query: String) -> SearchResponse {
    let result = (|| -> Result<Vec<SearchResult>, String> {
        let query = build_fts_query(&query);
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let connection = open_read_connection(&state.path)?;
        let mut statement = connection
            .prepare(
                "SELECT d.id, d.name, d.type,
                        snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) AS excerpt
                 FROM documents_fts
                 JOIN documents d ON d.rowid = documents_fts.rowid
                 WHERE documents_fts MATCH ?1
                 ORDER BY rank
                 LIMIT ?2",
            )
            .map_err(db_error)?;
        let rows = statement
            .query_map(params![query, SEARCH_RESULT_LIMIT], |row| {
                Ok(SearchResult {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    entry_type: row.get(2)?,
                    excerpt: row.get(3)?,
                })
            })
            .map_err(db_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
    })();

    match result {
        Ok(results) => SearchResponse {
            ok: true,
            results,
            error: None,
        },
        Err(error) => SearchResponse {
            ok: false,
            results: Vec::new(),
            error: Some(error),
        },
    }
}

fn build_fts_query(query: &str) -> String {
    let text: String = query.chars().take(MAX_SEARCH_QUERY_CHARS).collect();
    text.split_whitespace()
        .filter_map(|term| {
            let escaped = term.replace(['"', '*'], "").trim().to_string();
            (!escaped.is_empty()).then(|| format!("\"{}\"*", escaped.replace('"', "\"\"")))
        })
        .take(MAX_SEARCH_TERMS)
        .collect::<Vec<_>>()
        .join(" AND ")
}

#[tauri::command]
pub fn db_get_backlinks(
    state: State<'_, DatabaseState>,
    doc_id: Option<String>,
) -> BacklinksResponse {
    let result = (|| -> Result<Vec<Backlink>, String> {
        let Some(doc_id) = doc_id.filter(|value| !value.is_empty()) else {
            return Ok(Vec::new());
        };
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let connection = open_read_connection(&state.path)?;
        let mut statement = connection
            .prepare(
                "SELECT d.id, d.name, d.type
                 FROM links l JOIN documents d ON d.id = l.source_id
                 WHERE l.target_id = ?1 ORDER BY d.name",
            )
            .map_err(db_error)?;
        let rows = statement
            .query_map([doc_id], |row| {
                Ok(Backlink {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    entry_type: row.get(2)?,
                })
            })
            .map_err(db_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
    })();

    match result {
        Ok(backlinks) => BacklinksResponse {
            ok: true,
            backlinks,
            error: None,
        },
        Err(error) => BacklinksResponse {
            ok: false,
            backlinks: Vec::new(),
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn db_get_versions(
    state: State<'_, DatabaseState>,
    doc_id: Option<String>,
) -> VersionsResponse {
    let result = (|| -> Result<Vec<VersionListItem>, String> {
        let Some(doc_id) = doc_id.filter(|value| !value.is_empty()) else {
            return Ok(Vec::new());
        };
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let connection = open_read_connection(&state.path)?;
        let mut statement = connection
            .prepare(
                "SELECT id, created_at, length(content) AS char_count
                 FROM versions WHERE document_id = ?1
                 ORDER BY created_at DESC, id DESC LIMIT ?2",
            )
            .map_err(db_error)?;
        let rows = statement
            .query_map(params![doc_id, VERSION_LIST_LIMIT], |row| {
                Ok(VersionListItem {
                    id: row.get(0)?,
                    created_at: row.get(1)?,
                    char_count: row.get::<_, Option<i64>>(2)?.unwrap_or_default(),
                })
            })
            .map_err(db_error)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(db_error)
    })();

    match result {
        Ok(versions) => VersionsResponse {
            ok: true,
            versions,
            error: None,
        },
        Err(error) => VersionsResponse {
            ok: false,
            versions: Vec::new(),
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn db_get_version_content(
    state: State<'_, DatabaseState>,
    version_id: Option<i64>,
) -> VersionContentResponse {
    let result = (|| -> Result<Option<VersionContent>, String> {
        let Some(version_id) = version_id.filter(|value| *value > 0) else {
            return Ok(None);
        };
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let connection = open_read_connection(&state.path)?;
        connection
            .query_row(
                "SELECT id, content, created_at FROM versions WHERE id = ?1",
                [version_id],
                |row| {
                    Ok(VersionContent {
                        id: row.get(0)?,
                        content: row.get(1)?,
                        created_at: row.get(2)?,
                    })
                },
            )
            .optional()
            .map_err(db_error)
    })();

    match result {
        Ok(version) => VersionContentResponse {
            ok: version.is_some(),
            version,
            error: None,
        },
        Err(error) => VersionContentResponse {
            ok: false,
            version: None,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn db_save_version_snapshot(
    state: State<'_, DatabaseState>,
    doc_id: Option<String>,
    content: Option<String>,
) -> SnapshotResponse {
    let result = (|| -> Result<bool, String> {
        let (Some(doc_id), Some(content)) = (
            doc_id.filter(|value| !value.is_empty()),
            content.filter(|value| !value.is_empty()),
        ) else {
            return Ok(false);
        };
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let connection = open_write_connection(&state.path)?;
        let latest = connection
            .query_row(
                "SELECT content FROM versions
                 WHERE document_id = ?1 ORDER BY created_at DESC, id DESC LIMIT 1",
                [doc_id.as_str()],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()
            .map_err(db_error)?
            .flatten();
        if latest.as_deref() == Some(content.as_str()) {
            return Ok(false);
        }
        connection
            .execute(
                "INSERT INTO versions (document_id, content, created_at) VALUES (?1, ?2, ?3)",
                params![doc_id, content, now_millis()],
            )
            .map_err(db_error)?;
        Ok(true)
    })();

    match result {
        Ok(saved) => SnapshotResponse {
            ok: true,
            saved,
            error: None,
        },
        Err(error) => SnapshotResponse {
            ok: false,
            saved: false,
            error: Some(error),
        },
    }
}

#[tauri::command]
pub fn db_get_graph(state: State<'_, DatabaseState>) -> GraphResponse {
    let result = (|| -> Result<GraphData, String> {
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        let connection = open_read_connection(&state.path)?;
        let mut statement = connection
            .prepare(
                "SELECT id, name, type, node_type, related_ids
                 FROM documents WHERE type = 'file' LIMIT ?1",
            )
            .map_err(db_error)?;
        let raw_nodes = statement
            .query_map([GRAPH_NODE_LIMIT], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, Option<String>>(4)?,
                ))
            })
            .map_err(db_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(db_error)?;
        let node_ids: HashSet<&str> = raw_nodes.iter().map(|node| node.0.as_str()).collect();
        let mut seen_edges = HashSet::new();
        let mut edges = Vec::new();
        for (id, _, _, _, related_ids) in &raw_nodes {
            for target_id in parse_string_list(related_ids.as_deref()) {
                push_graph_edge(id, &target_id, &node_ids, &mut seen_edges, &mut edges);
            }
        }

        let mut link_statement = connection
            .prepare("SELECT source_id, target_id FROM links")
            .map_err(db_error)?;
        let links = link_statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(db_error)?;
        for link in links {
            let (source_id, target_id) = link.map_err(db_error)?;
            push_graph_edge(
                &source_id,
                &target_id,
                &node_ids,
                &mut seen_edges,
                &mut edges,
            );
        }

        let nodes = raw_nodes
            .into_iter()
            .map(|(id, name, entry_type, node_type, _)| GraphNode {
                id,
                name,
                entry_type,
                node_type,
            })
            .collect();
        Ok(GraphData { nodes, edges })
    })();

    match result {
        Ok(data) => GraphResponse {
            ok: true,
            data,
            error: None,
        },
        Err(error) => GraphResponse {
            ok: false,
            data: GraphData {
                nodes: Vec::new(),
                edges: Vec::new(),
            },
            error: Some(error),
        },
    }
}

fn parse_string_list(value: Option<&str>) -> Vec<String> {
    value
        .and_then(|value| serde_json::from_str::<Vec<JsonValue>>(value).ok())
        .unwrap_or_default()
        .into_iter()
        .filter_map(|value| value.as_str().map(str::to_string))
        .filter(|value| !value.is_empty())
        .collect()
}

fn push_graph_edge(
    source_id: &str,
    target_id: &str,
    node_ids: &HashSet<&str>,
    seen_edges: &mut HashSet<String>,
    edges: &mut Vec<GraphEdge>,
) {
    if source_id.is_empty()
        || target_id.is_empty()
        || source_id == target_id
        || !node_ids.contains(source_id)
        || !node_ids.contains(target_id)
    {
        return;
    }
    let key = format!("{source_id}::{target_id}");
    if seen_edges.insert(key) {
        edges.push(GraphEdge {
            source_id: source_id.to_string(),
            target_id: target_id.to_string(),
        });
    }
}

#[tauri::command]
pub async fn db_import_legacy_database(
    app: AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<LegacyImportResponse, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("完全退出 Electron 后选择 knowledge.db")
        .add_filter("SQLite 数据库", &["db", "sqlite", "sqlite3"])
        .blocking_pick_file();
    let Some(selected) = selected else {
        return Ok(LegacyImportResponse {
            ok: false,
            cancelled: true,
            documents: 0,
            versions: 0,
            backup_file_name: None,
            error: None,
        });
    };
    let source_path = match selected.into_path() {
        Ok(path) => path,
        Err(error) => {
            return Ok(LegacyImportResponse {
                ok: false,
                cancelled: false,
                documents: 0,
                versions: 0,
                backup_file_name: None,
                error: Some(format!("无法读取选中的数据库路径：{error}")),
            });
        }
    };

    let result = (|| -> Result<(DatabaseCounts, String), String> {
        let _guard = state.operation_lock.lock().map_err(|_| lock_error())?;
        import_legacy_database(&source_path, &state.path)
    })();
    Ok(match result {
        Ok((counts, backup_file_name)) => LegacyImportResponse {
            ok: true,
            cancelled: false,
            documents: counts.documents,
            versions: counts.versions,
            backup_file_name: Some(backup_file_name),
            error: None,
        },
        Err(error) => LegacyImportResponse {
            ok: false,
            cancelled: false,
            documents: 0,
            versions: 0,
            backup_file_name: None,
            error: Some(error),
        },
    })
}

fn import_legacy_database(
    source_path: &Path,
    destination_path: &Path,
) -> Result<(DatabaseCounts, String), String> {
    let source_path = source_path
        .canonicalize()
        .map_err(|error| format!("无法读取选中的数据库：{error}"))?;
    let destination_canonical = destination_path
        .canonicalize()
        .unwrap_or_else(|_| destination_path.to_path_buf());
    if source_path == destination_canonical {
        return Err("不能把 Tauri 自己的数据库当作旧库导入。".to_string());
    }
    if !source_path.is_file() {
        return Err("选中的路径不是可读的 SQLite 文件。".to_string());
    }
    ensure_legacy_source_is_closed(&source_path)?;
    let source_fingerprint = file_fingerprint(&source_path)?;
    let source = open_legacy_read_connection(&source_path)?;
    validate_legacy_schema(&source)?;
    let source_quick_check = quick_check(&source)?;
    if source_quick_check != "ok" {
        return Err(format!("旧数据库完整性检查失败：{source_quick_check}"));
    }
    source.execute_batch("BEGIN").map_err(db_error)?;
    let workspace_ids = validate_legacy_workspace(&source)?;
    let source_has_migration_marker = source
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM app_state WHERE key = ?1)",
            [MIGRATION_STATE_KEY],
            |row| row.get::<_, bool>(0),
        )
        .map_err(db_error)?;

    let timestamp = now_millis();
    let parent = destination_path
        .parent()
        .ok_or_else(|| "Tauri 数据库目录无效。".to_string())?;
    let candidate_path = parent.join(format!("knowledge.import.{timestamp}.tmp.db"));
    let backup_path = parent.join(format!("knowledge.before-import.{timestamp}.db"));
    remove_sqlite_files(&candidate_path)?;
    let import_result = (|| -> Result<DatabaseCounts, String> {
        initialize_schema(&candidate_path)?;
        let mut candidate = open_write_connection(&candidate_path)?;
        let transaction = candidate.transaction().map_err(db_error)?;
        let mut expected_counts = copy_legacy_rows(&source, &transaction, &workspace_ids)?;
        transaction
            .execute(
                "INSERT INTO app_state (key, value) VALUES (?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                params![MIGRATION_STATE_KEY, MIGRATION_STATE_VALUE],
            )
            .map_err(db_error)?;
        if !source_has_migration_marker {
            expected_counts.app_state += 1;
        }
        transaction.commit().map_err(db_error)?;
        validate_imported_workspace(&candidate)?;
        install_update_trigger(&candidate)?;
        candidate
            .execute(
                "INSERT INTO documents_fts(documents_fts) VALUES ('rebuild')",
                [],
            )
            .map_err(db_error)?;
        candidate
            .execute_batch("PRAGMA optimize; VACUUM;")
            .map_err(db_error)?;

        let imported_counts = database_counts(&candidate)?;
        if imported_counts != expected_counts {
            return Err("导入后的表记录数与旧库有效数据不一致，已取消切换。".to_string());
        }
        let fts_count: i64 = candidate
            .query_row("SELECT count(*) FROM documents_fts", [], |row| row.get(0))
            .map_err(db_error)?;
        if fts_count != imported_counts.documents {
            return Err("导入后的全文索引与文档数不一致，已取消切换。".to_string());
        }
        let candidate_quick_check = quick_check(&candidate)?;
        if candidate_quick_check != "ok" {
            return Err(format!("导入库完整性检查失败：{candidate_quick_check}"));
        }
        checkpoint_connection(&candidate)?;
        Ok(imported_counts)
    })();
    source.execute_batch("ROLLBACK").ok();

    let imported_counts = match import_result {
        Ok(counts) => counts,
        Err(error) => {
            remove_sqlite_files(&candidate_path).ok();
            return Err(error);
        }
    };
    if let Err(error) = ensure_legacy_source_unchanged(&source_path, &source_fingerprint) {
        remove_sqlite_files(&candidate_path).ok();
        return Err(error);
    }

    let prepare_switch_result = (|| -> Result<(), String> {
        checkpoint_database(destination_path)?;
        fs::copy(destination_path, &backup_path)
            .map_err(|error| format!("无法备份当前 Tauri 数据库：{error}"))?;
        remove_sqlite_sidecars(destination_path)?;
        remove_sqlite_sidecars(&candidate_path)
    })();
    if let Err(error) = prepare_switch_result {
        remove_sqlite_files(&candidate_path).ok();
        remove_sqlite_files(&backup_path).ok();
        return Err(error);
    }
    if let Err(error) = replace_database_file(&candidate_path, destination_path) {
        remove_sqlite_files(&candidate_path).ok();
        return Err(error);
    }

    let backup_file_name = backup_path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("knowledge.before-import.db")
        .to_string();
    Ok((imported_counts, backup_file_name))
}

fn validate_legacy_schema(connection: &Connection) -> Result<(), String> {
    const ALLOWED_OBJECTS: &[&str] = &[
        "app_state",
        "documents",
        "documents_fts",
        "documents_fts_data",
        "documents_fts_idx",
        "documents_fts_content",
        "documents_fts_docsize",
        "documents_fts_config",
        "documents_ai",
        "documents_ad",
        "documents_au",
        "links",
        "versions",
        "idx_versions_doc_time",
    ];
    let allowed: HashSet<&str> = ALLOWED_OBJECTS.iter().copied().collect();
    let mut statement = connection
        .prepare(
            "SELECT type, name FROM sqlite_master
             WHERE name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .map_err(db_error)?;
    let objects = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(db_error)?;
    let mut present = HashSet::new();
    for object in objects {
        let (object_type, name) = object.map_err(db_error)?;
        if !matches!(object_type.as_str(), "table" | "index" | "trigger")
            || !allowed.contains(name.as_str())
        {
            return Err(format!(
                "旧数据库含有未识别的 schema 对象：{object_type} {name}"
            ));
        }
        present.insert(name);
    }
    for table in ["app_state", "documents"] {
        if !present.contains(table) {
            return Err(format!("旧数据库缺少必需表：{table}"));
        }
    }
    require_columns(connection, "app_state", &["key", "value"])?;
    require_columns(
        connection,
        "documents",
        &[
            "id",
            "parent_id",
            "type",
            "name",
            "content",
            "node_type",
            "summary",
            "aliases",
            "tags",
            "related_ids",
            "created_at",
            "updated_at",
        ],
    )?;
    if present.contains("links") {
        require_columns(connection, "links", &["source_id", "target_id", "context"])?;
    }
    if present.contains("versions") {
        require_columns(
            connection,
            "versions",
            &["id", "document_id", "content", "created_at"],
        )?;
    }
    Ok(())
}

fn require_columns(connection: &Connection, table: &str, required: &[&str]) -> Result<(), String> {
    let columns = table_columns(connection, table)?;
    for column in required {
        if !columns.contains(*column) {
            return Err(format!("旧数据库的 {table} 表缺少字段：{column}"));
        }
    }
    Ok(())
}

fn table_columns(connection: &Connection, table: &str) -> Result<HashSet<String>, String> {
    let mut statement = connection
        .prepare(&format!("PRAGMA table_info({table})"))
        .map_err(db_error)?;
    let columns = statement
        .query_map([], |row| row.get::<_, String>(1))
        .map_err(db_error)?;
    columns.collect::<Result<HashSet<_>, _>>().map_err(db_error)
}

fn database_counts(connection: &Connection) -> Result<DatabaseCounts, String> {
    Ok(DatabaseCounts {
        app_state: table_count(connection, "app_state")?,
        documents: table_count(connection, "documents")?,
        links: optional_table_count(connection, "links")?,
        versions: optional_table_count(connection, "versions")?,
    })
}

fn validate_imported_workspace(connection: &Connection) -> Result<(), String> {
    validate_workspace_matches_documents(connection, "旧数据库")
}

fn validate_legacy_workspace(connection: &Connection) -> Result<HashSet<String>, String> {
    let workspace_ids = read_workspace_ids(connection, "旧数据库")?;
    let document_ids = read_document_ids(connection)?;
    let missing_count = workspace_ids.difference(&document_ids).count();
    if missing_count > 0 {
        return Err(format!(
            "旧数据库的工作区有 {missing_count} 个节点缺少文档索引，已取消导入。"
        ));
    }
    Ok(workspace_ids)
}

fn read_workspace_ids(
    connection: &Connection,
    source_label: &str,
) -> Result<HashSet<String>, String> {
    let workspace_json = connection
        .query_row(
            "SELECT value FROM app_state WHERE key = 'workspace_json'",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(db_error)?
        .ok_or_else(|| format!("{source_label}缺少 workspace_json，已停止加载。"))?;
    let workspace: JsonValue = serde_json::from_str(&workspace_json)
        .map_err(|error| format!("{source_label}的 workspace_json 无法解析：{error}"))?;
    validate_workspace_structure(&workspace)
        .map_err(|error| format!("{source_label}的 workspace_json 未通过安全校验：{error}"))
}

fn validate_workspace_matches_documents(
    connection: &Connection,
    source_label: &str,
) -> Result<(), String> {
    let workspace_ids = read_workspace_ids(connection, source_label)?;
    let document_ids = read_document_ids(connection)?;
    if workspace_ids != document_ids {
        return Err(format!(
            "{source_label}的工作区节点与文档索引不一致（工作区 {} 项，文档表 {} 项），已停止加载。",
            workspace_ids.len(),
            document_ids.len()
        ));
    }
    Ok(())
}

fn read_document_ids(connection: &Connection) -> Result<HashSet<String>, String> {
    let mut statement = connection
        .prepare("SELECT id FROM documents")
        .map_err(db_error)?;
    let rows = statement
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(db_error)?;
    rows.collect::<Result<HashSet<_>, _>>().map_err(db_error)
}

fn table_count(connection: &Connection, table: &str) -> Result<i64, String> {
    connection
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .map_err(db_error)
}

fn optional_table_count(connection: &Connection, table: &str) -> Result<i64, String> {
    if table_columns(connection, table)?.is_empty() {
        Ok(0)
    } else {
        table_count(connection, table)
    }
}

fn copy_legacy_rows(
    source: &Connection,
    destination: &Transaction<'_>,
    workspace_ids: &HashSet<String>,
) -> Result<DatabaseCounts, String> {
    Ok(DatabaseCounts {
        app_state: copy_app_state(source, destination)?,
        documents: copy_documents(source, destination, workspace_ids)?,
        links: copy_links(source, destination, workspace_ids)?,
        versions: copy_versions(source, destination, workspace_ids)?,
    })
}

fn copy_app_state(source: &Connection, destination: &Transaction<'_>) -> Result<i64, String> {
    let mut source_statement = source
        .prepare("SELECT key, value FROM app_state")
        .map_err(db_error)?;
    let rows = source_statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(db_error)?;
    let mut insert = destination
        .prepare("INSERT INTO app_state (key, value) VALUES (?1, ?2)")
        .map_err(db_error)?;
    let mut count = 0;
    for row in rows {
        let (key, value) = row.map_err(db_error)?;
        insert.execute(params![key, value]).map_err(db_error)?;
        count += 1;
    }
    Ok(count)
}

fn copy_documents(
    source: &Connection,
    destination: &Transaction<'_>,
    workspace_ids: &HashSet<String>,
) -> Result<i64, String> {
    let columns = table_columns(source, "documents")?;
    let disk_path = if columns.contains("disk_path") {
        "disk_path"
    } else {
        "NULL"
    };
    let url = if columns.contains("url") {
        "url"
    } else {
        "NULL"
    };
    let sql = format!(
        "SELECT id, parent_id, type, name, content, node_type, summary, aliases, tags,
                related_ids, created_at, updated_at, {disk_path}, {url}
         FROM documents"
    );
    let mut source_statement = source.prepare(&sql).map_err(db_error)?;
    let rows = source_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Option<String>>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, Option<String>>(5)?,
                row.get::<_, Option<String>>(6)?,
                row.get::<_, Option<String>>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
                legacy_optional_integer(row, 10)?,
                legacy_optional_integer(row, 11)?,
                row.get::<_, Option<String>>(12)?,
                row.get::<_, Option<String>>(13)?,
            ))
        })
        .map_err(db_error)?;
    let mut insert = destination
        .prepare(
            "INSERT INTO documents (
               id, parent_id, type, name, content, node_type, summary, aliases, tags,
               related_ids, created_at, updated_at, disk_path, url
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
        )
        .map_err(db_error)?;
    let mut count = 0;
    for row in rows {
        let row = row.map_err(db_error)?;
        if !workspace_ids.contains(&row.0) {
            continue;
        }
        insert
            .execute(params![
                row.0, row.1, row.2, row.3, row.4, row.5, row.6, row.7, row.8, row.9, row.10,
                row.11, row.12, row.13,
            ])
            .map_err(db_error)?;
        count += 1;
    }
    Ok(count)
}

fn copy_links(
    source: &Connection,
    destination: &Transaction<'_>,
    workspace_ids: &HashSet<String>,
) -> Result<i64, String> {
    if table_columns(source, "links")?.is_empty() {
        return Ok(0);
    }
    let mut source_statement = source
        .prepare("SELECT source_id, target_id, context FROM links")
        .map_err(db_error)?;
    let rows = source_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
            ))
        })
        .map_err(db_error)?;
    let mut insert = destination
        .prepare("INSERT INTO links (source_id, target_id, context) VALUES (?1, ?2, ?3)")
        .map_err(db_error)?;
    let mut count = 0;
    for row in rows {
        let (source_id, target_id, context) = row.map_err(db_error)?;
        if !workspace_ids.contains(&source_id) || !workspace_ids.contains(&target_id) {
            continue;
        }
        insert
            .execute(params![source_id, target_id, context])
            .map_err(db_error)?;
        count += 1;
    }
    Ok(count)
}

fn copy_versions(
    source: &Connection,
    destination: &Transaction<'_>,
    workspace_ids: &HashSet<String>,
) -> Result<i64, String> {
    if table_columns(source, "versions")?.is_empty() {
        return Ok(0);
    }
    let mut source_statement = source
        .prepare("SELECT id, document_id, content, created_at FROM versions ORDER BY id")
        .map_err(db_error)?;
    let rows = source_statement
        .query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                legacy_optional_integer(row, 3)?,
            ))
        })
        .map_err(db_error)?;
    let mut insert = destination
        .prepare(
            "INSERT INTO versions (id, document_id, content, created_at) VALUES (?1, ?2, ?3, ?4)",
        )
        .map_err(db_error)?;
    let mut count = 0;
    for row in rows {
        let (id, document_id, content, created_at) = row.map_err(db_error)?;
        if !workspace_ids.contains(&document_id) {
            continue;
        }
        insert
            .execute(params![id, document_id, content, created_at])
            .map_err(db_error)?;
        count += 1;
    }
    Ok(count)
}

fn quick_check(connection: &Connection) -> Result<String, String> {
    connection
        .query_row("PRAGMA quick_check", [], |row| row.get(0))
        .map_err(db_error)
}

fn checkpoint_database(path: &Path) -> Result<(), String> {
    let connection = open_write_connection(path)?;
    checkpoint_connection(&connection)
}

fn checkpoint_connection(connection: &Connection) -> Result<(), String> {
    let (busy, _checkpointed_pages): (i64, i64) = connection
        .query_row("PRAGMA wal_checkpoint(TRUNCATE)", [], |row| {
            Ok((row.get(0)?, row.get(2)?))
        })
        .map_err(db_error)?;
    if busy != 0 {
        return Err("数据库正在被占用，无法完成安全切换。".to_string());
    }
    Ok(())
}

fn replace_database_file(candidate: &Path, destination: &Path) -> Result<(), String> {
    let swap_path = destination.with_extension("db.switch-backup");
    recover_interrupted_switch(destination)?;
    fs::rename(destination, &swap_path)
        .map_err(|error| format!("无法准备切换 Tauri 数据库：{error}"))?;
    if let Err(error) = fs::rename(candidate, destination) {
        fs::rename(&swap_path, destination).map_err(|restore_error| {
            format!("导入库切换失败，且自动恢复失败：{error}；{restore_error}")
        })?;
        return Err(format!("导入库切换失败，已恢复原库：{error}"));
    }

    if let Err(validation_error) = validate_database_for_use(destination) {
        remove_sqlite_files(destination).map_err(|cleanup_error| {
            format!(
                "导入库切换后校验失败，且无法清理损坏的新库：{validation_error}；{cleanup_error}"
            )
        })?;
        fs::rename(&swap_path, destination).map_err(|restore_error| {
            format!("导入库切换后校验失败，且自动恢复失败：{validation_error}；{restore_error}")
        })?;
        validate_database_for_use(destination).map_err(|restore_validation_error| {
            format!(
                "导入库切换后校验失败，原库已恢复但校验未通过：{validation_error}；{restore_validation_error}"
            )
        })?;
        return Err(format!(
            "导入库切换后校验失败，已恢复原库：{validation_error}"
        ));
    }
    if let Err(error) = remove_sqlite_files(&swap_path) {
        eprintln!("[database] 新数据库已切换成功，但旧切换备份清理失败：{error}");
    }
    Ok(())
}

fn recover_interrupted_switch(destination: &Path) -> Result<(), String> {
    let swap_path = destination.with_extension("db.switch-backup");
    if !swap_path.exists() {
        return Ok(());
    }

    if destination.exists() {
        if validate_database_for_use(destination).is_ok() {
            if let Err(error) = remove_sqlite_files(&swap_path) {
                eprintln!("[database] 当前数据库校验通过，但上次切换备份清理失败：{error}");
            }
            return Ok(());
        }
        remove_sqlite_files(destination)
            .map_err(|error| format!("无法清理上次切换留下的损坏数据库：{error}"))?;
    }

    fs::rename(&swap_path, destination)
        .map_err(|error| format!("无法恢复上次切换前的数据库：{error}"))?;
    validate_database_for_use(destination)
        .map_err(|error| format!("上次切换前的数据库已恢复，但校验失败：{error}"))
}

fn validate_database_for_use(path: &Path) -> Result<(), String> {
    initialize_schema(path)?;
    let connection = open_read_connection(path)?;
    let result = quick_check(&connection)?;
    if result != "ok" {
        return Err(format!("数据库完整性检查失败：{result}"));
    }
    validate_workspace_matches_documents(&connection, "数据库")?;
    Ok(())
}

fn file_fingerprint(path: &Path) -> Result<FileFingerprint, String> {
    let metadata =
        fs::metadata(path).map_err(|error| format!("无法读取旧数据库文件信息：{error}"))?;
    Ok(FileFingerprint {
        length: metadata.len(),
        modified: metadata.modified().ok(),
    })
}

fn sqlite_companion_path(path: &Path, suffix: &str) -> PathBuf {
    PathBuf::from(format!("{}{suffix}", path.to_string_lossy()))
}

fn ensure_legacy_source_is_closed(path: &Path) -> Result<(), String> {
    for (suffix, label) in [("-wal", "WAL"), ("-journal", "journal")] {
        let companion = sqlite_companion_path(path, suffix);
        let length = match companion.metadata() {
            Ok(metadata) => metadata.len(),
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => 0,
            Err(error) => {
                return Err(format!("无法检查旧数据库的 {label} 日志：{error}"));
            }
        };
        if length > 0 {
            return Err(format!(
                "旧数据库仍有未合并的 {label} 日志。请完全退出 Electron 旧版后重试，不要只复制单个 knowledge.db。"
            ));
        }
    }
    Ok(())
}

fn ensure_legacy_source_unchanged(path: &Path, expected: &FileFingerprint) -> Result<(), String> {
    ensure_legacy_source_is_closed(path)?;
    if &file_fingerprint(path)? != expected {
        return Err("导入期间旧数据库发生了变化。请完全退出 Electron 旧版后重试。".to_string());
    }
    Ok(())
}

fn remove_sqlite_sidecars(path: &Path) -> Result<(), String> {
    for candidate in [
        sqlite_companion_path(path, "-wal"),
        sqlite_companion_path(path, "-shm"),
    ] {
        if candidate.exists() {
            fs::remove_file(&candidate)
                .map_err(|error| format!("无法清理数据库边文件：{error}"))?;
        }
    }
    Ok(())
}

fn remove_sqlite_files(path: &Path) -> Result<(), String> {
    if path.exists() {
        fs::remove_file(path).map_err(|error| format!("无法清理数据库临时文件：{error}"))?;
    }
    remove_sqlite_sidecars(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::tempdir;

    #[test]
    fn imports_real_legacy_timestamps_as_integer_milliseconds() {
        const LEGACY_TIMESTAMP: f64 = 1_780_557_027_766.75;
        const EXPECTED_TIMESTAMP: i64 = 1_780_557_027_766;

        let temp_dir = tempdir().unwrap();
        let source_path = temp_dir.path().join("electron.db");
        let destination_path = temp_dir.path().join("tauri.db");

        {
            let source = Connection::open(&source_path).unwrap();
            source.execute_batch(SCHEMA).unwrap();
            let workspace = json!({
                "id": "root",
                "children": [{
                    "id": "legacy-doc",
                    "type": "file",
                    "name": "旧稿",
                    "createdAt": LEGACY_TIMESTAMP,
                    "updatedAt": LEGACY_TIMESTAMP
                }]
            });
            source
                .execute(
                    "INSERT INTO app_state (key, value) VALUES ('workspace_json', ?1)",
                    [workspace.to_string()],
                )
                .unwrap();
            source
                .execute(
                    "INSERT INTO documents (
                       id, type, name, node_type, created_at, updated_at
                     ) VALUES (?1, 'file', ?2, 'document', ?3, ?3)",
                    params!["legacy-doc", "旧稿", LEGACY_TIMESTAMP],
                )
                .unwrap();
            source
                .execute(
                    "INSERT INTO versions (document_id, content, created_at)
                     VALUES (?1, ?2, ?3)",
                    params!["legacy-doc", "旧版本", LEGACY_TIMESTAMP],
                )
                .unwrap();

            let storage_types: (String, String, String) = source
                .query_row(
                    "SELECT typeof(documents.created_at), typeof(documents.updated_at),
                            (SELECT typeof(created_at) FROM versions LIMIT 1)
                     FROM documents WHERE id = 'legacy-doc'",
                    [],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .unwrap();
            assert_eq!(storage_types, ("real".into(), "real".into(), "real".into()));
        }

        initialize_schema(&destination_path).unwrap();
        let (counts, _) = import_legacy_database(&source_path, &destination_path).unwrap();
        assert_eq!(counts.documents, 1);
        assert_eq!(counts.versions, 1);

        let imported = Connection::open(&destination_path).unwrap();
        let document_timestamps: (i64, i64, String, String) = imported
            .query_row(
                "SELECT created_at, updated_at, typeof(created_at), typeof(updated_at)
                 FROM documents WHERE id = 'legacy-doc'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(
            document_timestamps,
            (
                EXPECTED_TIMESTAMP,
                EXPECTED_TIMESTAMP,
                "integer".into(),
                "integer".into()
            )
        );
        let version_timestamp: (i64, String) = imported
            .query_row(
                "SELECT created_at, typeof(created_at) FROM versions LIMIT 1",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(version_timestamp, (EXPECTED_TIMESTAMP, "integer".into()));

        let workspace_json: String = imported
            .query_row(
                "SELECT value FROM app_state WHERE key = 'workspace_json'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let workspace: JsonValue = serde_json::from_str(&workspace_json).unwrap();
        let documents = flatten_workspace(&workspace).unwrap();
        assert_eq!(documents[0].created_at, Some(EXPECTED_TIMESTAMP));
        assert_eq!(documents[0].updated_at, Some(EXPECTED_TIMESTAMP));
    }
}
