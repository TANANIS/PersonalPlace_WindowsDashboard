use crate::{dashboard::unique_id, storage::WorkspaceStore};
use chrono::{Datelike, Duration, Local, TimeZone, Timelike, Utc, Weekday};
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};

const DELETE_RETENTION_SECONDS: i64 = 30 * 24 * 60 * 60;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoList {
    pub id: String,
    pub title: String,
    pub position: i64,
    pub created_at: i64,
    pub updated_at: i64,
    pub archived_at: Option<i64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItem {
    pub id: String,
    pub list_id: String,
    pub parent_id: Option<String>,
    pub series_id: Option<String>,
    pub title: String,
    pub notes: String,
    pub status: String,
    pub priority: String,
    pub due_at: Option<i64>,
    pub position: i64,
    pub recurrence_kind: String,
    pub recurrence_interval: i64,
    pub reminder_offset_minutes: Option<i64>,
    pub reminder_state: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub completed_at: Option<i64>,
    pub deleted_at: Option<i64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoOverview {
    pub lists: Vec<TodoList>,
    pub items: Vec<TodoItem>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TodoItemInput {
    pub title: String,
    #[serde(default)]
    pub notes: String,
    #[serde(default = "default_priority")]
    pub priority: String,
    pub due_at: Option<i64>,
    #[serde(default = "default_recurrence")]
    pub recurrence_kind: String,
    #[serde(default = "default_interval")]
    pub recurrence_interval: i64,
    pub reminder_offset_minutes: Option<i64>,
    pub parent_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DueReminder {
    pub item_id: String,
    pub title: String,
    pub due_at: i64,
}

fn default_priority() -> String {
    "none".to_string()
}

fn default_recurrence() -> String {
    "none".to_string()
}

const fn default_interval() -> i64 {
    1
}

impl WorkspaceStore {
    pub fn get_todo_overview(&self) -> Result<TodoOverview, String> {
        let now = Utc::now().timestamp();
        let connection = self.lock()?;
        connection
            .execute(
                "DELETE FROM todo_items WHERE status = 'deleted' AND deleted_at < ?1",
                [now - DELETE_RETENTION_SECONDS],
            )
            .map_err(|error| format!("無法清理過期的已刪除待辦：{error}"))?;
        load_overview(&connection)
    }

    pub fn create_todo_list(&self, title: &str) -> Result<(TodoOverview, String), String> {
        let title = validate_title(title, "清單名稱", 120)?;
        let id = unique_id("todo-list");
        let now = Utc::now().timestamp();
        let result = self.mutate_todo(|transaction| {
            let position: i64 = transaction
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM todo_lists WHERE archived_at IS NULL",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| format!("無法計算清單位置：{error}"))?;
            transaction
                .execute(
                    "INSERT INTO todo_lists(id, title, position, created_at, updated_at, archived_at)
                     VALUES(?1, ?2, ?3, ?4, ?4, NULL)",
                    params![id, title, position, now],
                )
                .map_err(|error| format!("無法新增待辦清單：{error}"))?;
            Ok(())
        })?;
        Ok((result, id))
    }

    pub fn update_todo_list(
        &self,
        list_id: &str,
        title: &str,
        archived: bool,
    ) -> Result<TodoOverview, String> {
        let title = validate_title(title, "清單名稱", 120)?;
        let now = Utc::now().timestamp();
        self.mutate_todo(|transaction| {
            let changed = transaction
                .execute(
                    "UPDATE todo_lists SET title = ?2, updated_at = ?3,
                         archived_at = CASE WHEN ?4 THEN COALESCE(archived_at, ?3) ELSE NULL END
                     WHERE id = ?1",
                    params![list_id, title, now, archived],
                )
                .map_err(|error| format!("無法更新待辦清單：{error}"))?;
            if changed == 0 {
                return Err("找不到要更新的待辦清單。".to_string());
            }
            Ok(())
        })
    }

    pub fn create_todo_item(
        &self,
        list_id: &str,
        input: &TodoItemInput,
    ) -> Result<TodoOverview, String> {
        validate_item_input(input)?;
        let id = unique_id("todo");
        let now = Utc::now().timestamp();
        self.mutate_todo(|transaction| {
            ensure_list(transaction, list_id)?;
            ensure_parent(transaction, list_id, input.parent_id.as_deref(), None)?;
            let position = next_position(transaction, list_id, input.parent_id.as_deref())?;
            let reminder_state = reminder_state(input.due_at, input.reminder_offset_minutes);
            transaction
                .execute(
                    "INSERT INTO todo_items(
                         id, list_id, parent_id, series_id, title, notes, status, priority,
                         due_at, position, recurrence_kind, recurrence_interval,
                         reminder_offset_minutes, reminder_state, created_at, updated_at,
                         completed_at, deleted_at
                     ) VALUES(?1, ?2, ?3, NULL, ?4, ?5, 'active', ?6, ?7, ?8, ?9, ?10,
                              ?11, ?12, ?13, ?13, NULL, NULL)",
                    params![
                        id,
                        list_id,
                        input.parent_id,
                        input.title.trim(),
                        input.notes,
                        input.priority,
                        input.due_at,
                        position,
                        input.recurrence_kind,
                        input.recurrence_interval,
                        input.reminder_offset_minutes,
                        reminder_state,
                        now,
                    ],
                )
                .map_err(|error| format!("無法新增待辦事項：{error}"))?;
            Ok(())
        })
    }

    pub fn update_todo_item(
        &self,
        item_id: &str,
        input: &TodoItemInput,
    ) -> Result<TodoOverview, String> {
        validate_item_input(input)?;
        let now = Utc::now().timestamp();
        self.mutate_todo(|transaction| {
            let list_id: String = transaction
                .query_row(
                    "SELECT list_id FROM todo_items WHERE id = ?1 AND status != 'deleted'",
                    [item_id],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|error| format!("無法讀取待辦事項：{error}"))?
                .ok_or_else(|| "找不到要更新的待辦事項。".to_string())?;
            ensure_parent(transaction, &list_id, input.parent_id.as_deref(), Some(item_id))?;
            let reminder_state = reminder_state(input.due_at, input.reminder_offset_minutes);
            transaction
                .execute(
                    "UPDATE todo_items SET parent_id = ?2, title = ?3, notes = ?4,
                         priority = ?5, due_at = ?6, recurrence_kind = ?7,
                         recurrence_interval = ?8, reminder_offset_minutes = ?9,
                         reminder_state = ?10, updated_at = ?11
                     WHERE id = ?1 AND status != 'deleted'",
                    params![
                        item_id,
                        input.parent_id,
                        input.title.trim(),
                        input.notes,
                        input.priority,
                        input.due_at,
                        input.recurrence_kind,
                        input.recurrence_interval,
                        input.reminder_offset_minutes,
                        reminder_state,
                        now,
                    ],
                )
                .map_err(|error| format!("無法更新待辦事項：{error}"))?;
            Ok(())
        })
    }

    pub fn set_todo_completed(
        &self,
        item_id: &str,
        completed: bool,
    ) -> Result<TodoOverview, String> {
        let now = Utc::now().timestamp();
        self.mutate_todo(|transaction| {
            let item = load_item(transaction, item_id)?;
            if item.status == "deleted" {
                return Err("已刪除的待辦事項無法直接完成。".to_string());
            }
            if !completed {
                if item.recurrence_kind != "none" {
                    let later_exists: bool = transaction
                        .query_row(
                            "SELECT EXISTS(SELECT 1 FROM todo_items
                             WHERE series_id = COALESCE(?1, ?2) AND id != ?2 AND status = 'active')",
                            params![item.series_id, item.id],
                            |row| row.get(0),
                        )
                        .map_err(|error| format!("無法確認重複待辦：{error}"))?;
                    if later_exists {
                        return Err("下一次重複待辦已建立，請復原剛才的完成操作。".to_string());
                    }
                }
                transaction
                    .execute(
                        "UPDATE todo_items SET status = 'active', completed_at = NULL,
                         reminder_state = CASE WHEN reminder_offset_minutes IS NULL OR due_at IS NULL THEN 'none' ELSE 'pending' END,
                         updated_at = ?2 WHERE id = ?1",
                        params![item_id, now],
                    )
                    .map_err(|error| format!("無法恢復待辦事項：{error}"))?;
                return Ok(());
            }

            transaction
                .execute(
                    "UPDATE todo_items SET status = 'completed', completed_at = ?2,
                     reminder_state = 'none', updated_at = ?2 WHERE id = ?1",
                    params![item_id, now],
                )
                .map_err(|error| format!("無法完成待辦事項：{error}"))?;

            if item.recurrence_kind != "none" && item.parent_id.is_none() {
                let due_at = item
                    .due_at
                    .ok_or_else(|| "重複待辦需要截止日期。".to_string())?;
                let next_due = next_recurrence(
                    due_at,
                    &item.recurrence_kind,
                    item.recurrence_interval,
                    now,
                )?;
                let next_id = unique_id("todo");
                let series_id = item.series_id.clone().unwrap_or_else(|| item.id.clone());
                let position = next_position(transaction, &item.list_id, None)?;
                transaction
                    .execute(
                        "INSERT INTO todo_items(
                             id, list_id, parent_id, series_id, title, notes, status, priority,
                             due_at, position, recurrence_kind, recurrence_interval,
                             reminder_offset_minutes, reminder_state, created_at, updated_at,
                             completed_at, deleted_at
                         ) VALUES(?1, ?2, NULL, ?3, ?4, ?5, 'active', ?6, ?7, ?8, ?9, ?10,
                                  ?11, ?12, ?13, ?13, NULL, NULL)",
                        params![
                            next_id,
                            item.list_id,
                            series_id,
                            item.title,
                            item.notes,
                            item.priority,
                            next_due,
                            position,
                            item.recurrence_kind,
                            item.recurrence_interval,
                            item.reminder_offset_minutes,
                            reminder_state(Some(next_due), item.reminder_offset_minutes),
                            now,
                        ],
                    )
                    .map_err(|error| format!("無法建立下一次重複待辦：{error}"))?;
            }
            Ok(())
        })
    }

    pub fn move_todo_items(
        &self,
        item_ids: &[String],
        list_id: &str,
        parent_id: Option<&str>,
        target_index: usize,
    ) -> Result<TodoOverview, String> {
        if item_ids.is_empty() {
            return Err("請至少選擇一項待辦。".to_string());
        }
        self.mutate_todo(|transaction| {
            ensure_list(transaction, list_id)?;
            ensure_parent(transaction, list_id, parent_id, None)?;
            for item_id in item_ids {
                let item = load_item(transaction, item_id)?;
                if item.status == "deleted" || item.list_id != list_id {
                    return Err("只能移動同一清單內的有效待辦。".to_string());
                }
                if parent_id == Some(item_id.as_str()) {
                    return Err("待辦不可成為自己的子任務。".to_string());
                }
            }
            let mut ids = container_item_ids(transaction, list_id, parent_id)?;
            ids.retain(|id| !item_ids.contains(id));
            let insertion = target_index.min(ids.len());
            for (offset, id) in item_ids.iter().enumerate() {
                ids.insert(insertion + offset, id.clone());
                transaction
                    .execute(
                        "UPDATE todo_items SET parent_id = ?2 WHERE id = ?1",
                        params![id, parent_id],
                    )
                    .map_err(|error| format!("無法移動待辦事項：{error}"))?;
            }
            set_item_order(transaction, &ids)?;
            Ok(())
        })
    }

    pub fn delete_todo_items(&self, item_ids: &[String]) -> Result<TodoOverview, String> {
        let now = Utc::now().timestamp();
        self.mutate_todo(|transaction| {
            for item_id in item_ids {
                let changed = transaction
                    .execute(
                        "UPDATE todo_items SET status = 'deleted', deleted_at = ?2,
                         reminder_state = 'none', updated_at = ?2
                         WHERE (id = ?1 OR parent_id = ?1) AND status != 'deleted'",
                        params![item_id, now],
                    )
                    .map_err(|error| format!("無法刪除待辦事項：{error}"))?;
                if changed == 0 {
                    return Err("找不到要刪除的待辦事項。".to_string());
                }
            }
            Ok(())
        })
    }

    pub fn restore_todo_items(&self, item_ids: &[String]) -> Result<TodoOverview, String> {
        let now = Utc::now().timestamp();
        self.mutate_todo(|transaction| {
            for item_id in item_ids {
                let changed = transaction
                    .execute(
                        "UPDATE todo_items SET status = 'active', deleted_at = NULL,
                         reminder_state = CASE WHEN reminder_offset_minutes IS NULL OR due_at IS NULL THEN 'none' ELSE 'pending' END,
                         updated_at = ?2 WHERE (id = ?1 OR parent_id = ?1) AND status = 'deleted'",
                        params![item_id, now],
                    )
                    .map_err(|error| format!("無法復原待辦事項：{error}"))?;
                if changed == 0 {
                    return Err("找不到可復原的待辦事項。".to_string());
                }
            }
            Ok(())
        })
    }

    pub fn claim_due_reminders(&self, now: i64) -> Result<Vec<DueReminder>, String> {
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始提醒交易：{error}"))?;
        let reminders = {
            let mut statement = transaction
                .prepare(
                    "SELECT id, title, due_at FROM todo_items
                     WHERE status = 'active' AND reminder_state = 'pending'
                       AND due_at IS NOT NULL AND reminder_offset_minutes IS NOT NULL
                       AND due_at - reminder_offset_minutes * 60 <= ?1
                     ORDER BY due_at, position",
                )
                .map_err(|error| format!("無法準備提醒查詢：{error}"))?;
            let reminders = statement
                .query_map([now], |row| {
                    Ok(DueReminder {
                        item_id: row.get(0)?,
                        title: row.get(1)?,
                        due_at: row.get(2)?,
                    })
                })
                .map_err(|error| format!("無法讀取提醒：{error}"))?
                .collect::<Result<Vec<_>, _>>()
                .map_err(|error| format!("無法整理提醒：{error}"))?;
            reminders
        };
        for reminder in &reminders {
            transaction
                .execute(
                    "UPDATE todo_items SET reminder_state = 'delivered', updated_at = ?2 WHERE id = ?1",
                    params![reminder.item_id, now],
                )
                .map_err(|error| format!("無法更新提醒狀態：{error}"))?;
        }
        transaction
            .commit()
            .map_err(|error| format!("無法完成提醒交易：{error}"))?;
        Ok(reminders)
    }

    fn mutate_todo<F>(&self, operation: F) -> Result<TodoOverview, String>
    where
        F: FnOnce(&Transaction<'_>) -> Result<(), String>,
    {
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始待辦資料交易：{error}"))?;
        operation(&transaction)?;
        transaction
            .commit()
            .map_err(|error| format!("無法完成待辦資料交易：{error}"))?;
        load_overview(&connection)
    }
}

fn load_overview(connection: &Connection) -> Result<TodoOverview, String> {
    let lists = {
        let mut statement = connection
            .prepare(
                "SELECT id, title, position, created_at, updated_at, archived_at
                 FROM todo_lists ORDER BY archived_at IS NOT NULL, position, id",
            )
            .map_err(|error| format!("無法準備待辦清單查詢：{error}"))?;
        let lists = statement
            .query_map([], |row| {
                Ok(TodoList {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    position: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    archived_at: row.get(5)?,
                })
            })
            .map_err(|error| format!("無法讀取待辦清單：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("無法整理待辦清單：{error}"))?;
        lists
    };
    let items = {
        let mut statement = connection
            .prepare(
                "SELECT id, list_id, parent_id, series_id, title, notes, status, priority,
                        due_at, position, recurrence_kind, recurrence_interval,
                        reminder_offset_minutes, reminder_state, created_at, updated_at,
                        completed_at, deleted_at
                 FROM todo_items WHERE status != 'deleted'
                 ORDER BY list_id, parent_id IS NOT NULL, parent_id, position, id",
            )
            .map_err(|error| format!("無法準備待辦事項查詢：{error}"))?;
        let items = statement
            .query_map([], row_to_item)
            .map_err(|error| format!("無法讀取待辦事項：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("無法整理待辦事項：{error}"))?;
        items
    };
    Ok(TodoOverview { lists, items })
}

fn row_to_item(row: &rusqlite::Row<'_>) -> rusqlite::Result<TodoItem> {
    Ok(TodoItem {
        id: row.get(0)?,
        list_id: row.get(1)?,
        parent_id: row.get(2)?,
        series_id: row.get(3)?,
        title: row.get(4)?,
        notes: row.get(5)?,
        status: row.get(6)?,
        priority: row.get(7)?,
        due_at: row.get(8)?,
        position: row.get(9)?,
        recurrence_kind: row.get(10)?,
        recurrence_interval: row.get(11)?,
        reminder_offset_minutes: row.get(12)?,
        reminder_state: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
        completed_at: row.get(16)?,
        deleted_at: row.get(17)?,
    })
}

fn load_item(connection: &Connection, item_id: &str) -> Result<TodoItem, String> {
    connection
        .query_row(
            "SELECT id, list_id, parent_id, series_id, title, notes, status, priority,
                    due_at, position, recurrence_kind, recurrence_interval,
                    reminder_offset_minutes, reminder_state, created_at, updated_at,
                    completed_at, deleted_at FROM todo_items WHERE id = ?1",
            [item_id],
            row_to_item,
        )
        .optional()
        .map_err(|error| format!("無法讀取待辦事項：{error}"))?
        .ok_or_else(|| "找不到待辦事項。".to_string())
}

fn validate_item_input(input: &TodoItemInput) -> Result<(), String> {
    validate_title(&input.title, "待辦名稱", 300)?;
    if input.notes.chars().count() > 10_000 {
        return Err("待辦備註不可超過 10,000 個字。".to_string());
    }
    if !matches!(input.priority.as_str(), "none" | "low" | "medium" | "high") {
        return Err("待辦優先順序無效。".to_string());
    }
    if !matches!(
        input.recurrence_kind.as_str(),
        "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly"
            | "custom_days" | "custom_weeks" | "custom_months"
    ) {
        return Err("待辦重複規則無效。".to_string());
    }
    if !(1..=365).contains(&input.recurrence_interval) {
        return Err("自訂重複間隔需要介於 1 到 365。".to_string());
    }
    if input.recurrence_kind != "none" && input.due_at.is_none() {
        return Err("重複待辦需要設定截止日期。".to_string());
    }
    if input
        .reminder_offset_minutes
        .is_some_and(|value| !(0..=525_600).contains(&value))
    {
        return Err("提醒時間超出允許範圍。".to_string());
    }
    if input.reminder_offset_minutes.is_some() && input.due_at.is_none() {
        return Err("設定提醒前需要先設定截止時間。".to_string());
    }
    Ok(())
}

fn validate_title<'a>(title: &'a str, label: &str, max: usize) -> Result<&'a str, String> {
    let title = title.trim();
    let count = title.chars().count();
    if count == 0 || count > max {
        return Err(format!("{label}需要是 1 到 {max} 個字。"));
    }
    Ok(title)
}

fn ensure_list(transaction: &Transaction<'_>, list_id: &str) -> Result<(), String> {
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM todo_lists WHERE id = ?1 AND archived_at IS NULL)",
            [list_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("無法確認待辦清單：{error}"))?;
    if exists {
        Ok(())
    } else {
        Err("找不到可用的待辦清單。".to_string())
    }
}

fn ensure_parent(
    transaction: &Transaction<'_>,
    list_id: &str,
    parent_id: Option<&str>,
    item_id: Option<&str>,
) -> Result<(), String> {
    let Some(parent_id) = parent_id else {
        return Ok(());
    };
    if item_id == Some(parent_id) {
        return Err("待辦不可成為自己的子任務。".to_string());
    }
    let parent: Option<(String, Option<String>, String)> = transaction
        .query_row(
            "SELECT list_id, parent_id, status FROM todo_items WHERE id = ?1",
            [parent_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| format!("無法確認父待辦：{error}"))?;
    match parent {
        Some((parent_list, None, status)) if parent_list == list_id && status != "deleted" => Ok(()),
        _ => Err("子任務只能放在同一清單的頂層待辦下。".to_string()),
    }
}

fn next_position(
    transaction: &Transaction<'_>,
    list_id: &str,
    parent_id: Option<&str>,
) -> Result<i64, String> {
    transaction
        .query_row(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM todo_items
             WHERE list_id = ?1 AND parent_id IS ?2 AND status != 'deleted'",
            params![list_id, parent_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("無法計算待辦位置：{error}"))
}

fn container_item_ids(
    transaction: &Transaction<'_>,
    list_id: &str,
    parent_id: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut statement = transaction
        .prepare(
            "SELECT id FROM todo_items WHERE list_id = ?1 AND parent_id IS ?2 AND status != 'deleted'
             ORDER BY position, id",
        )
        .map_err(|error| format!("無法準備待辦順序：{error}"))?;
    let item_ids = statement
        .query_map(params![list_id, parent_id], |row| row.get(0))
        .map_err(|error| format!("無法讀取待辦順序：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理待辦順序：{error}"))?;
    Ok(item_ids)
}

fn set_item_order(transaction: &Transaction<'_>, ids: &[String]) -> Result<(), String> {
    for (position, id) in ids.iter().enumerate() {
        transaction
            .execute(
                "UPDATE todo_items SET position = ?2 WHERE id = ?1",
                params![id, position as i64],
            )
            .map_err(|error| format!("無法保存待辦順序：{error}"))?;
    }
    Ok(())
}

fn reminder_state(due_at: Option<i64>, offset: Option<i64>) -> &'static str {
    if due_at.is_some() && offset.is_some() {
        "pending"
    } else {
        "none"
    }
}

fn next_recurrence(
    due_at: i64,
    kind: &str,
    interval: i64,
    now: i64,
) -> Result<i64, String> {
    let mut current = Local
        .timestamp_opt(due_at, 0)
        .earliest()
        .ok_or_else(|| "截止時間無法轉換為本機時間。".to_string())?;
    for _ in 0..1_000 {
        current = match kind {
            "daily" => current + Duration::days(1),
            "weekdays" => {
                let mut next = current + Duration::days(1);
                while matches!(next.weekday(), Weekday::Sat | Weekday::Sun) {
                    next += Duration::days(1);
                }
                next
            }
            "weekly" => current + Duration::weeks(1),
            "monthly" => add_months(current, 1)?,
            "yearly" => add_months(current, 12)?,
            "custom_days" => current + Duration::days(interval),
            "custom_weeks" => current + Duration::weeks(interval),
            "custom_months" => add_months(current, interval)?,
            _ => return Err("待辦重複規則無效。".to_string()),
        };
        if current.timestamp() > now {
            return Ok(current.timestamp());
        }
    }
    Err("無法計算下一次待辦日期。".to_string())
}

fn add_months(
    value: chrono::DateTime<Local>,
    months: i64,
) -> Result<chrono::DateTime<Local>, String> {
    let total = value.year() as i64 * 12 + value.month0() as i64 + months;
    let year = total.div_euclid(12) as i32;
    let month = total.rem_euclid(12) as u32 + 1;
    let day = value.day().min(days_in_month(year, month));
    Local
        .with_ymd_and_hms(
            year,
            month,
            day,
            value.hour(),
            value.minute(),
            value.second(),
        )
        .earliest()
        .ok_or_else(|| "重複日期落在無效的本機時間。".to_string())
}

fn days_in_month(year: i32, month: u32) -> u32 {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let first_next = chrono::NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .expect("valid next month");
    (first_next - Duration::days(1)).day()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store() -> WorkspaceStore {
        let store = WorkspaceStore::in_memory().expect("store");
        store
            .initialize(
                None,
                &std::collections::HashMap::new(),
                std::path::Path::new("missing"),
                std::path::Path::new("backups"),
            )
            .expect("initialize");
        store
    }

    #[test]
    fn subtasks_are_limited_to_one_level_and_delete_can_be_restored() {
        let store = store();
        let (_, list_id) = store.create_todo_list("學習").unwrap();
        store
            .create_todo_item(
                &list_id,
                &TodoItemInput {
                    title: "父任務".into(),
                    notes: String::new(),
                    priority: "none".into(),
                    due_at: None,
                    recurrence_kind: "none".into(),
                    recurrence_interval: 1,
                    reminder_offset_minutes: None,
                    parent_id: None,
                },
            )
            .unwrap();
        let parent = store.get_todo_overview().unwrap().items[0].clone();
        store
            .create_todo_item(
                &list_id,
                &TodoItemInput {
                    title: "子任務".into(),
                    notes: String::new(),
                    priority: "low".into(),
                    due_at: None,
                    recurrence_kind: "none".into(),
                    recurrence_interval: 1,
                    reminder_offset_minutes: None,
                    parent_id: Some(parent.id.clone()),
                },
            )
            .unwrap();
        let child = store
            .get_todo_overview()
            .unwrap()
            .items
            .into_iter()
            .find(|item| item.parent_id.is_some())
            .unwrap();
        let invalid = TodoItemInput {
            title: "孫任務".into(),
            notes: String::new(),
            priority: "none".into(),
            due_at: None,
            recurrence_kind: "none".into(),
            recurrence_interval: 1,
            reminder_offset_minutes: None,
            parent_id: Some(child.id.clone()),
        };
        assert!(store.create_todo_item(&list_id, &invalid).is_err());
        store.delete_todo_items(std::slice::from_ref(&parent.id)).unwrap();
        assert!(store.get_todo_overview().unwrap().items.is_empty());
        store.restore_todo_items(&[parent.id]).unwrap();
        assert_eq!(store.get_todo_overview().unwrap().items.len(), 2);
    }

    #[test]
    fn recurring_completion_creates_only_the_next_future_item() {
        let store = store();
        let (_, list_id) = store.create_todo_list("重複").unwrap();
        store
            .create_todo_item(
                &list_id,
                &TodoItemInput {
                    title: "每日練習".into(),
                    notes: String::new(),
                    priority: "medium".into(),
                    due_at: Some(Utc::now().timestamp() - 10 * 24 * 60 * 60),
                    recurrence_kind: "daily".into(),
                    recurrence_interval: 1,
                    reminder_offset_minutes: Some(30),
                    parent_id: None,
                },
            )
            .unwrap();
        let item = store.get_todo_overview().unwrap().items[0].clone();
        let result = store.set_todo_completed(&item.id, true).unwrap();
        assert_eq!(result.items.len(), 2);
        let next = result.items.iter().find(|candidate| candidate.status == "active").unwrap();
        assert!(next.due_at.unwrap() > Utc::now().timestamp());
    }
}
