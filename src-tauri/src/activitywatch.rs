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
const RANK_LIMIT: usize = 12;
const TIMELINE_LIMIT: usize = 16;
const RECENT_LOOKBACK_HOURS: i64 = 12;
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
    pub label: String,
    pub seconds: f64,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityTimelineItem {
    pub item_type: String,
    pub label: String,
    pub detail: Option<String>,
    pub started_at: String,
    pub duration_seconds: f64,
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
    pub timeline: Vec<ActivityTimelineItem>,
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

#[derive(Serialize)]
struct QueryRequest<'a> {
    query: &'a [String],
    timeperiods: Vec<String>,
}

struct ActivityWatchClient {
    http: Client,
    base_url: Url,
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
        let info: ServerInfo = self.get("/api/0/info")?;
        let buckets: HashMap<String, BucketMetadata> = self.get("/api/0/buckets/")?;
        let hostname = info.hostname.as_deref();
        let window = select_bucket(&buckets, "currentwindow", hostname)
            .ok_or_else(|| "ActivityWatch 尚未建立視窗活動資料。".to_string())?;
        let afk = select_bucket(&buckets, "afkstatus", hostname)
            .ok_or_else(|| "ActivityWatch 尚未建立離開狀態資料。".to_string())?;
        let web_buckets = select_web_buckets(&buckets, hostname);
        let query = build_summary_query(&window.id, &afk.id, &web_buckets)?;
        let request = QueryRequest {
            query: &query,
            timeperiods: vec![timeperiod_string(range_start, range_end)],
        };
        let result: Vec<SummaryQueryResult> = self.post("/api/0/query/", &request)?;
        let result = result
            .into_iter()
            .next()
            .ok_or_else(|| "ActivityWatch 查詢沒有回傳資料。".to_string())?;

        let recent_start = std::cmp::max(
            range_start,
            range_end - Duration::hours(RECENT_LOOKBACK_HOURS),
        );
        let timeline = self
            .recent_timeline(&window.id, &afk.id, &web_buckets, recent_start, range_end)
            .unwrap_or_default();

        Ok(ActivitySummary {
            connection: ActivityConnectionStatus {
                status: "connected".to_string(),
                message: "ActivityWatch 已連線".to_string(),
                server_version: info.version,
            },
            period,
            range_start: range_start.to_rfc3339(),
            range_end: range_end.to_rfc3339(),
            active_total_seconds: result.duration.max(0.0),
            apps: ranked_items(result.apps, "app"),
            websites: ranked_items(result.domains, "$domain"),
            timeline,
        })
    }

    fn recent_timeline(
        &self,
        window_bucket: &str,
        afk_bucket: &str,
        web_buckets: &[BucketMetadata],
        start: DateTime<FixedOffset>,
        end: DateTime<FixedOffset>,
    ) -> Result<Vec<ActivityTimelineItem>, String> {
        let query = build_recent_query(window_bucket, afk_bucket, web_buckets)?;
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
}

pub fn get_activity_summary(period: ActivityPeriod) -> ActivitySummary {
    let now = Local::now().fixed_offset();
    get_activity_summary_at(period, now)
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
        timeline: Vec::new(),
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
        "events = filter_period_intersect(events, not_afk);".to_string(),
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
    query.push("browser_events = split_url_events(browser_events);".to_string());
    Ok(())
}

fn build_summary_query(
    window_bucket: &str,
    afk_bucket: &str,
    web_buckets: &[BucketMetadata],
) -> Result<Vec<String>, String> {
    let mut query = query_source(window_bucket, afk_bucket)?;
    append_browser_query(&mut query, web_buckets)?;
    query.extend([
        "apps = sort_by_duration(merge_events_by_keys(events, [\"app\"]));".to_string(),
        format!("apps = limit_events(apps, {RANK_LIMIT});"),
        "domains = sort_by_duration(merge_events_by_keys(browser_events, [\"$domain\"]));"
            .to_string(),
        format!("domains = limit_events(domains, {RANK_LIMIT});"),
        "RETURN = {\"duration\": sum_durations(events), \"apps\": apps, \"domains\": domains};"
            .to_string(),
    ]);
    Ok(query)
}

fn build_recent_query(
    window_bucket: &str,
    afk_bucket: &str,
    web_buckets: &[BucketMetadata],
) -> Result<Vec<String>, String> {
    let mut query = query_source(window_bucket, afk_bucket)?;
    append_browser_query(&mut query, web_buckets)?;
    query.push("RETURN = {\"window\": events, \"web\": browser_events};".to_string());
    Ok(query)
}

fn ranked_items(events: Vec<ActivityWatchEvent>, key: &str) -> Vec<ActivityRankItem> {
    events
        .into_iter()
        .filter_map(|event| {
            let label = event.data.get(key)?.as_str()?.trim();
            (!label.is_empty() && event.duration > 0.0).then(|| ActivityRankItem {
                label: label.to_string(),
                seconds: event.duration,
            })
        })
        .collect()
}

fn timeline_items(result: RecentQueryResult) -> Vec<ActivityTimelineItem> {
    let RecentQueryResult { window, web } = result;
    let web_ranges = web.iter().filter_map(event_range).collect::<Vec<_>>();
    let mut items = window
        .into_iter()
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
        .filter_map(|event| timeline_from_event(event, "app", "app", "title"))
        .chain(
            web.into_iter()
                .filter_map(|event| timeline_from_event(event, "website", "$domain", "title")),
        )
        .collect::<Vec<_>>();
    items.sort_by(|left, right| {
        parse_timestamp(&right.started_at).cmp(&parse_timestamp(&left.started_at))
    });
    items.truncate(TIMELINE_LIMIT);
    items
}

fn timeline_from_event(
    event: ActivityWatchEvent,
    item_type: &str,
    label_key: &str,
    detail_key: &str,
) -> Option<ActivityTimelineItem> {
    let label = event.data.get(label_key)?.as_str()?.trim();
    if label.is_empty() || event.duration <= 0.0 {
        return None;
    }
    let detail = event
        .data
        .get(detail_key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|detail| !detail.is_empty() && *detail != label)
        .map(str::to_string);
    Some(ActivityTimelineItem {
        item_type: item_type.to_string(),
        label: label.to_string(),
        detail,
        started_at: event.timestamp,
        duration_seconds: event.duration,
    })
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
    fn activitywatch_events_map_to_personal_place_dtos() {
        let events: Vec<ActivityWatchEvent> = serde_json::from_str(
            r#"[{"timestamp":"2026-08-28T12:00:00+08:00","duration":120.5,"data":{"app":"Code.exe"}}]"#,
        )
        .unwrap();
        assert_eq!(
            ranked_items(events, "app"),
            vec![ActivityRankItem {
                label: "Code.exe".to_string(),
                seconds: 120.5,
            }]
        );
    }

    #[test]
    fn timeline_prefers_web_domain_over_overlapping_browser_window() {
        let result: RecentQueryResult = serde_json::from_str(
            r#"{"window":[{"timestamp":"2026-08-28T12:00:00+08:00","duration":60,"data":{"app":"msedge.exe","title":"Example"}},{"timestamp":"2026-08-28T11:00:00+08:00","duration":30,"data":{"app":"Code.exe","title":"main.rs"}}],"web":[{"timestamp":"2026-08-28T12:00:00+08:00","duration":60,"data":{"$domain":"example.com","title":"Example"}}]}"#,
        )
        .unwrap();
        let items = timeline_items(result);
        assert_eq!(items.len(), 2);
        assert_eq!(items[0].item_type, "website");
        assert_eq!(items[0].label, "example.com");
        assert_eq!(items[1].label, "Code.exe");
    }

    #[test]
    #[ignore = "requires ActivityWatch running on the fixed localhost endpoint"]
    fn live_local_activitywatch_returns_a_connected_summary() {
        let summary = get_activity_summary(ActivityPeriod::Today);
        assert_eq!(summary.connection.status, "connected");
        assert!(summary.active_total_seconds >= 0.0);
    }
}
