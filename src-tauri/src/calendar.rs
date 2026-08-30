use chrono::{DateTime, Duration, LocalResult, NaiveDate, NaiveDateTime, TimeZone, Utc};
use chrono_tz::Tz as ChronoTz;
use icalendar::{
    rrule::{RRuleSet, Tz as RRuleTz},
    Calendar, CalendarDateTime, Component, DatePerhapsTime,
};
use regex::Regex;
use rusqlite::{params, Connection, Row, Transaction};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
    str::FromStr,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::storage::WorkspaceStore;

const MAX_ICS_BYTES: u64 = 64 * 1024 * 1024;
const MAX_OCCURRENCES_PER_QUERY: u16 = 4096;

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCalendarRequest {
    pub path: String,
    pub source_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDayRequest {
    pub date: String,
    pub timezone: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NextCalendarEventRequest {
    pub now: i64,
    pub timezone: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarSource {
    pub id: String,
    pub display_name: String,
    pub source_type: String,
    pub calendar_name: String,
    pub timezone: String,
    pub imported_at: i64,
    pub original_path: Option<String>,
    pub fingerprint: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredCalendarEvent {
    pub id: String,
    pub source_id: String,
    pub uid: String,
    pub recurrence_id: String,
    pub summary: String,
    pub description_raw: String,
    pub description_text: String,
    pub start_utc: Option<i64>,
    pub end_utc: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub timezone: String,
    pub all_day: bool,
    pub transparency: String,
    pub status: String,
    pub sequence: i64,
    pub created_at: Option<i64>,
    pub last_modified: Option<i64>,
    pub recurrence_rule: Option<String>,
    pub recurrence_set: Option<String>,
    pub alarm_count: i64,
    pub raw_ical: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarOccurrence {
    pub occurrence_id: String,
    pub source_id: String,
    pub source_name: String,
    pub uid: String,
    pub recurrence_id: Option<String>,
    pub summary: String,
    pub description_text: String,
    pub start_utc: Option<i64>,
    pub end_utc: Option<i64>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub all_day: bool,
    pub transparency: String,
    pub status: String,
    pub recurring: bool,
    pub recurrence_rule: Option<String>,
    pub last_modified: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarDay {
    pub date: String,
    pub timezone: String,
    pub sources: Vec<CalendarSource>,
    pub all_day: Vec<CalendarOccurrence>,
    pub timed: Vec<CalendarOccurrence>,
    pub next_blocking: Option<CalendarOccurrence>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CalendarImportSummary {
    pub source: CalendarSource,
    pub imported_event_count: usize,
    pub recurrence_count: usize,
    pub override_count: usize,
    pub invalid_count: usize,
}

#[derive(Clone, Debug)]
struct NormalizedTime {
    utc: Option<i64>,
    date: Option<NaiveDate>,
    timezone: String,
    all_day: bool,
}

#[derive(Clone, Debug)]
struct ParsedCalendar {
    source_name: String,
    calendar_name: String,
    timezone: String,
    fingerprint: String,
    events: Vec<StoredCalendarEvent>,
}

pub fn list_sources(store: &WorkspaceStore) -> Result<Vec<CalendarSource>, String> {
    let connection = store.lock()?;
    load_sources(&connection)
}

pub fn import_ics(
    store: &WorkspaceStore,
    request: &ImportCalendarRequest,
) -> Result<CalendarImportSummary, String> {
    let path = Path::new(&request.path);
    if path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| value.eq_ignore_ascii_case("ics"))
        != Some(true)
    {
        return Err("請選擇 .ics 行事曆檔案。".to_string());
    }
    let metadata = fs::metadata(path).map_err(|error| format!("無法讀取行事曆檔案：{error}"))?;
    if metadata.len() > MAX_ICS_BYTES {
        return Err("ICS 檔案超過 64 MB，已停止匯入。".to_string());
    }
    let content = fs::read_to_string(path)
        .map_err(|error| format!("ICS 必須是有效的 UTF-8 文字：{error}"))?;
    let parsed = parse_ics(
        &content,
        path.file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or("Calendar"),
    )?;
    let imported_at = unix_timestamp()?;
    let mut connection = store.lock()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("無法開始 Calendar 匯入交易：{error}"))?;
    let source_id = if let Some(source_id) = request.source_id.as_deref() {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM calendar_sources WHERE id = ?1)",
                [source_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法確認 Calendar source：{error}"))?;
        if !exists {
            return Err("找不到要重新匯入的 Calendar source。".to_string());
        }
        source_id.to_string()
    } else {
        new_source_id(&parsed.fingerprint, imported_at)
    };
    let source = CalendarSource {
        id: source_id.clone(),
        display_name: parsed.source_name,
        source_type: "ics".to_string(),
        calendar_name: parsed.calendar_name,
        timezone: parsed.timezone,
        imported_at,
        original_path: Some(path.to_string_lossy().into_owned()),
        fingerprint: parsed.fingerprint,
    };
    if request.source_id.is_some() {
        transaction
            .execute(
                "DELETE FROM calendar_events WHERE source_id = ?1",
                [&source_id],
            )
            .map_err(|error| format!("無法準備重新匯入 Calendar events：{error}"))?;
        transaction.execute(
            "UPDATE calendar_sources SET display_name=?2, calendar_name=?3, timezone=?4, imported_at=?5, original_path=?6, fingerprint=?7 WHERE id=?1",
            params![source.id, source.display_name, source.calendar_name, source.timezone, source.imported_at, source.original_path, source.fingerprint],
        ).map_err(|error| format!("無法更新 Calendar source：{error}"))?;
    } else {
        insert_source(&transaction, &source)?;
    }
    let recurrence_count = parsed
        .events
        .iter()
        .filter(|event| event.recurrence_rule.is_some())
        .count();
    let override_count = parsed
        .events
        .iter()
        .filter(|event| !event.recurrence_id.is_empty())
        .count();
    for mut event in parsed.events {
        event.source_id = source_id.clone();
        event.id = event_id(&source_id, &event.uid, &event.recurrence_id);
        insert_event(&transaction, &event)?;
    }
    let imported_event_count = transaction
        .query_row(
            "SELECT COUNT(*) FROM calendar_events WHERE source_id = ?1",
            [&source_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| format!("無法確認 Calendar 匯入結果：{error}"))?
        as usize;
    transaction
        .commit()
        .map_err(|error| format!("無法完成 Calendar 匯入交易：{error}"))?;
    Ok(CalendarImportSummary {
        source,
        imported_event_count,
        recurrence_count,
        override_count,
        invalid_count: 0,
    })
}

pub fn list_day(
    store: &WorkspaceStore,
    request: &CalendarDayRequest,
) -> Result<CalendarDay, String> {
    let date = NaiveDate::parse_from_str(&request.date, "%Y-%m-%d")
        .map_err(|_| "日期格式必須是 YYYY-MM-DD。".to_string())?;
    let display_tz = parse_timezone(&request.timezone)?;
    let start = local_midnight(display_tz, date)?;
    let end = local_midnight(
        display_tz,
        date.succ_opt()
            .ok_or_else(|| "日期超出範圍。".to_string())?,
    )?;
    let connection = store.lock()?;
    let sources = load_sources(&connection)?;
    let events = load_events(&connection)?;
    let mut occurrences =
        expand_events(&events, &sources, start.timestamp(), end.timestamp(), date)?;
    occurrences.sort_by(|left, right| occurrence_sort_key(left).cmp(&occurrence_sort_key(right)));
    let all_day = occurrences
        .iter()
        .filter(|event| event.all_day)
        .cloned()
        .collect();
    let timed: Vec<_> = occurrences
        .into_iter()
        .filter(|event| !event.all_day)
        .collect();
    let now = Utc::now().timestamp();
    let next_blocking = timed
        .iter()
        .find(|event| {
            event.status != "cancelled"
                && event.transparency != "transparent"
                && event.start_utc.is_some_and(|start_at| start_at >= now)
        })
        .cloned();
    Ok(CalendarDay {
        date: request.date.clone(),
        timezone: request.timezone.clone(),
        sources,
        all_day,
        timed,
        next_blocking,
    })
}

pub fn next_blocking_event(
    store: &WorkspaceStore,
    request: &NextCalendarEventRequest,
) -> Result<Option<CalendarOccurrence>, String> {
    let display_tz = parse_timezone(&request.timezone)?;
    let now = DateTime::<Utc>::from_timestamp(request.now, 0)
        .ok_or_else(|| "目前時間無效。".to_string())?;
    let local_date = now.with_timezone(&display_tz).date_naive();
    let end = local_midnight(
        display_tz,
        local_date
            .succ_opt()
            .ok_or_else(|| "日期超出範圍。".to_string())?,
    )?;
    let connection = store.lock()?;
    let sources = load_sources(&connection)?;
    let events = load_events(&connection)?;
    let mut occurrences =
        expand_events(&events, &sources, request.now, end.timestamp(), local_date)?;
    occurrences.sort_by(|left, right| occurrence_sort_key(left).cmp(&occurrence_sort_key(right)));
    Ok(occurrences.into_iter().find(|event| {
        !event.all_day
            && event.status != "cancelled"
            && event.transparency != "transparent"
            && event
                .start_utc
                .is_some_and(|start_at| start_at >= request.now)
    }))
}

fn parse_ics(content: &str, fallback_name: &str) -> Result<ParsedCalendar, String> {
    let calendar: Calendar = content
        .parse()
        .map_err(|error| format!("ICS 格式無效：{error}"))?;
    let calendar_name = calendar
        .get_name()
        .unwrap_or(fallback_name)
        .trim()
        .to_string();
    let calendar_tz = calendar.get_timezone().unwrap_or("UTC").to_string();
    parse_timezone(&calendar_tz)
        .map_err(|_| format!("ICS 使用不支援的 Calendar timezone：{calendar_tz}"))?;
    let fingerprint = format!("{:x}", Sha256::digest(content.as_bytes()));
    let mut events = Vec::new();
    let mut identities = HashSet::new();
    for calendar_event in calendar.calendar_events() {
        let event = calendar_event.event();
        let uid = event
            .get_uid()
            .filter(|value| !value.trim().is_empty())
            .ok_or_else(|| "ICS 包含缺少 UID 的 VEVENT；未匯入任何資料。".to_string())?
            .to_string();
        let start = normalize_time(
            event
                .get_start()
                .ok_or_else(|| format!("事件 {uid} 缺少 DTSTART。"))?,
            &calendar_tz,
        )?;
        let end = match event.get_end() {
            Some(value) => normalize_time(value, &calendar_tz)?,
            None if start.all_day => NormalizedTime {
                date: start.date.and_then(|date| date.succ_opt()),
                ..start.clone()
            },
            None => start.clone(),
        };
        if start.all_day != end.all_day {
            return Err(format!("事件 {uid} 的 DTSTART / DTEND 類型不一致。"));
        }
        let recurrence_id = match event.get_recurrence_id() {
            Some(value) => recurrence_key(&normalize_time(value, &calendar_tz)?)?,
            None => String::new(),
        };
        if !identities.insert((uid.clone(), recurrence_id.clone())) {
            return Err(format!(
                "ICS 包含重複事件 identity：{uid} / {recurrence_id}"
            ));
        }
        let recurrence_rule = event.property_value("RRULE").map(str::to_string);
        let recurrence_set = if recurrence_id.is_empty() && recurrence_rule.is_some() {
            let value = recurrence_set_text(event)?;
            RRuleSet::from_str(&value)
                .map_err(|error| format!("事件 {uid} 的 recurrence 無效：{error}"))?;
            Some(value)
        } else {
            None
        };
        let description_raw = event.get_description().unwrap_or("").to_string();
        let description_text = description_to_text(&description_raw);
        let status = event
            .property_value("STATUS")
            .unwrap_or("CONFIRMED")
            .to_ascii_lowercase();
        let transparency = if event
            .property_value("TRANSP")
            .is_some_and(|value| value.eq_ignore_ascii_case("TRANSPARENT"))
        {
            "transparent"
        } else {
            "opaque"
        }
        .to_string();
        let alarm_count = event
            .components()
            .iter()
            .filter(|component| component.component_kind() == "VALARM")
            .count() as i64;
        events.push(StoredCalendarEvent {
            id: String::new(),
            source_id: String::new(),
            uid,
            recurrence_id,
            summary: unescape_ics_text(event.get_summary().unwrap_or("（無標題）")),
            description_raw,
            description_text,
            start_utc: start.utc,
            end_utc: end.utc,
            start_date: start.date.map(|value| value.format("%Y-%m-%d").to_string()),
            end_date: end.date.map(|value| value.format("%Y-%m-%d").to_string()),
            timezone: start.timezone,
            all_day: start.all_day,
            transparency,
            status,
            sequence: event.get_sequence().unwrap_or(0) as i64,
            created_at: event.get_created().map(|value| value.timestamp()),
            last_modified: event.get_last_modified().map(|value| value.timestamp()),
            recurrence_rule,
            recurrence_set,
            alarm_count,
            raw_ical: event
                .try_into_string()
                .map_err(|_| format!("事件無法序列化：{}", event.get_uid().unwrap_or("unknown")))?,
        });
    }
    if events.is_empty() {
        return Err("ICS 沒有可匯入的 VEVENT。".to_string());
    }
    Ok(ParsedCalendar {
        source_name: fallback_name.to_string(),
        calendar_name,
        timezone: calendar_tz,
        fingerprint,
        events,
    })
}

fn normalize_time(value: DatePerhapsTime, fallback_tz: &str) -> Result<NormalizedTime, String> {
    match value {
        DatePerhapsTime::Date(date) => Ok(NormalizedTime {
            utc: None,
            date: Some(date),
            timezone: fallback_tz.to_string(),
            all_day: true,
        }),
        DatePerhapsTime::DateTime(CalendarDateTime::Utc(value)) => Ok(NormalizedTime {
            utc: Some(value.timestamp()),
            date: None,
            timezone: "UTC".to_string(),
            all_day: false,
        }),
        DatePerhapsTime::DateTime(CalendarDateTime::WithTimezone { date_time, tzid }) => {
            let timezone = parse_timezone(&tzid).map_err(|_| format!("不支援的 TZID：{tzid}"))?;
            let utc = resolve_local(timezone, date_time)?
                .with_timezone(&Utc)
                .timestamp();
            Ok(NormalizedTime {
                utc: Some(utc),
                date: None,
                timezone: tzid,
                all_day: false,
            })
        }
        DatePerhapsTime::DateTime(CalendarDateTime::Floating(date_time)) => {
            let timezone = parse_timezone(fallback_tz)
                .map_err(|_| "Floating time 缺少可用的 Calendar timezone。".to_string())?;
            let utc = resolve_local(timezone, date_time)?
                .with_timezone(&Utc)
                .timestamp();
            Ok(NormalizedTime {
                utc: Some(utc),
                date: None,
                timezone: fallback_tz.to_string(),
                all_day: false,
            })
        }
    }
}

fn recurrence_set_text(event: &icalendar::Event) -> Result<String, String> {
    let mut lines = Vec::new();
    for key in ["DTSTART", "RRULE"] {
        if let Some(property) = event.properties().get(key) {
            lines.push(recurrence_property_line(property));
        }
    }
    for key in ["RDATE", "EXDATE"] {
        if let Some(properties) = event.multi_properties().get(key) {
            for property in properties {
                lines.push(recurrence_property_line(property));
            }
        }
    }
    Ok(lines.join("\n"))
}

fn recurrence_property_line(property: &icalendar::Property) -> String {
    let params = property
        .params()
        .values()
        .map(|parameter| format!(";{}={}", parameter.key(), parameter.value()))
        .collect::<String>();
    format!("{}{}:{}", property.key(), params, property.value())
}

fn expand_events(
    events: &[StoredCalendarEvent],
    sources: &[CalendarSource],
    range_start: i64,
    range_end: i64,
    display_date: NaiveDate,
) -> Result<Vec<CalendarOccurrence>, String> {
    let source_names: HashMap<&str, &str> = sources
        .iter()
        .map(|source| (source.id.as_str(), source.calendar_name.as_str()))
        .collect();
    let mut by_series: HashMap<(&str, &str), Vec<&StoredCalendarEvent>> = HashMap::new();
    for event in events {
        by_series
            .entry((&event.source_id, &event.uid))
            .or_default()
            .push(event);
    }
    let mut output = Vec::new();
    for ((_source_id, _uid), series) in by_series {
        let master = series
            .iter()
            .find(|event| event.recurrence_id.is_empty())
            .copied();
        let overrides: HashMap<&str, &StoredCalendarEvent> = series
            .iter()
            .filter(|event| !event.recurrence_id.is_empty())
            .map(|event| (event.recurrence_id.as_str(), *event))
            .collect();
        let mut applied = HashSet::new();
        if let Some(master) = master {
            if master.status != "cancelled" {
                if let Some(recurrence_set) = master.recurrence_set.as_deref() {
                    let set = RRuleSet::from_str(recurrence_set)
                        .map_err(|error| format!("無法展開 recurrence {}：{error}", master.uid))?;
                    let duration = event_duration(master)?;
                    let after_utc =
                        DateTime::<Utc>::from_timestamp(range_start - duration.max(0), 0)
                            .ok_or_else(|| "查詢時間無效。".to_string())?;
                    let before_utc = DateTime::<Utc>::from_timestamp(range_end, 0)
                        .ok_or_else(|| "查詢時間無效。".to_string())?;
                    let after = after_utc.with_timezone(&RRuleTz::UTC);
                    let before = before_utc.with_timezone(&RRuleTz::UTC);
                    let result = set
                        .after(after)
                        .before(before)
                        .all(MAX_OCCURRENCES_PER_QUERY);
                    if result.limited {
                        return Err(
                            "單次 Calendar 查詢超過 4096 個 recurrence occurrences。".to_string()
                        );
                    }
                    for start in result.dates {
                        let key = if master.all_day {
                            format!("D:{}", start.date_naive().format("%Y-%m-%d"))
                        } else {
                            format!("T:{}", start.with_timezone(&Utc).timestamp())
                        };
                        if let Some(override_event) = overrides.get(key.as_str()) {
                            applied.insert(key);
                            if override_event.status != "cancelled"
                                && event_overlaps(
                                    override_event,
                                    range_start,
                                    range_end,
                                    display_date,
                                )
                            {
                                output.push(to_occurrence(
                                    override_event,
                                    source_names
                                        .get(override_event.source_id.as_str())
                                        .copied()
                                        .unwrap_or("Calendar"),
                                    true,
                                    Some(override_event.recurrence_id.clone()),
                                ));
                            }
                        } else {
                            let occurrence = occurrence_from_master(
                                master,
                                source_names
                                    .get(master.source_id.as_str())
                                    .copied()
                                    .unwrap_or("Calendar"),
                                start.with_timezone(&Utc).timestamp(),
                                start.date_naive(),
                                duration,
                            )?;
                            if occurrence_overlaps(
                                &occurrence,
                                range_start,
                                range_end,
                                display_date,
                            ) {
                                output.push(occurrence);
                            }
                        }
                    }
                } else if event_overlaps(master, range_start, range_end, display_date) {
                    output.push(to_occurrence(
                        master,
                        source_names
                            .get(master.source_id.as_str())
                            .copied()
                            .unwrap_or("Calendar"),
                        false,
                        None,
                    ));
                }
            }
        }
        for override_event in overrides.values() {
            if !applied.contains(&override_event.recurrence_id)
                && override_event.status != "cancelled"
                && event_overlaps(override_event, range_start, range_end, display_date)
            {
                output.push(to_occurrence(
                    override_event,
                    source_names
                        .get(override_event.source_id.as_str())
                        .copied()
                        .unwrap_or("Calendar"),
                    true,
                    Some(override_event.recurrence_id.clone()),
                ));
            }
        }
    }
    Ok(output)
}

fn occurrence_from_master(
    master: &StoredCalendarEvent,
    source_name: &str,
    start_utc: i64,
    recurrence_date: NaiveDate,
    duration: i64,
) -> Result<CalendarOccurrence, String> {
    if master.all_day {
        // Keep VALUE=DATE in the recurrence set's local calendar domain. Converting
        // midnight to UTC first would move positive-offset all-day events backward.
        let start = recurrence_date;
        let days = duration.max(86_400) / 86_400;
        let end = start
            .checked_add_signed(Duration::days(days))
            .ok_or_else(|| "all-day recurrence 日期超出範圍。".to_string())?;
        let key = format!("D:{}", start.format("%Y-%m-%d"));
        let mut occurrence = to_occurrence(master, source_name, true, Some(key));
        occurrence.occurrence_id = format!("{}@{}", master.id, start.format("%Y-%m-%d"));
        occurrence.start_utc = None;
        occurrence.end_utc = None;
        occurrence.start_date = Some(start.format("%Y-%m-%d").to_string());
        occurrence.end_date = Some(end.format("%Y-%m-%d").to_string());
        Ok(occurrence)
    } else {
        let mut occurrence =
            to_occurrence(master, source_name, true, Some(format!("T:{start_utc}")));
        occurrence.occurrence_id = format!("{}@{start_utc}", master.id);
        occurrence.start_utc = Some(start_utc);
        occurrence.end_utc = Some(start_utc + duration);
        Ok(occurrence)
    }
}

fn to_occurrence(
    event: &StoredCalendarEvent,
    source_name: &str,
    recurring: bool,
    recurrence_id: Option<String>,
) -> CalendarOccurrence {
    CalendarOccurrence {
        occurrence_id: if recurrence_id.is_some() {
            format!("{}@{}", event.id, recurrence_id.as_deref().unwrap_or(""))
        } else {
            event.id.clone()
        },
        source_id: event.source_id.clone(),
        source_name: source_name.to_string(),
        uid: event.uid.clone(),
        recurrence_id,
        summary: event.summary.clone(),
        description_text: event.description_text.clone(),
        start_utc: event.start_utc,
        end_utc: event.end_utc,
        start_date: event.start_date.clone(),
        end_date: event.end_date.clone(),
        all_day: event.all_day,
        transparency: event.transparency.clone(),
        status: event.status.clone(),
        recurring,
        recurrence_rule: event.recurrence_rule.clone(),
        last_modified: event.last_modified,
    }
}

fn event_duration(event: &StoredCalendarEvent) -> Result<i64, String> {
    if event.all_day {
        let start = NaiveDate::parse_from_str(
            event.start_date.as_deref().ok_or("all-day start missing")?,
            "%Y-%m-%d",
        )
        .map_err(|_| "all-day start 無效。".to_string())?;
        let end = NaiveDate::parse_from_str(
            event.end_date.as_deref().ok_or("all-day end missing")?,
            "%Y-%m-%d",
        )
        .map_err(|_| "all-day end 無效。".to_string())?;
        Ok((end - start).num_seconds())
    } else {
        Ok(event.end_utc.unwrap_or(0) - event.start_utc.unwrap_or(0))
    }
}

fn event_overlaps(
    event: &StoredCalendarEvent,
    range_start: i64,
    range_end: i64,
    display_date: NaiveDate,
) -> bool {
    if event.all_day {
        let start = event
            .start_date
            .as_deref()
            .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
        let end = event
            .end_date
            .as_deref()
            .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
        return start
            .zip(end)
            .is_some_and(|(start, end)| start <= display_date && display_date < end);
    }
    event
        .start_utc
        .zip(event.end_utc)
        .is_some_and(|(start, end)| start < range_end && end.max(start + 1) > range_start)
}

fn occurrence_overlaps(
    event: &CalendarOccurrence,
    range_start: i64,
    range_end: i64,
    display_date: NaiveDate,
) -> bool {
    if event.all_day {
        let start = event
            .start_date
            .as_deref()
            .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
        let end = event
            .end_date
            .as_deref()
            .and_then(|value| NaiveDate::parse_from_str(value, "%Y-%m-%d").ok());
        start
            .zip(end)
            .is_some_and(|(start, end)| start <= display_date && display_date < end)
    } else {
        event
            .start_utc
            .zip(event.end_utc)
            .is_some_and(|(start, end)| start < range_end && end.max(start + 1) > range_start)
    }
}

fn occurrence_sort_key(event: &CalendarOccurrence) -> (bool, i64, &str) {
    (
        !event.all_day,
        event.start_utc.unwrap_or(i64::MIN),
        event.summary.as_str(),
    )
}

fn recurrence_key(value: &NormalizedTime) -> Result<String, String> {
    if value.all_day {
        Ok(format!(
            "D:{}",
            value
                .date
                .ok_or("RECURRENCE-ID date missing")?
                .format("%Y-%m-%d")
        ))
    } else {
        Ok(format!(
            "T:{}",
            value.utc.ok_or("RECURRENCE-ID time missing")?
        ))
    }
}

fn parse_timezone(value: &str) -> Result<ChronoTz, String> {
    value
        .parse::<ChronoTz>()
        .map_err(|_| format!("不支援的 IANA timezone：{value}"))
}

fn resolve_local(timezone: ChronoTz, value: NaiveDateTime) -> Result<DateTime<ChronoTz>, String> {
    match timezone.from_local_datetime(&value) {
        LocalResult::Single(value) => Ok(value),
        LocalResult::Ambiguous(first, _) => Ok(first),
        LocalResult::None => Err(format!(
            "本地時間不存在於 timezone {}：{value}",
            timezone.name()
        )),
    }
}

fn local_midnight(timezone: ChronoTz, date: NaiveDate) -> Result<DateTime<ChronoTz>, String> {
    resolve_local(
        timezone,
        date.and_hms_opt(0, 0, 0)
            .ok_or_else(|| "無效日期。".to_string())?,
    )
}

fn unescape_ics_text(value: &str) -> String {
    let mut output = String::with_capacity(value.len());
    let mut chars = value.chars();
    while let Some(character) = chars.next() {
        if character != '\\' {
            output.push(character);
            continue;
        }
        match chars.next() {
            Some('n' | 'N') => output.push('\n'),
            Some(',') => output.push(','),
            Some(';') => output.push(';'),
            Some('\\') => output.push('\\'),
            Some(other) => {
                output.push('\\');
                output.push(other);
            }
            None => output.push('\\'),
        }
    }
    output
}

fn description_to_text(value: &str) -> String {
    let unescaped = unescape_ics_text(value);
    let blocks = Regex::new(r"(?i)</?(p|div|ol|ul|li|br|h[1-6])[^>]*>")
        .expect("block regex")
        .replace_all(&unescaped, "\n");
    let without_tags = Regex::new(r"(?s)<[^>]*>")
        .expect("tag regex")
        .replace_all(&blocks, "");
    let decoded = without_tags
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");
    decoded
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>()
        .join("\n")
}

fn new_source_id(fingerprint: &str, imported_at: i64) -> String {
    format!("calendar-{}-{imported_at}", &fingerprint[..12])
}
fn event_id(source_id: &str, uid: &str, recurrence_id: &str) -> String {
    let digest = Sha256::digest(format!("{source_id}\0{uid}\0{recurrence_id}").as_bytes());
    format!("event-{:x}", digest)[..30].to_string()
}
fn unix_timestamp() -> Result<i64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_secs() as i64)
        .map_err(|error| format!("系統時間無效：{error}"))
}

fn insert_source(transaction: &Transaction<'_>, source: &CalendarSource) -> Result<(), String> {
    transaction.execute(
        "INSERT INTO calendar_sources(id, display_name, source_type, calendar_name, timezone, imported_at, original_path, fingerprint) VALUES(?1,?2,?3,?4,?5,?6,?7,?8)",
        params![source.id, source.display_name, source.source_type, source.calendar_name, source.timezone, source.imported_at, source.original_path, source.fingerprint],
    ).map_err(|error| format!("無法保存 Calendar source：{error}"))?;
    Ok(())
}

fn insert_event(transaction: &Transaction<'_>, event: &StoredCalendarEvent) -> Result<(), String> {
    transaction.execute(
        "INSERT INTO calendar_events(id,source_id,uid,recurrence_id,summary,description_raw,description_text,start_utc,end_utc,start_date,end_date,timezone,all_day,transparency,status,sequence,created_at,last_modified,recurrence_rule,recurrence_set,alarm_count,raw_ical) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17,?18,?19,?20,?21,?22)",
        params![event.id,event.source_id,event.uid,event.recurrence_id,event.summary,event.description_raw,event.description_text,event.start_utc,event.end_utc,event.start_date,event.end_date,event.timezone,event.all_day,event.transparency,event.status,event.sequence,event.created_at,event.last_modified,event.recurrence_rule,event.recurrence_set,event.alarm_count,event.raw_ical],
    ).map_err(|error| format!("無法保存 Calendar event {}：{error}", event.uid))?;
    Ok(())
}

fn source_from_row(row: &Row<'_>) -> rusqlite::Result<CalendarSource> {
    Ok(CalendarSource {
        id: row.get(0)?,
        display_name: row.get(1)?,
        source_type: row.get(2)?,
        calendar_name: row.get(3)?,
        timezone: row.get(4)?,
        imported_at: row.get(5)?,
        original_path: row.get(6)?,
        fingerprint: row.get(7)?,
    })
}
fn event_from_row(row: &Row<'_>) -> rusqlite::Result<StoredCalendarEvent> {
    Ok(StoredCalendarEvent {
        id: row.get(0)?,
        source_id: row.get(1)?,
        uid: row.get(2)?,
        recurrence_id: row.get(3)?,
        summary: row.get(4)?,
        description_raw: row.get(5)?,
        description_text: row.get(6)?,
        start_utc: row.get(7)?,
        end_utc: row.get(8)?,
        start_date: row.get(9)?,
        end_date: row.get(10)?,
        timezone: row.get(11)?,
        all_day: row.get(12)?,
        transparency: row.get(13)?,
        status: row.get(14)?,
        sequence: row.get(15)?,
        created_at: row.get(16)?,
        last_modified: row.get(17)?,
        recurrence_rule: row.get(18)?,
        recurrence_set: row.get(19)?,
        alarm_count: row.get(20)?,
        raw_ical: row.get(21)?,
    })
}

fn load_sources(connection: &Connection) -> Result<Vec<CalendarSource>, String> {
    let mut statement = connection.prepare("SELECT id,display_name,source_type,calendar_name,timezone,imported_at,original_path,fingerprint FROM calendar_sources ORDER BY calendar_name,id").map_err(|error| format!("無法準備 Calendar sources：{error}"))?;
    let rows = statement
        .query_map([], source_from_row)
        .map_err(|error| format!("無法讀取 Calendar sources：{error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理 Calendar sources：{error}"))
}
fn load_events(connection: &Connection) -> Result<Vec<StoredCalendarEvent>, String> {
    let mut statement = connection.prepare("SELECT id,source_id,uid,recurrence_id,summary,description_raw,description_text,start_utc,end_utc,start_date,end_date,timezone,all_day,transparency,status,sequence,created_at,last_modified,recurrence_rule,recurrence_set,alarm_count,raw_ical FROM calendar_events ORDER BY source_id,uid,recurrence_id").map_err(|error| format!("無法準備 Calendar events：{error}"))?;
    let rows = statement
        .query_map([], event_from_row)
        .map_err(|error| format!("無法讀取 Calendar events：{error}"))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理 Calendar events：{error}"))
}

pub(crate) fn load_backup_data(
    transaction: &Transaction<'_>,
) -> Result<(Vec<CalendarSource>, Vec<StoredCalendarEvent>), String> {
    Ok((load_sources(transaction)?, load_events(transaction)?))
}

pub(crate) fn restore_backup_data(
    transaction: &Transaction<'_>,
    sources: &[CalendarSource],
    events: &[StoredCalendarEvent],
) -> Result<(), String> {
    transaction
        .execute("DELETE FROM calendar_events", [])
        .map_err(|error| format!("無法清除 Calendar events：{error}"))?;
    transaction
        .execute("DELETE FROM calendar_sources", [])
        .map_err(|error| format!("無法清除 Calendar sources：{error}"))?;
    for source in sources {
        insert_source(transaction, source)?;
    }
    for event in events {
        insert_event(transaction, event)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{collections::HashMap, path::Path};

    fn store() -> WorkspaceStore {
        let store = WorkspaceStore::in_memory().unwrap();
        store
            .initialize(
                None,
                &HashMap::new(),
                Path::new("missing"),
                Path::new("backups"),
            )
            .unwrap();
        store
    }
    fn import_text(
        store: &WorkspaceStore,
        content: &str,
        source_id: Option<String>,
    ) -> Result<CalendarImportSummary, String> {
        let parsed = parse_ics(content, "fixture")?;
        let imported_at = 1_700_000_000;
        let mut connection = store.lock()?;
        let transaction = connection.transaction().unwrap();
        let id = source_id.unwrap_or_else(|| new_source_id(&parsed.fingerprint, imported_at));
        let source = CalendarSource {
            id: id.clone(),
            display_name: "fixture".into(),
            source_type: "ics".into(),
            calendar_name: parsed.calendar_name,
            timezone: parsed.timezone,
            imported_at,
            original_path: None,
            fingerprint: parsed.fingerprint,
        };
        if transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM calendar_sources WHERE id=?1)",
                [&id],
                |row| row.get::<_, bool>(0),
            )
            .unwrap()
        {
            transaction
                .execute("DELETE FROM calendar_events WHERE source_id=?1", [&id])
                .unwrap();
        } else {
            insert_source(&transaction, &source)?;
        }
        let recurrence_count = parsed
            .events
            .iter()
            .filter(|event| event.recurrence_rule.is_some())
            .count();
        let override_count = parsed
            .events
            .iter()
            .filter(|event| !event.recurrence_id.is_empty())
            .count();
        for mut event in parsed.events {
            event.source_id = id.clone();
            event.id = event_id(&id, &event.uid, &event.recurrence_id);
            insert_event(&transaction, &event)?;
        }
        let count = transaction
            .query_row(
                "SELECT COUNT(*) FROM calendar_events WHERE source_id=?1",
                [&id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap() as usize;
        transaction.commit().unwrap();
        Ok(CalendarImportSummary {
            source,
            imported_event_count: count,
            recurrence_count,
            override_count,
            invalid_count: 0,
        })
    }
    const HEADER: &str = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Personal Place Tests//EN\r\nX-WR-CALNAME:Test Calendar\r\nX-WR-TIMEZONE:Asia/Taipei\r\n";
    fn ics(events: &str) -> String {
        format!("{HEADER}{events}END:VCALENDAR\r\n")
    }

    #[test]
    fn parses_utc_tzid_all_day_transparency_and_description_safely() {
        let input=ics("BEGIN:VEVENT\r\nUID:utc\r\nDTSTART:20260831T010000Z\r\nDTEND:20260831T020000Z\r\nSUMMARY:UTC\r\nTRANSP:OPAQUE\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:tz\r\nDTSTART;TZID=Asia/Taipei:20260831T130000\r\nDTEND;TZID=Asia/Taipei:20260831T143000\r\nSUMMARY:Taipei\r\nTRANSP:TRANSPARENT\r\nDESCRIPTION:<p>Hello\\nWorld</p><script>bad()</script>\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:day\r\nDTSTART;VALUE=DATE:20260831\r\nDTEND;VALUE=DATE:20260901\r\nSUMMARY:All day\r\nEND:VEVENT\r\n");
        let parsed = parse_ics(&input, "fixture").unwrap();
        assert_eq!(parsed.events.len(), 3);
        let tz = parsed
            .events
            .iter()
            .find(|event| event.uid == "tz")
            .unwrap();
        assert_eq!(tz.start_utc, Some(1_788_152_400));
        assert_eq!(tz.transparency, "transparent");
        assert_eq!(tz.description_text, "Hello\nWorld\nbad()");
        assert!(!tz.description_text.contains('<'));
        let day = parsed
            .events
            .iter()
            .find(|event| event.uid == "day")
            .unwrap();
        assert!(day.all_day);
        assert_eq!(day.start_date.as_deref(), Some("2026-08-31"));
    }

    #[test]
    fn preserves_long_descriptions_as_plain_text() {
        let long_text = "一段很長的安全描述。".repeat(900);
        let input = ics(&format!(
            "BEGIN:VEVENT\r\nUID:long\r\nDTSTART:20260831T010000Z\r\nDTEND:20260831T020000Z\r\nSUMMARY:Long\r\nDESCRIPTION:<p>{long_text}</p>\r\nEND:VEVENT\r\n"
        ));
        let parsed = parse_ics(&input, "fixture").unwrap();
        let event = parsed.events.first().unwrap();
        assert_eq!(event.description_text, long_text);
        assert!(!event.description_text.contains('<'));
    }

    #[test]
    fn recurring_all_day_dates_do_not_shift_when_timezone_is_ahead_of_utc() {
        let input=ics("BEGIN:VEVENT\r\nUID:all-day-series\r\nDTSTART;VALUE=DATE:20260831\r\nDTEND;VALUE=DATE:20260901\r\nRRULE:FREQ=DAILY;COUNT=2\r\nSUMMARY:All day series\r\nEND:VEVENT\r\n");
        let store = store();
        import_text(&store, &input, None).unwrap();
        let first = list_day(
            &store,
            &CalendarDayRequest {
                date: "2026-08-31".into(),
                timezone: "Asia/Taipei".into(),
            },
        )
        .unwrap();
        let second = list_day(
            &store,
            &CalendarDayRequest {
                date: "2026-09-01".into(),
                timezone: "Asia/Taipei".into(),
            },
        )
        .unwrap();
        assert_eq!(first.all_day[0].start_date.as_deref(), Some("2026-08-31"));
        assert_eq!(second.all_day[0].start_date.as_deref(), Some("2026-09-01"));
    }

    #[test]
    fn expands_daily_weekly_exdate_override_and_cancelled_instance_without_duplicates() {
        let input=ics("BEGIN:VEVENT\r\nUID:daily\r\nDTSTART;TZID=Asia/Taipei:20260831T080000\r\nDTEND;TZID=Asia/Taipei:20260831T090000\r\nRRULE:FREQ=DAILY;COUNT=4\r\nEXDATE;TZID=Asia/Taipei:20260901T080000\r\nSUMMARY:Daily\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:daily\r\nRECURRENCE-ID;TZID=Asia/Taipei:20260902T080000\r\nDTSTART;TZID=Asia/Taipei:20260902T100000\r\nDTEND;TZID=Asia/Taipei:20260902T110000\r\nSUMMARY:Moved\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:daily\r\nRECURRENCE-ID;TZID=Asia/Taipei:20260903T080000\r\nDTSTART;TZID=Asia/Taipei:20260903T080000\r\nDTEND;TZID=Asia/Taipei:20260903T090000\r\nSTATUS:CANCELLED\r\nSUMMARY:Cancelled\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nUID:weekly\r\nDTSTART;TZID=Asia/Taipei:20260831T130000\r\nDTEND;TZID=Asia/Taipei:20260831T140000\r\nRRULE:FREQ=WEEKLY;COUNT=2;BYDAY=MO\r\nSUMMARY:Weekly\r\nEND:VEVENT\r\n");
        let store = store();
        import_text(&store, &input, None).unwrap();
        let day = list_day(
            &store,
            &CalendarDayRequest {
                date: "2026-09-02".into(),
                timezone: "Asia/Taipei".into(),
            },
        )
        .unwrap();
        assert_eq!(
            day.timed
                .iter()
                .filter(|event| event.uid == "daily")
                .count(),
            1
        );
        assert_eq!(
            day.timed
                .iter()
                .find(|event| event.uid == "daily")
                .unwrap()
                .summary,
            "Moved"
        );
        assert!(list_day(
            &store,
            &CalendarDayRequest {
                date: "2026-09-01".into(),
                timezone: "Asia/Taipei".into()
            }
        )
        .unwrap()
        .timed
        .iter()
        .all(|event| event.uid != "daily"));
        assert!(list_day(
            &store,
            &CalendarDayRequest {
                date: "2026-09-03".into(),
                timezone: "Asia/Taipei".into()
            }
        )
        .unwrap()
        .timed
        .iter()
        .all(|event| event.uid != "daily"));
        assert_eq!(
            list_day(
                &store,
                &CalendarDayRequest {
                    date: "2026-09-07".into(),
                    timezone: "Asia/Taipei".into()
                }
            )
            .unwrap()
            .timed
            .iter()
            .filter(|event| event.uid == "weekly")
            .count(),
            1
        );
    }

    #[test]
    fn failed_reimport_preserves_previous_source_data() {
        let store = store();
        let valid=ics("BEGIN:VEVENT\r\nUID:one\r\nDTSTART:20260831T010000Z\r\nDTEND:20260831T020000Z\r\nSUMMARY:Original\r\nEND:VEVENT\r\n");
        let first = import_text(&store, &valid, None).unwrap();
        assert!(parse_ics("broken", "bad").is_err());
        let connection = store.lock().unwrap();
        let title: String = connection
            .query_row(
                "SELECT summary FROM calendar_events WHERE source_id=?1",
                [first.source.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(title, "Original");
    }

    #[test]
    fn successful_reimport_replaces_events_in_one_transaction() {
        let store = store();
        let first=ics("BEGIN:VEVENT\r\nUID:one\r\nDTSTART:20260831T010000Z\r\nDTEND:20260831T020000Z\r\nSUMMARY:Old\r\nEND:VEVENT\r\n");
        let imported = import_text(&store, &first, None).unwrap();
        let second=ics("BEGIN:VEVENT\r\nUID:two\r\nDTSTART:20260831T030000Z\r\nDTEND:20260831T040000Z\r\nSUMMARY:New\r\nEND:VEVENT\r\n");
        import_text(&store, &second, Some(imported.source.id.clone())).unwrap();
        let connection = store.lock().unwrap();
        let values: Vec<String> = connection
            .prepare("SELECT summary FROM calendar_events WHERE source_id=?1")
            .unwrap()
            .query_map([imported.source.id], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap();
        assert_eq!(values, vec!["New"]);
    }
}
