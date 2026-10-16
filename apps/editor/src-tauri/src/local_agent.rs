use std::{
    collections::HashMap,
    env, fs,
    path::{Path, PathBuf},
    process::Stdio,
    sync::Mutex,
    time::Duration,
};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{Child, Command},
    sync::watch,
    time::timeout,
};

use crate::local_project::{resolve_agent_work_dir, LocalProjectRegistry};

const LOCAL_AGENT_EVENT: &str = "tauri-local-agent://event";
const COMMAND_TIMEOUT: Duration = Duration::from_secs(4);
const RUN_TIMEOUT: Duration = Duration::from_secs(30 * 60);
const MCP_NOTICE: &str = "Tauri 版已使用本机 agent；md-render 内部工具尚未迁移，本轮只操作已授权的项目或应用私有工作目录";

#[derive(Clone, Copy)]
struct AgentDefinition {
    id: &'static str,
    label: &'static str,
    bins: &'static [&'static str],
    priority: u16,
    login_args: Option<&'static [&'static str]>,
    model_presets: &'static [&'static str],
    effort_levels: &'static [&'static str],
}

const AGENTS: &[AgentDefinition] = &[
    AgentDefinition {
        id: "codex",
        label: "Codex",
        bins: &["codex"],
        priority: 10,
        login_args: Some(&["login", "status"]),
        model_presets: &["gpt-6.1-sol", "gpt-6-astra", "gpt-5.6-sol"],
        effort_levels: &["low", "medium", "high", "xhigh", "max"],
    },
    AgentDefinition {
        id: "claude",
        label: "Claude Code",
        bins: &["claude"],
        priority: 20,
        login_args: None,
        model_presets: &["fable", "opus", "sonnet", "haiku"],
        effort_levels: &["low", "medium", "high", "xhigh", "max"],
    },
    AgentDefinition {
        id: "cursor",
        label: "Cursor",
        bins: &["cursor-agent", "agent"],
        priority: 30,
        login_args: Some(&["status"]),
        model_presets: &["auto"],
        effort_levels: &[],
    },
];

#[derive(Default)]
pub(crate) struct LocalAgentState {
    active: Mutex<HashMap<String, watch::Sender<bool>>>,
}

#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectPayload {
    #[serde(default)]
    refresh: bool,
}

#[derive(Deserialize)]
pub(crate) struct ModelsPayload {
    id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunPayload {
    run_id: String,
    agent_id: String,
    #[serde(default)]
    prompt: String,
    #[serde(default)]
    model: String,
    #[serde(default)]
    effort: String,
    #[serde(default)]
    session_id: String,
    #[serde(default)]
    safe_mode: bool,
    #[serde(default)]
    read_only: bool,
    #[serde(default)]
    project_root: String,
    #[serde(default)]
    system_prompt: String,
    #[serde(default)]
    context_text: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CancelPayload {
    run_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetectedAgent {
    id: &'static str,
    label: &'static str,
    kind: &'static str,
    priority: u16,
    supported: bool,
    installed: bool,
    version: String,
    path: String,
    status: &'static str,
}

#[derive(Serialize)]
pub(crate) struct DetectResult {
    agents: Vec<DetectedAgent>,
}

#[derive(Serialize)]
pub(crate) struct ModelOption {
    id: String,
    label: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ModelsResult {
    models: Vec<ModelOption>,
    default_model: String,
    efforts: Vec<String>,
    default_effort: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RunResult {
    cancelled: bool,
    timed_out: bool,
    cwd: String,
}

#[derive(Serialize)]
pub(crate) struct CancelResult {
    cancelled: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LocalAgentEventPayload {
    run_id: String,
    event: Value,
}

#[derive(Default)]
struct ParsedOutput {
    session_id: String,
    last_text: String,
    last_error: String,
}

fn home_dir() -> PathBuf {
    env::var_os("HOME")
        .or_else(|| env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default()
}

fn common_bin_dirs(home: &Path) -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    let relative = [
        "AppData/Roaming/npm",
        "AppData/Local/pnpm",
        "scoop/shims",
        ".local/bin",
        ".bun/bin",
        ".cursor/bin",
        "AppData/Local/cursor-agent",
        "AppData/Roaming/fnm/aliases/default",
        "AppData/Local/fnm/aliases/default",
    ];
    #[cfg(not(target_os = "windows"))]
    let relative = [
        ".local/bin",
        ".npm-global/bin",
        ".volta/bin",
        ".bun/bin",
        ".claude/local",
        ".cursor/bin",
        ".local/share/fnm/aliases/default/bin",
    ];
    let mut dirs: Vec<PathBuf> = relative.iter().map(|dir| home.join(dir)).collect();
    #[cfg(not(target_os = "windows"))]
    {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
    }
    dirs
}

fn parse_env_output(output: &[u8]) -> HashMap<String, String> {
    let marker = b"__MD_RENDER_ENV__";
    let body = output
        .windows(marker.len())
        .position(|part| part == marker)
        .map(|index| &output[index + marker.len()..])
        .unwrap_or(output);
    body.split(|byte| *byte == 0)
        .filter_map(|pair| {
            let index = pair.iter().position(|byte| *byte == b'=')?;
            let key = String::from_utf8_lossy(&pair[..index]).trim().to_string();
            if key.is_empty() {
                return None;
            }
            Some((key, String::from_utf8_lossy(&pair[index + 1..]).to_string()))
        })
        .collect()
}

async fn read_login_shell_env() -> HashMap<String, String> {
    #[cfg(target_os = "windows")]
    {
        HashMap::new()
    }
    #[cfg(not(target_os = "windows"))]
    {
        let shell = env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        for flag in ["-ilc", "-lc"] {
            let mut command = Command::new(&shell);
            command
                .args([flag, "printf '__MD_RENDER_ENV__'; env -0"])
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .kill_on_drop(true);
            let Ok(Ok(output)) = timeout(COMMAND_TIMEOUT, command.output()).await else {
                continue;
            };
            let parsed = parse_env_output(&output.stdout);
            if parsed.contains_key("PATH") {
                return parsed;
            }
        }
        HashMap::new()
    }
}

async fn agent_env() -> HashMap<String, String> {
    let shell_env = read_login_shell_env().await;
    let process_env: HashMap<String, String> = env::vars().collect();
    let home = home_dir();
    let mut dirs: Vec<PathBuf> = shell_env
        .get("PATH")
        .into_iter()
        .flat_map(env::split_paths)
        .chain(
            process_env
                .get("PATH")
                .into_iter()
                .flat_map(env::split_paths),
        )
        .chain(common_bin_dirs(&home))
        .collect();
    dirs.dedup();
    let mut merged = shell_env;
    merged.extend(process_env);
    if let Ok(path) = env::join_paths(dirs) {
        merged.insert("PATH".to_string(), path.to_string_lossy().to_string());
    }
    merged.remove("ELECTRON_RUN_AS_NODE");
    merged
}

fn executable_names(bin: &str) -> Vec<String> {
    #[cfg(target_os = "windows")]
    {
        vec![format!("{bin}.exe"), format!("{bin}.cmd")]
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![bin.to_string()]
    }
}

fn is_executable(path: &Path) -> bool {
    let Ok(metadata) = fs::metadata(path) else {
        return false;
    };
    if !metadata.is_file() {
        return false;
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        metadata.permissions().mode() & 0o111 != 0
    }
    #[cfg(not(unix))]
    {
        true
    }
}

fn candidate_paths(agent: AgentDefinition, env_map: &HashMap<String, String>) -> Vec<PathBuf> {
    let home = home_dir();
    let mut dirs: Vec<PathBuf> = env_map
        .get("PATH")
        .into_iter()
        .flat_map(env::split_paths)
        .chain(common_bin_dirs(&home))
        .collect();
    dirs.dedup();
    let mut paths = Vec::new();
    for bin in agent.bins {
        for dir in &dirs {
            for name in executable_names(bin) {
                paths.push(dir.join(name));
            }
        }
    }
    #[cfg(target_os = "macos")]
    if agent.id == "codex" {
        paths.extend([
            PathBuf::from("/Applications/Codex.app/Contents/Resources/codex"),
            home.join("Applications/Codex.app/Contents/Resources/codex"),
            PathBuf::from("/Applications/ChatGPT.app/Contents/Resources/codex"),
            home.join("Applications/ChatGPT.app/Contents/Resources/codex"),
        ]);
    }
    paths
}

#[cfg(target_os = "windows")]
fn quote_cmd_arg(value: &str) -> String {
    let escaped = value
        .replace('^', "^^")
        .replace('&', "^&")
        .replace('|', "^|")
        .replace('<', "^<")
        .replace('>', "^>")
        .replace('"', "\"\"");
    format!("\"{escaped}\"")
}

fn agent_command(path: &Path, args: &[String]) -> Command {
    #[cfg(target_os = "windows")]
    if path
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("cmd"))
    {
        let command_line = std::iter::once(quote_cmd_arg(&path.to_string_lossy()))
            .chain(args.iter().map(|arg| quote_cmd_arg(arg)))
            .collect::<Vec<_>>()
            .join(" ");
        let mut command = Command::new("cmd.exe");
        command.args(["/d", "/s", "/c", &command_line]);
        return command;
    }
    let mut command = Command::new(path);
    command.args(args);
    command
}

async fn run_short(
    path: &Path,
    args: &[String],
    env_map: &HashMap<String, String>,
) -> Option<(bool, String)> {
    let mut command = agent_command(path, args);
    command
        .env_clear()
        .envs(env_map)
        .env("NO_COLOR", "1")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    let output = timeout(COMMAND_TIMEOUT, command.output())
        .await
        .ok()?
        .ok()?;
    let text = format!(
        "{}\n{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    )
    .trim()
    .to_string();
    Some((output.status.success(), text))
}

fn looks_like_cursor(path: &Path, version: &str) -> bool {
    if path
        .to_string_lossy()
        .to_ascii_lowercase()
        .contains("cursor")
    {
        return true;
    }
    let first = version.lines().next().unwrap_or_default().trim();
    let parts: Vec<&str> = first.split('-').collect();
    parts.len() == 2
        && parts[0].split('.').count() == 3
        && parts[0]
            .chars()
            .all(|character| character.is_ascii_digit() || character == '.')
        && parts[1]
            .chars()
            .all(|character| character.is_ascii_hexdigit())
}

async fn locate_agent(
    agent: AgentDefinition,
    env_map: &HashMap<String, String>,
) -> Option<(PathBuf, String)> {
    for path in candidate_paths(agent, env_map) {
        if !is_executable(&path) {
            continue;
        }
        let Some((ok, version)) = run_short(&path, &["--version".to_string()], env_map).await
        else {
            continue;
        };
        if !ok
            || (agent.id == "cursor"
                && path.file_name().is_some_and(|name| name == "agent")
                && !looks_like_cursor(&path, &version))
        {
            continue;
        }
        return Some((
            path,
            version
                .lines()
                .next()
                .unwrap_or_default()
                .trim()
                .to_string(),
        ));
    }
    None
}

async fn detect_agent(agent: AgentDefinition, env_map: &HashMap<String, String>) -> DetectedAgent {
    let Some((path, version)) = locate_agent(agent, env_map).await else {
        return DetectedAgent {
            id: agent.id,
            label: agent.label,
            kind: "agent",
            priority: agent.priority,
            supported: true,
            installed: false,
            version: String::new(),
            path: String::new(),
            status: "missing",
        };
    };
    let status = if let Some(login_args) = agent.login_args {
        let args = login_args
            .iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>();
        match run_short(&path, &args, env_map).await {
            Some((true, output))
                if !output.to_ascii_lowercase().contains("not logged in")
                    && !output.to_ascii_lowercase().contains("unauthorized") =>
            {
                "ready"
            }
            Some(_) => "needs-login",
            None => "unverified",
        }
    } else {
        "unverified"
    };
    DetectedAgent {
        id: agent.id,
        label: agent.label,
        kind: "agent",
        priority: agent.priority,
        supported: true,
        installed: true,
        version,
        path: path.to_string_lossy().to_string(),
        status,
    }
}

fn definition(id: &str) -> Option<AgentDefinition> {
    AGENTS.iter().copied().find(|agent| agent.id == id)
}

fn compose_prompt(payload: &RunPayload) -> String {
    let preamble = [
        if payload.session_id.is_empty() {
            payload.system_prompt.as_str()
        } else {
            ""
        },
        payload.context_text.as_str(),
    ]
    .into_iter()
    .filter(|part| !part.trim().is_empty())
    .collect::<Vec<_>>()
    .join("\n\n");
    if preamble.is_empty() {
        payload.prompt.clone()
    } else {
        format!("{preamble}\n\n---\n\n{}", payload.prompt)
    }
}

fn build_launch(payload: &RunPayload) -> Result<(Vec<String>, String), String> {
    let mut args = Vec::new();
    let stdin = match payload.agent_id.as_str() {
        "codex" => {
            args.extend(["exec", "--json", "--skip-git-repo-check"].map(String::from));
            if payload.read_only {
                args.extend(["--sandbox", "read-only"].map(String::from));
            } else if payload.safe_mode {
                args.extend(["--sandbox", "workspace-write"].map(String::from));
            } else {
                args.push("--dangerously-bypass-approvals-and-sandbox".to_string());
            }
            if !payload.model.is_empty() {
                args.extend(["-m".to_string(), payload.model.clone()]);
            }
            if !payload.effort.is_empty()
                && payload
                    .effort
                    .chars()
                    .all(|character| character.is_ascii_lowercase())
            {
                args.extend([
                    "-c".to_string(),
                    format!("model_reasoning_effort=\"{}\"", payload.effort),
                ]);
            }
            if !payload.session_id.is_empty() {
                args.extend(["resume".to_string(), payload.session_id.clone()]);
            }
            args.push("-".to_string());
            compose_prompt(payload)
        }
        "claude" => {
            args.extend(["-p", "--output-format", "stream-json", "--verbose"].map(String::from));
            if payload.read_only {
                args.extend(
                    [
                        "--permission-mode",
                        "plan",
                        "--tools",
                        "Read,Glob,Grep,LS,WebSearch,WebFetch",
                    ]
                    .map(String::from),
                );
            } else if payload.safe_mode {
                args.extend(["--permission-mode", "acceptEdits"].map(String::from));
            } else {
                args.push("--dangerously-skip-permissions".to_string());
            }
            if !payload.model.is_empty() {
                args.extend(["--model".to_string(), payload.model.clone()]);
            }
            if !payload.effort.is_empty() {
                args.extend(["--effort".to_string(), payload.effort.clone()]);
            }
            if !payload.session_id.is_empty() {
                args.extend(["--resume".to_string(), payload.session_id.clone()]);
            }
            let appended = [&payload.system_prompt, &payload.context_text]
                .into_iter()
                .filter(|part| !part.trim().is_empty())
                .cloned()
                .collect::<Vec<_>>()
                .join("\n\n");
            if !appended.is_empty() {
                args.extend(["--append-system-prompt".to_string(), appended]);
            }
            payload.prompt.clone()
        }
        "cursor" => {
            args.extend(
                [
                    "-p",
                    "--output-format",
                    "stream-json",
                    "--trust",
                    "--approve-mcps",
                ]
                .map(String::from),
            );
            if payload.read_only {
                args.extend(["--mode", "ask"].map(String::from));
            } else if !payload.safe_mode {
                args.push("--force".to_string());
            }
            if !payload.model.is_empty() {
                args.extend(["--model".to_string(), payload.model.clone()]);
            }
            if !payload.session_id.is_empty() {
                args.extend(["--resume".to_string(), payload.session_id.clone()]);
            }
            compose_prompt(payload)
        }
        _ => return Err("还不支持这个本机 agent".to_string()),
    };
    Ok((args, stdin))
}

fn text_content(content: &Value) -> String {
    content
        .as_array()
        .into_iter()
        .flatten()
        .filter(|item| item.get("type").and_then(Value::as_str) == Some("text"))
        .filter_map(|item| item.get("text").and_then(Value::as_str))
        .collect::<Vec<_>>()
        .join("\n")
}

fn emit_event(window: &WebviewWindow, run_id: &str, event: Value) {
    let _ = window.emit(
        LOCAL_AGENT_EVENT,
        LocalAgentEventPayload {
            run_id: run_id.to_string(),
            event,
        },
    );
}

fn append_text(state: &mut ParsedOutput, text: String, window: &WebviewWindow, run_id: &str) {
    if text.trim().is_empty() {
        return;
    }
    state.last_text = text.clone();
    emit_event(
        window,
        run_id,
        json!({ "type": "assistant_text", "text": text }),
    );
}

fn parse_agent_line(
    agent_id: &str,
    line: &str,
    state: &mut ParsedOutput,
    window: &WebviewWindow,
    run_id: &str,
) {
    let Ok(event) = serde_json::from_str::<Value>(line.trim()) else {
        return;
    };
    let event_type = event
        .get("type")
        .and_then(Value::as_str)
        .unwrap_or_default();
    match agent_id {
        "codex" => match event_type {
            "thread.started" => {
                state.session_id = event
                    .get("thread_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                emit_event(
                    window,
                    run_id,
                    json!({ "type": "session", "sessionId": state.session_id }),
                );
            }
            "item.completed" => {
                let item = &event["item"];
                if item.get("type").and_then(Value::as_str) == Some("agent_message") {
                    append_text(
                        state,
                        item.get("text")
                            .and_then(Value::as_str)
                            .unwrap_or_default()
                            .to_string(),
                        window,
                        run_id,
                    );
                } else if item.get("type").and_then(Value::as_str) == Some("error") {
                    state.last_error = item
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                }
            }
            "turn.completed" => {}
            "turn.failed" => {
                state.last_error = event
                    .pointer("/error/message")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
            }
            "error" => {
                let message = event
                    .get("message")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                let lower = message.to_ascii_lowercase();
                if !["reconnect", "retrying", "stream disconnected"]
                    .iter()
                    .any(|part| lower.contains(part))
                {
                    state.last_error = message;
                }
            }
            _ => {}
        },
        "claude" | "cursor" => match event_type {
            "system" if event.get("subtype").and_then(Value::as_str) == Some("init") => {
                state.session_id = event
                    .get("session_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string();
                emit_event(
                    window,
                    run_id,
                    json!({ "type": "session", "sessionId": state.session_id }),
                );
            }
            "assistant" => append_text(
                state,
                text_content(&event["message"]["content"]),
                window,
                run_id,
            ),
            "result" => {
                state.session_id = event
                    .get("session_id")
                    .and_then(Value::as_str)
                    .unwrap_or(&state.session_id)
                    .to_string();
                let failed = event
                    .get("is_error")
                    .and_then(Value::as_bool)
                    .unwrap_or(false)
                    || event
                        .get("subtype")
                        .and_then(Value::as_str)
                        .is_some_and(|subtype| subtype != "success");
                if failed {
                    state.last_error = event
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .or_else(|| event.get("result").and_then(Value::as_str))
                        .unwrap_or_default()
                        .to_string();
                } else if agent_id == "claude" || state.last_text.is_empty() {
                    let result = event
                        .get("result")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_string();
                    if !result.trim().is_empty() {
                        state.last_text = result;
                    }
                }
            }
            "error" => {
                state.last_error = event
                    .get("message")
                    .and_then(Value::as_str)
                    .or_else(|| event.pointer("/error/message").and_then(Value::as_str))
                    .unwrap_or_default()
                    .to_string()
            }
            _ => {}
        },
        _ => {}
    }
}

fn error_event(message: String) -> Value {
    let lower = message.to_ascii_lowercase();
    let network = [
        "403",
        "forbidden",
        "econnrefused",
        "etimedout",
        "unable to connect",
        "fetch failed",
    ]
    .iter()
    .any(|part| lower.contains(part));
    let auth = !network
        && [
            "/login",
            "not logged in",
            "authentication",
            "invalid api key",
            "unauthorized",
            "credential",
        ]
        .iter()
        .any(|part| lower.contains(part));
    json!({ "type": "error", "message": message, "auth": auth, "network": network })
}

async fn terminate_child(child: &mut Child) {
    let Some(pid) = child.id() else {
        let _ = child.kill().await;
        return;
    };
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill")
            .args(["/pid", &pid.to_string(), "/T", "/F"])
            .status()
            .await;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("kill")
            .args(["-TERM", &format!("-{pid}")])
            .status()
            .await;
    }
    let _ = child.kill().await;
}

fn work_dir(
    app: &AppHandle,
    window: &WebviewWindow,
    registry: &LocalProjectRegistry,
    project_root: &str,
) -> Result<PathBuf, String> {
    if !project_root.is_empty() {
        return resolve_agent_work_dir(registry, project_root, window.label());
    }
    let fallback = app
        .path()
        .app_data_dir()
        .map_err(|_| "无法读取应用数据目录".to_string())?
        .join("local-agent-workdir");
    fs::create_dir_all(&fallback).map_err(|_| "无法创建本机 agent 工作目录".to_string())?;
    Ok(fallback)
}

#[tauri::command]
pub(crate) async fn tauri_local_agent_detect(
    payload: DetectPayload,
) -> Result<DetectResult, String> {
    let _ = payload.refresh;
    let env_map = agent_env().await;
    let mut agents = Vec::new();
    for agent in AGENTS {
        agents.push(detect_agent(*agent, &env_map).await);
    }
    Ok(DetectResult { agents })
}

#[tauri::command]
pub(crate) async fn tauri_local_agent_models(
    payload: ModelsPayload,
) -> Result<ModelsResult, String> {
    let agent = definition(&payload.id).ok_or_else(|| "还不支持这个本机 agent".to_string())?;
    Ok(ModelsResult {
        models: agent
            .model_presets
            .iter()
            .map(|model| ModelOption {
                id: (*model).to_string(),
                label: (*model).to_string(),
            })
            .collect(),
        default_model: String::new(),
        efforts: agent
            .effort_levels
            .iter()
            .map(|effort| (*effort).to_string())
            .collect(),
        default_effort: String::new(),
    })
}

#[tauri::command]
pub(crate) async fn tauri_local_agent_run(
    app: AppHandle,
    window: WebviewWindow,
    registry: State<'_, LocalProjectRegistry>,
    state: State<'_, LocalAgentState>,
    payload: RunPayload,
) -> Result<RunResult, String> {
    if payload.run_id.trim().is_empty() {
        return Err("缺少 runId".to_string());
    }
    let agent =
        definition(&payload.agent_id).ok_or_else(|| "还不支持这个本机 agent".to_string())?;
    let env_map = agent_env().await;
    let (path, _) = locate_agent(agent, &env_map)
        .await
        .ok_or_else(|| format!("没检测到 {}", agent.label))?;
    let cwd = work_dir(&app, &window, registry.inner(), &payload.project_root)?;
    let (args, stdin) = build_launch(&payload)?;
    let (cancel_tx, mut cancel_rx) = watch::channel(false);
    {
        let active = state
            .active
            .lock()
            .map_err(|_| "本机 agent 状态异常".to_string())?;
        if active.contains_key(&payload.run_id) {
            return Err("这一轮已经在运行".to_string());
        }
    }

    emit_event(
        &window,
        &payload.run_id,
        json!({
            "type": "run_info",
            "cwd": cwd.to_string_lossy(),
            "cwdSource": if payload.project_root.is_empty() { "app-data" } else { "project" },
            "notice": MCP_NOTICE,
        }),
    );

    let mut command = agent_command(&path, &args);
    command
        .current_dir(&cwd)
        .env_clear()
        .envs(&env_map)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .kill_on_drop(true);
    #[cfg(not(target_os = "windows"))]
    command.process_group(0);
    let mut child = command
        .spawn()
        .map_err(|error| format!("无法启动 {}: {error}", agent.label))?;
    let mut child_stdin = child
        .stdin
        .take()
        .ok_or_else(|| "无法写入 agent 请求".to_string())?;
    child_stdin
        .write_all(stdin.as_bytes())
        .await
        .map_err(|_| "无法写入 agent 请求".to_string())?;
    drop(child_stdin);

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 agent 输出".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "无法读取 agent 错误".to_string())?;
    state
        .active
        .lock()
        .map_err(|_| "本机 agent 状态异常".to_string())?
        .insert(payload.run_id.clone(), cancel_tx);
    let parse_window = window.clone();
    let parse_run_id = payload.run_id.clone();
    let parse_agent_id = payload.agent_id.clone();
    let stdout_task = tauri::async_runtime::spawn(async move {
        let mut state = ParsedOutput::default();
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            parse_agent_line(
                &parse_agent_id,
                &line,
                &mut state,
                &parse_window,
                &parse_run_id,
            );
        }
        state
    });
    let stderr_task = tauri::async_runtime::spawn(async move {
        let mut text = String::new();
        let _ = BufReader::new(stderr)
            .take(6_000)
            .read_to_string(&mut text)
            .await;
        text
    });

    let mut cancelled = false;
    let mut timed_out = false;
    let status = tokio::select! {
        result = child.wait() => result.map_err(|error| format!("{} 运行失败: {error}", agent.label))?,
        _ = cancel_rx.changed() => {
            cancelled = true;
            terminate_child(&mut child).await;
            child.wait().await.map_err(|error| format!("{} 停止失败: {error}", agent.label))?
        },
        _ = tokio::time::sleep(RUN_TIMEOUT) => {
            timed_out = true;
            terminate_child(&mut child).await;
            child.wait().await.map_err(|error| format!("{} 停止失败: {error}", agent.label))?
        },
    };
    let parsed = stdout_task
        .await
        .map_err(|_| "无法解析 agent 输出".to_string())?;
    let stderr = stderr_task.await.unwrap_or_default();
    if let Ok(mut active) = state.active.lock() {
        active.remove(&payload.run_id);
    }

    if !cancelled {
        let error = if timed_out {
            "本机 agent 运行超过 30 分钟，已停止".to_string()
        } else if !parsed.last_error.trim().is_empty() {
            parsed.last_error.clone()
        } else if !status.success() {
            stderr
                .trim()
                .chars()
                .rev()
                .take(600)
                .collect::<String>()
                .chars()
                .rev()
                .collect()
        } else {
            String::new()
        };
        if !error.is_empty() {
            emit_event(&window, &payload.run_id, error_event(error));
        } else {
            emit_event(
                &window,
                &payload.run_id,
                json!({
                    "type": "done",
                    "finalText": parsed.last_text,
                    "sessionId": parsed.session_id,
                }),
            );
        }
    }

    Ok(RunResult {
        cancelled,
        timed_out,
        cwd: cwd.to_string_lossy().to_string(),
    })
}

#[tauri::command]
pub(crate) async fn tauri_local_agent_cancel(
    state: State<'_, LocalAgentState>,
    payload: CancelPayload,
) -> Result<CancelResult, String> {
    let sender = state
        .active
        .lock()
        .map_err(|_| "本机 agent 状态异常".to_string())?
        .get(&payload.run_id)
        .cloned();
    if let Some(sender) = sender {
        let _ = sender.send(true);
        return Ok(CancelResult { cancelled: true });
    }
    Ok(CancelResult { cancelled: false })
}
