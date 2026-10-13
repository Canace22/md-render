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
        .invoke_handler(tauri::generate_handler![runtime_info])
        .run(tauri::generate_context!())
        .expect("error while running MD Render Tauri Preview");
}
