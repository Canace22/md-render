mod ai_proxy;
mod database;
mod desktop_shell;
mod local_agent;
mod local_project;
mod update;

use ai_proxy::{
    tauri_ai_abort_chat_stream, tauri_ai_chat, tauri_ai_chat_stream, tauri_ai_exec_tool,
    tauri_ai_extract_attachment_text, tauri_ai_get_config, tauri_ai_list_tools, tauri_ai_read_url,
    tauri_ai_search_knowledge, AiProxyState,
};
use database::{
    db_get_backlinks, db_get_graph, db_get_version_content, db_get_versions,
    db_import_legacy_database, db_is_migrated, db_load, db_migrate, db_save,
    db_save_version_snapshot, db_search, DatabaseState,
};
use desktop_shell::{open_external_url, save_export_file};
use local_agent::{
    tauri_local_agent_cancel, tauri_local_agent_detect, tauri_local_agent_models,
    tauri_local_agent_run, LocalAgentState,
};
use local_project::{
    create_local_project_file, create_local_project_folder, delete_local_project_entry,
    get_local_project_revision, local_media_protocol_response, read_local_project_file,
    read_read_only_project_file, rename_local_project_entry, reveal_local_project_entry,
    revoke_local_project, revoke_read_only_project, save_binary_asset, save_local_project_file,
    save_local_project_metadata, scan_local_project, scan_read_only_project,
    select_read_only_projects, select_read_write_projects, LocalProjectRegistry,
};
use tauri::Manager;
use update::check_for_update;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RuntimeInfo {
    runtime: &'static str,
    platform: &'static str,
    version: String,
}

#[tauri::command]
fn runtime_info(app: tauri::AppHandle) -> RuntimeInfo {
    let platform = match std::env::consts::OS {
        "macos" => "darwin",
        "windows" => "win32",
        "linux" => "linux",
        other => other,
    };
    let version = app.package_info().version.to_string();

    println!("[desktop-runtime] tauri {platform} {version}");

    RuntimeInfo {
        runtime: "tauri",
        platform,
        version,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AiProxyState::default())
        .manage(LocalAgentState::default())
        .manage(LocalProjectRegistry::default())
        .register_asynchronous_uri_scheme_protocol("local-media", |context, request, responder| {
            let app_handle = context.app_handle().clone();
            let window_label = context.webview_label().to_string();
            let method = request.method().clone();
            let path = request.uri().path().to_string();
            tauri::async_runtime::spawn_blocking(move || {
                let registry = app_handle.state::<LocalProjectRegistry>();
                responder.respond(local_media_protocol_response(
                    registry.inner(),
                    &window_label,
                    &method,
                    &path,
                ));
            });
        })
        .setup(|app| {
            let database = DatabaseState::initialize(app.handle())
                .map_err(|error| std::io::Error::new(std::io::ErrorKind::Other, error))?;
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            runtime_info,
            check_for_update,
            open_external_url,
            save_export_file,
            tauri_ai_get_config,
            tauri_ai_chat,
            tauri_ai_chat_stream,
            tauri_ai_abort_chat_stream,
            tauri_ai_list_tools,
            tauri_ai_exec_tool,
            tauri_ai_search_knowledge,
            tauri_ai_read_url,
            tauri_ai_extract_attachment_text,
            tauri_local_agent_detect,
            tauri_local_agent_models,
            tauri_local_agent_run,
            tauri_local_agent_cancel,
            db_is_migrated,
            db_load,
            db_migrate,
            db_save,
            db_search,
            db_get_graph,
            db_get_backlinks,
            db_get_versions,
            db_get_version_content,
            db_save_version_snapshot,
            db_import_legacy_database,
            select_read_only_projects,
            select_read_write_projects,
            scan_read_only_project,
            scan_local_project,
            get_local_project_revision,
            read_read_only_project_file,
            read_local_project_file,
            revoke_read_only_project,
            revoke_local_project,
            save_local_project_file,
            save_local_project_metadata,
            create_local_project_file,
            create_local_project_folder,
            save_binary_asset,
            rename_local_project_entry,
            delete_local_project_entry,
            reveal_local_project_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running MD Render");
}
