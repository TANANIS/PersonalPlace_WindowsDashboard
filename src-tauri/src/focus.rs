use crate::{dashboard::unique_id, storage::WorkspaceStore};
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSettings {
    pub focus_minutes: i64,
    pub short_break_minutes: i64,
    pub long_break_minutes: i64,
    pub long_break_interval: i64,
    pub auto_start_focus: bool,
    pub auto_start_break: bool,
    pub notifications_enabled: bool,
}

#[derive(Clone, Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusState {
    pub status: String,
    pub phase: String,
    pub cycle_count: i64,
    pub started_at: Option<i64>,
    pub ends_at: Option<i64>,
    pub remaining_seconds: Option<i64>,
    pub linked_todo_id: Option<String>,
    pub linked_group_id: Option<String>,
    pub updated_at: i64,
    pub settings: FocusSettings,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FocusSession {
    pub id: String,
    pub phase: String,
    pub planned_seconds: i64,
    pub actual_seconds: i64,
    pub outcome: String,
    pub started_at: i64,
    pub ended_at: i64,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartFocusRequest {
    pub phase: Option<String>,
    pub linked_todo_id: Option<String>,
    pub linked_group_id: Option<String>,
}

impl WorkspaceStore {
    pub fn get_focus_state(&self, now: i64) -> Result<FocusState, String> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(|error| format!("無法讀取 Focus 狀態：{error}"))?;
        resolve_expired(&transaction, now)?;
        let result = read_state(&transaction)?;
        transaction.commit().map_err(|error| format!("無法完成 Focus 狀態讀取：{error}"))?;
        Ok(result)
    }

    pub fn start_focus(&self, request: &StartFocusRequest, now: i64) -> Result<FocusState, String> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(|error| format!("無法開始 Focus：{error}"))?;
        resolve_expired(&transaction, now)?;
        let settings = read_settings(&transaction)?;
        let phase = request.phase.as_deref().unwrap_or("focus");
        let seconds = phase_seconds(phase, &settings)?;
        transaction.execute(
            "UPDATE focus_state SET status = 'running', phase = ?1, started_at = ?2, ends_at = ?3, remaining_seconds = NULL, linked_todo_id = ?4, linked_group_id = ?5, updated_at = ?2 WHERE id = 1",
            params![phase, now, now + seconds, request.linked_todo_id, request.linked_group_id],
        ).map_err(|error| format!("無法開始 Focus：{error}"))?;
        let state = read_state(&transaction)?;
        transaction.commit().map_err(|error| format!("無法儲存 Focus：{error}"))?;
        Ok(state)
    }

    pub fn pause_focus(&self, now: i64) -> Result<FocusState, String> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(|error| format!("無法暫停 Focus：{error}"))?;
        resolve_expired(&transaction, now)?;
        let remaining: Option<i64> = transaction.query_row("SELECT CASE WHEN ends_at IS NULL THEN NULL ELSE MAX(0, ends_at - ?1) END FROM focus_state WHERE id = 1", [now], |row| row.get(0)).map_err(|error| format!("無法讀取 Focus 剩餘時間：{error}"))?;
        transaction.execute("UPDATE focus_state SET status = 'paused', remaining_seconds = ?1, ends_at = NULL, updated_at = ?2 WHERE id = 1 AND status = 'running'", params![remaining, now]).map_err(|error| format!("無法暫停 Focus：{error}"))?;
        let state = read_state(&transaction)?;
        transaction.commit().map_err(|error| format!("無法儲存 Focus：{error}"))?;
        Ok(state)
    }

    pub fn resume_focus(&self, now: i64) -> Result<FocusState, String> {
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(|error| format!("無法繼續 Focus：{error}"))?;
        let remaining: Option<i64> = transaction.query_row("SELECT remaining_seconds FROM focus_state WHERE id = 1", [], |row| row.get(0)).map_err(|error| format!("無法讀取 Focus 剩餘時間：{error}"))?;
        let remaining = remaining.unwrap_or(0).max(1);
        transaction.execute("UPDATE focus_state SET status = 'running', started_at = ?1, ends_at = ?2, remaining_seconds = NULL, updated_at = ?1 WHERE id = 1 AND status = 'paused'", params![now, now + remaining]).map_err(|error| format!("無法繼續 Focus：{error}"))?;
        let state = read_state(&transaction)?;
        transaction.commit().map_err(|error| format!("無法儲存 Focus：{error}"))?;
        Ok(state)
    }

    pub fn stop_focus(&self, outcome: &str, now: i64) -> Result<FocusState, String> {
        if !matches!(outcome, "stopped" | "skipped") { return Err("Focus 結束方式無效。".to_string()); }
        let mut connection = self.lock()?;
        let transaction = connection.transaction().map_err(|error| format!("無法結束 Focus：{error}"))?;
        finish_current(&transaction, now, outcome)?;
        let state = read_state(&transaction)?;
        transaction.commit().map_err(|error| format!("無法儲存 Focus：{error}"))?;
        Ok(state)
    }

    pub fn update_focus_settings(&self, settings: &FocusSettings) -> Result<FocusState, String> {
        validate_settings(settings)?;
        let connection = self.lock()?;
        connection.execute("UPDATE focus_settings SET focus_minutes=?1, short_break_minutes=?2, long_break_minutes=?3, long_break_interval=?4, auto_start_focus=?5, auto_start_break=?6, notifications_enabled=?7 WHERE id=1", params![settings.focus_minutes, settings.short_break_minutes, settings.long_break_minutes, settings.long_break_interval, settings.auto_start_focus as i64, settings.auto_start_break as i64, settings.notifications_enabled as i64]).map_err(|error| format!("無法更新 Focus 設定：{error}"))?;
        read_state(&connection)
    }

    pub fn get_focus_sessions(&self, from: i64, to: i64) -> Result<Vec<FocusSession>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare("SELECT id, phase, planned_seconds, actual_seconds, outcome, started_at, ended_at FROM focus_sessions WHERE ended_at >= ?1 AND ended_at < ?2 ORDER BY ended_at DESC")
            .map_err(|error| format!("無法讀取專注紀錄：{error}"))?;
        let sessions = statement.query_map(params![from, to], |row| Ok(FocusSession {
            id: row.get(0)?, phase: row.get(1)?, planned_seconds: row.get(2)?, actual_seconds: row.get(3)?, outcome: row.get(4)?, started_at: row.get(5)?, ended_at: row.get(6)?,
        }))
        .map_err(|error| format!("無法讀取專注紀錄：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理專注紀錄：{error}"))?;
        Ok(sessions)
    }
}

fn read_settings(connection: &rusqlite::Connection) -> Result<FocusSettings, String> {
    connection.query_row("SELECT focus_minutes, short_break_minutes, long_break_minutes, long_break_interval, auto_start_focus, auto_start_break, notifications_enabled FROM focus_settings WHERE id=1", [], |row| Ok(FocusSettings { focus_minutes: row.get(0)?, short_break_minutes: row.get(1)?, long_break_minutes: row.get(2)?, long_break_interval: row.get(3)?, auto_start_focus: row.get::<_, i64>(4)? != 0, auto_start_break: row.get::<_, i64>(5)? != 0, notifications_enabled: row.get::<_, i64>(6)? != 0 })).map_err(|error| format!("無法讀取 Focus 設定：{error}"))
}

fn read_state(connection: &rusqlite::Connection) -> Result<FocusState, String> {
    let settings = read_settings(connection)?;
    let mut state = connection.query_row("SELECT status, phase, cycle_count, started_at, ends_at, remaining_seconds, linked_todo_id, linked_group_id, updated_at FROM focus_state WHERE id=1", [], |row| Ok(FocusState { status: row.get(0)?, phase: row.get(1)?, cycle_count: row.get(2)?, started_at: row.get(3)?, ends_at: row.get(4)?, remaining_seconds: row.get(5)?, linked_todo_id: row.get(6)?, linked_group_id: row.get(7)?, updated_at: row.get(8)?, settings })).map_err(|error| format!("無法讀取 Focus 狀態：{error}"))?;
    if state.status == "running" { state.remaining_seconds = state.ends_at.map(|ends| (ends - chrono::Local::now().timestamp()).max(0)); }
    Ok(state)
}

fn phase_seconds(phase: &str, settings: &FocusSettings) -> Result<i64, String> {
    let minutes = match phase { "focus" => settings.focus_minutes, "shortBreak" => settings.short_break_minutes, "longBreak" => settings.long_break_minutes, _ => return Err("Focus 階段無效。".to_string()) };
    Ok(minutes * 60)
}

fn validate_settings(settings: &FocusSettings) -> Result<(), String> {
    if !(1..=180).contains(&settings.focus_minutes) || !(1..=120).contains(&settings.short_break_minutes) || !(1..=180).contains(&settings.long_break_minutes) || !(1..=12).contains(&settings.long_break_interval) { return Err("Focus 時間設定超出可用範圍。".to_string()); }
    Ok(())
}

fn resolve_expired(transaction: &rusqlite::Transaction<'_>, now: i64) -> Result<(), String> {
    let status: String = transaction.query_row("SELECT status FROM focus_state WHERE id=1", [], |row| row.get(0)).map_err(|error| format!("無法讀取 Focus：{error}"))?;
    let ends_at: Option<i64> = transaction.query_row("SELECT ends_at FROM focus_state WHERE id=1", [], |row| row.get(0)).map_err(|error| format!("無法讀取 Focus：{error}"))?;
    if status == "running" && ends_at.is_some_and(|ends| ends <= now) { finish_current(transaction, now, "completed")?; }
    Ok(())
}

fn finish_current(transaction: &rusqlite::Transaction<'_>, now: i64, outcome: &str) -> Result<(), String> {
    let row = transaction.query_row("SELECT status, phase, cycle_count, started_at, ends_at, remaining_seconds, linked_todo_id, linked_group_id FROM focus_state WHERE id=1", [], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?, row.get::<_, i64>(2)?, row.get::<_, Option<i64>>(3)?, row.get::<_, Option<i64>>(4)?, row.get::<_, Option<i64>>(5)?, row.get::<_, Option<String>>(6)?, row.get::<_, Option<String>>(7)?))).optional().map_err(|error| format!("無法讀取 Focus：{error}"))?;
    let Some((status, phase, cycle, started, ends, remaining, todo, group)) = row else { return Ok(()); };
    if status == "idle" { return Ok(()); }
    let planned = ends.zip(started).map(|(end, start)| end - start).unwrap_or(remaining.unwrap_or(0));
    let actual = if status == "running" { started.map(|start| (now - start).clamp(0, planned)).unwrap_or(0) } else { (planned - remaining.unwrap_or(planned)).max(0) };
    transaction.execute("INSERT INTO focus_sessions(id, phase, planned_seconds, actual_seconds, outcome, started_at, ended_at, linked_todo_id, linked_group_id) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)", params![unique_id("focus"), phase, planned, actual, outcome, started.unwrap_or(now), now, todo, group]).map_err(|error| format!("無法儲存 Focus 紀錄：{error}"))?;
    let next_cycle = if phase == "focus" && outcome == "completed" { cycle + 1 } else { cycle };
    transaction.execute("UPDATE focus_state SET status='idle', phase='focus', cycle_count=?1, started_at=NULL, ends_at=NULL, remaining_seconds=NULL, linked_todo_id=NULL, linked_group_id=NULL, updated_at=?2 WHERE id=1", params![next_cycle, now]).map_err(|error| format!("無法結束 Focus：{error}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::path::Path;

    fn store() -> WorkspaceStore {
        let store = WorkspaceStore::in_memory().unwrap();
        store.initialize(None, &HashMap::new(), Path::new("missing"), Path::new("backups")).unwrap();
        store
    }

    #[test]
    fn pause_resume_and_expiry_use_actual_deadlines_once() {
        let store = store();
        let start = 1_000_000;
        let running = store.start_focus(&StartFocusRequest { phase: Some("focus".to_string()), linked_todo_id: None, linked_group_id: None }, start).unwrap();
        assert_eq!(running.status, "running");
        let paused = store.pause_focus(start + 60).unwrap();
        assert_eq!(paused.status, "paused");
        assert_eq!(paused.remaining_seconds, Some(24 * 60));
        let resumed = store.resume_focus(start + 600).unwrap();
        assert_eq!(resumed.ends_at, Some(start + 600 + 24 * 60));
        let finished = store.get_focus_state(start + 600 + 24 * 60 + 1).unwrap();
        assert_eq!(finished.status, "idle");
        assert_eq!(store.get_focus_state(start + 600 + 24 * 60 + 99).unwrap().status, "idle");
    }
}
