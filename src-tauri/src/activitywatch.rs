use chrono::{DateTime, Duration, FixedOffset, Local, TimeZone};
use reqwest::{
    blocking::{Client, RequestBuilder, Response},
    redirect::Policy,
    Url,
};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use serde_json::Value;
use std::{collections::HashMap, io::Read, time::Duration as StdDuration};

const SERVER_URL: &str = "http://127.0.0.1:5600";
const CONNECT_TIMEOUT: StdDuration = StdDuration::from_secs(2);
const REQUEST_TIMEOUT: StdDuration = StdDuration::from_secs(8);
const MAX_RESPONSE_BYTES: u64 = 8 * 1024 * 1024;
const QUERY_RANK_LIMIT: usize = 64;
const RANK_LIMIT: usize = 12;
const TIMELINE_LIMIT: usize = 48;
const MIN_RANK_SECONDS: f64 = 60.0;
const MERGE_GAP_SECONDS: i64 = 30;
const BROWSER_APP_PATTERN: &str =
    "(?i)(chrome|chromium|msedge|firefox|librewolf|waterfox|brave|opera|vivaldi|arc|yandex|zen|floorp|helium)";

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityPeriod {
    Today,
    SevenDays,
    ThirtyDays,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityConnectionStatus {
    pub status: String,
    pub message: String,
    pub server_version: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityRankItem {
    pub key: String,
    pub label: String,
    pub seconds: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityTimelineItem {
    pub label: String,
    pub context: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub duration_seconds: f64,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum ActivityDetailKind {
    App,
    Website,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetailItem {
    pub title: Option<String>,
    pub url: Option<String>,
    pub started_at: String,
    pub ended_at: String,
    pub duration_seconds: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityDetail {
    pub kind: ActivityDetailKind,
    pub label: String,
    pub period: ActivityPeriod,
    pub total_seconds: f64,
    pub items: Vec<ActivityDetailItem>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySummary {
    pub connection: ActivityConnectionStatus,
    pub period: ActivityPeriod,
    pub range_start: String,
    pub range_end: String,
    pub active_total_seconds: f64,
    pub apps: Vec<ActivityRankItem>,
    pub websites: Vec<ActivityRankItem>,
}

#[derive(Debug, Deserialize)]
struct ServerInfo {
    version: Option<String>,
    hostname: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct BucketMetadata {
    id: String,
    #[serde(rename = "type")]
    event_type: String,
    hostname: Option<String>,
    last_updated: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ActivityWatchEvent {
    timestamp: String,
    #[serde(default)]
    duration: f64,
    #[serde(default)]
    data: HashMap<String, Value>,
}

#[derive(Debug, Deserialize)]
struct SummaryQueryResult {
    #[serde(default)]
    duration: f64,
    #[serde(default)]
    apps: Vec<ActivityWatchEvent>,
    #[serde(default)]
    domains: Vec<ActivityWatchEvent>,
}

#[derive(Debug, Deserialize)]
struct RecentQueryResult {
    #[serde(default)]
    window: Vec<ActivityWatchEvent>,
    #[serde(default)]
    web: Vec<ActivityWatchEvent>,
}

#[derive(Debug, Deserialize)]
struct DetailQueryResult {
    #[serde(default)]
    events: Vec<ActivityWatchEvent>,
}

#[derive(Serialize)]
struct QueryRequest<'a> {
    query: &'a [String],
    timeperiods: Vec<String>,
}

struct ActivityWatchClient {
    http: Client,
    base_url: Url,
}

struct ActivitySources {
    info: ServerInfo,
    window: BucketMetadata,
    afk: BucketMetadata,
    web_buckets: Vec<BucketMetadata>,
}

impl ActivityWatchClient {
    fn new() -> Result<Self, String> {
        let base_url = Url::parse(SERVER_URL)
            .map_err(|error| format!("ActivityWatch server URL is invalid: {error}"))?;
        validate_server_url(&base_url)?;
        let http = Client::builder()
            .connect_timeout(CONNECT_TIMEOUT)
            .timeout(REQUEST_TIMEOUT)
            .redirect(Policy::none())
            .no_proxy()
            .build()
            .map_err(|error| format!("Unable to create ActivityWatch client: {error}"))?;
        Ok(Self { http, base_url })
    }

    fn get<T: DeserializeOwned>(&self, path: &str) -> Result<T, String> {
        let url = self.endpoint(path)?;
        read_json(self.http.get(url))
    }

    fn post<T: DeserializeOwned, B: Serialize>(&self, path: &str, body: &B) -> Result<T, String> {
        let url = self.endpoint(path)?;
        let body = serde_json::to_vec(body)
            .map_err(|error| format!("Unable to encode ActivityWatch request: {error}"))?;
        read_json(
            self.http
                .post(url)
                .header(reqwest::header::CONTENT_TYPE, "application/json")
                .body(body),
        )
    }

    fn endpoint(&self, path: &str) -> Result<Url, String> {
        let url = self
            .base_url
            .join(path)
            .map_err(|error| format!("ActivityWatch endpoint is invalid: {error}"))?;
        validate_server_url(&url)?;
        Ok(url)
    }

    fn summary(
        &self,
        period: ActivityPeriod,
        range_start: DateTime<FixedOffset>,
        range_end: DateTime<FixedOffset>,
    ) -> Result<ActivitySummary, String> {
        let sources = self.sources()?;
        let query = build_summary_query(&sources.window.id, &sources.afk.id, &sources.web_buckets)?;
        let request = QueryRequest {
            query: &query,
            timeperiods: vec![timeperiod_string(range_start, range_end)],
        };
        let result: Vec<SummaryQueryResult> = self.post("/api/0/query/", &request)?;
        let result = result
            .into_iter()
            .next()
            .ok_or_else(|| "ActivityWatch 查詢沒有回傳資料。".to_string())?;

        Ok(ActivitySummary {
            connection: ActivityConnectionStatus {
                status: "connected".to_string(),
                message: "ActivityWatch 已連線".to_string(),
                server_version: sources.info.version,
            },
            period,
            range_start: range_start.to_rfc3339(),
            range_end: range_end.to_rfc3339(),
            active_total_seconds: result.duration.max(0.0),
            apps: ranked_app_items(result.apps),
            websites: ranked_website_items(result.domains),
        })
    }

    fn sources(&self) -> Result<ActivitySources, String> {
        let info: ServerInfo = self.get("/api/0/info")?;
        let buckets: HashMap<String, BucketMetadata> = self.get("/api/0/buckets/")?;
        let hostname = info.hostname.as_deref();
        let window = select_bucket(&buckets, "currentwindow", hostname)
            .ok_or_else(|| "ActivityWatch 尚未建立視窗活動資料。".to_string())?;
        let afk = select_bucket(&buckets, "afkstatus", hostname)
            .ok_or_else(|| "ActivityWatch 尚未建立離開狀態資料。".to_string())?;
        let web_buckets = select_web_buckets(&buckets, hostname);
        Ok(ActivitySources {
            info,
            window,
            afk,
            web_buckets,
        })
    }

    fn timeline(
        &self,
        start: DateTime<FixedOffset>,
        end: DateTime<FixedOffset>,
    ) -> Result<Vec<ActivityTimelineItem>, String> {
        let sources = self.sources()?;
        let query = build_event_query(&sources.window.id, &sources.afk.id, &sources.web_buckets)?;
        let request = QueryRequest {
            query: &query,
            timeperiods: vec![timeperiod_string(start, end)],
        };
        let result: Vec<RecentQueryResult> = self.post("/api/0/query/", &request)?;
        Ok(result
            .into_iter()
            .next()
            .map(timeline_items)
            .unwrap_or_default())
    }

    fn detail(
        &self,
        period: ActivityPeriod,
        kind: ActivityDetailKind,
        key: &str,
        start: DateTime<FixedOffset>,
        end: DateTime<FixedOffset>,
    ) -> Result<ActivityDetail, String> {
        validate_detail_key(key)?;
        let sources = self.sources()?;
        let query = build_detail_query(
            &sources.window.id,
            &sources.afk.id,
            &sources.web_buckets,
            &kind,
            key,
        )?;
        let request = QueryRequest {
            query: &query,
            timeperiods: vec![timeperiod_string(start, end)],
        };
        let result: Vec<DetailQueryResult> = self.post("/api/0/query/", &request)?;
        let events = result
            .into_iter()
            .next()
            .map(|value| value.events)
            .unwrap_or_default();
        Ok(detail_from_events(period, kind, key, events))
    }
}

pub fn get_activity_summary(period: ActivityPeriod) -> ActivitySummary {
    let now = Local::now().fixed_offset();
    get_activity_summary_at(period, now)
}

pub fn get_activity_timeline() -> Result<Vec<ActivityTimelineItem>, String> {
    let now = Local::now().fixed_offset();
    let (start, end) = range_for(ActivityPeriod::Today, now);
    ActivityWatchClient::new()?.timeline(start, end)
}

pub fn get_activity_detail(
    period: ActivityPeriod,
    kind: ActivityDetailKind,
    key: String,
) -> Result<ActivityDetail, String> {
    let now = Local::now().fixed_offset();
    let (start, end) = range_for(period, now);
    ActivityWatchClient::new()?.detail(period, kind, &key, start, end)
}

fn get_activity_summary_at(period: ActivityPeriod, now: DateTime<FixedOffset>) -> ActivitySummary {
    let (range_start, range_end) = range_for(period, now);
    match ActivityWatchClient::new()
        .and_then(|client| client.summary(period, range_start, range_end))
    {
        Ok(summary) => summary,
        Err(_) => unavailable_summary(period, range_start, range_end),
    }
}

fn unavailable_summary(
    period: ActivityPeriod,
    range_start: DateTime<FixedOffset>,
    range_end: DateTime<FixedOffset>,
) -> ActivitySummary {
    ActivitySummary {
        connection: ActivityConnectionStatus {
            status: "unavailable".to_string(),
            message: "無法連線 ActivityWatch。請確認 ActivityWatch 正在本機執行。".to_string(),
            server_version: None,
        },
        period,
        range_start: range_start.to_rfc3339(),
        range_end: range_end.to_rfc3339(),
        active_total_seconds: 0.0,
        apps: Vec::new(),
        websites: Vec::new(),
    }
}

fn validate_server_url(url: &Url) -> Result<(), String> {
    if url.scheme() != "http"
        || url.host_str() != Some("127.0.0.1")
        || url.port_or_known_default() != Some(5600)
        || url.username() != ""
        || url.password().is_some()
    {
        return Err(
            "ActivityWatch requests are restricted to the fixed localhost server.".to_string(),
        );
    }
    Ok(())
}

fn read_json<T: DeserializeOwned>(request: RequestBuilder) -> Result<T, String> {
    let response = request
        .send()
        .map_err(|error| format!("ActivityWatch request failed: {error}"))?;
    read_json_response(response)
}

fn read_json_response<T: DeserializeOwned>(response: Response) -> Result<T, String> {
    if response.status().is_redirection() {
        return Err("ActivityWatch redirect responses are not allowed.".to_string());
    }
    let status = response.status();
    if !status.is_success() {
        return Err(format!("ActivityWatch returned HTTP {status}."));
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE_BYTES)
    {
        return Err("ActivityWatch response is too large.".to_string());
    }
    let mut bytes = Vec::new();
    response
        .take(MAX_RESPONSE_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("Unable to read ActivityWatch response: {error}"))?;
    if bytes.len() as u64 > MAX_RESPONSE_BYTES {
        return Err("ActivityWatch response is too large.".to_string());
    }
    serde_json::from_slice(&bytes)
        .map_err(|error| format!("ActivityWatch returned invalid JSON: {error}"))
}

fn range_for(
    period: ActivityPeriod,
    now: DateTime<FixedOffset>,
) -> (DateTime<FixedOffset>, DateTime<FixedOffset>) {
    let midnight = now
        .timezone()
        .from_local_datetime(
            &now.date_naive()
                .and_hms_opt(0, 0, 0)
                .expect("valid midnight"),
        )
        .single()
        .expect("fixed offset has one local time");
    let start = match period {
        ActivityPeriod::Today => midnight,
        ActivityPeriod::SevenDays => midnight - Duration::days(6),
        ActivityPeriod::ThirtyDays => midnight - Duration::days(29),
    };
    (start, now)
}

fn timeperiod_string(start: DateTime<FixedOffset>, end: DateTime<FixedOffset>) -> String {
    format!("{}/{}", start.to_rfc3339(), end.to_rfc3339())
}

fn select_bucket(
    buckets: &HashMap<String, BucketMetadata>,
    event_type: &str,
    hostname: Option<&str>,
) -> Option<BucketMetadata> {
    let mut candidates = buckets
        .values()
        .filter(|bucket| bucket.event_type == event_type && safe_bucket_id(&bucket.id))
        .cloned()
        .collect::<Vec<_>>();
    candidates.sort_by(|left, right| {
        let left_host = hostname.is_some() && left.hostname.as_deref() == hostname;
        let right_host = hostname.is_some() && right.hostname.as_deref() == hostname;
        left_host
            .cmp(&right_host)
            .then_with(|| left.last_updated.cmp(&right.last_updated))
            .reverse()
    });
    candidates.into_iter().next()
}

fn select_web_buckets(
    buckets: &HashMap<String, BucketMetadata>,
    hostname: Option<&str>,
) -> Vec<BucketMetadata> {
    let mut candidates = buckets
        .values()
        .filter(|bucket| bucket.event_type == "web.tab.current" && safe_bucket_id(&bucket.id))
        .cloned()
        .collect::<Vec<_>>();
    if let Some(hostname) = hostname {
        let has_same_host = candidates
            .iter()
            .any(|bucket| bucket.hostname.as_deref() == Some(hostname));
        if has_same_host {
            candidates.retain(|bucket| bucket.hostname.as_deref() == Some(hostname));
        }
    }
    candidates.sort_by(|left, right| {
        let left_host = hostname.is_some() && left.hostname.as_deref() == hostname;
        let right_host = hostname.is_some() && right.hostname.as_deref() == hostname;
        left_host
            .cmp(&right_host)
            .then_with(|| left.last_updated.cmp(&right.last_updated))
            .reverse()
    });
    candidates.truncate(8);
    candidates
}

fn safe_bucket_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 240
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
}

fn query_source(window_bucket: &str, afk_bucket: &str) -> Result<Vec<String>, String> {
    if !safe_bucket_id(window_bucket) || !safe_bucket_id(afk_bucket) {
        return Err("ActivityWatch returned an unsafe bucket identifier.".to_string());
    }
    Ok(vec![
        format!("events = flood(query_bucket(\"{window_bucket}\"));"),
        format!("not_afk = flood(query_bucket(\"{afk_bucket}\"));"),
        "not_afk = filter_keyvals(not_afk, \"status\", [\"not-afk\"]);".to_string(),
        format!(
            "browser_windows = filter_keyvals_regex(events, \"app\", \"{BROWSER_APP_PATTERN}\");"
        ),
        "browser_events = [];".to_string(),
    ])
}

fn append_browser_query(
    query: &mut Vec<String>,
    web_buckets: &[BucketMetadata],
) -> Result<(), String> {
    for (index, bucket) in web_buckets.iter().enumerate() {
        if !safe_bucket_id(&bucket.id) {
            return Err("ActivityWatch returned an unsafe web bucket identifier.".to_string());
        }
        query.push(format!(
            "browser_{index} = flood(query_bucket(\"{}\"));",
            bucket.id
        ));
        query.push(format!(
            "browser_{index} = filter_period_intersect(browser_{index}, browser_windows);"
        ));
        query.push(format!(
            "browser_events = union_no_overlap(browser_events, browser_{index});"
        ));
    }
    Ok(())
}

fn apply_active_filter(query: &mut Vec<String>) {
    query.extend([
        "audible_events = filter_keyvals(browser_events, \"audible\", [true]);".to_string(),
        "not_afk = period_union(not_afk, audible_events);".to_string(),
        "events = filter_period_intersect(events, not_afk);".to_string(),
        format!(
            "active_browser_windows = filter_keyvals_regex(events, \"app\", \"{BROWSER_APP_PATTERN}\");"
        ),
        "browser_events = filter_period_intersect(browser_events, active_browser_windows);"
            .to_string(),
        "browser_events = split_url_events(browser_events);".to_string(),
    ]);
}

fn build_summary_query(
    window_bucket: &str,
    afk_bucket: &str,
    web_buckets: &[BucketMetadata],
) -> Result<Vec<String>, String> {
    let mut query = query_source(window_bucket, afk_bucket)?;
    append_browser_query(&mut query, web_buckets)?;
    apply_active_filter(&mut query);
    query.extend([
        "apps = sort_by_duration(merge_events_by_keys(events, [\"app\"]));".to_string(),
        format!("apps = limit_events(apps, {QUERY_RANK_LIMIT});"),
        "domains = sort_by_duration(merge_events_by_keys(browser_events, [\"$domain\"]));"
            .to_string(),
        format!("domains = limit_events(domains, {QUERY_RANK_LIMIT});"),
        "RETURN = {\"duration\": sum_durations(events), \"apps\": apps, \"domains\": domains};"
            .to_string(),
    ]);
    Ok(query)
}

fn build_event_query(
    window_bucket: &str,
    afk_bucket: &str,
    web_buckets: &[BucketMetadata],
) -> Result<Vec<String>, String> {
    let mut query = query_source(window_bucket, afk_bucket)?;
    append_browser_query(&mut query, web_buckets)?;
    apply_active_filter(&mut query);
    query.push("RETURN = {\"window\": events, \"web\": browser_events};".to_string());
    Ok(query)
}

fn build_detail_query(
    window_bucket: &str,
    afk_bucket: &str,
    web_buckets: &[BucketMetadata],
    kind: &ActivityDetailKind,
    key: &str,
) -> Result<Vec<String>, String> {
    validate_detail_key(key)?;
    let mut query = query_source(window_bucket, afk_bucket)?;
    append_browser_query(&mut query, web_buckets)?;
    apply_active_filter(&mut query);
    match kind {
        ActivityDetailKind::App => {
            let pattern = serde_json::to_string(&app_detail_pattern(key))
                .map_err(|error| format!("Unable to encode ActivityWatch filter: {error}"))?;
            query.push(format!(
                "detail_events = filter_keyvals_regex(events, \"app\", {pattern});"
            ));
        }
        ActivityDetailKind::Website => {
            let domain = serde_json::to_string(key)
                .map_err(|error| format!("Unable to encode ActivityWatch filter: {error}"))?;
            query.push(format!(
                "detail_events = filter_keyvals(browser_events, \"$domain\", [{domain}]);"
            ));
        }
    }
    query.push("RETURN = {\"events\": detail_events};".to_string());
    Ok(query)
}

fn validate_detail_key(value: &str) -> Result<(), String> {
    if value.is_empty() || value.len() > 240 || value.chars().any(char::is_control) {
        return Err("Activity detail key is invalid.".to_string());
    }
    Ok(())
}

fn app_detail_pattern(label: &str) -> String {
    match label {
        "Personal Place" => {
            "(?i)^(personal-place(?:-[0-9.]+)?-portable|personal-workspace)(?:\\.exe)?$".to_string()
        }
        "Microsoft Edge" => "(?i)^msedge(?:\\.exe)?$".to_string(),
        "Discord" => "(?i)^discord(?:\\.exe)?$".to_string(),
        "ChatGPT" => "(?i)^chatgpt(?:\\.exe)?$".to_string(),
        "League of Legends" => "(?i)^league of legends(?:\\.exe)?$".to_string(),
        "Riot Client" => "(?i)^riot client(?:\\.exe)?$".to_string(),
        "Visual Studio Code" => "(?i)^(code|code - insiders)(?:\\.exe)?$".to_string(),
        _ => format!("(?i)^{}(?:\\.exe)?$", regex::escape(label)),
    }
}

fn normalize_app_name(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let without_exe = trimmed
        .strip_suffix(".exe")
        .or_else(|| trimmed.strip_suffix(".EXE"))
        .unwrap_or(trimmed)
        .trim();
    let lower = without_exe.to_ascii_lowercase();
    let normalized = match lower.as_str() {
        "msedge" => "Microsoft Edge",
        "discord" => "Discord",
        "chatgpt" => "ChatGPT",
        "league of legends" => "League of Legends",
        "riot client" => "Riot Client",
        "personal-workspace" => "Personal Place",
        "code" => "Visual Studio Code",
        _ if lower.starts_with("personal-place-") && lower.ends_with("-portable") => {
            "Personal Place"
        }
        _ => without_exe,
    };
    Some(normalized.to_string())
}

fn normalize_domain(raw: &str) -> Option<String> {
    let domain = raw.trim().trim_end_matches('.').to_ascii_lowercase();
    if domain.is_empty() || is_internal_domain(&domain) {
        None
    } else {
        Some(domain)
    }
}

fn is_internal_domain(value: &str) -> bool {
    let lower = value.trim().to_ascii_lowercase();
    let host = lower.split(':').next().unwrap_or("");
    lower.starts_with("edge://")
        || lower.starts_with("chrome://")
        || lower.starts_with("about:")
        || lower.starts_with("extension://")
        || lower.starts_with("chrome-extension://")
        || matches!(host, "127.0.0.1" | "localhost" | "::1")
        || matches!(lower.as_str(), "newtab" | "extensions" | "new-tab-page")
}

fn ranked_app_items(events: Vec<ActivityWatchEvent>) -> Vec<ActivityRankItem> {
    ranked_items(events, "app", normalize_app_name)
}

fn ranked_website_items(events: Vec<ActivityWatchEvent>) -> Vec<ActivityRankItem> {
    ranked_items(events, "$domain", normalize_domain)
}

fn ranked_items(
    events: Vec<ActivityWatchEvent>,
    key: &str,
    normalize: fn(&str) -> Option<String>,
) -> Vec<ActivityRankItem> {
    let mut totals = HashMap::<String, f64>::new();
    for event in events {
        let Some(raw) = event.data.get(key).and_then(Value::as_str) else {
            continue;
        };
        let Some(label) = normalize(raw) else {
            continue;
        };
        if event.duration > 0.0 {
            *totals.entry(label).or_default() += event.duration;
        }
    }
    let mut items = totals
        .into_iter()
        .filter(|(_, seconds)| *seconds >= MIN_RANK_SECONDS)
        .map(|(label, seconds)| ActivityRankItem {
            key: label.clone(),
            label,
            seconds,
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| right.seconds.total_cmp(&left.seconds));
    items.truncate(RANK_LIMIT);
    items
}

fn timeline_items(result: RecentQueryResult) -> Vec<ActivityTimelineItem> {
    let RecentQueryResult { window, web } = result;
    let useful_web = web
        .into_iter()
        .filter(|event| {
            event
                .data
                .get("$domain")
                .and_then(Value::as_str)
                .and_then(normalize_domain)
                .is_some()
        })
        .collect::<Vec<_>>();
    let web_ranges = useful_web
        .iter()
        .filter_map(event_range)
        .collect::<Vec<_>>();
    let mut items = window
        .iter()
        .filter(|event| {
            let browser = event
                .data
                .get("app")
                .and_then(Value::as_str)
                .is_some_and(is_browser_app);
            !browser
                || !event_range(event).is_some_and(|range| {
                    web_ranges
                        .iter()
                        .any(|web_range| ranges_overlap(range, *web_range))
                })
        })
        .filter_map(timeline_from_window_event)
        .collect::<Vec<_>>();
    items.extend(
        useful_web
            .iter()
            .filter_map(|event| timeline_from_web_event(event, &window)),
    );
    let mut items = merge_adjacent_timeline_items(items);
    items.sort_by(|left, right| {
        parse_timestamp(&right.started_at).cmp(&parse_timestamp(&left.started_at))
    });
    items.truncate(TIMELINE_LIMIT);
    items
}

fn merge_adjacent_timeline_items(
    mut items: Vec<ActivityTimelineItem>,
) -> Vec<ActivityTimelineItem> {
    items.sort_by(|left, right| {
        parse_timestamp(&left.started_at).cmp(&parse_timestamp(&right.started_at))
    });
    let mut merged: Vec<ActivityTimelineItem> = Vec::new();
    for item in items {
        if let Some(previous) = merged.last_mut() {
            let gap = parse_timestamp(&item.started_at)
                .zip(parse_timestamp(&previous.ended_at))
                .map(|(start, end)| start - end)
                .unwrap_or(i64::MAX);
            if previous.label == item.label
                && previous.context == item.context
                && (0..=MERGE_GAP_SECONDS).contains(&gap)
            {
                previous.ended_at = item.ended_at;
                previous.duration_seconds += item.duration_seconds;
                continue;
            }
        }
        merged.push(item);
    }
    merged
}

fn timeline_from_window_event(event: &ActivityWatchEvent) -> Option<ActivityTimelineItem> {
    let raw_app = event.data.get("app")?.as_str()?;
    timeline_item(
        event,
        normalize_app_name(raw_app)?,
        event_text(event, "title").filter(|title| title != raw_app),
    )
}

fn timeline_from_web_event(
    event: &ActivityWatchEvent,
    windows: &[ActivityWatchEvent],
) -> Option<ActivityTimelineItem> {
    let domain = normalize_domain(event.data.get("$domain")?.as_str()?)?;
    let range = event_range(event)?;
    let label = windows
        .iter()
        .find(|window| {
            window
                .data
                .get("app")
                .and_then(Value::as_str)
                .is_some_and(is_browser_app)
                && event_range(window)
                    .is_some_and(|window_range| ranges_overlap(range, window_range))
        })
        .and_then(|window| window.data.get("app").and_then(Value::as_str))
        .and_then(normalize_app_name)
        .unwrap_or_else(|| "瀏覽器".to_string());
    let title = event_text(event, "title");
    let context = title
        .filter(|title| title != &domain)
        .map(|title| format!("{domain} · {title}"))
        .or(Some(domain));
    timeline_item(event, label, context)
}

fn timeline_item(
    event: &ActivityWatchEvent,
    label: String,
    context: Option<String>,
) -> Option<ActivityTimelineItem> {
    if event.duration <= 0.0 {
        return None;
    }
    Some(ActivityTimelineItem {
        label,
        context,
        started_at: event.timestamp.clone(),
        ended_at: add_seconds(&event.timestamp, event.duration)?,
        duration_seconds: event.duration,
    })
}

fn detail_from_events(
    period: ActivityPeriod,
    kind: ActivityDetailKind,
    key: &str,
    events: Vec<ActivityWatchEvent>,
) -> ActivityDetail {
    let mut items = events
        .into_iter()
        .filter(|event| match kind {
            ActivityDetailKind::App => {
                event
                    .data
                    .get("app")
                    .and_then(Value::as_str)
                    .and_then(normalize_app_name)
                    .as_deref()
                    == Some(key)
            }
            ActivityDetailKind::Website => {
                event
                    .data
                    .get("$domain")
                    .and_then(Value::as_str)
                    .and_then(normalize_domain)
                    .as_deref()
                    == Some(key)
            }
        })
        .filter(|event| event.duration > 0.0)
        .filter_map(|event| {
            let ended_at = add_seconds(&event.timestamp, event.duration)?;
            Some(ActivityDetailItem {
                title: event_text(&event, "title"),
                url: matches!(kind, ActivityDetailKind::Website)
                    .then(|| event_text(&event, "url"))
                    .flatten(),
                started_at: event.timestamp,
                ended_at,
                duration_seconds: event.duration,
            })
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        parse_timestamp(&right.started_at).cmp(&parse_timestamp(&left.started_at))
    });
    items = merge_detail_items(items);
    let total_seconds = items.iter().map(|item| item.duration_seconds).sum();
    ActivityDetail {
        kind,
        label: key.to_string(),
        period,
        total_seconds,
        items,
    }
}

fn merge_detail_items(mut items: Vec<ActivityDetailItem>) -> Vec<ActivityDetailItem> {
    items.sort_by_key(|right| std::cmp::Reverse(parse_timestamp(&right.started_at)));
    let mut merged: Vec<ActivityDetailItem> = Vec::new();
    for item in items {
        if let Some(previous) = merged.last_mut() {
            let gap = parse_timestamp(&previous.started_at).zip(parse_timestamp(&item.ended_at))
                .map(|(start, end)| start - end).unwrap_or(i64::MAX);
            if previous.title == item.title && previous.url == item.url && (0..=MERGE_GAP_SECONDS).contains(&gap) {
                previous.started_at = item.started_at;
                previous.duration_seconds += item.duration_seconds;
                continue;
            }
        }
        merged.push(item);
    }
    merged
}

fn event_text(event: &ActivityWatchEvent, key: &str) -> Option<String> {
    event
        .data
        .get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn add_seconds(timestamp: &str, seconds: f64) -> Option<String> {
    let start = DateTime::parse_from_rfc3339(timestamp).ok()?;
    let milliseconds = (seconds.max(0.0) * 1000.0).round() as i64;
    Some((start + Duration::milliseconds(milliseconds)).to_rfc3339())
}

fn is_browser_app(value: &str) -> bool {
    let value = value.to_ascii_lowercase();
    [
        "chrome",
        "chromium",
        "msedge",
        "firefox",
        "librewolf",
        "waterfox",
        "brave",
        "opera",
        "vivaldi",
        "arc",
        "yandex",
        "zen",
        "floorp",
        "helium",
    ]
    .iter()
    .any(|browser| value.contains(browser))
}

fn event_range(event: &ActivityWatchEvent) -> Option<(i64, i64)> {
    let start = parse_timestamp(&event.timestamp)?;
    let duration = event.duration.max(0.0).round() as i64;
    Some((start, start.saturating_add(duration)))
}

fn ranges_overlap(left: (i64, i64), right: (i64, i64)) -> bool {
    left.0 < right.1 && right.0 < left.1
}

fn parse_timestamp(value: &str) -> Option<i64> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.timestamp())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn server_url_is_fixed_to_expected_localhost_endpoint() {
        assert!(validate_server_url(&Url::parse(SERVER_URL).unwrap()).is_ok());
        assert!(validate_server_url(&Url::parse("http://localhost:5600").unwrap()).is_err());
        assert!(validate_server_url(&Url::parse("http://127.0.0.1:5601").unwrap()).is_err());
        assert!(validate_server_url(&Url::parse("https://127.0.0.1:5600").unwrap()).is_err());
        assert!(validate_server_url(&Url::parse("http://192.168.1.5:5600").unwrap()).is_err());
    }

    #[test]
    fn periods_start_at_local_midnight_and_include_expected_days() {
        let offset = FixedOffset::east_opt(8 * 3600).unwrap();
        let now = offset.with_ymd_and_hms(2026, 8, 28, 20, 30, 0).unwrap();
        let (today, end) = range_for(ActivityPeriod::Today, now);
        let (week, _) = range_for(ActivityPeriod::SevenDays, now);
        let (month, _) = range_for(ActivityPeriod::ThirtyDays, now);
        assert_eq!(today.to_rfc3339(), "2026-08-28T00:00:00+08:00");
        assert_eq!(week.to_rfc3339(), "2026-08-22T00:00:00+08:00");
        assert_eq!(month.to_rfc3339(), "2026-07-30T00:00:00+08:00");
        assert_eq!(end, now);
    }

    #[test]
    fn bucket_selection_prefers_same_host_and_rejects_query_injection() {
        let buckets = HashMap::from([
            (
                "old".to_string(),
                BucketMetadata {
                    id: "aw-watcher-window_other".to_string(),
                    event_type: "currentwindow".to_string(),
                    hostname: Some("other".to_string()),
                    last_updated: Some("2026-08-29T00:00:00+08:00".to_string()),
                },
            ),
            (
                "local".to_string(),
                BucketMetadata {
                    id: "aw-watcher-window_Tana-Pc2".to_string(),
                    event_type: "currentwindow".to_string(),
                    hostname: Some("Tana-Pc2".to_string()),
                    last_updated: Some("2026-08-28T00:00:00+08:00".to_string()),
                },
            ),
            (
                "unsafe".to_string(),
                BucketMetadata {
                    id: "bad\"); RETURN = secret;".to_string(),
                    event_type: "currentwindow".to_string(),
                    hostname: Some("Tana-Pc2".to_string()),
                    last_updated: Some("2026-08-30T00:00:00+08:00".to_string()),
                },
            ),
        ]);
        assert_eq!(
            select_bucket(&buckets, "currentwindow", Some("Tana-Pc2"))
                .unwrap()
                .id,
            "aw-watcher-window_Tana-Pc2"
        );
        assert!(!safe_bucket_id("bad\"); RETURN = secret;"));
    }

    #[test]
    fn app_names_are_normalized_and_unknown_executables_keep_a_clean_fallback() {
        assert_eq!(
            normalize_app_name("msedge.exe").as_deref(),
            Some("Microsoft Edge")
        );
        assert_eq!(
            normalize_app_name("Discord.exe").as_deref(),
            Some("Discord")
        );
        assert_eq!(
            normalize_app_name("ChatGPT.exe").as_deref(),
            Some("ChatGPT")
        );
        assert_eq!(
            normalize_app_name("League of Legends.exe").as_deref(),
            Some("League of Legends")
        );
        assert_eq!(
            normalize_app_name("Personal-Place-1.5.0-portable.exe").as_deref(),
            Some("Personal Place")
        );
        assert_eq!(
            normalize_app_name("personal-workspace.exe").as_deref(),
            Some("Personal Place")
        );
        assert_eq!(
            normalize_app_name("Riot Client.exe").as_deref(),
            Some("Riot Client")
        );
        assert_eq!(
            normalize_app_name("DrawingTool.exe").as_deref(),
            Some("DrawingTool")
        );
    }

    #[test]
    fn ranking_normalizes_combines_and_filters_sub_minute_activity() {
        let events: Vec<ActivityWatchEvent> = serde_json::from_str(
            r#"[{"timestamp":"2026-08-28T12:00:00+08:00","duration":40,"data":{"app":"msedge.exe"}},{"timestamp":"2026-08-28T12:01:00+08:00","duration":30,"data":{"app":"MSedge.exe"}},{"timestamp":"2026-08-28T12:02:00+08:00","duration":59,"data":{"app":"Tiny.exe"}}]"#,
        )
        .unwrap();
        assert_eq!(
            ranked_app_items(events),
            vec![ActivityRankItem {
                key: "Microsoft Edge".to_string(),
                label: "Microsoft Edge".to_string(),
                seconds: 70.0,
            }]
        );
    }

    #[test]
    fn browser_internal_domains_are_not_ranked() {
        for value in [
            "127.0.0.1",
            "127.0.0.1:5600",
            "localhost",
            "newtab",
            "extensions",
            "edge://settings",
            "chrome://newtab",
            "about:blank",
        ] {
            assert!(
                normalize_domain(value).is_none(),
                "{value} should be filtered"
            );
        }
        assert_eq!(
            normalize_domain("YouTube.com."),
            Some("youtube.com".to_string())
        );
    }

    #[test]
    fn query_treats_audible_browser_events_as_active_before_afk_filtering() {
        let web_bucket = BucketMetadata {
            id: "aw-watcher-web-chrome_Tana-Pc2".to_string(),
            event_type: "web.tab.current".to_string(),
            hostname: Some("Tana-Pc2".to_string()),
            last_updated: None,
        };
        let query = build_summary_query(
            "aw-watcher-window_Tana-Pc2",
            "aw-watcher-afk_Tana-Pc2",
            &[web_bucket],
        )
        .unwrap();
        let query = query.join("\n");
        let browser_query = query.find("browser_0 = flood").unwrap();
        let audible_filter = query
            .find("audible_events = filter_keyvals(browser_events, \"audible\", [true])")
            .unwrap();
        let audible_union = query
            .find("not_afk = period_union(not_afk, audible_events)")
            .unwrap();
        let afk_filter = query
            .find("events = filter_period_intersect(events, not_afk)")
            .unwrap();

        assert!(browser_query < audible_filter);
        assert!(audible_filter < audible_union);
        assert!(audible_union < afk_filter);
    }

    #[test]
    fn web_bucket_selection_ignores_stale_unknown_host_when_current_host_exists() {
        let buckets = HashMap::from([
            (
                "current".to_string(),
                BucketMetadata {
                    id: "aw-watcher-web-chrome_Tana-Pc2".to_string(),
                    event_type: "web.tab.current".to_string(),
                    hostname: Some("Tana-Pc2".to_string()),
                    last_updated: Some("2026-08-29T10:00:00+08:00".to_string()),
                },
            ),
            (
                "stale".to_string(),
                BucketMetadata {
                    id: "aw-watcher-web-chrome".to_string(),
                    event_type: "web.tab.current".to_string(),
                    hostname: Some("unknown".to_string()),
                    last_updated: Some("2026-08-29T11:00:00+08:00".to_string()),
                },
            ),
        ]);

        let selected = select_web_buckets(&buckets, Some("Tana-Pc2"));
        assert_eq!(selected.len(), 1);
        assert_eq!(selected[0].id, "aw-watcher-web-chrome_Tana-Pc2");
    }

    #[test]
    fn timeline_prefers_web_domain_over_overlapping_browser_window() {
        let result: RecentQueryResult = serde_json::from_str(
            r#"{"window":[{"timestamp":"2026-08-28T12:00:00+08:00","duration":60,"data":{"app":"msedge.exe","title":"Example"}},{"timestamp":"2026-08-28T11:00:00+08:00","duration":30,"data":{"app":"Code.exe","title":"main.rs"}}],"web":[{"timestamp":"2026-08-28T12:00:00+08:00","duration":60,"data":{"$domain":"example.com","title":"Example"}}]}"#,
        )
        .unwrap();
        let items = timeline_items(result);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].label, "Microsoft Edge");
        assert_eq!(items[0].context.as_deref(), Some("example.com · Example"));
        assert_eq!(items[1].label, "Visual Studio Code");
        assert_eq!(
            items.iter().map(|item| item.duration_seconds).sum::<f64>(),
            90.0
        );
    }

    #[test]
    fn timeline_orders_newest_first_and_merges_only_adjacent_matching_fragments() {
        let result: RecentQueryResult = serde_json::from_str(
            r#"{"window":[{"timestamp":"2026-08-29T10:38:55+08:00","duration":5,"data":{"app":"ChatGPT.exe","title":"Personal Place"}},{"timestamp":"2026-08-29T10:21:47+08:00","duration":1024,"data":{"app":"ChatGPT.exe","title":"Personal Place"}},{"timestamp":"2026-08-29T09:00:00+08:00","duration":60,"data":{"app":"Discord.exe","title":"Friends"}}],"web":[]}"#,
        )
        .unwrap();
        let items = timeline_items(result);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].label, "ChatGPT");
        assert_eq!(items[0].started_at, "2026-08-29T10:21:47+08:00");
        assert_eq!(items[0].ended_at, "2026-08-29T10:39:00+08:00");
        assert_eq!(items[0].duration_seconds, 1029.0);
        assert_eq!(items[1].label, "Discord");
    }

    #[test]
    fn detail_events_map_to_private_dtos_with_title_and_url() {
        let events: Vec<ActivityWatchEvent> = serde_json::from_str(
            r#"[{"timestamp":"2026-08-28T12:00:00+08:00","duration":120,"data":{"$domain":"youtube.com","title":"人體繪畫教學","url":"https://youtube.com/watch?v=private"}}]"#,
        )
        .unwrap();
        let detail = detail_from_events(
            ActivityPeriod::Today,
            ActivityDetailKind::Website,
            "youtube.com",
            events,
        );
        assert_eq!(detail.total_seconds, 120.0);
        assert_eq!(detail.items[0].title.as_deref(), Some("人體繪畫教學"));
        assert_eq!(
            detail.items[0].url.as_deref(),
            Some("https://youtube.com/watch?v=private")
        );
        assert_eq!(detail.items[0].ended_at, "2026-08-28T12:02:00+08:00");
    }

    #[test]
    #[ignore = "requires ActivityWatch running on the fixed localhost endpoint"]
    fn live_local_activitywatch_returns_a_connected_summary() {
        let summary = get_activity_summary(ActivityPeriod::Today);
        assert_eq!(summary.connection.status, "connected");
        assert!(summary.active_total_seconds >= 0.0);
    }
}
