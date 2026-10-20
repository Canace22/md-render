use std::{
    collections::HashMap,
    env, fs,
    hash::Hasher,
    io::{Read, Write},
    path::{Component, Path, PathBuf},
    process::Command,
    sync::{Mutex, OnceLock},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{
    engine::general_purpose::{STANDARD as BASE64_STANDARD, URL_SAFE_NO_PAD as BASE64_URL_SAFE},
    Engine as _,
};
use serde::Serialize;
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tempfile::NamedTempFile;
use uuid::Uuid;

const READ_ONLY_MOUNT_ID_PREFIX: &str = "tauri-ro:v1:";
const READ_WRITE_MOUNT_ID_PREFIX: &str = "tauri-rw:v1:";
const READ_ONLY_ACCESS: &str = "read-only";
const READ_WRITE_ACCESS: &str = "read-write";
const ASSETS_DIRECTORY_NAME: &str = "assets";
const LOCAL_PROJECT_META_DIR_NAME: &str = ".md-render";
const LOCAL_PROJECT_META_SIDECAR_SUFFIX: &str = ".md-render-meta.json";
const MAX_DIRECTORY_DEPTH: usize = 16;
const MAX_RELATIVE_PATH_BYTES: usize = 4_096;
const MAX_PATH_SEGMENT_BYTES: usize = 255;
const MAX_VISIBLE_FILE_COUNT: usize = 2_000;
const MAX_VISITED_ENTRY_COUNT: usize = 10_000;
const MAX_TEXT_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_TOTAL_READ_BYTES: u64 = 32 * 1024 * 1024;
const MAX_PREVIEW_FILE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_BINARY_ASSET_BYTES: usize = 16 * 1024 * 1024;
const LOCAL_MEDIA_PROTOCOL_PATH_PREFIX: &str = "/tauri/v1/";
const MAX_METADATA_FILE_BYTES: u64 = 256 * 1024;
const MAX_TOTAL_METADATA_BYTES: u64 = 8 * 1024 * 1024;

const ELECTRON_USER_DATA_PATH_SEGMENTS: &[&[&str]] =
    &[&["md-render"], &["@md-render", "editor"], &["MD Render"]];

const IGNORED_DIRECTORY_NAMES: &[&str] = &[
    "node_modules",
    "dist",
    "build",
    "target",
    ".git",
    ".svn",
    ".hg",
    ".cache",
    ".next",
    ".idea",
    ".turbo",
    ".vscode",
];

const SUPPORTED_FILE_EXTENSIONS: &[&str] = &[
    "md", "markdown", "txt", "html", "htm", "docx", "xlsx", "xls", "csv", "rst", "org", "json",
    "png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico", "mp4", "webm", "ogg", "mov", "mp3",
    "wav", "flac", "aac",
];

const IMAGE_FILE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"];
const AUDIO_VIDEO_FILE_EXTENSIONS: &[&str] =
    &["mp4", "webm", "ogg", "mov", "mp3", "wav", "flac", "aac"];
const BINARY_FILE_EXTENSIONS: &[&str] = &["docx", "xlsx", "xls"];

#[derive(Clone, Copy, PartialEq, Eq)]
enum ProjectAccess {
    ReadOnly,
    ReadWrite,
}

impl ProjectAccess {
    fn mount_id_prefix(self) -> &'static str {
        match self {
            Self::ReadOnly => READ_ONLY_MOUNT_ID_PREFIX,
            Self::ReadWrite => READ_WRITE_MOUNT_ID_PREFIX,
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::ReadOnly => READ_ONLY_ACCESS,
            Self::ReadWrite => READ_WRITE_ACCESS,
        }
    }

    fn is_read_only(self) -> bool {
        self == Self::ReadOnly
    }
}

#[derive(Clone)]
struct LocalProjectMount {
    root: PathBuf,
    display_name: String,
    window_label: String,
    access: ProjectAccess,
}

#[derive(Default)]
pub(crate) struct LocalProjectRegistry {
    mounts: Mutex<HashMap<String, LocalProjectMount>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceNode {
    id: String,
    name: String,
    #[serde(rename = "type")]
    node_type: &'static str,
    relative_path: String,
    read_only: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<WorkspaceNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_content_snapshot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    frontmatter_source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    legacy_metadata: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    needs_conversion: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalProject {
    mount_id: String,
    project_root_path: String,
    display_name: String,
    access: &'static str,
    workspace: WorkspaceNode,
    skipped_count: usize,
    complete: bool,
    revision: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalProjectRevision {
    revision: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SelectProjectsResult {
    canceled: bool,
    projects: Vec<LocalProject>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadProjectFileResult {
    ok: bool,
    data: String,
    encoding: &'static str,
    updated_at: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileMutationResult {
    relative_path: String,
    updated_at: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FolderMutationResult {
    relative_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveProjectFileResult {
    ok: bool,
    relative_path: String,
    updated_at: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveBinaryAssetResult {
    relative_path: String,
    file_name: String,
    updated_at: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DeleteProjectEntryResult {
    ok: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RevealProjectEntryResult {
    ok: bool,
    kind: &'static str,
}

struct ScanStats {
    visible_file_count: usize,
    visited_entry_count: usize,
    total_read_bytes: u64,
    total_metadata_bytes: u64,
    skipped_count: usize,
    entry_limit_reached: bool,
    complete: bool,
}

impl Default for ScanStats {
    fn default() -> Self {
        Self {
            visible_file_count: 0,
            visited_entry_count: 0,
            total_read_bytes: 0,
            total_metadata_bytes: 0,
            skipped_count: 0,
            entry_limit_reached: false,
            complete: true,
        }
    }
}

#[derive(Default)]
struct RevisionStats {
    visible_file_count: usize,
    visited_entry_count: usize,
    entry_limit_reached: bool,
    revision_hasher: StableRevisionHasher,
}

struct StableRevisionHasher(u64);

impl Default for StableRevisionHasher {
    fn default() -> Self {
        Self(0xcbf29ce484222325)
    }
}

impl Hasher for StableRevisionHasher {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.0 ^= u64::from(*byte);
            self.0 = self.0.wrapping_mul(0x100000001b3);
        }
    }
}

struct MarkdownDocument {
    frontmatter_prefix: Option<String>,
    gap: String,
    body: String,
}

fn is_frontmatter_delimiter(line: &str) -> bool {
    line.trim_end_matches(['\r', '\n'])
        .trim_end_matches([' ', '\t'])
        == "---"
}

fn parse_markdown_document(raw_content: &str) -> MarkdownDocument {
    let normalized = raw_content.replace("\r\n", "\n");
    let mut lines = normalized.split_inclusive('\n');
    let Some(opening_line) = lines.next() else {
        return MarkdownDocument {
            frontmatter_prefix: None,
            gap: String::new(),
            body: normalized,
        };
    };
    if !is_frontmatter_delimiter(opening_line) {
        return MarkdownDocument {
            frontmatter_prefix: None,
            gap: String::new(),
            body: normalized,
        };
    }

    let mut offset = opening_line.len();
    for line in lines {
        if is_frontmatter_delimiter(line) {
            let closing_line_length = line.trim_end_matches(['\r', '\n']).len();
            let prefix_end = offset + closing_line_length;
            let remainder = &normalized[prefix_end..];
            let gap_length = remainder
                .chars()
                .take_while(|character| *character == '\n')
                .count();
            return MarkdownDocument {
                frontmatter_prefix: Some(normalized[..prefix_end].to_string()),
                gap: remainder[..gap_length].to_string(),
                body: remainder[gap_length..].to_string(),
            };
        }
        offset += line.len();
    }

    MarkdownDocument {
        frontmatter_prefix: None,
        gap: String::new(),
        body: normalized,
    }
}

fn replace_markdown_body(raw_content: &str, next_body: &str) -> String {
    let document = parse_markdown_document(raw_content);
    let Some(prefix) = document.frontmatter_prefix else {
        return next_body.to_string();
    };
    let body = next_body.trim_start_matches('\n');
    let gap = if body.is_empty() {
        "\n"
    } else if document.gap.is_empty() {
        "\n\n"
    } else {
        document.gap.as_str()
    };
    format!("{prefix}{gap}{body}")
}

fn is_hidden_name(name: &str) -> bool {
    name.starts_with('.')
}

fn is_ignored_directory(name: &str) -> bool {
    let lower_name = name.to_ascii_lowercase();
    is_hidden_name(name)
        || IGNORED_DIRECTORY_NAMES
            .iter()
            .any(|ignored| lower_name == *ignored)
}

fn file_extension(name: &str) -> Option<String> {
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
}

fn is_extension_in(name: &str, extensions: &[&str]) -> bool {
    file_extension(name)
        .map(|extension| extensions.contains(&extension.as_str()))
        .unwrap_or(false)
}

fn is_supported_file(name: &str) -> bool {
    is_extension_in(name, SUPPORTED_FILE_EXTENSIONS)
}

fn is_editable_text_file(name: &str) -> bool {
    is_extension_in(name, &["md", "markdown", "txt"])
}

fn is_binary_file(name: &str) -> bool {
    is_extension_in(name, BINARY_FILE_EXTENSIONS)
}

fn is_media_file(name: &str) -> bool {
    is_extension_in(name, IMAGE_FILE_EXTENSIONS)
        || is_extension_in(name, AUDIO_VIDEO_FILE_EXTENSIONS)
}

fn metadata_candidate_paths(file_path: &Path) -> Option<[PathBuf; 2]> {
    let parent = file_path.parent()?;
    let file_name = file_path.file_name()?.to_str()?;
    Some([
        parent
            .join(LOCAL_PROJECT_META_DIR_NAME)
            .join(format!("{file_name}{LOCAL_PROJECT_META_SIDECAR_SUFFIX}")),
        parent.join(format!(".{file_name}{LOCAL_PROJECT_META_SIDECAR_SUFFIX}")),
    ])
}

fn metadata_directory_is_safe(candidate: &Path) -> bool {
    let Some(parent) = candidate.parent() else {
        return false;
    };
    if parent
        .file_name()
        .is_none_or(|name| name != LOCAL_PROJECT_META_DIR_NAME)
    {
        return true;
    }
    fs::symlink_metadata(parent)
        .map(|metadata| metadata.is_dir() && !metadata.file_type().is_symlink())
        .unwrap_or(false)
}

fn read_legacy_metadata(
    root: &Path,
    file_path: &Path,
    stats: &mut ScanStats,
) -> Result<Option<serde_json::Value>, String> {
    let Some(candidates) = metadata_candidate_paths(file_path) else {
        return Ok(None);
    };

    for candidate in candidates {
        let link_metadata = match fs::symlink_metadata(&candidate) {
            Ok(metadata) => metadata,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
            Err(_) => return Err("无法读取旧版文件属性".to_string()),
        };
        if link_metadata.file_type().is_symlink() || !link_metadata.is_file() {
            return Err("旧版文件属性路径不安全".to_string());
        }
        if !metadata_directory_is_safe(&candidate) {
            return Err("旧版属性目录不安全".to_string());
        }

        let canonical_candidate = canonical_target_within_root(root, &candidate)?;
        if link_metadata.len() > MAX_METADATA_FILE_BYTES
            || stats
                .total_metadata_bytes
                .saturating_add(link_metadata.len())
                > MAX_TOTAL_METADATA_BYTES
        {
            return Err("旧版文件属性过大".to_string());
        }
        let mut bytes = Vec::with_capacity(link_metadata.len() as usize);
        fs::File::open(canonical_candidate)
            .map_err(|_| "无法读取旧版文件属性".to_string())?
            .take(MAX_METADATA_FILE_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "无法读取旧版文件属性".to_string())?;
        if bytes.len() as u64 > MAX_METADATA_FILE_BYTES {
            return Err("旧版文件属性过大".to_string());
        }
        stats.total_metadata_bytes += bytes.len() as u64;

        let parsed: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| "旧版文件属性格式无效".to_string())?;
        let payload = parsed
            .get("metadata")
            .filter(|value| value.is_object())
            .unwrap_or(&parsed);
        if !payload.is_object() {
            return Err("旧版文件属性格式无效".to_string());
        }
        return Ok(Some(payload.clone()));
    }

    Ok(None)
}

fn update_legacy_metadata_revision(
    root: &Path,
    file_path: &Path,
    relative_path: &str,
    stats: &mut RevisionStats,
) {
    let Some(candidates) = metadata_candidate_paths(file_path) else {
        return;
    };
    for (index, candidate) in candidates.into_iter().enumerate() {
        let Ok(link_metadata) = fs::symlink_metadata(&candidate) else {
            continue;
        };
        if link_metadata.file_type().is_symlink()
            || !link_metadata.is_file()
            || !metadata_directory_is_safe(&candidate)
            || canonical_target_within_root(root, &candidate).is_err()
        {
            return;
        }
        update_revision(
            &mut stats.revision_hasher,
            &format!("{relative_path}:legacy-metadata:{index}"),
            b'm',
            &link_metadata,
        );
        return;
    }
}

fn media_mime_type(name: &str) -> &'static str {
    match file_extension(name).as_deref() {
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("svg") => "image/svg+xml",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        Some("ico") => "image/x-icon",
        Some("mp4") => "video/mp4",
        Some("webm") => "video/webm",
        Some("ogg") => "application/ogg",
        Some("mov") => "video/quicktime",
        Some("mp3") => "audio/mpeg",
        Some("wav") => "audio/wav",
        Some("flac") => "audio/flac",
        Some("aac") => "audio/aac",
        _ => "application/octet-stream",
    }
}

fn local_media_response(
    status: tauri::http::StatusCode,
    content_type: &'static str,
    body: Vec<u8>,
    content_length: usize,
) -> tauri::http::Response<Vec<u8>> {
    tauri::http::Response::builder()
        .status(status)
        .header(tauri::http::header::CONTENT_TYPE, content_type)
        .header(
            tauri::http::header::CONTENT_LENGTH,
            content_length.to_string(),
        )
        .header(tauri::http::header::CACHE_CONTROL, "private, no-store")
        .header("X-Content-Type-Options", "nosniff")
        .header("Content-Security-Policy", "default-src 'none'")
        .body(body)
        .expect("static local media response headers must be valid")
}

fn local_media_error(status: tauri::http::StatusCode) -> tauri::http::Response<Vec<u8>> {
    let body = b"Local media unavailable".to_vec();
    let content_length = body.len();
    local_media_response(status, "text/plain; charset=utf-8", body, content_length)
}

fn decode_local_media_token(token: &str, maximum_bytes: usize) -> Result<String, String> {
    let maximum_encoded_bytes = maximum_bytes.saturating_add(2) / 3 * 4;
    if token.is_empty() || token.len() > maximum_encoded_bytes {
        return Err("invalid local media token".to_string());
    }
    let bytes = BASE64_URL_SAFE
        .decode(token.as_bytes())
        .map_err(|_| "invalid local media token".to_string())?;
    if bytes.is_empty() || bytes.len() > maximum_bytes {
        return Err("invalid local media token".to_string());
    }
    String::from_utf8(bytes).map_err(|_| "invalid local media token".to_string())
}

fn parse_local_media_protocol_path(path: &str) -> Result<(String, String), String> {
    let payload = path
        .strip_prefix(LOCAL_MEDIA_PROTOCOL_PATH_PREFIX)
        .ok_or_else(|| "invalid local media path".to_string())?;
    let mut segments = payload.split('/');
    let mount_token = segments
        .next()
        .ok_or_else(|| "invalid local media path".to_string())?;
    let path_token = segments
        .next()
        .ok_or_else(|| "invalid local media path".to_string())?;
    if segments.next().is_some() {
        return Err("invalid local media path".to_string());
    }
    let mount_id = decode_local_media_token(mount_token, 128)?;
    let relative_path = decode_local_media_token(path_token, MAX_RELATIVE_PATH_BYTES)?;
    Ok((mount_id, relative_path))
}

fn read_local_media_asset(
    registry: &LocalProjectRegistry,
    window_label: &str,
    mount_id: &str,
    relative_path: &str,
) -> Result<(Vec<u8>, &'static str), String> {
    let mount = resolve_mount(registry, mount_id, window_label)?;
    let normalized = validate_relative_path(relative_path, false, false)?;
    let file_name = normalized
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "invalid local media path".to_string())?;
    if !is_media_file(file_name) {
        return Err("unsupported local media type".to_string());
    }
    let target = resolve_existing_target(&mount.root, relative_path, false)?;
    let (bytes, _) = read_file_bytes(&target, MAX_PREVIEW_FILE_BYTES)?;
    Ok((bytes, media_mime_type(file_name)))
}

pub(crate) fn local_media_protocol_response(
    registry: &LocalProjectRegistry,
    window_label: &str,
    method: &tauri::http::Method,
    path: &str,
) -> tauri::http::Response<Vec<u8>> {
    if method != tauri::http::Method::GET && method != tauri::http::Method::HEAD {
        return local_media_error(tauri::http::StatusCode::METHOD_NOT_ALLOWED);
    }
    let Ok((mount_id, relative_path)) = parse_local_media_protocol_path(path) else {
        return local_media_error(tauri::http::StatusCode::BAD_REQUEST);
    };
    let Ok((bytes, content_type)) =
        read_local_media_asset(registry, window_label, &mount_id, &relative_path)
    else {
        // 未授权、会话过期与文件不存在统一返回 404，不向 WebView 泄露本机路径状态。
        return local_media_error(tauri::http::StatusCode::NOT_FOUND);
    };
    let content_length = bytes.len();
    let body = if method == tauri::http::Method::HEAD {
        Vec::new()
    } else {
        bytes
    };
    local_media_response(
        tauri::http::StatusCode::OK,
        content_type,
        body,
        content_length,
    )
}

fn binary_asset_extension(mime_subtype: &str) -> Option<&'static str> {
    match mime_subtype.trim().to_ascii_lowercase().as_str() {
        "png" => Some("png"),
        "jpeg" | "jpg" => Some("jpg"),
        "gif" => Some("gif"),
        "webp" => Some("webp"),
        "bmp" => Some("bmp"),
        _ => None,
    }
}

fn has_expected_image_signature(bytes: &[u8], extension: &str) -> bool {
    match extension {
        "png" => bytes.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" => bytes.starts_with(&[0xff, 0xd8, 0xff]),
        "gif" => bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a"),
        "webp" => bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP",
        "bmp" => bytes.starts_with(b"BM"),
        _ => false,
    }
}

fn display_name_from_path(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or("本地项目")
        .to_string()
}

fn join_relative_path(parent: &str, name: &str) -> String {
    if parent.is_empty() {
        name.to_string()
    } else {
        format!("{parent}/{name}")
    }
}

fn modified_at_millis(metadata: &fs::Metadata) -> f64 {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs_f64() * 1_000.0)
        .unwrap_or(0.0)
}

fn modified_at_nanos(metadata: &fs::Metadata) -> u128 {
    metadata
        .modified()
        .ok()
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_nanos())
        .unwrap_or(0)
}

fn canonical_or_original(path: PathBuf) -> PathBuf {
    fs::canonicalize(&path).unwrap_or(path)
}

fn push_protected_root(roots: &mut Vec<PathBuf>, path: PathBuf) {
    let normalized = canonical_or_original(path);
    if !roots.contains(&normalized) {
        roots.push(normalized);
    }
}

fn push_electron_user_data_roots(roots: &mut Vec<PathBuf>, base: &Path) {
    for segments in ELECTRON_USER_DATA_PATH_SEGMENTS {
        let path = segments
            .iter()
            .fold(base.to_path_buf(), |current, segment| current.join(segment));
        push_protected_root(roots, path);
    }
}

fn protected_electron_roots() -> &'static [PathBuf] {
    static ROOTS: OnceLock<Vec<PathBuf>> = OnceLock::new();
    ROOTS.get_or_init(|| {
        let mut roots = Vec::new();
        if let Some(home) = env::var_os("HOME").map(PathBuf::from) {
            push_electron_user_data_roots(
                &mut roots,
                &home.join("Library").join("Application Support"),
            );
            push_protected_root(&mut roots, home.join("Documents").join("MdRender"));
            push_electron_user_data_roots(&mut roots, &home.join(".config"));
        }
        if let Some(profile) = env::var_os("USERPROFILE").map(PathBuf::from) {
            push_protected_root(&mut roots, profile.join("Documents").join("MdRender"));
        }
        for variable in ["APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME"] {
            if let Some(base) = env::var_os(variable).map(PathBuf::from) {
                push_electron_user_data_roots(&mut roots, &base);
            }
        }
        roots
    })
}

#[cfg(not(target_os = "windows"))]
fn is_same_or_within(path: &Path, parent: &Path) -> bool {
    path == parent || path.starts_with(parent)
}

#[cfg(target_os = "windows")]
fn is_same_or_within(path: &Path, parent: &Path) -> bool {
    let path = path.to_string_lossy().replace('/', "\\").to_lowercase();
    let parent = parent
        .to_string_lossy()
        .replace('/', "\\")
        .trim_end_matches('\\')
        .to_lowercase();
    path == parent || path.starts_with(&format!("{parent}\\"))
}

fn is_protected_electron_path(path: &Path) -> bool {
    protected_electron_roots()
        .iter()
        .any(|protected_root| is_same_or_within(path, protected_root))
}

fn overlaps_protected_electron_tree(path: &Path) -> bool {
    protected_electron_roots().iter().any(|protected_root| {
        is_same_or_within(path, protected_root) || is_same_or_within(protected_root, path)
    })
}

fn is_path_within_root(root: &Path, target: &Path) -> bool {
    target.starts_with(root) && target != root
}

fn ensure_not_protected(path: &Path) -> Result<(), String> {
    if is_protected_electron_path(path) {
        return Err("为保护旧版 Electron 数据，请通过设置里的「Electron 数据交接」导入，不要把该目录直接当作项目打开。".to_string());
    }
    Ok(())
}

fn canonical_target_within_root(root: &Path, target: &Path) -> Result<PathBuf, String> {
    let canonical_target =
        fs::canonicalize(target).map_err(|_| "目标不存在或无法访问".to_string())?;
    if !is_path_within_root(root, &canonical_target) {
        return Err("目标不在当前项目目录内".to_string());
    }
    ensure_not_protected(&canonical_target)?;
    Ok(canonical_target)
}

fn update_revision(
    hasher: &mut StableRevisionHasher,
    relative_path: &str,
    entry_kind: u8,
    metadata: &fs::Metadata,
) {
    hasher.write_u8(entry_kind);
    hasher.write(relative_path.as_bytes());
    hasher.write_u8(0);
    hasher.write_u64(metadata.len());
    hasher.write(&modified_at_nanos(metadata).to_le_bytes());
}

fn read_revision_directory_entries(path: &Path, stats: &mut RevisionStats) -> Vec<fs::DirEntry> {
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };

    let mut visible_entries = Vec::new();
    for entry in entries {
        if stats.visited_entry_count >= MAX_VISITED_ENTRY_COUNT {
            stats.entry_limit_reached = true;
            break;
        }
        stats.visited_entry_count += 1;
        if let Ok(entry) = entry {
            visible_entries.push(entry);
        }
    }

    visible_entries.sort_by(|left, right| {
        left.file_name()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&right.file_name().to_string_lossy().to_lowercase())
    });
    visible_entries
}

fn scan_revision_directory(
    root: &Path,
    directory: &Path,
    relative_path: &str,
    depth: usize,
    stats: &mut RevisionStats,
) {
    if stats.entry_limit_reached {
        return;
    }

    for entry in read_revision_directory_entries(directory, stats) {
        let Ok(name) = entry.file_name().into_string() else {
            continue;
        };
        if is_hidden_name(&name) {
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }

        let child_path = entry.path();
        let child_relative_path = join_relative_path(relative_path, &name);
        if file_type.is_dir() {
            if is_ignored_directory(&name) || depth >= MAX_DIRECTORY_DEPTH {
                continue;
            }
            let Ok(canonical_child_path) = fs::canonicalize(&child_path) else {
                continue;
            };
            if !is_path_within_root(root, &canonical_child_path)
                || is_protected_electron_path(&canonical_child_path)
            {
                continue;
            }
            let Ok(metadata) = entry.metadata() else {
                continue;
            };
            update_revision(
                &mut stats.revision_hasher,
                &child_relative_path,
                b'd',
                &metadata,
            );
            scan_revision_directory(
                root,
                &canonical_child_path,
                &child_relative_path,
                depth + 1,
                stats,
            );
            continue;
        }

        if !file_type.is_file()
            || !is_supported_file(&name)
            || stats.visible_file_count >= MAX_VISIBLE_FILE_COUNT
        {
            continue;
        }
        let Ok(metadata) = entry.metadata() else {
            continue;
        };
        if canonical_target_within_root(root, &child_path).is_err() {
            continue;
        }
        update_revision(
            &mut stats.revision_hasher,
            &child_relative_path,
            b'f',
            &metadata,
        );
        update_legacy_metadata_revision(root, &child_path, &child_relative_path, stats);
        stats.visible_file_count += 1;
    }
}

fn build_project_revision(root: &Path) -> String {
    let mut stats = RevisionStats::default();
    scan_revision_directory(root, root, "", 0, &mut stats);
    format!("{:016x}", stats.revision_hasher.finish())
}

fn read_supported_text_file(
    root: &Path,
    file_path: &Path,
    metadata: &fs::Metadata,
    stats: &mut ScanStats,
) -> Option<String> {
    if metadata.len() > MAX_TEXT_FILE_BYTES
        || stats.total_read_bytes.saturating_add(metadata.len()) > MAX_TOTAL_READ_BYTES
    {
        return None;
    }

    let canonical_file = canonical_target_within_root(root, file_path).ok()?;
    let remaining_total_bytes = MAX_TOTAL_READ_BYTES.saturating_sub(stats.total_read_bytes);
    let read_limit = MAX_TEXT_FILE_BYTES.min(remaining_total_bytes);
    let file = fs::File::open(canonical_file).ok()?;
    let mut bytes = Vec::with_capacity(metadata.len().min(read_limit) as usize);
    file.take(read_limit + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > read_limit {
        return None;
    }

    stats.total_read_bytes += bytes.len() as u64;
    String::from_utf8(bytes).ok()
}

fn read_directory_entries(path: &Path, stats: &mut ScanStats) -> Vec<fs::DirEntry> {
    let Ok(entries) = fs::read_dir(path) else {
        stats.skipped_count += 1;
        stats.complete = false;
        return Vec::new();
    };

    let mut visible_entries = Vec::new();
    for entry in entries {
        if stats.visited_entry_count >= MAX_VISITED_ENTRY_COUNT {
            stats.entry_limit_reached = true;
            stats.skipped_count += 1;
            stats.complete = false;
            break;
        }
        stats.visited_entry_count += 1;

        match entry {
            Ok(entry) => visible_entries.push(entry),
            Err(_) => {
                stats.skipped_count += 1;
                stats.complete = false;
            }
        }
    }

    visible_entries.sort_by(|left, right| {
        left.file_name()
            .to_string_lossy()
            .to_lowercase()
            .cmp(&right.file_name().to_string_lossy().to_lowercase())
    });
    visible_entries
}

fn scan_directory(
    root: &Path,
    directory: &Path,
    relative_path: &str,
    depth: usize,
    access: ProjectAccess,
    stats: &mut ScanStats,
) -> Vec<WorkspaceNode> {
    if stats.entry_limit_reached {
        return Vec::new();
    }

    let entries = read_directory_entries(directory, stats);
    let mut folders = Vec::new();
    let mut files = Vec::new();

    for entry in entries {
        let Ok(name) = entry.file_name().into_string() else {
            stats.skipped_count += 1;
            stats.complete = false;
            continue;
        };
        if is_hidden_name(&name) {
            stats.skipped_count += 1;
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            stats.skipped_count += 1;
            stats.complete = false;
            continue;
        };
        if file_type.is_symlink() {
            stats.skipped_count += 1;
            continue;
        }

        let child_path = entry.path();
        let child_relative_path = join_relative_path(relative_path, &name);

        if file_type.is_dir() {
            if is_ignored_directory(&name) {
                stats.skipped_count += 1;
                continue;
            }
            if depth >= MAX_DIRECTORY_DEPTH {
                stats.skipped_count += 1;
                stats.complete = false;
                continue;
            }

            let Ok(canonical_child_path) = fs::canonicalize(&child_path) else {
                stats.skipped_count += 1;
                stats.complete = false;
                continue;
            };
            if !is_path_within_root(root, &canonical_child_path)
                || is_protected_electron_path(&canonical_child_path)
            {
                stats.skipped_count += 1;
                continue;
            }
            let children = scan_directory(
                root,
                &canonical_child_path,
                &child_relative_path,
                depth + 1,
                access,
                stats,
            );
            folders.push(WorkspaceNode {
                id: format!("folder:{child_relative_path}"),
                name,
                node_type: "folder",
                relative_path: child_relative_path,
                read_only: access.is_read_only(),
                children: Some(children),
                content: None,
                disk_content_snapshot: None,
                frontmatter_source: None,
                legacy_metadata: None,
                needs_conversion: None,
                updated_at: None,
            });
            continue;
        }

        if !file_type.is_file() || !is_supported_file(&name) {
            stats.skipped_count += 1;
            continue;
        }
        if stats.visible_file_count >= MAX_VISIBLE_FILE_COUNT {
            stats.skipped_count += 1;
            stats.complete = false;
            continue;
        }

        let Ok(metadata) = entry.metadata() else {
            stats.skipped_count += 1;
            stats.complete = false;
            continue;
        };
        let Ok(canonical_file) = canonical_target_within_root(root, &child_path) else {
            stats.skipped_count += 1;
            stats.complete = false;
            continue;
        };
        let legacy_metadata = match read_legacy_metadata(root, &canonical_file, stats) {
            Ok(metadata) => metadata,
            Err(_) => {
                stats.skipped_count += 1;
                stats.complete = false;
                None
            }
        };
        let (content, disk_content_snapshot, frontmatter_source, needs_conversion) =
            if is_editable_text_file(&name) {
                let Some(content) =
                    read_supported_text_file(root, &canonical_file, &metadata, stats)
                else {
                    stats.skipped_count += 1;
                    stats.complete = false;
                    continue;
                };
                let document = parse_markdown_document(&content);
                let body = document.body;
                (
                    Some(body.clone()),
                    Some(body),
                    document.frontmatter_prefix,
                    None,
                )
            } else {
                (None, None, None, Some(true))
            };
        stats.visible_file_count += 1;

        files.push(WorkspaceNode {
            id: format!("file:{child_relative_path}"),
            name,
            node_type: "file",
            relative_path: child_relative_path,
            read_only: access.is_read_only(),
            children: None,
            content,
            disk_content_snapshot,
            frontmatter_source,
            legacy_metadata,
            needs_conversion,
            updated_at: Some(modified_at_millis(&metadata)),
        });
    }

    folders.extend(files);
    folders
}

fn build_workspace(
    root: &Path,
    display_name: &str,
    access: ProjectAccess,
) -> (WorkspaceNode, usize, bool, String) {
    let revision_before = build_project_revision(root);
    let mut stats = ScanStats::default();
    let children = scan_directory(root, root, "", 0, access, &mut stats);
    let revision = build_project_revision(root);
    let complete = stats.complete && revision_before == revision;
    (
        WorkspaceNode {
            id: "root".to_string(),
            name: display_name.to_string(),
            node_type: "folder",
            relative_path: String::new(),
            read_only: access.is_read_only(),
            children: Some(children),
            content: None,
            disk_content_snapshot: None,
            frontmatter_source: None,
            legacy_metadata: None,
            needs_conversion: None,
            updated_at: None,
        },
        stats.skipped_count,
        complete,
        revision,
    )
}

fn lock_mounts(
    registry: &LocalProjectRegistry,
) -> Result<std::sync::MutexGuard<'_, HashMap<String, LocalProjectMount>>, String> {
    registry
        .mounts
        .lock()
        .map_err(|_| "本地项目会话异常，请重新打开目录".to_string())
}

fn register_mount(
    registry: &LocalProjectRegistry,
    root: PathBuf,
    display_name: String,
    window_label: String,
    access: ProjectAccess,
) -> Result<String, String> {
    let mount_id = format!("{}{}", access.mount_id_prefix(), Uuid::new_v4());
    lock_mounts(registry)?.insert(
        mount_id.clone(),
        LocalProjectMount {
            root,
            display_name,
            window_label,
            access,
        },
    );
    Ok(mount_id)
}

fn remove_mounts(registry: &LocalProjectRegistry, mount_ids: &[String]) {
    if let Ok(mut mounts) = lock_mounts(registry) {
        mount_ids.iter().for_each(|mount_id| {
            mounts.remove(mount_id);
        });
    }
}

fn has_known_mount_prefix(mount_id: &str) -> bool {
    mount_id.starts_with(READ_ONLY_MOUNT_ID_PREFIX)
        || mount_id.starts_with(READ_WRITE_MOUNT_ID_PREFIX)
}

fn resolve_mount(
    registry: &LocalProjectRegistry,
    mount_id: &str,
    window_label: &str,
) -> Result<LocalProjectMount, String> {
    if !has_known_mount_prefix(mount_id) {
        return Err("无效的本地项目会话".to_string());
    }

    let mount = lock_mounts(registry)?
        .get(mount_id)
        .cloned()
        .ok_or_else(|| "本地项目会话已失效，请重新打开目录".to_string())?;
    if mount.window_label != window_label {
        return Err("本地项目会话不属于当前窗口".to_string());
    }
    if !mount_id.starts_with(mount.access.mount_id_prefix()) {
        return Err("本地项目会话权限不匹配".to_string());
    }
    Ok(mount)
}

fn resolve_read_only_mount(
    registry: &LocalProjectRegistry,
    mount_id: &str,
    window_label: &str,
) -> Result<LocalProjectMount, String> {
    let mount = resolve_mount(registry, mount_id, window_label)?;
    if mount.access != ProjectAccess::ReadOnly {
        return Err("该命令只接受只读项目会话".to_string());
    }
    Ok(mount)
}

fn resolve_writable_mount(
    registry: &LocalProjectRegistry,
    mount_id: &str,
    window_label: &str,
) -> Result<LocalProjectMount, String> {
    let mount = resolve_mount(registry, mount_id, window_label)?;
    if mount.access != ProjectAccess::ReadWrite {
        return Err("当前项目只读，不能修改磁盘内容".to_string());
    }
    Ok(mount)
}

fn build_project(mount_id: String, mount: &LocalProjectMount) -> LocalProject {
    let (workspace, skipped_count, complete, revision) =
        build_workspace(&mount.root, &mount.display_name, mount.access);
    LocalProject {
        project_root_path: mount_id.clone(),
        mount_id,
        display_name: mount.display_name.clone(),
        access: mount.access.label(),
        workspace,
        skipped_count,
        complete,
        revision,
    }
}

async fn build_project_in_background(
    mount_id: String,
    mount: LocalProjectMount,
) -> Result<LocalProject, String> {
    tauri::async_runtime::spawn_blocking(move || build_project(mount_id, &mount))
        .await
        .map_err(|_| "扫描本地项目失败".to_string())
}

async fn build_revision_in_background(
    mount: LocalProjectMount,
) -> Result<LocalProjectRevision, String> {
    tauri::async_runtime::spawn_blocking(move || LocalProjectRevision {
        revision: build_project_revision(&mount.root),
    })
    .await
    .map_err(|_| "读取本地项目状态失败".to_string())
}

fn is_portable_new_name(name: &str) -> bool {
    if name.is_empty()
        || name.ends_with(' ')
        || name.ends_with('.')
        || name
            .chars()
            .any(|character| character.is_control() || "<>:\"|?*".contains(character))
    {
        return false;
    }

    let stem = name.split('.').next().unwrap_or(name).to_ascii_uppercase();
    !matches!(stem.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        && !(stem.len() == 4
            && (stem.starts_with("COM") || stem.starts_with("LPT"))
            && stem.as_bytes()[3].is_ascii_digit()
            && stem.as_bytes()[3] != b'0')
}

fn validate_relative_path(
    relative_path: &str,
    allow_empty: bool,
    validate_new_names: bool,
) -> Result<PathBuf, String> {
    let trimmed = relative_path.trim();
    if (!allow_empty && trimmed.is_empty())
        || trimmed != relative_path
        || trimmed.contains('\\')
        || trimmed.len() > MAX_RELATIVE_PATH_BYTES
    {
        return Err("无效的项目相对路径".to_string());
    }
    if trimmed.is_empty() {
        return Ok(PathBuf::new());
    }

    let path = Path::new(trimmed);
    if path.is_absolute() {
        return Err("无效的项目相对路径".to_string());
    }

    let mut normalized = PathBuf::new();
    let mut component_count = 0;
    for component in path.components() {
        let Component::Normal(segment) = component else {
            return Err("无效的项目相对路径".to_string());
        };
        component_count += 1;
        if component_count > MAX_DIRECTORY_DEPTH + 1 {
            return Err("项目相对路径层级过深".to_string());
        }
        let Some(segment) = segment.to_str() else {
            return Err("无效的项目相对路径".to_string());
        };
        if segment.as_bytes().len() > MAX_PATH_SEGMENT_BYTES
            || is_hidden_name(segment)
            || is_ignored_directory(segment)
            || (validate_new_names && !is_portable_new_name(segment))
        {
            return Err("项目路径包含不允许的名称".to_string());
        }
        normalized.push(segment);
    }
    Ok(normalized)
}

fn reject_symbolic_link_components(root: &Path, relative_path: &Path) -> Result<(), String> {
    let mut current = root.to_path_buf();
    for component in relative_path.components() {
        let Component::Normal(segment) = component else {
            return Err("无效的项目相对路径".to_string());
        };
        current.push(segment);
        let metadata =
            fs::symlink_metadata(&current).map_err(|_| "目标不存在或无法访问".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("不允许通过符号链接访问项目内容".to_string());
        }
    }
    Ok(())
}

fn resolve_existing_target(
    root: &Path,
    relative_path: &str,
    allow_root: bool,
) -> Result<PathBuf, String> {
    let normalized = validate_relative_path(relative_path, allow_root, false)?;
    if normalized.as_os_str().is_empty() {
        ensure_not_protected(root)?;
        return Ok(root.to_path_buf());
    }
    reject_symbolic_link_components(root, &normalized)?;
    canonical_target_within_root(root, &root.join(normalized))
}

fn resolve_new_target(root: &Path, relative_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let normalized = validate_relative_path(relative_path, false, true)?;
    let target = root.join(&normalized);
    if target.exists() {
        return Err("目标已存在，请换一个名称".to_string());
    }
    let parent_relative = normalized.parent().unwrap_or_else(|| Path::new(""));
    if !parent_relative.as_os_str().is_empty() {
        reject_symbolic_link_components(root, parent_relative)?;
    }
    let parent = fs::canonicalize(root.join(parent_relative))
        .map_err(|_| "目标父目录不存在或无法访问".to_string())?;
    if parent != root && !is_path_within_root(root, &parent) {
        return Err("目标不在当前项目目录内".to_string());
    }
    ensure_not_protected(&parent)?;
    ensure_not_protected(&target)?;
    Ok((target, normalized))
}

fn ensure_supported_target_file(relative_path: &Path) -> Result<(), String> {
    let Some(file_name) = relative_path.file_name().and_then(|name| name.to_str()) else {
        return Err("无效的项目文件路径".to_string());
    };
    if !is_supported_file(file_name) {
        return Err("不支持该文件类型".to_string());
    }
    Ok(())
}

fn ensure_editable_text_target(relative_path: &Path) -> Result<(), String> {
    let Some(file_name) = relative_path.file_name().and_then(|name| name.to_str()) else {
        return Err("无效的项目文件路径".to_string());
    };
    if !is_editable_text_file(file_name) {
        return Err("只允许写入 Markdown 和 TXT 文件".to_string());
    }
    Ok(())
}

fn atomic_write_text(target: &Path, content: &str) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "无法定位目标父目录".to_string())?;
    let mut temporary =
        NamedTempFile::new_in(parent).map_err(|_| "无法创建临时保存文件".to_string())?;
    if let Ok(metadata) = fs::metadata(target) {
        temporary
            .as_file()
            .set_permissions(metadata.permissions())
            .map_err(|_| "无法保留原文件权限".to_string())?;
    }
    temporary
        .write_all(content.as_bytes())
        .map_err(|_| "写入临时保存文件失败".to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|_| "刷新临时保存文件失败".to_string())?;
    temporary
        .persist(target)
        .map_err(|_| "替换目标文件失败，原文件未被修改".to_string())?;
    Ok(())
}

fn atomic_create_bytes(target: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = target
        .parent()
        .ok_or_else(|| "无法定位目标父目录".to_string())?;
    let mut temporary =
        NamedTempFile::new_in(parent).map_err(|_| "无法创建临时文件".to_string())?;
    temporary
        .write_all(bytes)
        .map_err(|_| "写入临时文件失败".to_string())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|_| "刷新临时文件失败".to_string())?;
    temporary
        .persist_noclobber(target)
        .map_err(|_| "目标已存在或无法完成原子写入".to_string())?;
    Ok(())
}

fn read_file_bytes(target: &Path, maximum_bytes: u64) -> Result<(Vec<u8>, fs::Metadata), String> {
    let metadata = fs::metadata(target).map_err(|_| "文件不存在或无法读取".to_string())?;
    if !metadata.is_file() {
        return Err("目标路径不是文件".to_string());
    }
    if metadata.len() > maximum_bytes {
        return Err("文件过大，无法在预览中打开".to_string());
    }

    let file = fs::File::open(target).map_err(|_| "文件读取失败".to_string())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(maximum_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "文件读取失败".to_string())?;
    if bytes.len() as u64 > maximum_bytes {
        return Err("文件过大，无法在预览中打开".to_string());
    }
    Ok((bytes, metadata))
}

fn read_project_file(
    mount: &LocalProjectMount,
    relative_path: &str,
) -> Result<ReadProjectFileResult, String> {
    let normalized = validate_relative_path(relative_path, false, false)?;
    ensure_supported_target_file(&normalized)?;
    let target = resolve_existing_target(&mount.root, relative_path, false)?;
    let file_name = normalized
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "无效的项目文件路径".to_string())?;
    let maximum_bytes = if is_media_file(file_name) || is_binary_file(file_name) {
        MAX_PREVIEW_FILE_BYTES
    } else {
        MAX_TEXT_FILE_BYTES
    };
    let (bytes, metadata) = read_file_bytes(&target, maximum_bytes)?;

    let (data, encoding) = if is_media_file(file_name) {
        (
            format!(
                "data:{};base64,{}",
                media_mime_type(file_name),
                BASE64_STANDARD.encode(bytes)
            ),
            "fileUrl",
        )
    } else if is_binary_file(file_name) {
        (BASE64_STANDARD.encode(bytes), "base64")
    } else {
        (
            String::from_utf8(bytes).map_err(|_| "文件不是有效的 UTF-8 文本".to_string())?,
            "utf8",
        )
    };

    Ok(ReadProjectFileResult {
        ok: true,
        data,
        encoding,
        updated_at: modified_at_millis(&metadata),
    })
}

fn ensure_directory_fully_visible(
    mount: &LocalProjectMount,
    directory: &Path,
    relative_path: &str,
) -> Result<(), String> {
    let normalized = validate_relative_path(relative_path, false, false)?;
    let depth = normalized.components().count();
    let mut stats = ScanStats::default();
    scan_directory(
        &mount.root,
        directory,
        relative_path,
        depth,
        mount.access,
        &mut stats,
    );
    if stats.skipped_count > 0 || stats.entry_limit_reached {
        return Err(
            "目录包含隐藏、忽略、超限或不支持的内容，请在系统文件管理器中确认后删除".to_string(),
        );
    }
    Ok(())
}

async fn select_projects(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    access: ProjectAccess,
) -> Result<SelectProjectsResult, String> {
    let title = if access.is_read_only() {
        "选择只读项目目录"
    } else {
        "选择可读写项目目录（不会访问正式版数据）"
    };
    let selected_paths = window
        .dialog()
        .file()
        .set_title(title)
        .blocking_pick_folders();
    let Some(selected_paths) = selected_paths else {
        return Ok(SelectProjectsResult {
            canceled: true,
            projects: Vec::new(),
        });
    };

    let mut selected_roots = Vec::new();
    for selected_path in selected_paths {
        let selected_path = selected_path
            .into_path()
            .map_err(|_| "所选目录路径无法读取".to_string())?;
        let root = fs::canonicalize(selected_path).map_err(|_| "所选目录无法访问".to_string())?;
        if !root.is_dir() {
            return Err("所选路径不是目录".to_string());
        }
        if overlaps_protected_electron_tree(&root) {
            return Err(
                "为保护正式版数据，请选择不包含 Electron 数据或 Documents/MdRender 的独立目录"
                    .to_string(),
            );
        }

        selected_roots.push((root.clone(), display_name_from_path(&root)));
    }

    let mut projects = Vec::new();
    let mut registered_mount_ids = Vec::new();
    for (root, display_name) in selected_roots {
        let mount_id = match register_mount(
            registry.inner(),
            root,
            display_name,
            window.label().to_string(),
            access,
        ) {
            Ok(mount_id) => mount_id,
            Err(error) => {
                remove_mounts(registry.inner(), &registered_mount_ids);
                return Err(error);
            }
        };
        registered_mount_ids.push(mount_id.clone());
        let mount = match resolve_mount(registry.inner(), &mount_id, window.label()) {
            Ok(mount) => mount,
            Err(error) => {
                remove_mounts(registry.inner(), &registered_mount_ids);
                return Err(error);
            }
        };
        match build_project_in_background(mount_id, mount).await {
            Ok(project) => projects.push(project),
            Err(error) => {
                remove_mounts(registry.inner(), &registered_mount_ids);
                return Err(error);
            }
        }
    }

    Ok(SelectProjectsResult {
        canceled: projects.is_empty(),
        projects,
    })
}

fn revoke_project(
    window: &WebviewWindow,
    registry: &LocalProjectRegistry,
    mount_id: &str,
    required_access: Option<ProjectAccess>,
) -> Result<(), String> {
    let mut mounts = lock_mounts(registry)?;
    let mount = mounts
        .get(mount_id)
        .ok_or_else(|| "本地项目会话已失效，请重新打开目录".to_string())?;
    if mount.window_label != window.label() {
        return Err("本地项目会话不属于当前窗口".to_string());
    }
    if required_access.is_some_and(|access| mount.access != access) {
        return Err("本地项目会话权限不匹配".to_string());
    }
    mounts.remove(mount_id);
    Ok(())
}

fn open_in_system_file_manager(target: &Path, is_directory: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut command = Command::new("open");
        if !is_directory {
            command.arg("-R");
        }
        command.arg(target);
        command
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut command = Command::new("explorer");
        if is_directory {
            command.arg(target);
        } else {
            command.arg(format!("/select,{}", target.display()));
        }
        command
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut command = Command::new("xdg-open");
        let open_target = if is_directory {
            target
        } else {
            target.parent().unwrap_or(target)
        };
        command.arg(open_target);
        command
    };

    command
        .spawn()
        .map_err(|_| "无法打开系统文件管理器".to_string())?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn select_read_only_projects(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
) -> Result<SelectProjectsResult, String> {
    select_projects(window, registry, ProjectAccess::ReadOnly).await
}

#[tauri::command]
pub(crate) async fn select_read_write_projects(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
) -> Result<SelectProjectsResult, String> {
    select_projects(window, registry, ProjectAccess::ReadWrite).await
}

#[tauri::command]
pub(crate) async fn scan_read_only_project(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
) -> Result<LocalProject, String> {
    let mount = resolve_read_only_mount(registry.inner(), &mount_id, window.label())?;
    build_project_in_background(mount_id, mount).await
}

#[tauri::command]
pub(crate) async fn scan_local_project(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
) -> Result<LocalProject, String> {
    let mount = resolve_mount(registry.inner(), &mount_id, window.label())?;
    build_project_in_background(mount_id, mount).await
}

#[tauri::command]
pub(crate) async fn get_local_project_revision(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
) -> Result<LocalProjectRevision, String> {
    let mount = resolve_mount(registry.inner(), &mount_id, window.label())?;
    build_revision_in_background(mount).await
}

#[tauri::command]
pub(crate) async fn revoke_read_only_project(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
) -> Result<(), String> {
    revoke_project(
        &window,
        registry.inner(),
        &mount_id,
        Some(ProjectAccess::ReadOnly),
    )
}

#[tauri::command]
pub(crate) async fn revoke_local_project(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
) -> Result<(), String> {
    revoke_project(&window, registry.inner(), &mount_id, None)
}

#[tauri::command]
pub(crate) async fn read_read_only_project_file(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
) -> Result<ReadProjectFileResult, String> {
    let mount = resolve_read_only_mount(registry.inner(), &mount_id, window.label())?;
    read_project_file(&mount, &relative_path)
}

#[tauri::command]
pub(crate) async fn read_local_project_file(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
) -> Result<ReadProjectFileResult, String> {
    let mount = resolve_mount(registry.inner(), &mount_id, window.label())?;
    read_project_file(&mount, &relative_path)
}

#[tauri::command]
pub(crate) async fn save_local_project_file(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
    content: String,
    expected_updated_at: Option<f64>,
) -> Result<SaveProjectFileResult, String> {
    if content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("文件过大，已拒绝保存".to_string());
    }
    let mount = resolve_writable_mount(registry.inner(), &mount_id, window.label())?;
    let normalized = validate_relative_path(&relative_path, false, false)?;
    ensure_editable_text_target(&normalized)?;

    let unresolved_target = mount.root.join(&normalized);
    if !unresolved_target.exists() {
        return Err("目标文件已被删除或移动，请刷新后再保存".to_string());
    }
    let target = resolve_existing_target(&mount.root, &relative_path, false)?;
    let metadata =
        fs::metadata(&target).map_err(|_| "目标文件已被删除或移动，请刷新后再保存".to_string())?;
    if !metadata.is_file() {
        return Err("目标路径不是文件".to_string());
    }
    if let Some(expected) = expected_updated_at.filter(|value| *value > 0.0) {
        if (modified_at_millis(&metadata) - expected).abs() > 1.0 {
            return Err("文件已在磁盘被修改，请刷新后再保存".to_string());
        }
    }

    let (current_bytes, _) = read_file_bytes(&target, MAX_TEXT_FILE_BYTES)?;
    let current_content =
        String::from_utf8(current_bytes).map_err(|_| "文件不是有效的 UTF-8 文本".to_string())?;
    let disk_content = replace_markdown_body(&current_content, &content);
    atomic_write_text(&target, &disk_content)?;
    let metadata = fs::metadata(&target).map_err(|_| "保存后无法读取文件状态".to_string())?;
    Ok(SaveProjectFileResult {
        ok: true,
        relative_path,
        updated_at: modified_at_millis(&metadata),
    })
}

#[tauri::command]
pub(crate) async fn save_local_project_metadata(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
    raw_content: String,
    expected_updated_at: Option<f64>,
) -> Result<SaveProjectFileResult, String> {
    if raw_content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("文件过大，已拒绝保存元数据".to_string());
    }
    let mount = resolve_writable_mount(registry.inner(), &mount_id, window.label())?;
    let normalized = validate_relative_path(&relative_path, false, false)?;
    ensure_editable_text_target(&normalized)?;
    let target = resolve_existing_target(&mount.root, &relative_path, false)?;
    let metadata = fs::metadata(&target).map_err(|_| "目标文件不存在或无法访问".to_string())?;
    if !metadata.is_file() {
        return Err("目标路径不是文件".to_string());
    }
    if let Some(expected) = expected_updated_at.filter(|value| *value > 0.0) {
        if (modified_at_millis(&metadata) - expected).abs() > 1.0 {
            return Err("文件已在磁盘被修改，请刷新后再保存元数据".to_string());
        }
    }
    atomic_write_text(&target, &raw_content)?;
    let saved_metadata = fs::metadata(&target).map_err(|_| "保存后无法读取文件状态".to_string())?;
    Ok(SaveProjectFileResult {
        ok: true,
        relative_path,
        updated_at: modified_at_millis(&saved_metadata),
    })
}

#[tauri::command]
pub(crate) async fn create_local_project_file(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
    content: String,
) -> Result<FileMutationResult, String> {
    if content.len() as u64 > MAX_TEXT_FILE_BYTES {
        return Err("文件过大，已拒绝创建".to_string());
    }
    let mount = resolve_writable_mount(registry.inner(), &mount_id, window.label())?;
    let (target, normalized) = resolve_new_target(&mount.root, &relative_path)?;
    ensure_editable_text_target(&normalized)?;
    atomic_create_bytes(&target, content.as_bytes())?;
    let metadata = fs::metadata(&target).map_err(|_| "创建后无法读取文件状态".to_string())?;
    Ok(FileMutationResult {
        relative_path,
        updated_at: modified_at_millis(&metadata),
    })
}

#[tauri::command]
pub(crate) async fn create_local_project_folder(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
) -> Result<FolderMutationResult, String> {
    let mount = resolve_writable_mount(registry.inner(), &mount_id, window.label())?;
    let (target, _) = resolve_new_target(&mount.root, &relative_path)?;
    fs::create_dir(&target).map_err(|_| "创建文件夹失败，目标可能已存在".to_string())?;
    Ok(FolderMutationResult { relative_path })
}

#[tauri::command]
pub(crate) async fn save_binary_asset(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    base64: String,
    mime_subtype: String,
) -> Result<SaveBinaryAssetResult, String> {
    let mount = resolve_writable_mount(registry.inner(), &mount_id, window.label())?;
    let extension = binary_asset_extension(&mime_subtype)
        .ok_or_else(|| "仅支持 PNG、JPEG、GIF、WebP 和 BMP 图片".to_string())?;
    let maximum_encoded_bytes = (MAX_BINARY_ASSET_BYTES + 2) / 3 * 4;
    if base64.is_empty() || base64.len() > maximum_encoded_bytes {
        return Err("图片为空或超过 16 MiB 限制".to_string());
    }
    let bytes = BASE64_STANDARD
        .decode(base64.as_bytes())
        .map_err(|_| "图片 base64 数据无效".to_string())?;
    if bytes.is_empty() || bytes.len() > MAX_BINARY_ASSET_BYTES {
        return Err("图片为空或超过 16 MiB 限制".to_string());
    }
    if !has_expected_image_signature(&bytes, extension) {
        return Err("图片内容与声明格式不一致".to_string());
    }

    let assets_relative = Path::new(ASSETS_DIRECTORY_NAME);
    let assets_path = mount.root.join(assets_relative);
    if assets_path.exists() {
        reject_symbolic_link_components(&mount.root, assets_relative)?;
        let canonical_assets = canonical_target_within_root(&mount.root, &assets_path)?;
        if !canonical_assets.is_dir() {
            return Err("assets 已存在但不是文件夹".to_string());
        }
    } else {
        ensure_not_protected(&assets_path)?;
        fs::create_dir(&assets_path).map_err(|_| "创建 assets 文件夹失败".to_string())?;
    }

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let file_name = format!("截图-{timestamp}-{}.{}", Uuid::new_v4(), extension);
    let relative_path = format!("{ASSETS_DIRECTORY_NAME}/{file_name}");
    let (target, _) = resolve_new_target(&mount.root, &relative_path)?;
    atomic_create_bytes(&target, &bytes)?;
    let metadata = fs::metadata(&target).map_err(|_| "保存后无法读取图片状态".to_string())?;
    Ok(SaveBinaryAssetResult {
        relative_path,
        file_name,
        updated_at: modified_at_millis(&metadata),
    })
}

#[tauri::command]
pub(crate) async fn rename_local_project_entry(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
    new_relative_path: String,
) -> Result<FileMutationResult, String> {
    let mount = resolve_writable_mount(registry.inner(), &mount_id, window.label())?;
    let source = resolve_existing_target(&mount.root, &relative_path, false)?;
    let source_metadata = fs::metadata(&source).map_err(|_| "源目标不存在".to_string())?;
    if source_metadata.is_dir() && overlaps_protected_electron_tree(&source) {
        return Err("不能移动包含正式版数据的目录".to_string());
    }
    let (destination, normalized_destination) =
        resolve_new_target(&mount.root, &new_relative_path)?;
    if source_metadata.is_file() {
        ensure_supported_target_file(&normalized_destination)?;
    } else if !source_metadata.is_dir() {
        return Err("不支持移动该目标类型".to_string());
    }
    if source_metadata.is_dir()
        && destination
            .parent()
            .is_some_and(|parent| is_same_or_within(parent, &source))
    {
        return Err("不能把文件夹移动到自身内部".to_string());
    }

    fs::rename(&source, &destination).map_err(|_| "重命名或移动失败".to_string())?;
    let metadata = fs::metadata(&destination).map_err(|_| "移动后无法读取目标状态".to_string())?;
    Ok(FileMutationResult {
        relative_path: new_relative_path,
        updated_at: modified_at_millis(&metadata),
    })
}

#[tauri::command]
pub(crate) async fn delete_local_project_entry(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
) -> Result<DeleteProjectEntryResult, String> {
    let mount = resolve_writable_mount(registry.inner(), &mount_id, window.label())?;
    tauri::async_runtime::spawn_blocking(move || {
        let target = resolve_existing_target(&mount.root, &relative_path, false)?;
        let metadata = fs::metadata(&target).map_err(|_| "目标不存在".to_string())?;
        if metadata.is_file() {
            let normalized = validate_relative_path(&relative_path, false, false)?;
            ensure_supported_target_file(&normalized)?;
            fs::remove_file(&target).map_err(|_| "删除文件失败".to_string())?;
        } else if metadata.is_dir() {
            if overlaps_protected_electron_tree(&target) {
                return Err("不能删除包含正式版数据的目录".to_string());
            }
            ensure_directory_fully_visible(&mount, &target, &relative_path)?;
            fs::remove_dir_all(&target).map_err(|_| "删除文件夹失败".to_string())?;
        } else {
            return Err("不支持删除该目标类型".to_string());
        }
        Ok(DeleteProjectEntryResult { ok: true })
    })
    .await
    .map_err(|_| "删除本地项目内容失败".to_string())?
}

#[tauri::command]
pub(crate) async fn reveal_local_project_entry(
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    mount_id: String,
    relative_path: String,
) -> Result<RevealProjectEntryResult, String> {
    let mount = resolve_mount(registry.inner(), &mount_id, window.label())?;
    let target = resolve_existing_target(&mount.root, &relative_path, true)?;
    let metadata = fs::metadata(&target).map_err(|_| "目标不存在或无法访问".to_string())?;
    let is_directory = metadata.is_dir();
    if !is_directory && !metadata.is_file() {
        return Err("不支持定位该目标类型".to_string());
    }
    open_in_system_file_manager(&target, is_directory)?;
    Ok(RevealProjectEntryResult {
        ok: true,
        kind: if is_directory { "directory" } else { "file" },
    })
}
