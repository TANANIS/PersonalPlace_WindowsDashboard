use regex::Regex;
use reqwest::{
    blocking::{Client, Response},
    header::{CONTENT_TYPE, LOCATION},
    redirect::Policy,
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    fs,
    io::Read,
    net::{IpAddr, Ipv4Addr, Ipv6Addr, SocketAddr, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        mpsc, Mutex,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use url::{Host, Url};

use crate::{
    preview,
    storage::{CardTarget, InsertItemResult, LauncherItem, WorkspaceStore},
};

const HTML_LIMIT: usize = 1024 * 1024;
const FAVICON_LIMIT: usize = 512 * 1024;
const MAX_REDIRECTS: usize = 3;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(3);
const RISKY_EXTENSIONS: &[&str] = &[
    "bat", "cmd", "ps1", "vbs", "vbe", "wsf", "wsh", "reg", "msi", "msp", "scr", "com",
];

static CARD_SEQUENCE: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestInput {
    pub input_type: String,
    pub value: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestRequest {
    pub page_id: String,
    #[serde(default)]
    pub parent_group_id: Option<String>,
    pub inputs: Vec<IngestInput>,
    #[serde(default)]
    pub allow_duplicate: bool,
    #[serde(default)]
    pub allow_risky: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestFinding {
    pub input_index: usize,
    pub input_type: String,
    pub value: String,
    pub code: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub card_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestResult {
    pub added: Vec<LauncherItem>,
    pub issues: Vec<IngestFinding>,
    pub errors: Vec<IngestFinding>,
}

#[derive(Clone, Debug)]
pub struct CardDefaults {
    pub title: String,
    pub subtitle: String,
    pub symbol: String,
    pub tone: String,
    pub size: String,
}

#[derive(Clone, Debug)]
pub struct RemoteIcon {
    pub mime_type: String,
    pub bytes: Vec<u8>,
}

#[derive(Clone, Debug)]
struct UrlMetadata {
    title: Option<String>,
    icon: Option<RemoteIcon>,
}

struct LimitedResponse {
    final_url: Url,
    content_type: Option<String>,
    bytes: Vec<u8>,
}

#[derive(Debug)]
enum MetadataEndpoint {
    DirectIp,
    PinnedDomain {
        request_host: String,
        addresses: Vec<SocketAddr>,
    },
}

#[derive(Debug)]
enum MetadataAccess {
    Allowed(MetadataEndpoint),
    PrivateOrLan,
}

pub fn ingest_items(
    store: &WorkspaceStore,
    preview_cache_dir: &Path,
    preview_cache_io: &Mutex<()>,
    request: IngestRequest,
) -> IngestResult {
    let mut result = IngestResult::default();

    for (input_index, input) in request.inputs.into_iter().enumerate() {
        match input.input_type.as_str() {
            "path" => ingest_path(
                store,
                preview_cache_dir,
                preview_cache_io,
                &request.page_id,
                request.parent_group_id.as_deref(),
                input_index,
                input,
                request.allow_duplicate,
                request.allow_risky,
                &mut result,
            ),
            "url" => ingest_url(
                store,
                preview_cache_dir,
                preview_cache_io,
                &request.page_id,
                request.parent_group_id.as_deref(),
                input_index,
                input,
                request.allow_duplicate,
                &mut result,
            ),
            _ => result.errors.push(finding(
                input_index,
                &input,
                "unsupported",
                "不支援這種加入方式。",
            )),
        }
    }

    result
}

#[allow(clippy::too_many_arguments)]
fn ingest_path(
    store: &WorkspaceStore,
    preview_cache_dir: &Path,
    preview_cache_io: &Mutex<()>,
    page_id: &str,
    parent_group_id: Option<&str>,
    input_index: usize,
    input: IngestInput,
    allow_duplicate: bool,
    allow_risky: bool,
    result: &mut IngestResult,
) {
    let raw = input.value.trim();
    if raw.is_empty() {
        result
            .errors
            .push(finding(input_index, &input, "invalid", "路徑不能是空白。"));
        return;
    }

    let canonical_path = match fs::canonicalize(raw) {
        Ok(path) => path,
        Err(error) => {
            let (code, message) = if error.kind() == std::io::ErrorKind::NotFound {
                ("missing", "找不到這個檔案或資料夾。".to_string())
            } else {
                ("invalid", format!("無法讀取這個路徑：{error}"))
            };
            result
                .errors
                .push(finding(input_index, &input, code, &message));
            return;
        }
    };
    if !(canonical_path.is_file() || canonical_path.is_dir()) {
        result.errors.push(finding(
            input_index,
            &input,
            "unsupported",
            "這個項目不是可加入的檔案或資料夾。",
        ));
        return;
    }
    if is_risky_path(&canonical_path) && !allow_risky {
        result.issues.push(finding(
            input_index,
            &input,
            "risky",
            "開啟此卡片可能執行程式或變更系統，請確認後再加入。",
        ));
        return;
    }

    let target_id = target_id_for_path(&canonical_path);
    if !allow_duplicate {
        match store.target_exists_in_container(page_id, parent_group_id, &target_id) {
            Ok(true) => {
                result.issues.push(finding(
                    input_index,
                    &input,
                    "duplicate",
                    "這個項目已經在目前頁面中。",
                ));
                return;
            }
            Ok(false) => {}
            Err(error) => {
                result.errors.push(finding(
                    input_index,
                    &input,
                    "invalid",
                    &format!("無法檢查項目：{error}"),
                ));
                return;
            }
        }
    }

    let defaults = defaults_for_local_path(&canonical_path);
    let item = launcher_item(page_id, target_id.clone(), "local", defaults);
    match store.insert_ingested_item_in_container(
        &item,
        parent_group_id,
        "local",
        &canonical_path.to_string_lossy(),
        allow_duplicate,
    ) {
        Ok(InsertItemResult::Added(item)) => {
            if let Ok(_guard) = preview_cache_io.lock() {
                let _ = preview::remove_cached_preview(
                    preview_cache_dir,
                    &preview_cache_key(&target_id),
                );
            }
            result.added.push(*item);
        }
        Ok(InsertItemResult::Duplicate) => result.issues.push(finding(
            input_index,
            &input,
            "duplicate",
            "這個項目已經在目前頁面中。",
        )),
        Err(error) => result.errors.push(finding(
            input_index,
            &input,
            "invalid",
            &format!("無法加入這個項目：{error}"),
        )),
    }
}

#[allow(clippy::too_many_arguments)]
fn ingest_url(
    store: &WorkspaceStore,
    preview_cache_dir: &Path,
    preview_cache_io: &Mutex<()>,
    page_id: &str,
    parent_group_id: Option<&str>,
    input_index: usize,
    input: IngestInput,
    allow_duplicate: bool,
    result: &mut IngestResult,
) {
    let normalized = match normalize_url(&input.value) {
        Ok(url) => url,
        Err(message) => {
            result
                .errors
                .push(finding(input_index, &input, "invalid", &message));
            return;
        }
    };
    let (target_id, equivalent_on_page) = match store.equivalent_url_target_in_container(
        page_id,
        parent_group_id,
        normalized.as_str(),
    ) {
        Ok(Some((target_id, on_page))) => (target_id, on_page),
        Ok(None) => (format!("url-{}", sha256_hex(normalized.as_str())), false),
        Err(error) => {
            result.errors.push(finding(
                input_index,
                &input,
                "invalid",
                &format!("無法檢查網址：{error}"),
            ));
            return;
        }
    };
    if !allow_duplicate && equivalent_on_page {
        result.issues.push(finding(
            input_index,
            &input,
            "duplicate",
            "這個網址已經在目前頁面中。",
        ));
        return;
    }

    let mut defaults = defaults_for_url(&normalized);
    let mut remote_icon = None;
    match fetch_url_metadata(&normalized) {
        Ok(Some(metadata)) => {
            if let Some(title) = metadata.title {
                defaults.title = title;
            }
            remote_icon = metadata.icon;
        }
        Ok(None) => {
            // localhost, private-IP and LAN URLs are deliberately not requested.
        }
        Err(message) => result.issues.push(finding(
            input_index,
            &input,
            "metadataUnavailable",
            &format!("網址已可加入，但暫時無法取得網站名稱或圖示：{message}"),
        )),
    }

    let item = launcher_item(page_id, target_id.clone(), "web", defaults);
    match store.insert_ingested_item_in_container(
        &item,
        parent_group_id,
        "url",
        normalized.as_str(),
        allow_duplicate,
    ) {
        Ok(InsertItemResult::Added(item)) => {
            if let Some(icon) = remote_icon {
                let cache_result = preview_cache_io
                    .lock()
                    .map_err(|_| "縮圖儲存區暫時無法使用。".to_string())
                    .and_then(|_guard| {
                        preview::store_remote_icon(
                            preview_cache_dir,
                            &preview_cache_key(&target_id),
                            &icon.mime_type,
                            &icon.bytes,
                        )
                    });
                if let Err(message) = cache_result {
                    result.issues.push(finding(
                        input_index,
                        &input,
                        "metadataUnavailable",
                        &format!("網址已加入，但網站圖示無法保存：{message}"),
                    ));
                }
            }
            result.added.push(*item);
        }
        Ok(InsertItemResult::Duplicate) => result.issues.push(finding(
            input_index,
            &input,
            "duplicate",
            "這個網址已經在目前頁面中。",
        )),
        Err(error) => result.errors.push(finding(
            input_index,
            &input,
            "invalid",
            &format!("無法加入這個網址：{error}"),
        )),
    }
}

pub fn automatic_defaults(target: &CardTarget) -> CardDefaults {
    match target.target_kind.as_str() {
        "url" => normalize_url(&target.locator)
            .map(|url| defaults_for_url(&url))
            .unwrap_or_else(|_| CardDefaults {
                title: target.card.title.clone(),
                subtitle: target.card.subtitle.clone(),
                symbol: "↗".to_string(),
                tone: "cyan".to_string(),
                size: "square".to_string(),
            }),
        "local" => {
            let path = PathBuf::from(&target.locator);
            if path.exists() {
                defaults_for_local_path(&path)
            } else {
                CardDefaults {
                    title: display_name(&path),
                    subtitle: target.card.subtitle.clone(),
                    symbol: target.card.symbol.clone(),
                    tone: target.card.tone.clone(),
                    size: "square".to_string(),
                }
            }
        }
        "builtin" => defaults_for_builtin(&target.locator).unwrap_or_else(|| CardDefaults {
            title: target.card.title.clone(),
            subtitle: "桌面應用程式".to_string(),
            symbol: "◆".to_string(),
            tone: "violet".to_string(),
            size: "square".to_string(),
        }),
        _ => CardDefaults {
            title: target.card.title.clone(),
            subtitle: target.card.subtitle.clone(),
            symbol: target.card.symbol.clone(),
            tone: target.card.tone.clone(),
            size: "square".to_string(),
        },
    }
}

pub fn normalize_url(raw: &str) -> Result<Url, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("網址不能是空白。".to_string());
    }
    let mut url = Url::parse(trimmed).map_err(|_| "網址格式不正確。".to_string())?;
    if !matches!(url.scheme(), "http" | "https") {
        return Err("只允許加入 HTTP 或 HTTPS 網址。".to_string());
    }
    if url.host().is_none() {
        return Err("網址缺少主機名稱。".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("網址不可包含帳號或密碼。".to_string());
    }
    // URL fragments are meaningful launch destinations, so they are preserved.
    url.set_username("")
        .map_err(|_| "網址格式不正確。".to_string())?;
    url.set_password(None)
        .map_err(|_| "網址格式不正確。".to_string())?;
    Ok(url)
}

pub fn preview_cache_key(target_id: &str) -> String {
    stable_hash(target_id)
}

pub fn built_in_path(app_id: &str) -> Option<PathBuf> {
    let windows_dir = std::env::var_os("WINDIR").map(PathBuf::from)?;
    match app_id {
        "file-explorer" => Some(windows_dir.join("explorer.exe")),
        "notepad" => Some(windows_dir.join("System32").join("notepad.exe")),
        "calculator" => Some(windows_dir.join("System32").join("calc.exe")),
        _ => None,
    }
}

fn launcher_item(
    page_id: &str,
    target_id: String,
    kind: &str,
    defaults: CardDefaults,
) -> LauncherItem {
    LauncherItem {
        id: make_card_id(),
        workspace_id: page_id.to_string(),
        title: defaults.title,
        subtitle: defaults.subtitle,
        kind: kind.to_string(),
        target: target_id,
        symbol: defaults.symbol,
        tone: defaults.tone,
        size: defaults.size,
    }
}

fn target_id_for_path(path: &Path) -> String {
    format!(
        "local-{}",
        stable_hash(&path.to_string_lossy().to_lowercase())
    )
}

fn make_card_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    let sequence = CARD_SEQUENCE.fetch_add(1, Ordering::Relaxed);
    format!("card-{timestamp:x}-{sequence:x}")
}

fn stable_hash(value: &str) -> String {
    let mut hash = 0xcbf29ce484222325_u64;
    for byte in value.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x100000001b3);
    }
    format!("{hash:016x}")
}

fn sha256_hex(value: &str) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let digest = Sha256::digest(value.as_bytes());
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        encoded.push(HEX[(byte >> 4) as usize] as char);
        encoded.push(HEX[(byte & 0x0f) as usize] as char);
    }
    encoded
}

fn display_name(path: &Path) -> String {
    path.file_stem()
        .or_else(|| path.file_name())
        .map(|value| value.to_string_lossy().into_owned())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| path.display().to_string())
}

fn defaults_for_local_path(path: &Path) -> CardDefaults {
    let (subtitle, symbol, tone) = classify_local_target(path);
    CardDefaults {
        title: display_name(path),
        subtitle: subtitle.to_string(),
        symbol: symbol.to_string(),
        tone: tone.to_string(),
        size: "square".to_string(),
    }
}

fn classify_local_target(path: &Path) -> (&'static str, &'static str, &'static str) {
    if path.is_dir() {
        return ("資料夾", "▰", "amber");
    }
    let extension = extension(path);
    match extension.as_str() {
        "exe" | "com" | "msi" | "msp" | "scr" => ("桌面應用程式", "◆", "violet"),
        "lnk" => ("Windows 捷徑", "↗", "cyan"),
        "url" => ("網際網路捷徑", "◎", "cyan"),
        "bat" | "cmd" | "ps1" | "vbs" | "vbe" | "wsf" | "wsh" | "reg" => {
            ("指令或系統檔", ">_", "rose")
        }
        "png" | "jpg" | "jpeg" | "gif" | "webp" | "bmp" | "svg" => ("圖片檔案", "▧", "rose"),
        "mp3" | "wav" | "flac" | "m4a" | "mp4" | "mkv" | "mov" | "webm" => {
            ("媒體檔案", "▶", "rose")
        }
        "txt" | "md" | "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" => {
            ("文件", "▤", "slate")
        }
        _ => ("本機檔案", "•", "slate"),
    }
}

fn defaults_for_url(url: &Url) -> CardDefaults {
    CardDefaults {
        title: hostname_title(url),
        subtitle: url.as_str().to_string(),
        symbol: "↗".to_string(),
        tone: "cyan".to_string(),
        size: "square".to_string(),
    }
}

fn defaults_for_builtin(app_id: &str) -> Option<CardDefaults> {
    let (title, symbol, tone) = match app_id {
        "file-explorer" => ("檔案總管", "▰", "amber"),
        "notepad" => ("記事本", "✎", "cyan"),
        "calculator" => ("計算機", "±", "violet"),
        _ => return None,
    };
    Some(CardDefaults {
        title: title.to_string(),
        subtitle: "桌面應用程式".to_string(),
        symbol: symbol.to_string(),
        tone: tone.to_string(),
        size: "square".to_string(),
    })
}

fn hostname_title(url: &Url) -> String {
    url.host_str()
        .map(|host| {
            host.strip_prefix("www.")
                .or_else(|| host.strip_prefix("WWW."))
                .unwrap_or(host)
                .to_string()
        })
        .filter(|host| !host.is_empty())
        .unwrap_or_else(|| url.as_str().to_string())
}

pub(crate) fn is_risky_path(path: &Path) -> bool {
    path.is_file() && RISKY_EXTENSIONS.contains(&extension(path).as_str())
}

pub(crate) fn is_risky_launch_path(path: &Path) -> bool {
    !path.is_dir() && RISKY_EXTENSIONS.contains(&extension(path).as_str())
}

fn extension(path: &Path) -> String {
    path.extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase()
}

fn finding(input_index: usize, input: &IngestInput, code: &str, message: &str) -> IngestFinding {
    IngestFinding {
        input_index,
        input_type: input.input_type.clone(),
        value: input.value.clone(),
        code: code.to_string(),
        message: message.to_string(),
        card_id: None,
        title: None,
    }
}

fn fetch_url_metadata(url: &Url) -> Result<Option<UrlMetadata>, String> {
    let deadline = Instant::now() + REQUEST_TIMEOUT;
    let initial_endpoint = match metadata_access(url, deadline)? {
        MetadataAccess::Allowed(endpoint) => endpoint,
        MetadataAccess::PrivateOrLan => return Ok(None),
    };
    let page = fetch_limited(url, HTML_LIMIT, deadline, Some(initial_endpoint))?;
    if let Some(content_type) = page.content_type.as_deref() {
        let mime = content_type.split(';').next().unwrap_or_default().trim();
        if !(mime.eq_ignore_ascii_case("text/html")
            || mime.eq_ignore_ascii_case("application/xhtml+xml"))
        {
            return Err("網站未回傳 HTML 頁面。".to_string());
        }
    }
    let html = String::from_utf8_lossy(&page.bytes);
    let title = extract_html_title(&html);
    let linked_icon = extract_icon_href(&html)
        .and_then(|href| page.final_url.join(&href).ok())
        .filter(|icon_url| normalize_url(icon_url.as_str()).is_ok());
    let fallback_icon = page.final_url.join("/favicon.ico").ok();
    let mut icon = None;
    for candidate in [linked_icon, fallback_icon].into_iter().flatten() {
        if let Ok(response) = fetch_limited(&candidate, FAVICON_LIMIT, deadline, None) {
            if let Some(mime_type) = favicon_mime(&response) {
                if !response.bytes.is_empty() {
                    icon = Some(RemoteIcon {
                        mime_type,
                        bytes: response.bytes,
                    });
                    break;
                }
            }
        }
    }
    Ok(Some(UrlMetadata { title, icon }))
}

fn fetch_limited(
    initial_url: &Url,
    limit: usize,
    deadline: Instant,
    initial_endpoint: Option<MetadataEndpoint>,
) -> Result<LimitedResponse, String> {
    let mut current = initial_url.clone();
    let mut endpoint = initial_endpoint;
    for redirect_count in 0..=MAX_REDIRECTS {
        validate_metadata_url(&current)?;
        let current_endpoint = match endpoint.take() {
            Some(endpoint) => endpoint,
            None => match metadata_access(&current, deadline)? {
                MetadataAccess::Allowed(endpoint) => endpoint,
                MetadataAccess::PrivateOrLan => {
                    return Err("為保護本機網路，未連線至私人或區域網路位址。".to_string());
                }
            },
        };
        let client = metadata_client(current_endpoint, deadline)?;
        let response = client
            .get(current.clone())
            .send()
            .map_err(|error| format!("連線失敗：{error}"))?;
        if response.status().is_redirection() {
            if redirect_count == MAX_REDIRECTS {
                return Err("網站重新導向次數超過 3 次。".to_string());
            }
            let location = response
                .headers()
                .get(LOCATION)
                .ok_or_else(|| "網站重新導向缺少目的地。".to_string())?
                .to_str()
                .map_err(|_| "網站重新導向格式不正確。".to_string())?;
            current = current
                .join(location)
                .map_err(|_| "網站重新導向網址不正確。".to_string())?;
            continue;
        }
        if !response.status().is_success() {
            return Err(format!("網站回傳狀態 {}。", response.status()));
        }
        return read_limited_response(response, current, limit);
    }
    Err("網站重新導向次數超過限制。".to_string())
}

fn metadata_client(endpoint: MetadataEndpoint, deadline: Instant) -> Result<Client, String> {
    let remaining = remaining_time(deadline)?;
    let mut builder = Client::builder()
        .timeout(remaining)
        .connect_timeout(remaining)
        .redirect(Policy::none())
        // A proxy may resolve the hostname independently and bypass the pinned
        // destination, so metadata requests deliberately avoid system proxies.
        .no_proxy();
    if let MetadataEndpoint::PinnedDomain {
        request_host,
        addresses,
    } = endpoint
    {
        builder = builder.resolve_to_addrs(&request_host, &addresses);
    }
    builder
        .build()
        .map_err(|error| format!("無法準備網站連線：{error}"))
}

fn read_limited_response(
    response: Response,
    final_url: Url,
    limit: usize,
) -> Result<LimitedResponse, String> {
    let content_type = response
        .headers()
        .get(CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .map(ToOwned::to_owned);
    let mut bytes = Vec::with_capacity(limit.min(64 * 1024));
    response
        .take((limit + 1) as u64)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("無法讀取網站回應：{error}"))?;
    if bytes.len() > limit {
        return Err(format!("網站回應超過 {} KB 限制。", limit / 1024));
    }
    Ok(LimitedResponse {
        final_url,
        content_type,
        bytes,
    })
}

fn validate_metadata_url(url: &Url) -> Result<(), String> {
    if !matches!(url.scheme(), "http" | "https") {
        return Err("網站重新導向到不允許的通訊協定。".to_string());
    }
    if url.host().is_none() {
        return Err("網站網址缺少主機名稱。".to_string());
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err("網站網址不可包含帳號或密碼。".to_string());
    }
    Ok(())
}

fn metadata_access(url: &Url, deadline: Instant) -> Result<MetadataAccess, String> {
    let port = url
        .port_or_known_default()
        .ok_or_else(|| "網址缺少有效連接埠。".to_string())?;
    match url.host() {
        Some(Host::Ipv4(address)) => Ok(if is_public_ipv4(address) {
            MetadataAccess::Allowed(MetadataEndpoint::DirectIp)
        } else {
            MetadataAccess::PrivateOrLan
        }),
        Some(Host::Ipv6(address)) => Ok(if is_public_ipv6(address) {
            MetadataAccess::Allowed(MetadataEndpoint::DirectIp)
        } else {
            MetadataAccess::PrivateOrLan
        }),
        Some(Host::Domain(domain)) => {
            let normalized = domain.trim_end_matches('.').to_ascii_lowercase();
            if normalized == "localhost"
                || normalized.ends_with(".localhost")
                || normalized.ends_with(".local")
                || !normalized.contains('.')
            {
                return Ok(MetadataAccess::PrivateOrLan);
            }
            let addresses = resolve_until_deadline(normalized.clone(), port, deadline)?;
            if addresses.is_empty() {
                return Err("網站主機沒有可用位址。".to_string());
            }
            if addresses.iter().all(|address| is_public_ip(address.ip())) {
                Ok(MetadataAccess::Allowed(MetadataEndpoint::PinnedDomain {
                    // The override key must match the URL hostname so TLS still
                    // uses the original hostname for certificate verification/SNI.
                    request_host: domain.to_string(),
                    addresses,
                }))
            } else {
                Ok(MetadataAccess::PrivateOrLan)
            }
        }
        None => Err("網址缺少主機名稱。".to_string()),
    }
}

fn resolve_until_deadline(
    hostname: String,
    port: u16,
    deadline: Instant,
) -> Result<Vec<SocketAddr>, String> {
    let remaining = remaining_time(deadline)?;
    let (sender, receiver) = mpsc::sync_channel(1);
    thread::spawn(move || {
        let resolved = (hostname.as_str(), port)
            .to_socket_addrs()
            .map(|addresses| addresses.collect::<Vec<_>>())
            .map_err(|error| error.to_string());
        let _ = sender.send(resolved);
    });
    match receiver.recv_timeout(remaining) {
        Ok(Ok(addresses)) => Ok(addresses),
        Ok(Err(error)) => Err(format!("無法解析網站主機：{error}")),
        Err(mpsc::RecvTimeoutError::Timeout) => Err("取得網站資訊超過 3 秒。".to_string()),
        Err(mpsc::RecvTimeoutError::Disconnected) => Err("網站主機解析工作意外中止。".to_string()),
    }
}

fn remaining_time(deadline: Instant) -> Result<Duration, String> {
    deadline
        .checked_duration_since(Instant::now())
        .filter(|remaining| !remaining.is_zero())
        .ok_or_else(|| "取得網站資訊超過 3 秒。".to_string())
}

fn is_public_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_public_ipv4(address),
        IpAddr::V6(address) => is_public_ipv6(address),
    }
}

fn is_public_ipv4(address: Ipv4Addr) -> bool {
    let [a, b, c, _d] = address.octets();
    !(a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 168)
        || (a == 192 && b == 0 && (c == 0 || c == 2))
        || (a == 198 && (b == 18 || b == 19 || (b == 51 && c == 100)))
        || (a == 203 && b == 0 && c == 113)
        || a >= 224)
}

fn is_public_ipv6(address: Ipv6Addr) -> bool {
    if let Some(mapped) = address.to_ipv4() {
        return is_public_ipv4(mapped);
    }
    let segments = address.segments();
    !(address.is_unspecified()
        || address.is_loopback()
        || (segments[0] & 0xfe00) == 0xfc00
        || (segments[0] & 0xffc0) == 0xfe80
        || (segments[0] & 0xff00) == 0xff00
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
        || (segments[0] == 0x0100 && segments[1..].iter().all(|segment| *segment == 0)))
}

fn extract_html_title(html: &str) -> Option<String> {
    let title_regex = Regex::new(r"(?is)<title(?:\s[^>]*)?>(.*?)</title>").ok()?;
    let tags = Regex::new(r"(?is)<[^>]*>").ok()?;
    let captured = title_regex.captures(html)?.get(1)?.as_str();
    let without_tags = tags.replace_all(captured, " ");
    let decoded = decode_basic_entities(&without_tags);
    let collapsed = decoded.split_whitespace().collect::<Vec<_>>().join(" ");
    let bounded = collapsed.chars().take(200).collect::<String>();
    (!bounded.is_empty()).then_some(bounded)
}

fn extract_icon_href(html: &str) -> Option<String> {
    let link_regex = Regex::new(r"(?is)<link\b[^>]*>").ok()?;
    for tag in link_regex.find_iter(html) {
        let Some(rel) = html_attribute(tag.as_str(), "rel") else {
            continue;
        };
        if !rel.split_ascii_whitespace().any(|value| {
            value.eq_ignore_ascii_case("icon") || value.eq_ignore_ascii_case("shortcut")
        }) {
            continue;
        }
        if let Some(href) = html_attribute(tag.as_str(), "href") {
            if !href.trim().is_empty() {
                return Some(decode_basic_entities(href.trim()));
            }
        }
    }
    None
}

fn html_attribute(tag: &str, attribute: &str) -> Option<String> {
    let pattern = format!(
        r#"(?is)\b{}\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))"#,
        regex::escape(attribute)
    );
    let regex = Regex::new(&pattern).ok()?;
    let captures = regex.captures(tag)?;
    (1..=3)
        .find_map(|index| captures.get(index))
        .map(|value| value.as_str().to_string())
}

fn decode_basic_entities(value: &str) -> String {
    value
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&nbsp;", " ")
}

fn favicon_mime(response: &LimitedResponse) -> Option<String> {
    let declared = response
        .content_type
        .as_deref()
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .unwrap_or_default();
    match declared.to_ascii_lowercase().as_str() {
        "image/png" => Some("image/png".to_string()),
        "image/jpeg" | "image/jpg" => Some("image/jpeg".to_string()),
        "image/gif" => Some("image/gif".to_string()),
        "image/webp" => Some("image/webp".to_string()),
        "image/svg+xml" => Some("image/svg+xml".to_string()),
        "image/x-icon" | "image/vnd.microsoft.icon" => Some("image/x-icon".to_string()),
        _ => mime_from_icon_path(&response.final_url),
    }
}

fn mime_from_icon_path(url: &Url) -> Option<String> {
    let extension = Path::new(url.path())
        .extension()
        .and_then(|value| value.to_str())?
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => Some("image/png".to_string()),
        "jpg" | "jpeg" => Some("image/jpeg".to_string()),
        "gif" => Some("image/gif".to_string()),
        "webp" => Some("image/webp".to_string()),
        "svg" => Some("image/svg+xml".to_string()),
        "ico" => Some("image/x-icon".to_string()),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{Workspace, WorkspaceState};
    use std::{collections::HashMap, sync::Mutex};

    fn store_with_pages(page_ids: &[&str]) -> WorkspaceStore {
        let store = WorkspaceStore::in_memory().expect("create store");
        let state = WorkspaceState {
            workspaces: page_ids
                .iter()
                .map(|id| Workspace {
                    id: (*id).to_string(),
                    name: (*id).to_string(),
                    symbol: "⌂".to_string(),
                })
                .collect(),
            items: Vec::new(),
        };
        let root = std::env::temp_dir().join(format!(
            "personal-place-ingest-init-{}-{}",
            std::process::id(),
            make_card_id()
        ));
        store
            .initialize(
                Some(state),
                &HashMap::new(),
                &root.join("registry.json"),
                &root.join("backups"),
            )
            .expect("initialize");
        let _ = fs::remove_dir_all(root);
        store
    }

    #[test]
    fn url_normalization_allows_only_http_and_https_without_userinfo() {
        assert_eq!(
            normalize_url(" HTTPS://Example.COM/path ")
                .expect("valid URL")
                .as_str(),
            "https://example.com/path"
        );
        assert!(normalize_url("file:///C:/Windows/notepad.exe").is_err());
        assert!(normalize_url("https://user:secret@example.com/").is_err());
    }

    #[test]
    fn risky_extensions_cover_the_approved_list_but_not_exe_or_lnk() {
        let root = std::env::temp_dir().join(format!(
            "personal-place-risk-list-{}-{}",
            std::process::id(),
            make_card_id()
        ));
        fs::create_dir_all(&root).expect("create root");
        for extension in RISKY_EXTENSIONS {
            for spelling in [extension.to_string(), extension.to_ascii_uppercase()] {
                let path = root.join(format!("sample.{spelling}"));
                fs::write(&path, "fixture").expect("write risky fixture");
                assert!(is_risky_path(&path), "{spelling} should be risky");
            }
        }
        for safe in ["sample.exe", "sample.lnk"] {
            let path = root.join(safe);
            fs::write(&path, "fixture").expect("write safe fixture");
            assert!(!is_risky_path(&path));
        }
        let misleading_folder = root.join("folder.bat");
        fs::create_dir(&misleading_folder).expect("create folder");
        assert!(!is_risky_path(&misleading_folder));
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn private_and_lan_addresses_never_allow_metadata_fetching() {
        for value in [
            "http://127.0.0.1/",
            "http://10.0.0.1/",
            "http://192.168.1.2/",
            "http://[::1]/",
            "http://printer.local/",
            "http://intranet/",
        ] {
            let url = normalize_url(value).expect("valid local URL");
            assert!(matches!(
                metadata_access(&url, Instant::now() + REQUEST_TIMEOUT).expect("classify"),
                MetadataAccess::PrivateOrLan
            ));
        }
    }

    #[test]
    fn public_ip_literals_use_the_direct_pinned_destination() {
        let url = normalize_url("https://8.8.8.8/").expect("valid public IP URL");
        assert!(matches!(
            metadata_access(&url, Instant::now() + REQUEST_TIMEOUT).expect("classify"),
            MetadataAccess::Allowed(MetadataEndpoint::DirectIp)
        ));
    }

    #[test]
    fn html_title_and_icon_are_extracted_from_bounded_input() {
        let html = r#"<html><head><title>  Personal &amp; Place </title><link href='/style.css'><link href='/icon.png' rel='shortcut icon'></head></html>"#;
        assert_eq!(
            extract_html_title(html).as_deref(),
            Some("Personal & Place")
        );
        assert_eq!(extract_icon_href(html).as_deref(), Some("/icon.png"));
    }

    #[test]
    fn html_titles_are_limited_to_two_hundred_unicode_characters() {
        let title = "界".repeat(260);
        let html = format!("<title>{title}</title>");
        let extracted = extract_html_title(&html).expect("extract title");
        assert_eq!(extracted.chars().count(), 200);
        assert!(extracted.chars().all(|character| character == '界'));
    }

    #[test]
    fn batch_keeps_valid_paths_when_another_input_is_missing() {
        let store = store_with_pages(&["home"]);
        let root = std::env::temp_dir().join(format!(
            "personal-place-ingest-batch-{}-{}",
            std::process::id(),
            make_card_id()
        ));
        fs::create_dir_all(&root).expect("create root");
        let valid = root.join("note.txt");
        fs::write(&valid, "hello").expect("write fixture");
        let result = ingest_items(
            &store,
            &root.join("cache"),
            &Mutex::new(()),
            IngestRequest {
                page_id: "home".to_string(),
                parent_group_id: None,
                inputs: vec![
                    IngestInput {
                        input_type: "path".to_string(),
                        value: valid.to_string_lossy().into_owned(),
                    },
                    IngestInput {
                        input_type: "path".to_string(),
                        value: root.join("missing.txt").to_string_lossy().into_owned(),
                    },
                ],
                allow_duplicate: false,
                allow_risky: false,
            },
        );
        assert_eq!(result.added.len(), 1);
        assert_eq!(result.errors.len(), 1);
        assert_eq!(result.errors[0].code, "missing");
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn duplicates_are_page_local_and_can_be_explicitly_allowed() {
        let store = store_with_pages(&["one", "two"]);
        let root = std::env::temp_dir().join(format!(
            "personal-place-ingest-duplicate-{}-{}",
            std::process::id(),
            make_card_id()
        ));
        fs::create_dir_all(&root).expect("create root");
        let path = root.join("app.exe");
        fs::write(&path, "fixture").expect("write fixture");
        let run = |page_id: &str, allow_duplicate: bool| {
            ingest_items(
                &store,
                &root.join("cache"),
                &Mutex::new(()),
                IngestRequest {
                    page_id: page_id.to_string(),
                    parent_group_id: None,
                    inputs: vec![IngestInput {
                        input_type: "path".to_string(),
                        value: path.to_string_lossy().into_owned(),
                    }],
                    allow_duplicate,
                    allow_risky: false,
                },
            )
        };
        assert_eq!(run("one", false).added.len(), 1);
        assert_eq!(run("one", false).issues[0].code, "duplicate");
        assert_eq!(run("two", false).added.len(), 1);
        assert_eq!(run("one", true).added.len(), 1);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_url_spelling_is_detected_and_its_target_id_is_reused() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let legacy_target_id = "HTTP://127.0.0.1:80/path";
        let state = WorkspaceState {
            workspaces: vec![Workspace {
                id: "home".to_string(),
                name: "home".to_string(),
                symbol: "⌂".to_string(),
            }],
            items: vec![LauncherItem {
                id: "legacy-web".to_string(),
                workspace_id: "home".to_string(),
                title: "Legacy".to_string(),
                subtitle: legacy_target_id.to_string(),
                kind: "web".to_string(),
                target: legacy_target_id.to_string(),
                symbol: "↗".to_string(),
                tone: "cyan".to_string(),
                size: "square".to_string(),
            }],
        };
        let root = std::env::temp_dir().join(format!(
            "personal-place-ingest-legacy-url-{}-{}",
            std::process::id(),
            make_card_id()
        ));
        store
            .initialize(
                Some(state),
                &HashMap::new(),
                &root.join("registry.json"),
                &root.join("backups"),
            )
            .expect("initialize");
        let run = |allow_duplicate: bool| {
            ingest_items(
                &store,
                &root.join("cache"),
                &Mutex::new(()),
                IngestRequest {
                    page_id: "home".to_string(),
                    parent_group_id: None,
                    inputs: vec![IngestInput {
                        input_type: "url".to_string(),
                        // A private literal avoids a network request while still testing URL identity.
                        value: "http://127.0.0.1/path".to_string(),
                    }],
                    allow_duplicate,
                    allow_risky: false,
                },
            )
        };
        assert_eq!(run(false).issues[0].code, "duplicate");
        let added = run(true).added;
        assert_eq!(added.len(), 1);
        assert_eq!(added[0].target, legacy_target_id);
        let stored = store
            .resolve_card_target(&added[0].id)
            .expect("resolve legacy card")
            .expect("legacy target exists");
        assert_eq!(stored.locator, legacy_target_id);
        assert_eq!(
            normalize_url(&stored.locator)
                .expect("legacy URL remains launchable")
                .as_str(),
            "http://127.0.0.1/path"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn new_urls_use_an_opaque_sha256_target_and_keep_the_url_in_storage() {
        let store = store_with_pages(&["home"]);
        let root = std::env::temp_dir().join(format!(
            "personal-place-ingest-opaque-url-{}-{}",
            std::process::id(),
            make_card_id()
        ));
        let locator = "http://127.0.0.1:8765/private-page";
        let result = ingest_items(
            &store,
            &root.join("cache"),
            &Mutex::new(()),
            IngestRequest {
                page_id: "home".to_string(),
                parent_group_id: None,
                inputs: vec![IngestInput {
                    input_type: "url".to_string(),
                    value: locator.to_string(),
                }],
                allow_duplicate: false,
                allow_risky: false,
            },
        );
        assert!(result.issues.is_empty());
        assert!(result.errors.is_empty());
        assert_eq!(result.added.len(), 1);
        let added = &result.added[0];
        assert!(added.target.starts_with("url-"));
        assert_eq!(added.target.len(), 4 + 64);
        assert!(!added.target.contains("http"));
        let stored = store
            .resolve_card_target(&added.id)
            .expect("resolve card")
            .expect("stored target");
        assert_eq!(stored.target_kind, "url");
        assert_eq!(stored.locator, locator);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn risky_paths_require_explicit_confirmation() {
        let store = store_with_pages(&["home"]);
        let root = std::env::temp_dir().join(format!(
            "personal-place-ingest-risky-{}-{}",
            std::process::id(),
            make_card_id()
        ));
        fs::create_dir_all(&root).expect("create root");
        let path = root.join("change-system.ps1");
        fs::write(&path, "Write-Host test").expect("write fixture");
        let run = |allow_risky: bool| {
            ingest_items(
                &store,
                &root.join("cache"),
                &Mutex::new(()),
                IngestRequest {
                    page_id: "home".to_string(),
                    parent_group_id: None,
                    inputs: vec![IngestInput {
                        input_type: "path".to_string(),
                        value: path.to_string_lossy().into_owned(),
                    }],
                    allow_duplicate: false,
                    allow_risky,
                },
            )
        };
        assert_eq!(run(false).issues[0].code, "risky");
        assert_eq!(run(true).added.len(), 1);
        let _ = fs::remove_dir_all(root);
    }
}
