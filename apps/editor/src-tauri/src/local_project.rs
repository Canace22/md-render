use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::Mutex,
    time::UNIX_EPOCH,
};

use serde::Serialize;
use tauri::{State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use uuid::Uuid;

const MOUNT_ID_PREFIX: &str = "tauri-ro:v1:";
const READ_ONLY_ACCESS: &str = "read-only";
const MAX_DIRECTORY_DEPTH: usize = 16;
const MAX_VISIBLE_FILE_COUNT: usize = 2_000;
const MAX_VISITED_ENTRY_COUNT: usize = 10_000;
const MAX_FILE_BYTES: u64 = 4 * 1024 * 1024;
const MAX_TOTAL_READ_BYTES: u64 = 32 * 1024 * 1024;

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
];

#[derive(Clone)]
struct ReadOnlyProjectMount {
    root: PathBuf,
    display_name: String,
    window_label: String,
}

#[derive(Default)]
pub(crate) struct ReadOnlyProjectRegistry {
    mounts: Mutex<HashMap<String, ReadOnlyProjectMount>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadOnlyWorkspaceNode {
    id: String,
    name: String,
    #[serde(rename = "type")]
    node_type: &'static str,
    relative_path: String,
    read_only: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    children: Option<Vec<ReadOnlyWorkspaceNode>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    disk_content_snapshot: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    updated_at: Option<f64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadOnlyProject {
    mount_id: String,
    project_root_path: String,
    display_name: String,
    access: &'static str,
    workspace: ReadOnlyWorkspaceNode,
    skipped_count: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SelectReadOnlyProjectsResult {
    canceled: bool,
    projects: Vec<ReadOnlyProject>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadReadOnlyProjectFileResult {
    ok: bool,
    data: String,
    encoding: &'static str,
    updated_at: f64,
}

#[derive(Default)]
struct ScanStats {
    read_file_count: usize,
    visited_entry_count: usize,
    total_read_bytes: u64,
    skipped_count: usize,
    entry_limit_reached: bool,
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

fn is_supported_text_file(name: &str) -> bool {
    Path::new(name)
        .extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            extension.eq_ignore_ascii_case("md")
                || extension.eq_ignore_ascii_case("markdown")
                || extension.eq_ignore_ascii_case("txt")
        })
        .unwrap_or(false)
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

fn is_path_within_root(root: &Path, target: &Path) -> bool {
    target.starts_with(root) && target != root
}

fn canonical_file_within_root(root: &Path, target: &Path) -> Option<PathBuf> {
    let canonical_target = fs::canonicalize(target).ok()?;
    if is_path_within_root(root, &canonical_target) {
        Some(canonical_target)
    } else {
        None
    }
}

fn read_supported_text_file(
    root: &Path,
    file_path: &Path,
    metadata: &fs::Metadata,
    stats: &mut ScanStats,
) -> Option<String> {
    if stats.read_file_count >= MAX_VISIBLE_FILE_COUNT
        || metadata.len() > MAX_FILE_BYTES
        || stats.total_read_bytes.saturating_add(metadata.len()) > MAX_TOTAL_READ_BYTES
    {
        return None;
    }

    let canonical_file = canonical_file_within_root(root, file_path)?;
    let remaining_total_bytes = MAX_TOTAL_READ_BYTES.saturating_sub(stats.total_read_bytes);
    let read_limit = MAX_FILE_BYTES.min(remaining_total_bytes);
    let file = fs::File::open(canonical_file).ok()?;
    let mut bytes = Vec::with_capacity(metadata.len().min(read_limit) as usize);
    file.take(read_limit + 1).read_to_end(&mut bytes).ok()?;
    if bytes.len() as u64 > read_limit {
        return None;
    }

    let actual_size = bytes.len() as u64;
    stats.read_file_count += 1;
    stats.total_read_bytes += actual_size;
    let content = String::from_utf8(bytes).ok()?;
    Some(content)
}

fn read_directory_entries(path: &Path, stats: &mut ScanStats) -> Vec<fs::DirEntry> {
    let Ok(entries) = fs::read_dir(path) else {
        stats.skipped_count += 1;
        return Vec::new();
    };

    let mut visible_entries = Vec::new();
    for entry in entries {
        if stats.visited_entry_count >= MAX_VISITED_ENTRY_COUNT {
            stats.entry_limit_reached = true;
            stats.skipped_count += 1;
            break;
        }
        stats.visited_entry_count += 1;

        match entry {
            Ok(entry) => visible_entries.push(entry),
            Err(_) => stats.skipped_count += 1,
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
    stats: &mut ScanStats,
) -> Vec<ReadOnlyWorkspaceNode> {
    if stats.entry_limit_reached {
        return Vec::new();
    }

    let entries = read_directory_entries(directory, stats);
    let mut folders = Vec::new();
    let mut files = Vec::new();

    for entry in entries {
        let Ok(name) = entry.file_name().into_string() else {
            stats.skipped_count += 1;
            continue;
        };
        if is_hidden_name(&name) {
            stats.skipped_count += 1;
            continue;
        }

        let Ok(file_type) = entry.file_type() else {
            stats.skipped_count += 1;
            continue;
        };
        if file_type.is_symlink() {
            stats.skipped_count += 1;
            continue;
        }

        let child_path = entry.path();
        let child_relative_path = join_relative_path(relative_path, &name);

        if file_type.is_dir() {
            if is_ignored_directory(&name) || depth >= MAX_DIRECTORY_DEPTH {
                stats.skipped_count += 1;
                continue;
            }

            let Ok(canonical_child_path) = fs::canonicalize(&child_path) else {
                stats.skipped_count += 1;
                continue;
            };
            if !is_path_within_root(root, &canonical_child_path) {
                stats.skipped_count += 1;
                continue;
            }

            let children = scan_directory(
                root,
                &canonical_child_path,
                &child_relative_path,
                depth + 1,
                stats,
            );
            folders.push(ReadOnlyWorkspaceNode {
                id: format!("folder:{child_relative_path}"),
                name,
                node_type: "folder",
                relative_path: child_relative_path,
                read_only: true,
                children: Some(children),
                content: None,
                disk_content_snapshot: None,
                updated_at: None,
            });
            continue;
        }

        if !file_type.is_file() || !is_supported_text_file(&name) {
            continue;
        }

        let Ok(metadata) = entry.metadata() else {
            stats.skipped_count += 1;
            continue;
        };
        let Some(content) = read_supported_text_file(root, &child_path, &metadata, stats) else {
            stats.skipped_count += 1;
            continue;
        };

        files.push(ReadOnlyWorkspaceNode {
            id: format!("file:{child_relative_path}"),
            name,
            node_type: "file",
            relative_path: child_relative_path,
            read_only: true,
            children: None,
            disk_content_snapshot: Some(content.clone()),
            content: Some(content),
            updated_at: Some(modified_at_millis(&metadata)),
        });
    }

    folders.extend(files);
    folders
}

fn build_workspace(root: &Path, display_name: &str) -> (ReadOnlyWorkspaceNode, usize) {
    let mut stats = ScanStats::default();
    let children = scan_directory(root, root, "", 0, &mut stats);
    (
        ReadOnlyWorkspaceNode {
            id: "root".to_string(),
            name: display_name.to_string(),
            node_type: "folder",
            relative_path: String::new(),
            read_only: true,
            children: Some(children),
            content: None,
            disk_content_snapshot: None,
            updated_at: None,
        },
        stats.skipped_count,
    )
}

fn lock_mounts(
    registry: &ReadOnlyProjectRegistry,
) -> Result<std::sync::MutexGuard<'_, HashMap<String, ReadOnlyProjectMount>>, String> {
    registry
        .mounts
        .lock()
        .map_err(|_| "只读项目会话异常，请重新打开目录".to_string())
}

fn register_mount(
    registry: &ReadOnlyProjectRegistry,
    root: PathBuf,
    display_name: String,
    window_label: String,
) -> Result<String, String> {
    let mount_id = format!("{MOUNT_ID_PREFIX}{}", Uuid::new_v4());
    lock_mounts(registry)?.insert(
        mount_id.clone(),
        ReadOnlyProjectMount {
            root,
            display_name,
            window_label,
        },
    );
    Ok(mount_id)
}

fn resolve_mount(
    registry: &ReadOnlyProjectRegistry,
    mount_id: &str,
    window_label: &str,
) -> Result<ReadOnlyProjectMount, String> {
    if !mount_id.starts_with(MOUNT_ID_PREFIX) {
        return Err("无效的只读项目会话".to_string());
    }

    let mount = lock_mounts(registry)?
        .get(mount_id)
        .cloned()
        .ok_or_else(|| "只读项目会话已失效，请重新打开目录".to_string())?;
    if mount.window_label != window_label {
        return Err("只读项目会话不属于当前窗口".to_string());
    }
    Ok(mount)
}

fn build_project(mount_id: String, mount: &ReadOnlyProjectMount) -> ReadOnlyProject {
    let (workspace, skipped_count) = build_workspace(&mount.root, &mount.display_name);
    ReadOnlyProject {
        project_root_path: mount_id.clone(),
        mount_id,
        display_name: mount.display_name.clone(),
        access: READ_ONLY_ACCESS,
        workspace,
        skipped_count,
    }
}

fn validate_relative_path(relative_path: &str) -> Result<PathBuf, String> {
    let trimmed = relative_path.trim();
    if trimmed.is_empty() || trimmed != relative_path || trimmed.contains('\\') {
        return Err("无效的项目相对路径".to_string());
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
        if is_hidden_name(segment) || is_ignored_directory(segment) {
            return Err("不允许读取隐藏或忽略路径".to_string());
        }
        normalized.push(segment);
    }

    let Some(file_name) = normalized.file_name().and_then(|name| name.to_str()) else {
        return Err("无效的项目相对路径".to_string());
    };
    if !is_supported_text_file(file_name) {
        return Err("只支持读取 Markdown 和 TXT 文件".to_string());
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
            fs::symlink_metadata(&current).map_err(|_| "文件不存在或无法读取".to_string())?;
        if metadata.file_type().is_symlink() {
            return Err("不允许通过符号链接读取项目文件".to_string());
        }
    }
    Ok(())
}

fn resolve_read_target(root: &Path, relative_path: &str) -> Result<PathBuf, String> {
    let normalized = validate_relative_path(relative_path)?;
    reject_symbolic_link_components(root, &normalized)?;
    let target = root.join(normalized);
    let canonical_target =
        fs::canonicalize(target).map_err(|_| "文件不存在或无法读取".to_string())?;
    if !is_path_within_root(root, &canonical_target) {
        return Err("目标文件不在当前项目目录内".to_string());
    }
    Ok(canonical_target)
}

#[tauri::command]
pub(crate) async fn select_read_only_projects(
    window: WebviewWindow,
    registry: State<'_, ReadOnlyProjectRegistry>,
) -> Result<SelectReadOnlyProjectsResult, String> {
    let selected_paths = window
        .dialog()
        .file()
        .set_title("选择只读项目目录")
        .blocking_pick_folders();
    let Some(selected_paths) = selected_paths else {
        return Ok(SelectReadOnlyProjectsResult {
            canceled: true,
            projects: Vec::new(),
        });
    };

    let mut projects = Vec::new();
    for selected_path in selected_paths {
        let selected_path = selected_path
            .into_path()
            .map_err(|_| "所选目录路径无法读取".to_string())?;
        let display_name = display_name_from_path(&selected_path);
        let root = fs::canonicalize(selected_path).map_err(|_| "所选目录无法访问".to_string())?;
        if !root.is_dir() {
            return Err("所选路径不是目录".to_string());
        }

        let mount_id = register_mount(
            registry.inner(),
            root,
            display_name,
            window.label().to_string(),
        )?;
        let mount = resolve_mount(registry.inner(), &mount_id, window.label())?;
        projects.push(build_project(mount_id, &mount));
    }

    Ok(SelectReadOnlyProjectsResult {
        canceled: projects.is_empty(),
        projects,
    })
}

#[tauri::command]
pub(crate) async fn scan_read_only_project(
    window: WebviewWindow,
    registry: State<'_, ReadOnlyProjectRegistry>,
    mount_id: String,
) -> Result<ReadOnlyProject, String> {
    let mount = resolve_mount(registry.inner(), &mount_id, window.label())?;
    Ok(build_project(mount_id, &mount))
}

#[tauri::command]
pub(crate) async fn revoke_read_only_project(
    window: WebviewWindow,
    registry: State<'_, ReadOnlyProjectRegistry>,
    mount_id: String,
) -> Result<(), String> {
    let mut mounts = lock_mounts(registry.inner())?;
    let mount = mounts
        .get(&mount_id)
        .ok_or_else(|| "只读项目会话已失效，请重新打开目录".to_string())?;
    if mount.window_label != window.label() {
        return Err("只读项目会话不属于当前窗口".to_string());
    }
    mounts.remove(&mount_id);
    Ok(())
}

#[tauri::command]
pub(crate) async fn read_read_only_project_file(
    window: WebviewWindow,
    registry: State<'_, ReadOnlyProjectRegistry>,
    mount_id: String,
    relative_path: String,
) -> Result<ReadReadOnlyProjectFileResult, String> {
    let mount = resolve_mount(registry.inner(), &mount_id, window.label())?;
    let target = resolve_read_target(&mount.root, &relative_path)?;
    let metadata = fs::metadata(&target).map_err(|_| "文件不存在或无法读取".to_string())?;
    if !metadata.is_file() {
        return Err("目标路径不是文件".to_string());
    }
    if metadata.len() > MAX_FILE_BYTES {
        return Err("文件过大，无法在只读预览中打开".to_string());
    }

    let file = fs::File::open(target).map_err(|_| "文件读取失败".to_string())?;
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_FILE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| "文件读取失败".to_string())?;
    if bytes.len() as u64 > MAX_FILE_BYTES {
        return Err("文件过大，无法在只读预览中打开".to_string());
    }
    let data = String::from_utf8(bytes).map_err(|_| "文件不是有效的 UTF-8 文本".to_string())?;

    Ok(ReadReadOnlyProjectFileResult {
        ok: true,
        data,
        encoding: "utf8",
        updated_at: modified_at_millis(&metadata),
    })
}
