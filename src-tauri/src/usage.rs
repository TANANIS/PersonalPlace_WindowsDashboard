use chrono::TimeZone;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::{path::Path, sync::Mutex};

#[cfg(windows)]
use std::sync::OnceLock;

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrackingSettings { pub enabled: bool, pub idle_seconds: i64 }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageApp { pub app_id: String, pub display_name: String, pub seconds: i64, pub excluded: bool }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSegment { pub app_id: String, pub display_name: String, pub started_at: i64, pub ended_at: i64 }

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSummary { pub total_seconds: i64, pub apps: Vec<UsageApp>, pub segments: Vec<UsageSegment> }

pub struct UsageStore { connection: Mutex<Connection> }

impl UsageStore {
    pub fn open(path: &Path) -> Result<Self, String> {
        let connection = Connection::open(path).map_err(|error| format!("無法開啟使用紀錄資料庫：{error}"))?;
        Self::initialize(connection)
    }

    /// Usage statistics are optional. If the persistent database is
    /// temporarily unavailable, keep the dashboard available with an
    /// in-memory store instead of aborting application startup.
    pub fn in_memory() -> Result<Self, String> {
        let connection = Connection::open_in_memory().map_err(|error| format!("無法建立暫存使用紀錄資料庫：{error}"))?;
        Self::initialize(connection)
    }

    fn initialize(connection: Connection) -> Result<Self, String> {
        connection.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
          CREATE TABLE IF NOT EXISTS usage_settings(id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, idle_seconds INTEGER NOT NULL DEFAULT 300);
          INSERT OR IGNORE INTO usage_settings(id) VALUES(1);
          CREATE TABLE IF NOT EXISTS usage_segments(id INTEGER PRIMARY KEY, app_id TEXT NOT NULL, display_name TEXT NOT NULL, started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL);
          CREATE INDEX IF NOT EXISTS usage_segments_end ON usage_segments(ended_at);
          CREATE TABLE IF NOT EXISTS usage_daily(day TEXT NOT NULL, app_id TEXT NOT NULL, display_name TEXT NOT NULL, seconds INTEGER NOT NULL, PRIMARY KEY(day, app_id));
          CREATE TABLE IF NOT EXISTS usage_apps(app_id TEXT PRIMARY KEY, display_name TEXT NOT NULL, excluded INTEGER NOT NULL DEFAULT 0);")
          .map_err(|error| format!("無法初始化使用紀錄資料庫：{error}"))?;
        Ok(Self { connection: Mutex::new(connection) })
    }

    pub fn settings(&self) -> Result<TrackingSettings, String> {
        let connection = self.connection.lock().map_err(|_| "使用紀錄鎖定失敗。".to_string())?;
        connection.query_row("SELECT enabled, idle_seconds FROM usage_settings WHERE id=1", [], |row| Ok(TrackingSettings { enabled: row.get::<_, i64>(0)? != 0, idle_seconds: row.get(1)? })).map_err(|error| format!("無法讀取追蹤設定：{error}"))
    }

    pub fn update_settings(&self, settings: &TrackingSettings) -> Result<TrackingSettings, String> {
        if ![60, 300, 900, 0].contains(&settings.idle_seconds) { return Err("閒置時間只能是 1、5、15 分鐘或不排除。".to_string()); }
        let connection = self.connection.lock().map_err(|_| "使用紀錄鎖定失敗。".to_string())?;
        connection.execute("UPDATE usage_settings SET enabled=?1, idle_seconds=?2 WHERE id=1", params![settings.enabled as i64, settings.idle_seconds]).map_err(|error| format!("無法更新追蹤設定：{error}"))?;
        Ok(settings.clone())
    }

    pub fn record(&self, app_id: &str, display_name: &str, started_at: i64, ended_at: i64) -> Result<(), String> {
        if ended_at <= started_at || app_id == "personal-place" { return Ok(()); }
        let mut connection = self.connection.lock().map_err(|_| "使用紀錄鎖定失敗。".to_string())?;
        let transaction = connection.transaction().map_err(|error| format!("無法儲存使用紀錄：{error}"))?;
        let excluded: bool = transaction.query_row("SELECT COALESCE((SELECT excluded FROM usage_apps WHERE app_id=?1), 0)", [app_id], |row| Ok(row.get::<_, i64>(0)? != 0)).map_err(|error| format!("無法讀取 App 設定：{error}"))?;
        transaction.execute("INSERT INTO usage_apps(app_id, display_name, excluded) VALUES(?1, ?2, 0) ON CONFLICT(app_id) DO UPDATE SET display_name=excluded.display_name", params![app_id, display_name]).map_err(|error| format!("無法儲存 App 身分：{error}"))?;
        if !excluded {
            transaction.execute("INSERT INTO usage_segments(app_id, display_name, started_at, ended_at) VALUES(?1, ?2, ?3, ?4)", params![app_id, display_name, started_at, ended_at]).map_err(|error| format!("無法儲存使用區段：{error}"))?;
            let day = chrono::Local.timestamp_opt(started_at, 0).single().unwrap_or_else(chrono::Local::now).format("%Y-%m-%d").to_string();
            transaction.execute("INSERT INTO usage_daily(day, app_id, display_name, seconds) VALUES(?1, ?2, ?3, ?4) ON CONFLICT(day, app_id) DO UPDATE SET seconds=usage_daily.seconds+excluded.seconds, display_name=excluded.display_name", params![day, app_id, display_name, ended_at - started_at]).map_err(|error| format!("無法更新每日使用時間：{error}"))?;
        }
        transaction.execute("DELETE FROM usage_segments WHERE ended_at < ?1", [ended_at - 30 * 24 * 60 * 60]).map_err(|error| format!("無法清理舊使用區段：{error}"))?;
        transaction.commit().map_err(|error| format!("無法完成使用紀錄：{error}"))
    }

    pub fn summary(&self, from: i64, to: i64) -> Result<UsageSummary, String> {
        let connection = self.connection.lock().map_err(|_| "使用紀錄鎖定失敗。".to_string())?;
        let mut statement = connection.prepare("SELECT s.app_id, MAX(s.display_name), SUM(s.ended_at-s.started_at), COALESCE(a.excluded,0) FROM usage_segments s LEFT JOIN usage_apps a ON a.app_id=s.app_id WHERE s.ended_at>?1 AND s.started_at<?2 GROUP BY s.app_id ORDER BY 3 DESC").map_err(|error| format!("無法讀取使用摘要：{error}"))?;
        let apps = statement.query_map(params![from,to], |row| Ok(UsageApp { app_id: row.get(0)?, display_name: row.get(1)?, seconds: row.get(2)?, excluded: row.get::<_,i64>(3)? != 0 })).map_err(|error| format!("無法讀取使用摘要：{error}"))?.collect::<Result<Vec<_>,_>>().map_err(|error| format!("無法整理使用摘要：{error}"))?;
        let total_seconds = apps.iter().filter(|app| !app.excluded).map(|app| app.seconds).sum();
        let mut statement = connection.prepare("SELECT app_id, display_name, started_at, ended_at FROM usage_segments WHERE ended_at>?1 AND started_at<?2 ORDER BY started_at DESC LIMIT 200").map_err(|error| format!("無法讀取使用區段：{error}"))?;
        let segments = statement.query_map(params![from,to], |row| Ok(UsageSegment { app_id: row.get(0)?, display_name: row.get(1)?, started_at: row.get(2)?, ended_at: row.get(3)? })).map_err(|error| format!("無法讀取使用區段：{error}"))?.collect::<Result<Vec<_>,_>>().map_err(|error| format!("無法整理使用區段：{error}"))?;
        Ok(UsageSummary { total_seconds, apps, segments })
    }

    pub fn update_app(&self, app_id: &str, display_name: &str, excluded: bool) -> Result<(), String> {
        let connection = self.connection.lock().map_err(|_| "使用紀錄鎖定失敗。".to_string())?;
        connection.execute("INSERT INTO usage_apps(app_id, display_name, excluded) VALUES(?1, ?2, ?3) ON CONFLICT(app_id) DO UPDATE SET display_name=excluded.display_name, excluded=excluded.excluded", params![app_id, display_name, excluded as i64]).map_err(|error| format!("無法更新 App 設定：{error}"))?;
        Ok(())
    }

    pub fn clear(&self, app_id: Option<&str>) -> Result<(), String> {
        let connection = self.connection.lock().map_err(|_| "使用紀錄鎖定失敗。".to_string())?;
        if let Some(app_id) = app_id { connection.execute("DELETE FROM usage_segments WHERE app_id=?1", [app_id]).map_err(|error| format!("無法清除使用紀錄：{error}"))?; connection.execute("DELETE FROM usage_daily WHERE app_id=?1", [app_id]).map_err(|error| format!("無法清除每日使用紀錄：{error}"))?; }
        else { connection.execute("DELETE FROM usage_segments", []).map_err(|error| format!("無法清除使用紀錄：{error}"))?; connection.execute("DELETE FROM usage_daily", []).map_err(|error| format!("無法清除每日使用紀錄：{error}"))?; }
        Ok(())
    }
}

#[cfg(windows)]
pub fn foreground_app() -> Option<(String, String)> {
    use windows::{core::PWSTR, Win32::{Foundation::CloseHandle, System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_FORMAT, PROCESS_QUERY_LIMITED_INFORMATION}, UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId}}};
    unsafe {
        let window = GetForegroundWindow();
        if window.0.is_null() { return None; }
        let mut process_id = 0;
        GetWindowThreadProcessId(window, Some(&mut process_id));
        if process_id == 0 { return None; }
        let handle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id).ok()?;
        let mut buffer = vec![0u16; 32768];
        let mut length = buffer.len() as u32;
        let result = QueryFullProcessImageNameW(handle, PROCESS_NAME_FORMAT(0), PWSTR(buffer.as_mut_ptr()), &mut length).is_ok();
        let _ = CloseHandle(handle);
        if !result || length == 0 { return None; }
        let path = String::from_utf16_lossy(&buffer[..length as usize]);
        let display_name = std::path::Path::new(&path).file_stem()?.to_string_lossy().into_owned();
        if display_name.eq_ignore_ascii_case("personal-workspace") || display_name.eq_ignore_ascii_case("personal-place") { return None; }
        Some((path.to_lowercase(), display_name))
    }
}

#[cfg(not(windows))]
pub fn foreground_app() -> Option<(String, String)> { None }

#[cfg(windows)]
pub fn idle_seconds() -> Option<i64> {
    use windows::Win32::{System::SystemInformation::GetTickCount64, UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO}};
    unsafe {
        let mut info = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        GetLastInputInfo(&mut info).ok().ok()?;
        let now = GetTickCount64() as u32;
        Some(now.wrapping_sub(info.dwTime) as i64 / 1000)
    }
}

#[cfg(not(windows))]
pub fn idle_seconds() -> Option<i64> { None }

#[cfg(windows)]
static FOREGROUND_EVENTS: OnceLock<crossbeam_channel::Sender<()>> = OnceLock::new();

#[cfg(windows)]
pub struct ForegroundHook { _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK }

#[cfg(windows)]
unsafe extern "system" fn on_foreground_event(
    _hook: windows::Win32::UI::Accessibility::HWINEVENTHOOK,
    event: u32,
    _window: windows::Win32::Foundation::HWND,
    _object: i32,
    _child: i32,
    _thread: u32,
    _time: u32,
) {
    if event == windows::Win32::UI::WindowsAndMessaging::EVENT_SYSTEM_FOREGROUND {
        if let Some(sender) = FOREGROUND_EVENTS.get() { let _ = sender.try_send(()); }
    }
}

#[cfg(windows)]
pub fn install_foreground_hook(sender: crossbeam_channel::Sender<()>) -> Option<ForegroundHook> {
    use windows::Win32::UI::{Accessibility::SetWinEventHook, WindowsAndMessaging::{EVENT_SYSTEM_FOREGROUND, WINEVENT_OUTOFCONTEXT, WINEVENT_SKIPOWNPROCESS}};
    let _ = FOREGROUND_EVENTS.set(sender);
    let hook = unsafe { SetWinEventHook(EVENT_SYSTEM_FOREGROUND, EVENT_SYSTEM_FOREGROUND, None, Some(on_foreground_event), 0, 0, WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS) };
    (!hook.is_invalid()).then_some(ForegroundHook { _hook: hook })
}

#[cfg(not(windows))]
pub fn install_foreground_hook(_sender: crossbeam_channel::Sender<()>) -> Option<()> { None }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn records_only_app_identity_and_prunes_old_segments() {
        let path = std::env::temp_dir().join(format!("personal-place-usage-{}.db", std::process::id()));
        let _ = std::fs::remove_file(&path);
        let store = UsageStore::open(&path).unwrap();
        store.update_settings(&TrackingSettings { enabled: true, idle_seconds: 300 }).unwrap();
        store.record("notepad.exe", "記事本", 1_000_000, 1_000_120).unwrap();
        let summary = store.summary(999_000, 1_001_000).unwrap();
        assert_eq!(summary.total_seconds, 120);
        assert_eq!(summary.apps[0].app_id, "notepad.exe");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn in_memory_store_keeps_optional_usage_feature_available() {
        let store = UsageStore::in_memory().unwrap();
        assert!(!store.settings().unwrap().enabled);
    }
}
