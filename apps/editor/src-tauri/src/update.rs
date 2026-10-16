use std::time::Duration;

use semver::Version;
use serde::{Deserialize, Serialize};
use tauri::AppHandle;

const LATEST_RELEASE_API: &str = "https://api.github.com/repos/Canace22/md-render/releases/latest";
const UPDATE_CHECK_TIMEOUT_SECONDS: u64 = 15;

#[derive(Deserialize)]
struct GitHubRelease {
    tag_name: String,
    html_url: String,
    body: Option<String>,
    published_at: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateCheckResult {
    status: &'static str,
    version: String,
    release_url: String,
    release_notes: Option<String>,
    release_date: Option<String>,
    manual: bool,
}

fn parse_release_version(tag_name: &str) -> Result<Version, String> {
    let trimmed = tag_name.trim();
    let version = trimmed
        .strip_prefix('v')
        .or_else(|| trimmed.strip_prefix('V'))
        .unwrap_or(trimmed);
    Version::parse(version).map_err(|_| format!("无法识别发布版本：{tag_name}"))
}

#[tauri::command]
pub(crate) async fn check_for_update(app: AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = Version::parse(&app.package_info().version.to_string())
        .map_err(|error| format!("当前应用版本无效：{error}"))?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(UPDATE_CHECK_TIMEOUT_SECONDS))
        .build()
        .map_err(|error| format!("无法初始化更新检查：{error}"))?;
    let response = client
        .get(LATEST_RELEASE_API)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header(reqwest::header::USER_AGENT, "md-render-update-check")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(|error| format!("检查更新失败：{error}"))?;
    let status = response.status();
    if !status.is_success() {
        return Err(format!("检查更新失败（GitHub HTTP {status}）"));
    }

    let payload = response
        .text()
        .await
        .map_err(|error| format!("读取更新信息失败：{error}"))?;
    let release: GitHubRelease =
        serde_json::from_str(&payload).map_err(|error| format!("更新信息格式无效：{error}"))?;
    let latest_version = parse_release_version(&release.tag_name)?;

    Ok(UpdateCheckResult {
        status: if latest_version > current_version {
            "available"
        } else {
            "up-to-date"
        },
        version: latest_version.to_string(),
        release_url: release.html_url,
        release_notes: release.body,
        release_date: release.published_at,
        manual: true,
    })
}
