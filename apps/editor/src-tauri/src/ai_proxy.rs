use std::{
    collections::HashMap,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use futures_util::StreamExt;
use reqwest::{Method, Response, StatusCode, Url};
use serde::Serialize;
use serde_json::{json, Map, Value};
use tauri::{Emitter, State, WebviewWindow};
use tokio::sync::Notify;

pub const AI_CHAT_STREAM_EVENT: &str = "tauri-ai://chat-stream-event";

const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
const CHAT_TIMEOUT: Duration = Duration::from_secs(60);
const KNOWLEDGE_TIMEOUT: Duration = Duration::from_secs(30);
const URL_READ_TIMEOUT: Duration = Duration::from_secs(30);
const ATTACHMENT_TIMEOUT: Duration = Duration::from_secs(45);
const TOOL_EXEC_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const STREAM_IDLE_TIMEOUT: Duration = Duration::from_secs(60);

const MAX_DEFAULT_REQUEST_BYTES: usize = 8 * 1024 * 1024;
const MAX_ATTACHMENT_REQUEST_BYTES: usize = 18 * 1024 * 1024;
const MAX_DEFAULT_RESPONSE_BYTES: usize = 10 * 1024 * 1024;
const MAX_ATTACHMENT_RESPONSE_BYTES: usize = 20 * 1024 * 1024;
const MAX_STREAM_RESPONSE_BYTES: usize = 16 * 1024 * 1024;
const MAX_SSE_LINE_BYTES: usize = 2 * 1024 * 1024;
const MAX_ERROR_TEXT_CHARS: usize = 300;
const MAX_REQUEST_ID_LEN: usize = 128;
const MAX_TOOL_CALLS: usize = 256;

#[derive(Default)]
pub struct AiProxyState {
    active_streams: Mutex<HashMap<String, ActiveStream>>,
}

#[derive(Clone)]
struct ActiveStream {
    owner: String,
    cancellation: Arc<StreamCancellation>,
}

#[derive(Default)]
struct StreamCancellation {
    cancelled: AtomicBool,
    notify: Notify,
}

impl StreamCancellation {
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::Release);
        self.notify.notify_one();
    }

    fn is_cancelled(&self) -> bool {
        self.cancelled.load(Ordering::Acquire)
    }

    async fn cancelled(&self) {
        if self.is_cancelled() {
            return;
        }
        self.notify.notified().await;
    }
}

impl AiProxyState {
    fn register_stream(
        &self,
        owner: &str,
        request_id: &str,
    ) -> Result<Arc<StreamCancellation>, String> {
        let mut streams = lock_streams(&self.active_streams);
        if streams.contains_key(request_id) {
            return Err("流式请求 ID 已在使用".to_string());
        }
        let cancellation = Arc::new(StreamCancellation::default());
        streams.insert(
            request_id.to_string(),
            ActiveStream {
                owner: owner.to_string(),
                cancellation: cancellation.clone(),
            },
        );
        Ok(cancellation)
    }

    fn finish_stream(&self, owner: &str, request_id: &str, cancellation: &Arc<StreamCancellation>) {
        let mut streams = lock_streams(&self.active_streams);
        let should_remove = streams.get(request_id).is_some_and(|active| {
            active.owner == owner && Arc::ptr_eq(&active.cancellation, cancellation)
        });
        if should_remove {
            streams.remove(request_id);
        }
    }

    fn abort_stream(&self, owner: &str, request_id: &str) {
        let cancellation = {
            let streams = lock_streams(&self.active_streams);
            streams
                .get(request_id)
                .and_then(|active| (active.owner == owner).then(|| active.cancellation.clone()))
        };
        if let Some(cancellation) = cancellation {
            cancellation.cancel();
        }
    }
}

fn lock_streams(
    streams: &Mutex<HashMap<String, ActiveStream>>,
) -> std::sync::MutexGuard<'_, HashMap<String, ActiveStream>> {
    streams
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ChatStreamEvent<'a> {
    request_id: &'a str,
    text: &'a str,
}

enum StreamError {
    Cancelled,
    Failed(String),
}

#[derive(Default)]
struct ToolCallAccumulator {
    id: String,
    kind: String,
    name: String,
    arguments: String,
}

#[derive(Default)]
struct ChatAccumulator {
    content: String,
    tool_calls: Vec<Option<ToolCallAccumulator>>,
}

impl ChatAccumulator {
    fn push(&mut self, payload: &Value) -> String {
        let Some(delta) = payload
            .get("choices")
            .and_then(Value::as_array)
            .and_then(|choices| choices.first())
            .and_then(|choice| choice.get("delta"))
        else {
            return String::new();
        };

        if let Some(calls) = delta.get("tool_calls").and_then(Value::as_array) {
            for call in calls {
                let index = call
                    .get("index")
                    .and_then(Value::as_u64)
                    .and_then(|index| usize::try_from(index).ok())
                    .unwrap_or(self.tool_calls.len());
                if index >= MAX_TOOL_CALLS {
                    continue;
                }
                while self.tool_calls.len() <= index {
                    self.tool_calls.push(None);
                }
                let current =
                    self.tool_calls[index].get_or_insert_with(ToolCallAccumulator::default);
                if let Some(id) = call.get("id").and_then(Value::as_str) {
                    current.id = id.to_string();
                }
                if let Some(kind) = call.get("type").and_then(Value::as_str) {
                    current.kind = kind.to_string();
                }
                let function = call.get("function");
                append_json_string(
                    &mut current.name,
                    function.and_then(|value| value.get("name")),
                );
                append_json_string(
                    &mut current.arguments,
                    function.and_then(|value| value.get("arguments")),
                );
            }
        }

        let text = delta
            .get("content")
            .and_then(Value::as_str)
            .unwrap_or_default();
        self.content.push_str(text);
        text.to_string()
    }

    fn into_message(self) -> Value {
        let mut message = Map::from_iter([
            ("role".to_string(), Value::String("assistant".to_string())),
            ("content".to_string(), Value::String(self.content)),
        ]);
        let calls = self
            .tool_calls
            .into_iter()
            .flatten()
            .map(|call| {
                json!({
                    "id": call.id,
                    "type": if call.kind.is_empty() { "function" } else { &call.kind },
                    "function": {
                        "name": call.name,
                        "arguments": call.arguments,
                    },
                })
            })
            .collect::<Vec<_>>();
        if !calls.is_empty() {
            message.insert("tool_calls".to_string(), Value::Array(calls));
        }
        Value::Object(message)
    }
}

fn append_json_string(target: &mut String, value: Option<&Value>) {
    if let Some(value) = value.and_then(Value::as_str) {
        target.push_str(value);
    }
}

fn build_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(CONNECT_TIMEOUT)
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            let url = attempt.url();
            let is_safe_url = matches!(url.scheme(), "http" | "https")
                && url.host_str().is_some()
                && url.username().is_empty()
                && url.password().is_none();
            let is_same_origin = attempt.previous().first().is_some_and(|original| {
                original.scheme() == url.scheme()
                    && original.host_str() == url.host_str()
                    && original.port_or_known_default() == url.port_or_known_default()
            });
            if attempt.previous().len() > 5 {
                attempt.error("too many redirects")
            } else if is_safe_url && is_same_origin {
                attempt.follow()
            } else {
                attempt.error("unsafe redirect")
            }
        }))
        .user_agent("md-render-tauri")
        .build()
        .map_err(|_| "无法初始化 AI 代理客户端".to_string())
}

fn required_string(payload: &Value, key: &str, error: &str) -> Result<String, String> {
    payload
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .ok_or_else(|| error.to_string())
}

fn parse_proxy_base(payload: &Value) -> Result<Url, String> {
    let raw = required_string(payload, "aiProxyBase", "未配置 AI 代理地址（aiProxyBase）")?;
    let mut url =
        Url::parse(raw.trim_end_matches('/')).map_err(|_| "AI 代理地址格式无效".to_string())?;
    if !matches!(url.scheme(), "http" | "https") || url.host_str().is_none() {
        return Err("AI 代理地址仅支持有效的 http/https 地址".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("AI 代理地址不能包含用户名或密码".to_string());
    }
    if url.query().is_some() || url.fragment().is_some() {
        return Err("AI 代理地址不能包含查询参数或片段".to_string());
    }
    let normalized_path = url.path().trim_end_matches('/').to_string();
    url.set_path(&normalized_path);
    Ok(url)
}

fn endpoint_url(base: &Url, endpoint: &str) -> Url {
    let mut url = base.clone();
    let base_path = base.path().trim_end_matches('/');
    url.set_path(&format!("{base_path}{endpoint}"));
    url
}

fn display_proxy_base(base: &Url) -> String {
    let mut display = base.clone();
    display.set_query(None);
    display.set_fragment(None);
    display.to_string().trim_end_matches('/').to_string()
}

fn validate_request_id(payload: &Value) -> Result<String, String> {
    let request_id = required_string(payload, "requestId", "缺少 requestId")?;
    let is_valid = request_id.len() <= MAX_REQUEST_ID_LEN
        && request_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.' | b':'));
    if !is_valid {
        return Err("requestId 格式无效".to_string());
    }
    Ok(request_id)
}

fn build_chat_body(payload: &Value, stream: bool) -> Result<Value, String> {
    let provider_id = required_string(payload, "providerId", "未指定 providerId")?;
    let messages = payload
        .get("messages")
        .and_then(Value::as_array)
        .filter(|messages| !messages.is_empty())
        .cloned()
        .ok_or_else(|| "消息不能为空".to_string())?;

    let mut body = Map::from_iter([
        ("providerId".to_string(), Value::String(provider_id)),
        ("messages".to_string(), Value::Array(messages)),
    ]);
    if let Some(model) = payload.get("model").and_then(Value::as_str).map(str::trim) {
        if !model.is_empty() {
            body.insert("model".to_string(), Value::String(model.to_string()));
        }
    }
    if let Some(tools) = payload.get("tools").and_then(Value::as_array) {
        if !tools.is_empty() {
            body.insert("tools".to_string(), Value::Array(tools.clone()));
        }
    }
    if stream {
        body.insert("stream".to_string(), Value::Bool(true));
    }
    Ok(Value::Object(body))
}

fn serialize_body(body: &Value, max_bytes: usize) -> Result<Vec<u8>, String> {
    let bytes = serde_json::to_vec(body).map_err(|_| "请求参数无法序列化".to_string())?;
    if bytes.len() > max_bytes {
        return Err("请求内容过大".to_string());
    }
    Ok(bytes)
}

fn format_network_error(error: &reqwest::Error, base: &Url) -> String {
    let display = display_proxy_base(base);
    if error.is_timeout() {
        return format!("AI 代理请求超时：{display} 暂无响应，请检查服务是否正常。");
    }
    if error.is_connect() || error.is_request() {
        return format!("AI 代理连接失败：无法连接 {display}。请检查 AI 代理地址和服务状态。");
    }
    "AI 代理请求失败".to_string()
}

async fn send_request(
    client: &reqwest::Client,
    method: Method,
    base: &Url,
    endpoint: &str,
    body: Option<&Value>,
    timeout: Duration,
    max_request_bytes: usize,
) -> Result<Response, String> {
    let mut request = client
        .request(method, endpoint_url(base, endpoint))
        .timeout(timeout);
    if let Some(body) = body {
        let bytes = serialize_body(body, max_request_bytes)?;
        request = request
            .header("Content-Type", "application/json")
            .body(bytes);
    }
    request
        .send()
        .await
        .map_err(|error| format_network_error(&error, base))
}

async fn read_response_bytes(
    response: Response,
    max_bytes: usize,
    base: &Url,
) -> Result<(StatusCode, Vec<u8>), String> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err("AI 代理响应过大".to_string());
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format_network_error(&error, base))?;
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err("AI 代理响应过大".to_string());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok((status, bytes))
}

async fn read_response_bytes_cancellable(
    response: Response,
    max_bytes: usize,
    base: &Url,
    cancellation: &Arc<StreamCancellation>,
) -> Result<(StatusCode, Vec<u8>), StreamError> {
    let status = response.status();
    if response
        .content_length()
        .is_some_and(|length| length > max_bytes as u64)
    {
        return Err(StreamError::Failed("AI 代理响应过大".to_string()));
    }

    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    loop {
        let next = tokio::select! {
            _ = cancellation.cancelled() => return Err(StreamError::Cancelled),
            result = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()) => result,
        };
        let Some(chunk) = next.map_err(|_| StreamError::Failed("AI 代理响应超时".to_string()))?
        else {
            break;
        };
        let chunk =
            chunk.map_err(|error| StreamError::Failed(format_network_error(&error, base)))?;
        if bytes.len().saturating_add(chunk.len()) > max_bytes {
            return Err(StreamError::Failed("AI 代理响应过大".to_string()));
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok((status, bytes))
}

fn parse_json_bytes(bytes: &[u8]) -> Result<Value, String> {
    serde_json::from_slice(bytes).map_err(|_| "AI 代理返回了无效数据".to_string())
}

fn response_error(status: StatusCode, data: Option<&Value>, bytes: &[u8], prefix: &str) -> String {
    let detail = data
        .and_then(|value| value.get("error"))
        .and_then(Value::as_str)
        .map(str::to_string)
        .unwrap_or_else(|| truncate_chars(&String::from_utf8_lossy(bytes), MAX_ERROR_TEXT_CHARS));
    if detail.is_empty() {
        format!("{prefix} ({})", status.as_u16())
    } else {
        format!("{prefix} ({}): {detail}", status.as_u16())
    }
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect()
}

fn message_from_chat_response(data: &Value) -> Result<Value, String> {
    data.get("choices")
        .and_then(Value::as_array)
        .and_then(|choices| choices.first())
        .and_then(|choice| choice.get("message"))
        .cloned()
        .ok_or_else(|| "AI 返回内容为空".to_string())
}

fn ok_message(message: Value) -> Value {
    json!({ "ok": true, "message": message })
}

fn failed(error: impl Into<String>) -> Value {
    json!({ "ok": false, "error": error.into() })
}

#[tauri::command]
pub async fn tauri_ai_chat(payload: Value) -> Value {
    match run_chat(payload).await {
        Ok(message) => ok_message(message),
        Err(error) => failed(error),
    }
}

async fn run_chat(payload: Value) -> Result<Value, String> {
    let base = parse_proxy_base(&payload)?;
    let body = build_chat_body(&payload, false)?;
    let client = build_client()?;
    let response = send_request(
        &client,
        Method::POST,
        &base,
        "/api/chat",
        Some(&body),
        CHAT_TIMEOUT,
        MAX_DEFAULT_REQUEST_BYTES,
    )
    .await?;
    let (status, bytes) = read_response_bytes(response, MAX_DEFAULT_RESPONSE_BYTES, &base).await?;
    let data = parse_json_bytes(&bytes).ok();
    if !status.is_success() {
        return Err(response_error(status, data.as_ref(), &bytes, "AI 请求失败"));
    }
    message_from_chat_response(
        data.as_ref()
            .ok_or_else(|| "AI 代理返回了无效数据".to_string())?,
    )
}

#[tauri::command]
pub async fn tauri_ai_chat_stream(
    window: WebviewWindow,
    state: State<'_, AiProxyState>,
    payload: Value,
) -> Result<Value, String> {
    let request_id = match validate_request_id(&payload) {
        Ok(request_id) => request_id,
        Err(error) => return Ok(failed(error)),
    };
    let owner = window.label().to_string();
    let cancellation = match state.register_stream(&owner, &request_id) {
        Ok(cancellation) => cancellation,
        Err(error) => return Ok(failed(error)),
    };

    let result = run_chat_stream(&window, &request_id, &payload, &cancellation).await;
    state.finish_stream(&owner, &request_id, &cancellation);
    Ok(match result {
        Ok(message) => ok_message(message),
        Err(StreamError::Cancelled) => {
            json!({ "ok": false, "error": "已取消", "cancelled": true })
        }
        Err(StreamError::Failed(error)) => {
            json!({ "ok": false, "error": error, "cancelled": false })
        }
    })
}

async fn run_chat_stream(
    window: &WebviewWindow,
    request_id: &str,
    payload: &Value,
    cancellation: &Arc<StreamCancellation>,
) -> Result<Value, StreamError> {
    let base = parse_proxy_base(payload).map_err(StreamError::Failed)?;
    let body = build_chat_body(payload, true).map_err(StreamError::Failed)?;
    let bytes = serialize_body(&body, MAX_DEFAULT_REQUEST_BYTES).map_err(StreamError::Failed)?;
    let client = build_client().map_err(StreamError::Failed)?;
    let request = client
        .post(endpoint_url(&base, "/api/chat"))
        .header("Content-Type", "application/json")
        .body(bytes);

    let response = tokio::select! {
        _ = cancellation.cancelled() => return Err(StreamError::Cancelled),
        result = tokio::time::timeout(CHAT_TIMEOUT, request.send()) => {
            match result {
                Ok(Ok(response)) => response,
                Ok(Err(error)) => return Err(StreamError::Failed(format_network_error(&error, &base))),
                Err(_) => return Err(StreamError::Failed(format!(
                    "AI 代理请求超时：{} 暂无响应，请检查服务是否正常。",
                    display_proxy_base(&base),
                ))),
            }
        }
    };

    if !response.status().is_success() {
        let (status, bytes) = read_response_bytes_cancellable(
            response,
            MAX_DEFAULT_RESPONSE_BYTES,
            &base,
            cancellation,
        )
        .await?;
        let data = parse_json_bytes(&bytes).ok();
        return Err(StreamError::Failed(response_error(
            status,
            data.as_ref(),
            &bytes,
            "AI 请求失败",
        )));
    }

    let is_event_stream = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .is_some_and(|value| value.to_ascii_lowercase().contains("text/event-stream"));
    if !is_event_stream {
        let (_, bytes) = read_response_bytes_cancellable(
            response,
            MAX_DEFAULT_RESPONSE_BYTES,
            &base,
            cancellation,
        )
        .await?;
        if cancellation.is_cancelled() {
            return Err(StreamError::Cancelled);
        }
        let data = parse_json_bytes(&bytes).map_err(StreamError::Failed)?;
        let message = message_from_chat_response(&data).map_err(StreamError::Failed)?;
        if let Some(text) = message.get("content").and_then(Value::as_str) {
            emit_delta(window, request_id, text).map_err(StreamError::Failed)?;
        }
        return Ok(message);
    }

    consume_sse(window, request_id, response, &base, cancellation).await
}

async fn consume_sse(
    window: &WebviewWindow,
    request_id: &str,
    response: Response,
    base: &Url,
    cancellation: &Arc<StreamCancellation>,
) -> Result<Value, StreamError> {
    let mut accumulator = ChatAccumulator::default();
    let mut line_buffer = Vec::new();
    let mut response_bytes = 0usize;
    let mut stream = response.bytes_stream();

    loop {
        let next = tokio::select! {
            _ = cancellation.cancelled() => return Err(StreamError::Cancelled),
            result = tokio::time::timeout(STREAM_IDLE_TIMEOUT, stream.next()) => result,
        };
        let Some(chunk) =
            next.map_err(|_| StreamError::Failed("AI 代理流式响应超时".to_string()))?
        else {
            break;
        };
        let chunk =
            chunk.map_err(|error| StreamError::Failed(format_network_error(&error, base)))?;
        response_bytes = response_bytes.saturating_add(chunk.len());
        if response_bytes > MAX_STREAM_RESPONSE_BYTES {
            return Err(StreamError::Failed("AI 代理响应过大".to_string()));
        }
        line_buffer.extend_from_slice(&chunk);
        process_complete_sse_lines(window, request_id, &mut line_buffer, &mut accumulator)?;
        if line_buffer.len() > MAX_SSE_LINE_BYTES {
            return Err(StreamError::Failed("AI 代理流式响应行过大".to_string()));
        }
    }

    if !line_buffer.is_empty() {
        process_sse_line(window, request_id, &line_buffer, &mut accumulator)?;
    }
    Ok(accumulator.into_message())
}

fn process_complete_sse_lines(
    window: &WebviewWindow,
    request_id: &str,
    buffer: &mut Vec<u8>,
    accumulator: &mut ChatAccumulator,
) -> Result<(), StreamError> {
    while let Some(newline) = buffer.iter().position(|byte| *byte == b'\n') {
        let mut line = buffer.drain(..=newline).collect::<Vec<_>>();
        line.pop();
        if line.last() == Some(&b'\r') {
            line.pop();
        }
        process_sse_line(window, request_id, &line, accumulator)?;
    }
    Ok(())
}

fn process_sse_line(
    window: &WebviewWindow,
    request_id: &str,
    line: &[u8],
    accumulator: &mut ChatAccumulator,
) -> Result<(), StreamError> {
    let Ok(line) = std::str::from_utf8(line) else {
        return Ok(());
    };
    let line = line.trim();
    let Some(data) = line.strip_prefix("data:").map(str::trim) else {
        return Ok(());
    };
    if data.is_empty() || data == "[DONE]" {
        return Ok(());
    }
    let Ok(payload) = serde_json::from_str::<Value>(data) else {
        return Ok(());
    };
    let text = accumulator.push(&payload);
    if !text.is_empty() {
        emit_delta(window, request_id, &text).map_err(StreamError::Failed)?;
    }
    Ok(())
}

fn emit_delta(window: &WebviewWindow, request_id: &str, text: &str) -> Result<(), String> {
    window
        .emit(AI_CHAT_STREAM_EVENT, ChatStreamEvent { request_id, text })
        .map_err(|_| "无法向窗口发送 AI 流式响应".to_string())
}

#[tauri::command]
pub fn tauri_ai_abort_chat_stream(
    window: WebviewWindow,
    state: State<'_, AiProxyState>,
    payload: Value,
) -> Value {
    let request_id = match validate_request_id(&payload) {
        Ok(request_id) => request_id,
        Err(error) => return failed(error),
    };
    state.abort_stream(window.label(), &request_id);
    json!({ "ok": true })
}

#[tauri::command]
pub async fn tauri_ai_get_config(payload: Value) -> Value {
    match fetch_provider_config(payload).await {
        Ok(providers) => Value::Array(providers),
        Err(_) => Value::Array(Vec::new()),
    }
}

async fn fetch_provider_config(payload: Value) -> Result<Vec<Value>, String> {
    let base = parse_proxy_base(&payload)?;
    let client = build_client()?;
    let response = send_request(
        &client,
        Method::GET,
        &base,
        "/api/providers",
        None,
        CHAT_TIMEOUT,
        MAX_DEFAULT_REQUEST_BYTES,
    )
    .await?;
    let (status, bytes) = read_response_bytes(response, MAX_DEFAULT_RESPONSE_BYTES, &base).await?;
    let data = parse_json_bytes(&bytes)?;
    if !status.is_success() {
        return Err(response_error(
            status,
            Some(&data),
            &bytes,
            "获取 provider 列表失败",
        ));
    }
    Ok(data
        .get("providers")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_object)
        .map(|provider| {
            json!({
                "id": provider.get("id").cloned().unwrap_or(Value::Null),
                "label": provider.get("label").cloned().unwrap_or(Value::Null),
                "baseURL": provider.get("baseURL").cloned().unwrap_or(Value::Null),
                "defaultModel": provider.get("defaultModel").cloned().unwrap_or(Value::Null),
                "hasBuiltinKey": provider.get("hasKey").and_then(Value::as_bool).unwrap_or(false),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn tauri_ai_exec_tool(payload: Value) -> Value {
    match exec_tool(payload).await {
        Ok(result) => result,
        Err(error) => json!({
            "ok": false,
            "stdout": "",
            "stderr": "",
            "error": error,
        }),
    }
}

async fn exec_tool(payload: Value) -> Result<Value, String> {
    let base = parse_proxy_base(&payload)?;
    let tool_name = required_string(&payload, "toolName", "未指定 toolName")?;
    let args = payload
        .get("args")
        .and_then(Value::as_object)
        .cloned()
        .map(Value::Object)
        .unwrap_or_else(|| json!({}));
    let body = json!({
        "toolName": tool_name,
        "args": args,
    });
    let client = build_client()?;
    let response = send_request(
        &client,
        Method::POST,
        &base,
        "/api/tools/exec",
        Some(&body),
        TOOL_EXEC_TIMEOUT,
        MAX_DEFAULT_REQUEST_BYTES,
    )
    .await?;
    let (status, bytes) = read_response_bytes(response, MAX_DEFAULT_RESPONSE_BYTES, &base).await?;
    let data = parse_json_bytes(&bytes).ok();
    if status.is_success() {
        return data.ok_or_else(|| "AI 代理返回了无效数据".to_string());
    }
    Ok(json!({
        "ok": false,
        "exitCode": data.as_ref().and_then(|value| value.get("exitCode")).cloned().unwrap_or(Value::Null),
        "stdout": data.as_ref().and_then(|value| value.get("stdout")).cloned().unwrap_or_else(|| Value::String(String::new())),
        "stderr": data.as_ref().and_then(|value| value.get("stderr")).cloned().unwrap_or_else(|| Value::String(String::new())),
        "error": data
            .as_ref()
            .and_then(|value| value.get("error"))
            .and_then(Value::as_str)
            .map(str::to_string)
            .unwrap_or_else(|| format!("server 返回 {}", status.as_u16())),
    }))
}

#[tauri::command]
pub async fn tauri_ai_list_tools(payload: Value) -> Value {
    match get_json(&payload, "/api/tools/schema", CHAT_TIMEOUT).await {
        Ok(data) => data,
        Err(error) => json!({ "tools": [], "error": error }),
    }
}

#[tauri::command]
pub async fn tauri_ai_search_knowledge(payload: Value) -> Value {
    match post_knowledge_search(payload).await {
        Ok(data) => data,
        Err(error) => json!({ "ok": false, "results": [], "error": error }),
    }
}

async fn post_knowledge_search(payload: Value) -> Result<Value, String> {
    let query = required_string(&payload, "query", "知识库搜索关键词为空")?;
    let body = json!({
        "query": query,
        "sources": payload.get("sources").cloned().unwrap_or(Value::Null),
    });
    post_json(
        &payload,
        "/api/knowledge/search",
        body,
        KNOWLEDGE_TIMEOUT,
        MAX_DEFAULT_REQUEST_BYTES,
        MAX_DEFAULT_RESPONSE_BYTES,
        "外挂知识库搜索失败",
    )
    .await
}

#[tauri::command]
pub async fn tauri_ai_read_url(payload: Value) -> Value {
    match post_url_read(payload).await {
        Ok(data) => data,
        Err(error) => json!({ "ok": false, "error": error }),
    }
}

async fn post_url_read(payload: Value) -> Result<Value, String> {
    let url = required_string(&payload, "url", "网页地址为空")?;
    post_json(
        &payload,
        "/api/url/read",
        json!({ "url": url }),
        URL_READ_TIMEOUT,
        MAX_DEFAULT_REQUEST_BYTES,
        MAX_DEFAULT_RESPONSE_BYTES,
        "网页读取失败",
    )
    .await
}

#[tauri::command]
pub async fn tauri_ai_extract_attachment_text(payload: Value) -> Value {
    match post_attachment_text(payload).await {
        Ok(data) => data,
        Err(error) => json!({ "ok": false, "error": error }),
    }
}

async fn post_attachment_text(payload: Value) -> Result<Value, String> {
    let base64 = required_string(&payload, "base64", "PDF 内容为空")?;
    post_json(
        &payload,
        "/api/attachments/text",
        json!({ "base64": base64 }),
        ATTACHMENT_TIMEOUT,
        MAX_ATTACHMENT_REQUEST_BYTES,
        MAX_ATTACHMENT_RESPONSE_BYTES,
        "PDF 读取失败",
    )
    .await
}

async fn get_json(payload: &Value, endpoint: &str, timeout: Duration) -> Result<Value, String> {
    let base = parse_proxy_base(payload)?;
    let client = build_client()?;
    let response = send_request(
        &client,
        Method::GET,
        &base,
        endpoint,
        None,
        timeout,
        MAX_DEFAULT_REQUEST_BYTES,
    )
    .await?;
    let (status, bytes) = read_response_bytes(response, MAX_DEFAULT_RESPONSE_BYTES, &base).await?;
    let data = parse_json_bytes(&bytes).ok();
    if !status.is_success() {
        return Err(response_error(
            status,
            data.as_ref(),
            &bytes,
            "AI 代理请求失败",
        ));
    }
    data.ok_or_else(|| "AI 代理返回了无效数据".to_string())
}

async fn post_json(
    payload: &Value,
    endpoint: &str,
    body: Value,
    timeout: Duration,
    max_request_bytes: usize,
    max_response_bytes: usize,
    error_prefix: &str,
) -> Result<Value, String> {
    let base = parse_proxy_base(payload)?;
    let client = build_client()?;
    let response = send_request(
        &client,
        Method::POST,
        &base,
        endpoint,
        Some(&body),
        timeout,
        max_request_bytes,
    )
    .await?;
    let (status, bytes) = read_response_bytes(response, max_response_bytes, &base).await?;
    let data = parse_json_bytes(&bytes).ok();
    if !status.is_success() {
        return Err(response_error(status, data.as_ref(), &bytes, error_prefix));
    }
    data.ok_or_else(|| "AI 代理返回了无效数据".to_string())
}
