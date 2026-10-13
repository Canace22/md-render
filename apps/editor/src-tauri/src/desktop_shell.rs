use std::{io::Write, path::Path};

use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use reqwest::Url;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;
use tempfile::NamedTempFile;

const MAX_EXTERNAL_URL_CHARS: usize = 4_096;
const MAX_EXPORT_INPUT_BYTES: usize = 128 * 1024 * 1024;
const MAX_EXPORT_BYTES: usize = 96 * 1024 * 1024;
const MAX_FILTERS: usize = 8;
const MAX_FILTER_NAME_CHARS: usize = 80;
const MAX_FILTER_EXTENSIONS: usize = 8;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportFilter {
    name: String,
    extensions: Vec<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportPayload {
    default_name: String,
    filters: Vec<ExportFilter>,
    content: String,
    encoding: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveExportResponse {
    canceled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file_path: Option<String>,
}

#[tauri::command]
pub fn open_external_url(app: AppHandle, url: String) -> Result<(), String> {
    if url.chars().count() > MAX_EXTERNAL_URL_CHARS {
        return Err("外部链接过长。".to_string());
    }

    let parsed = Url::parse(url.trim()).map_err(|_| "外部链接格式无效。".to_string())?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err("只允许打开 http/https 外部链接。".to_string());
    }

    app.opener()
        .open_url(parsed.as_str(), None::<&str>)
        .map_err(|error| format!("无法打开外部链接：{error}"))
}

#[tauri::command]
pub async fn save_export_file(
    app: AppHandle,
    payload: ExportPayload,
) -> Result<SaveExportResponse, String> {
    if payload.content.len() > MAX_EXPORT_INPUT_BYTES {
        return Err("导出内容过大。".to_string());
    }
    if payload.filters.len() > MAX_FILTERS {
        return Err("导出文件类型过多。".to_string());
    }

    let default_name = sanitize_default_name(&payload.default_name);
    let mut dialog = app
        .dialog()
        .file()
        .set_title("保存导出文件")
        .set_file_name(default_name);
    for filter in &payload.filters {
        let extensions = validate_filter(filter)?;
        let extension_refs = extensions.iter().map(String::as_str).collect::<Vec<_>>();
        dialog = dialog.add_filter(filter.name.trim(), &extension_refs);
    }

    let Some(selected) = dialog.blocking_save_file() else {
        return Ok(SaveExportResponse {
            canceled: true,
            file_path: None,
        });
    };
    let path = selected
        .into_path()
        .map_err(|error| format!("无法读取导出路径：{error}"))?;
    let bytes = decode_export_content(&payload.encoding, &payload.content)?;
    atomic_write(&path, &bytes)?;

    Ok(SaveExportResponse {
        canceled: false,
        file_path: Some(path.to_string_lossy().into_owned()),
    })
}

fn sanitize_default_name(name: &str) -> String {
    let sanitized = name
        .trim()
        .chars()
        .take(180)
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let sanitized = sanitized.trim_matches([' ', '.']);
    if sanitized.is_empty() {
        "export".to_string()
    } else {
        sanitized.to_string()
    }
}

fn validate_filter(filter: &ExportFilter) -> Result<Vec<String>, String> {
    if filter.name.trim().is_empty()
        || filter.name.chars().count() > MAX_FILTER_NAME_CHARS
        || filter.extensions.is_empty()
    {
        return Err("导出文件类型无效。".to_string());
    }
    if filter.extensions.len() > MAX_FILTER_EXTENSIONS {
        return Err("导出文件扩展名过多。".to_string());
    }

    filter
        .extensions
        .iter()
        .map(|extension| {
            let normalized = extension
                .trim()
                .trim_start_matches('.')
                .to_ascii_lowercase();
            if normalized.is_empty()
                || normalized.len() > 16
                || !normalized
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
            {
                return Err("导出文件扩展名无效。".to_string());
            }
            Ok(normalized)
        })
        .collect()
}

fn decode_export_content(encoding: &str, content: &str) -> Result<Vec<u8>, String> {
    let bytes = match encoding {
        "utf8" => content.as_bytes().to_vec(),
        "base64" => BASE64_STANDARD
            .decode(content)
            .map_err(|_| "导出内容的 Base64 编码无效。".to_string())?,
        _ => return Err("不支持的导出编码。".to_string()),
    };
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err("导出文件过大。".to_string());
    }
    Ok(bytes)
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| "导出路径无效。".to_string())?;
    let mut temporary =
        NamedTempFile::new_in(parent).map_err(|error| format!("无法创建导出临时文件：{error}"))?;
    temporary
        .write_all(bytes)
        .map_err(|error| format!("无法写入导出文件：{error}"))?;
    temporary
        .as_file_mut()
        .sync_all()
        .map_err(|error| format!("无法刷新导出文件：{error}"))?;
    temporary
        .persist(path)
        .map_err(|error| format!("无法保存导出文件：{}", error.error))?;
    Ok(())
}
