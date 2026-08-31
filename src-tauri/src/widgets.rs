use crate::{
    dashboard::{unique_id, DashboardState},
    storage::WorkspaceStore,
};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateWidgetResult {
    pub dashboard: DashboardState,
    pub widget_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSummaryItem {
    pub id: String,
    pub title: String,
    pub due_at: Option<i64>,
    pub priority: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WidgetSummary {
    pub card_id: String,
    pub widget_kind: String,
    pub title: String,
    pub primary_value: String,
    pub secondary_value: String,
    pub items: Vec<WidgetSummaryItem>,
}

impl WorkspaceStore {
    pub fn create_widget(
        &self,
        page_id: &str,
        parent_group_id: Option<&str>,
        widget_kind: &str,
        todo_list_id: Option<&str>,
    ) -> Result<CreateWidgetResult, String> {
        if !matches!(widget_kind, "todo" | "focus" | "usage") {
            return Err("不支援這種小工具。".to_string());
        }
        let widget_id = unique_id("widget");
        let list_id = (widget_kind == "todo").then(|| {
            todo_list_id
                .map(str::to_owned)
                .unwrap_or_else(|| unique_id("todo-list"))
        });
        let creates_list = widget_kind == "todo" && todo_list_id.is_none();
        let now = Utc::now().timestamp();
        let dashboard = self.mutate_with_undo(|transaction| {
            let page_exists: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM pages WHERE id = ?1)",
                    [page_id],
                    |row| row.get(0),
                )
                .map_err(|error| format!("無法確認小工具頁面：{error}"))?;
            if !page_exists {
                return Err("找不到要放置小工具的頁面。".to_string());
            }
            if let Some(group_id) = parent_group_id {
                let group_valid: bool = transaction
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM cards
                         WHERE id = ?1 AND page_id = ?2 AND card_type = 'group'
                           AND parent_group_id IS NULL)",
                        params![group_id, page_id],
                        |row| row.get(0),
                    )
                    .map_err(|error| format!("無法確認小工具群組：{error}"))?;
                if !group_valid {
                    return Err("小工具只能放在頁面或頂層群組中。".to_string());
                }
            }
            if widget_kind == "todo" && !creates_list {
                let list_exists: bool = transaction
                    .query_row(
                        "SELECT EXISTS(SELECT 1 FROM todo_lists WHERE id = ?1 AND archived_at IS NULL)",
                        [todo_list_id.ok_or_else(|| "找不到可用的待辦清單。".to_string())?],
                        |row| row.get(0),
                    )
                    .map_err(|error| format!("無法確認待辦清單：{error}"))?;
                if !list_exists {
                    return Err("找不到可用的待辦清單。".to_string());
                }
            }
            if creates_list {
                let list_id = list_id.as_deref().ok_or_else(|| "無法建立小工具待辦清單。".to_string())?;
                let list_position: i64 = transaction
                    .query_row(
                        "SELECT COALESCE(MAX(position), -1) + 1 FROM todo_lists WHERE archived_at IS NULL",
                        [],
                        |row| row.get(0),
                    )
                    .map_err(|error| format!("無法計算待辦清單位置：{error}"))?;
                transaction
                    .execute(
                        "INSERT INTO todo_lists(id, title, position, created_at, updated_at, archived_at)
                         VALUES(?1, '待辦事項', ?2, ?3, ?3, NULL)",
                        params![list_id, list_position, now],
                    )
                    .map_err(|error| format!("無法建立小工具待辦清單：{error}"))?;
            }
            let todo_title = if widget_kind == "todo" {
                Some(
                    transaction
                        .query_row(
                            "SELECT title FROM todo_lists WHERE id = ?1",
                            [list_id.as_deref().ok_or_else(|| "找不到可用的待辦清單。".to_string())?],
                            |row| row.get::<_, String>(0),
                        )
                        .map_err(|error| format!("無法讀取待辦清單名稱：{error}"))?,
                )
            } else {
                None
            };
            let position: i64 = transaction
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM cards
                     WHERE page_id = ?1 AND parent_group_id IS ?2",
                    params![page_id, parent_group_id],
                    |row| row.get(0),
                )
                .map_err(|error| format!("無法計算小工具位置：{error}"))?;
            let (title, subtitle, symbol, tone) = match widget_kind {
                "todo" => (todo_title.as_deref().unwrap_or("待辦事項"), "下一步要做的事", "✓", "cyan"),
                "focus" => ("Focus Timer", "專注與休息循環", "◷", "violet"),
                "usage" => ("使用時間", "本機前景應用程式", "◴", "amber"),
                _ => unreachable!(),
            };
            transaction
                .execute(
                    "INSERT INTO cards(
                         id, page_id, parent_group_id, card_type, target_id,
                         title, subtitle, kind, symbol, tone, size, position,
                         note_text, resume_note, launch_enabled, last_opened_at,
                         widget_kind, widget_resource_id
                     ) VALUES(?1, ?2, ?3, 'widget', NULL, ?4, ?5, 'widget', ?6, ?7,
                              'wide', ?8, '', '', 0, NULL, ?9, ?10)",
                    params![
                        widget_id,
                        page_id,
                        parent_group_id,
                        title,
                        subtitle,
                        symbol,
                        tone,
                        position,
                        widget_kind,
                        list_id,
                    ],
                )
                .map_err(|error| format!("無法新增小工具：{error}"))?;
            Ok(())
        })?;
        Ok(CreateWidgetResult {
            dashboard,
            widget_id,
        })
    }

    pub fn set_todo_widget_list(
        &self,
        card_id: &str,
        list_id: &str,
    ) -> Result<DashboardState, String> {
        self.mutate_with_undo(|transaction| {
            let list_exists: bool = transaction
                .query_row(
                    "SELECT EXISTS(SELECT 1 FROM todo_lists WHERE id = ?1 AND archived_at IS NULL)",
                    [list_id],
                    |row| row.get(0),
                )
                .map_err(|error| format!("無法確認待辦清單：{error}"))?;
            if !list_exists {
                return Err("找不到可用的待辦清單。".to_string());
            }
            let changed = transaction
                .execute(
                    "UPDATE cards SET widget_resource_id = ?2, title = (SELECT title FROM todo_lists WHERE id = ?2)
                     WHERE id = ?1 AND card_type = 'widget' AND widget_kind = 'todo'",
                    params![card_id, list_id],
                )
                .map_err(|error| format!("無法更新待辦小工具：{error}"))?;
            if changed == 0 {
                return Err("找不到待辦小工具。".to_string());
            }
            Ok(())
        })
    }

    pub fn get_widget_summary(&self, card_id: &str) -> Result<WidgetSummary, String> {
        // Do not retain the connection guard while dispatching to another
        // store method. The Focus branch queries the same store again; keeping
        // this guard would block forever on the non-reentrant mutex.
        let card: (String, String, Option<String>) = {
            let connection = self.lock()?;
            connection
                .query_row(
                    "SELECT title, widget_kind, widget_resource_id FROM cards
                     WHERE id = ?1 AND card_type = 'widget'",
                    [card_id],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|error| format!("無法讀取小工具：{error}"))?
                .ok_or_else(|| "找不到小工具。".to_string())?
        };
        match card.1.as_str() {
            "todo" => {
                let list_id = card.2.ok_or_else(|| "待辦小工具缺少清單。".to_string())?;
                let connection = self.lock()?;
                let active: i64 = connection
                    .query_row(
                        "SELECT COUNT(*) FROM todo_items WHERE list_id = ?1 AND status = 'active'",
                        [&list_id],
                        |row| row.get(0),
                    )
                    .map_err(|error| format!("無法統計待辦事項：{error}"))?;
                let overdue: i64 = connection
                    .query_row(
                        "SELECT COUNT(*) FROM todo_items
                         WHERE list_id = ?1 AND status = 'active' AND due_at IS NOT NULL AND due_at < ?2",
                        params![list_id, Utc::now().timestamp()],
                        |row| row.get(0),
                    )
                    .map_err(|error| format!("無法統計逾期待辦：{error}"))?;
                let items = {
                    let mut statement = connection
                        .prepare(
                            "SELECT id, title, due_at, priority FROM todo_items
                             WHERE list_id = ?1 AND parent_id IS NULL AND status = 'active'
                             ORDER BY due_at IS NULL, due_at, position LIMIT 3",
                        )
                        .map_err(|error| format!("無法準備待辦摘要：{error}"))?;
                    let items = statement
                        .query_map([&list_id], |row| {
                            Ok(WidgetSummaryItem {
                                id: row.get(0)?,
                                title: row.get(1)?,
                                due_at: row.get(2)?,
                                priority: row.get(3)?,
                            })
                        })
                        .map_err(|error| format!("無法讀取待辦摘要：{error}"))?
                        .collect::<Result<Vec<_>, _>>()
                        .map_err(|error| format!("無法整理待辦摘要：{error}"))?;
                    items
                };
                Ok(WidgetSummary {
                    card_id: card_id.to_string(),
                    widget_kind: card.1,
                    title: card.0,
                    primary_value: format!("{active} 項未完成"),
                    secondary_value: if overdue > 0 {
                        format!("{overdue} 項已逾期")
                    } else {
                        "目前沒有逾期".to_string()
                    },
                    items,
                })
            }
            "focus" => {
                let focus = self.get_focus_state(Utc::now().timestamp())?;
                let seconds = focus
                    .remaining_seconds
                    .unwrap_or(focus.settings.focus_minutes * 60)
                    .max(0);
                Ok(WidgetSummary {
                    card_id: card_id.to_string(),
                    widget_kind: card.1,
                    title: card.0,
                    primary_value: format!("{:02}:{:02}", seconds / 60, seconds % 60),
                    secondary_value: match focus.status.as_str() {
                        "running" => "進行中".to_string(),
                        "paused" => "已暫停".to_string(),
                        _ => "準備開始".to_string(),
                    },
                    items: Vec::new(),
                })
            }
            "focus_placeholder" => Ok(WidgetSummary {
                card_id: card_id.to_string(),
                widget_kind: card.1,
                title: card.0,
                primary_value: "25:00".to_string(),
                secondary_value: "準備開始專注".to_string(),
                items: Vec::new(),
            }),
            "usage" => Ok(WidgetSummary {
                card_id: card_id.to_string(),
                widget_kind: card.1,
                title: card.0,
                primary_value: "尚未啟用".to_string(),
                secondary_value: "使用時間追蹤預設關閉".to_string(),
                items: Vec::new(),
            }),
            _ => Err("小工具類型無效。".to_string()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn todo_widget_creates_independent_list_and_survives_dashboard_undo() {
        let store = WorkspaceStore::in_memory().unwrap();
        store
            .initialize(
                None,
                &std::collections::HashMap::new(),
                std::path::Path::new("missing"),
                std::path::Path::new("backups"),
            )
            .unwrap();
        let created = store.create_widget("home", None, "todo", None).unwrap();
        let widget = created
            .dashboard
            .cards
            .iter()
            .find(|card| card.id == created.widget_id)
            .unwrap();
        assert_eq!(widget.widget_kind.as_deref(), Some("todo"));
        let list_id = widget.widget_resource_id.clone().unwrap();
        store
            .delete_cards(std::slice::from_ref(&widget.id))
            .unwrap();
        assert_eq!(store.get_todo_overview().unwrap().lists[0].id, list_id);
        let restored = store.undo_last().unwrap();
        assert!(restored.cards.iter().any(|card| card.id == widget.id));
    }

    #[test]
    fn focus_widget_summary_releases_the_store_lock_before_loading_focus_state() {
        let store = WorkspaceStore::in_memory().unwrap();
        store
            .initialize(
                None,
                &std::collections::HashMap::new(),
                std::path::Path::new("missing"),
                std::path::Path::new("backups"),
            )
            .unwrap();
        let created = store.create_widget("home", None, "focus", None).unwrap();

        let summary = store.get_widget_summary(&created.widget_id).unwrap();
        assert_eq!(summary.widget_kind, "focus");
        assert_eq!(summary.primary_value, "25:00");
    }

    #[test]
    fn todo_widget_can_bind_existing_active_list_without_creating_another() {
        let store = WorkspaceStore::in_memory().unwrap();
        store
            .initialize(
                None,
                &std::collections::HashMap::new(),
                std::path::Path::new("missing"),
                std::path::Path::new("backups"),
            )
            .unwrap();
        let (_, list_id) = store.create_todo_list("Unity").unwrap();
        let created = store
            .create_widget("home", None, "todo", Some(&list_id))
            .unwrap();
        let widget = created
            .dashboard
            .cards
            .iter()
            .find(|card| card.id == created.widget_id)
            .unwrap();
        assert_eq!(widget.widget_resource_id.as_deref(), Some(list_id.as_str()));
        assert_eq!(widget.title, "Unity");
        assert_eq!(store.get_todo_overview().unwrap().lists.len(), 1);
    }

    #[test]
    fn todo_widget_titles_follow_list_renames_and_switches_for_all_references() {
        let store = WorkspaceStore::in_memory().unwrap();
        store
            .initialize(
                None,
                &std::collections::HashMap::new(),
                std::path::Path::new("missing"),
                std::path::Path::new("backups"),
            )
            .unwrap();
        let (_, unity_id) = store.create_todo_list("Unity").unwrap();
        let (_, art_id) = store.create_todo_list("畫畫").unwrap();
        let first = store
            .create_widget("home", None, "todo", Some(&unity_id))
            .unwrap();
        let second = store
            .create_widget("home", None, "todo", Some(&unity_id))
            .unwrap();
        let focus = store.create_widget("home", None, "focus", None).unwrap();
        let usage = store.create_widget("home", None, "usage", None).unwrap();
        let dashboard = store
            .set_todo_widget_list(&first.widget_id, &art_id)
            .unwrap();
        assert_eq!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == first.widget_id)
                .unwrap()
                .title,
            "畫畫"
        );
        assert_eq!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == second.widget_id)
                .unwrap()
                .title,
            "Unity"
        );
        assert_eq!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == focus.widget_id)
                .unwrap()
                .title,
            "Focus Timer"
        );
        assert_eq!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == usage.widget_id)
                .unwrap()
                .title,
            "使用時間"
        );
        store
            .update_todo_list(&unity_id, "Unity 開發", false)
            .unwrap();
        let dashboard = store.get_dashboard().unwrap();
        assert_eq!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == second.widget_id)
                .unwrap()
                .title,
            "Unity 開發"
        );
        assert_eq!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == first.widget_id)
                .unwrap()
                .title,
            "畫畫"
        );
        assert_eq!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == focus.widget_id)
                .unwrap()
                .title,
            "Focus Timer"
        );
        assert!(store
            .update_dashboard_card(
                &second.widget_id,
                crate::dashboard::CardMutation {
                    title: Some("手動改名".to_string()),
                    ..Default::default()
                }
            )
            .is_err());
    }

    #[test]
    fn todo_widget_rejects_missing_or_archived_list() {
        let store = WorkspaceStore::in_memory().unwrap();
        store
            .initialize(
                None,
                &std::collections::HashMap::new(),
                std::path::Path::new("missing"),
                std::path::Path::new("backups"),
            )
            .unwrap();
        assert!(store
            .create_widget("home", None, "todo", Some("missing-list"))
            .is_err());
        let (_, list_id) = store.create_todo_list("舊清單").unwrap();
        store.update_todo_list(&list_id, "舊清單", true).unwrap();
        assert!(store
            .create_widget("home", None, "todo", Some(&list_id))
            .is_err());
    }
}
