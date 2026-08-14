use crate::storage::WorkspaceStore;
use rusqlite::{params, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use std::{
    collections::{HashMap, HashSet},
    time::{SystemTime, UNIX_EPOCH},
};

const UNDO_LIMIT: usize = 20;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Page {
    pub id: String,
    pub name: String,
    pub symbol: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardCard {
    pub id: String,
    pub page_id: String,
    pub parent_group_id: Option<String>,
    pub card_type: String,
    pub target_id: Option<String>,
    pub title: String,
    pub subtitle: String,
    pub kind: String,
    pub symbol: String,
    pub tone: String,
    pub size: String,
    pub position: i64,
    pub note_text: String,
    pub resume_note: String,
    pub launch_enabled: bool,
    pub last_opened_at: Option<String>,
    #[serde(default)]
    pub widget_kind: Option<String>,
    #[serde(default)]
    pub widget_resource_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DashboardState {
    pub pages: Vec<Page>,
    pub cards: Vec<DashboardCard>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct GroupLaunchItem {
    pub card_id: String,
    pub title: String,
    pub target_kind: String,
    pub locator: String,
    pub launch_enabled: bool,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CardMutation {
    pub title: Option<String>,
    pub subtitle: Option<String>,
    pub symbol: Option<String>,
    pub tone: Option<String>,
    pub size: Option<String>,
}

#[derive(Clone, Debug)]
struct CardLocation {
    id: String,
    page_id: String,
    parent_group_id: Option<String>,
    card_type: String,
    position: i64,
}

impl WorkspaceStore {
    pub fn get_dashboard(&self) -> Result<DashboardState, String> {
        let connection = self.lock()?;
        load_dashboard(&connection)
    }

    pub fn update_dashboard_card(
        &self,
        card_id: &str,
        update: CardMutation,
    ) -> Result<DashboardState, String> {
        validate_card_mutation(&update)?;
        self.mutate_with_undo(|transaction| {
            let changed = transaction
                .execute(
                    "UPDATE cards SET
                         title = COALESCE(?2, title),
                         subtitle = COALESCE(?3, subtitle),
                         symbol = COALESCE(?4, symbol),
                         tone = COALESCE(?5, tone),
                         size = COALESCE(?6, size)
                     WHERE id = ?1",
                    params![
                        card_id,
                        update.title,
                        update.subtitle,
                        update.symbol,
                        update.tone,
                        update.size,
                    ],
                )
                .map_err(|error| format!("無法更新卡片：{error}"))?;
            if changed == 0 {
                return Err("找不到要更新的卡片。".to_string());
            }
            Ok(())
        })
    }

    pub fn move_cards(
        &self,
        card_ids: &[String],
        destination_page_id: &str,
        destination_group_id: Option<&str>,
        target_index: usize,
    ) -> Result<DashboardState, String> {
        if card_ids.is_empty() {
            return Err("請至少選擇一張卡片。".to_string());
        }
        let requested = card_ids.to_vec();
        self.mutate_with_undo(|transaction| {
            ensure_page(transaction, destination_page_id)?;
            let all_cards = load_card_locations(transaction)?;
            let by_id = all_cards
                .iter()
                .map(|card| (card.id.as_str(), card))
                .collect::<HashMap<_, _>>();
            let mut seen = HashSet::<String>::new();
            let mut selected = Vec::new();
            for card_id in &requested {
                if !seen.insert(card_id.clone()) {
                    continue;
                }
                let card = by_id
                    .get(card_id.as_str())
                    .ok_or_else(|| format!("找不到卡片 {card_id}。"))?;
                selected.push((*card).clone());
            }
            for card in &selected {
                if let Some(parent) = &card.parent_group_id {
                    if seen.contains(parent) {
                        return Err("不可同時移動群組與群組內的卡片。".to_string());
                    }
                }
            }

            let destination_group = if let Some(group_id) = destination_group_id {
                let group = by_id
                    .get(group_id)
                    .ok_or_else(|| "找不到目標群組。".to_string())?;
                if group.card_type != "group" || group.parent_group_id.is_some() {
                    return Err("目標不是可用的頂層群組。".to_string());
                }
                if group.page_id != destination_page_id {
                    return Err("群組與目標頁面不一致。".to_string());
                }
                if seen.contains(group_id) {
                    return Err("不可將群組移入自己。".to_string());
                }
                Some(group_id.to_string())
            } else {
                None
            };
            if destination_group.is_some() && selected.iter().any(|card| card.card_type == "group")
            {
                return Err("群組不可放入另一個群組。".to_string());
            }

            let selected_ids = selected
                .iter()
                .map(|card| card.id.as_str())
                .collect::<HashSet<_>>();
            let mut destination_order = all_cards
                .iter()
                .filter(|card| {
                    card.page_id == destination_page_id
                        && card.parent_group_id == destination_group
                        && !selected_ids.contains(card.id.as_str())
                })
                .collect::<Vec<_>>();
            destination_order.sort_by_key(|card| (card.position, card.id.as_str()));
            let mut destination_ids = destination_order
                .into_iter()
                .map(|card| card.id.clone())
                .collect::<Vec<_>>();
            let insertion = target_index.min(destination_ids.len());
            for (offset, card) in selected.iter().enumerate() {
                destination_ids.insert(insertion + offset, card.id.clone());
            }

            let mut source_containers = HashSet::new();
            for card in &selected {
                source_containers.insert((card.page_id.clone(), card.parent_group_id.clone()));
                transaction
                    .execute(
                        "UPDATE cards SET page_id = ?2, parent_group_id = ?3 WHERE id = ?1",
                        params![card.id, destination_page_id, destination_group],
                    )
                    .map_err(|error| format!("無法移動卡片 {}：{error}", card.id))?;
                if card.card_type == "group" && card.page_id != destination_page_id {
                    transaction
                        .execute(
                            "UPDATE cards SET page_id = ?2 WHERE parent_group_id = ?1",
                            params![card.id, destination_page_id],
                        )
                        .map_err(|error| format!("無法同步群組內容頁面：{error}"))?;
                }
            }

            for (page_id, parent_group_id) in source_containers {
                if page_id == destination_page_id && parent_group_id == destination_group {
                    continue;
                }
                normalize_container(transaction, &page_id, parent_group_id.as_deref())?;
            }
            set_container_order(transaction, &destination_ids)?;
            Ok(())
        })
    }

    pub fn delete_cards(&self, card_ids: &[String]) -> Result<DashboardState, String> {
        if card_ids.is_empty() {
            return Err("請至少選擇一張卡片。".to_string());
        }
        let ids = card_ids.to_vec();
        self.mutate_with_undo(|transaction| {
            let locations = load_card_locations(transaction)?;
            let found = locations
                .iter()
                .filter(|card| ids.contains(&card.id))
                .count();
            if found != ids.iter().collect::<HashSet<_>>().len() {
                return Err("部分卡片已不存在，未進行刪除。".to_string());
            }
            for card_id in &ids {
                transaction
                    .execute("DELETE FROM cards WHERE id = ?1", [card_id])
                    .map_err(|error| format!("無法刪除卡片：{error}"))?;
            }
            normalize_all_containers(transaction)?;
            cleanup_orphan_targets(transaction)?;
            Ok(())
        })
    }

    pub fn create_group(
        &self,
        page_id: &str,
        card_ids: &[String],
    ) -> Result<(DashboardState, String), String> {
        if card_ids.len() < 2 {
            return Err("建立群組至少需要兩張卡片。".to_string());
        }
        let group_id = unique_id("group");
        let selected_ids = card_ids.to_vec();
        let result = self.mutate_with_undo(|transaction| {
            ensure_page(transaction, page_id)?;
            let all_cards = load_card_locations(transaction)?;
            let selected_set = selected_ids.iter().collect::<HashSet<_>>();
            let mut selected = all_cards
                .iter()
                .filter(|card| selected_set.contains(&card.id))
                .cloned()
                .collect::<Vec<_>>();
            if selected.len() != selected_set.len() {
                return Err("部分選取卡片已不存在。".to_string());
            }
            if selected.iter().any(|card| {
                card.page_id != page_id
                    || card.parent_group_id.is_some()
                    || card.card_type == "group"
            }) {
                return Err("只能將同一頁面的頂層卡片建立為群組。".to_string());
            }
            selected.sort_by_key(|card| (card.position, card.id.clone()));
            let first_position = selected[0].position;

            transaction
                .execute(
                    "INSERT INTO cards(
                         id, page_id, parent_group_id, card_type, target_id,
                         title, subtitle, kind, symbol, tone, size, position,
                         note_text, resume_note, launch_enabled, last_opened_at
                     ) VALUES(?1, ?2, NULL, 'group', NULL,
                              '新群組', '', 'group', '◇', 'violet', 'wide', ?3,
                              '', '', 0, NULL)",
                    params![group_id, page_id, first_position],
                )
                .map_err(|error| format!("無法建立群組：{error}"))?;

            for (position, card) in selected.iter().enumerate() {
                transaction
                    .execute(
                        "UPDATE cards
                         SET parent_group_id = ?2, position = ?3
                         WHERE id = ?1",
                        params![card.id, group_id, position as i64],
                    )
                    .map_err(|error| format!("無法將卡片移入群組：{error}"))?;
            }
            normalize_container(transaction, page_id, None)?;
            Ok(())
        })?;
        Ok((result, group_id))
    }

    pub fn ungroup(&self, group_id: &str) -> Result<DashboardState, String> {
        let group_id = group_id.to_string();
        self.mutate_with_undo(|transaction| {
            let group = transaction
                .query_row(
                    "SELECT page_id, position, card_type, parent_group_id
                     FROM cards WHERE id = ?1",
                    [&group_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, i64>(1)?,
                            row.get::<_, String>(2)?,
                            row.get::<_, Option<String>>(3)?,
                        ))
                    },
                )
                .optional()
                .map_err(|error| format!("無法讀取群組：{error}"))?
                .ok_or_else(|| "找不到要解散的群組。".to_string())?;
            if group.2 != "group" || group.3.is_some() {
                return Err("指定卡片不是頂層群組。".to_string());
            }
            let mut top_level = container_ids(transaction, &group.0, None)?;
            let group_index = top_level
                .iter()
                .position(|id| id == &group_id)
                .ok_or_else(|| "群組位置已失效。".to_string())?;
            top_level.remove(group_index);
            let children = container_ids(transaction, &group.0, Some(&group_id))?;
            for (offset, child_id) in children.iter().enumerate() {
                top_level.insert(group_index + offset, child_id.clone());
                transaction
                    .execute(
                        "UPDATE cards SET parent_group_id = NULL WHERE id = ?1",
                        [child_id],
                    )
                    .map_err(|error| format!("無法移出群組內容：{error}"))?;
            }
            transaction
                .execute("DELETE FROM cards WHERE id = ?1", [&group_id])
                .map_err(|error| format!("無法解散群組：{error}"))?;
            set_container_order(transaction, &top_level)?;
            Ok(())
        })
    }

    pub fn create_note(
        &self,
        page_id: &str,
        parent_group_id: Option<&str>,
    ) -> Result<(DashboardState, String), String> {
        let note_id = unique_id("note");
        let page_id = page_id.to_string();
        let parent_group_id = parent_group_id.map(str::to_string);
        let result = self.mutate_with_undo(|transaction| {
            ensure_page(transaction, &page_id)?;
            if let Some(group_id) = parent_group_id.as_deref() {
                ensure_top_level_group(transaction, group_id, &page_id)?;
            }
            let position: i64 = transaction
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM cards
                     WHERE page_id = ?1 AND parent_group_id IS ?2",
                    params![page_id, parent_group_id],
                    |row| row.get(0),
                )
                .map_err(|error| format!("無法計算筆記位置：{error}"))?;
            transaction
                .execute(
                    "INSERT INTO cards(
                         id, page_id, parent_group_id, card_type, target_id,
                         title, subtitle, kind, symbol, tone, size, position,
                         note_text, resume_note, launch_enabled, last_opened_at
                     ) VALUES(?1, ?2, ?3, 'note', NULL,
                              '新筆記', '純文字筆記', 'note', '≡', 'amber', 'wide', ?4,
                              '', '', 0, NULL)",
                    params![note_id, page_id, parent_group_id, position],
                )
                .map_err(|error| format!("無法新增筆記：{error}"))?;
            Ok(())
        })?;
        Ok((result, note_id))
    }

    pub fn update_note_text(
        &self,
        card_id: &str,
        note_text: &str,
    ) -> Result<DashboardState, String> {
        if note_text.chars().count() > 10_000 {
            return Err("筆記內容不可超過 10,000 個字。".to_string());
        }
        self.mutate_content(|transaction| {
            let changed = transaction
                .execute(
                    "UPDATE cards SET note_text = ?2 WHERE id = ?1 AND card_type = 'note'",
                    params![card_id, note_text],
                )
                .map_err(|error| format!("無法保存筆記：{error}"))?;
            if changed == 0 {
                return Err("找不到要保存的筆記。".to_string());
            }
            Ok(())
        })
    }

    pub fn update_group_resume_note(
        &self,
        group_id: &str,
        resume_note: &str,
    ) -> Result<DashboardState, String> {
        if resume_note.chars().count() > 2_000 {
            return Err("最近狀態不可超過 2,000 個字。".to_string());
        }
        self.mutate_content(|transaction| {
            let changed = transaction
                .execute(
                    "UPDATE cards SET resume_note = ?2
                     WHERE id = ?1 AND card_type = 'group' AND parent_group_id IS NULL",
                    params![group_id, resume_note],
                )
                .map_err(|error| format!("無法保存最近狀態：{error}"))?;
            if changed == 0 {
                return Err("找不到要保存的群組。".to_string());
            }
            Ok(())
        })
    }

    pub fn set_launch_enabled(
        &self,
        card_id: &str,
        enabled: bool,
        allow_risky: bool,
    ) -> Result<DashboardState, String> {
        self.mutate_with_undo(|transaction| {
            let candidate = transaction
                .query_row(
                    "SELECT c.card_type, c.parent_group_id, t.kind, t.locator
                     FROM cards c LEFT JOIN targets t ON t.id = c.target_id
                     WHERE c.id = ?1",
                    [card_id],
                    |row| {
                        Ok((
                            row.get::<_, String>(0)?,
                            row.get::<_, Option<String>>(1)?,
                            row.get::<_, Option<String>>(2)?,
                            row.get::<_, Option<String>>(3)?,
                        ))
                    },
                )
                .optional()
                .map_err(|error| format!("無法讀取啟動項目：{error}"))?
                .ok_or_else(|| "找不到要設定的卡片。".to_string())?;
            if candidate.0 != "target" || candidate.1.is_none() {
                return Err("只有群組內的可開啟卡片能加入一次開啟。".to_string());
            }
            if enabled
                && !allow_risky
                && candidate.2.as_deref() == Some("local")
                && candidate.3.as_deref().is_some_and(|locator| {
                    crate::ingest::is_risky_launch_path(std::path::Path::new(locator))
                })
            {
                return Err("riskyConfirmationRequired".to_string());
            }
            transaction
                .execute(
                    "UPDATE cards SET launch_enabled = ?2 WHERE id = ?1",
                    params![card_id, enabled],
                )
                .map_err(|error| format!("無法更新一次開啟清單：{error}"))?;
            Ok(())
        })
    }

    pub fn group_launch_items(&self, group_id: &str) -> Result<Vec<GroupLaunchItem>, String> {
        let connection = self.lock()?;
        let group_exists: bool = connection
            .query_row(
                "SELECT EXISTS(
                     SELECT 1 FROM cards
                     WHERE id = ?1 AND card_type = 'group' AND parent_group_id IS NULL
                 )",
                [group_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法確認群組：{error}"))?;
        if !group_exists {
            return Err("找不到要開啟的群組。".to_string());
        }
        let mut statement = connection
            .prepare(
                "SELECT c.id, c.title, t.kind, t.locator, c.launch_enabled
                 FROM cards c
                 JOIN targets t ON t.id = c.target_id
                 WHERE c.parent_group_id = ?1 AND c.card_type = 'target'
                 ORDER BY c.position, c.id",
            )
            .map_err(|error| format!("無法準備群組啟動清單：{error}"))?;
        let items = statement
            .query_map([group_id], |row| {
                Ok(GroupLaunchItem {
                    card_id: row.get(0)?,
                    title: row.get(1)?,
                    target_kind: row.get(2)?,
                    locator: row.get(3)?,
                    launch_enabled: row.get(4)?,
                })
            })
            .map_err(|error| format!("無法讀取群組啟動清單：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("無法整理群組啟動清單：{error}"))?;
        Ok(items)
    }

    pub fn mark_group_opened(&self, group_id: &str) -> Result<(), String> {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|error| format!("無法建立使用時間：{error}"))?
            .as_secs()
            .to_string();
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始群組狀態交易：{error}"))?;
        let changed = transaction
            .execute(
                "UPDATE cards SET last_opened_at = ?2
                 WHERE id = ?1 AND card_type = 'group' AND parent_group_id IS NULL",
                params![group_id, timestamp],
            )
            .map_err(|error| format!("無法記錄群組使用時間：{error}"))?;
        if changed == 0 {
            return Err("找不到要記錄的群組。".to_string());
        }
        transaction
            .commit()
            .map_err(|error| format!("無法完成群組狀態交易：{error}"))
    }

    pub fn create_page(&self) -> Result<DashboardState, String> {
        let page_id = unique_id("page");
        self.mutate_with_undo(|transaction| {
            let position: i64 = transaction
                .query_row(
                    "SELECT COALESCE(MAX(position), -1) + 1 FROM pages",
                    [],
                    |row| row.get(0),
                )
                .map_err(|error| format!("無法計算新頁面位置：{error}"))?;
            transaction
                .execute(
                    "INSERT INTO pages(id, name, symbol, position) VALUES(?1, '新頁面', '○', ?2)",
                    params![page_id, position],
                )
                .map_err(|error| format!("無法新增頁面：{error}"))?;
            Ok(())
        })
    }

    pub fn update_page(
        &self,
        page_id: &str,
        name: &str,
        symbol: &str,
    ) -> Result<DashboardState, String> {
        let name = name.trim();
        if name.is_empty() || name.chars().count() > 60 {
            return Err("頁面名稱需要是 1 到 60 個字。".to_string());
        }
        if symbol.trim().is_empty() || symbol.chars().count() > 4 {
            return Err("請選擇有效的頁面符號。".to_string());
        }
        self.mutate_with_undo(|transaction| {
            let changed = transaction
                .execute(
                    "UPDATE pages SET name = ?2, symbol = ?3 WHERE id = ?1",
                    params![page_id, name, symbol],
                )
                .map_err(|error| format!("無法更新頁面：{error}"))?;
            if changed == 0 {
                return Err("找不到要更新的頁面。".to_string());
            }
            Ok(())
        })
    }

    pub fn move_page(&self, page_id: &str, direction: i32) -> Result<DashboardState, String> {
        if !matches!(direction, -1 | 1) {
            return Err("頁面移動方向無效。".to_string());
        }
        self.mutate_with_undo(|transaction| {
            let mut pages = load_page_ids(transaction)?;
            let Some(index) = pages.iter().position(|id| id == page_id) else {
                return Err("找不到要移動的頁面。".to_string());
            };
            let next = index as i32 + direction;
            if next < 0 || next >= pages.len() as i32 {
                return Err("頁面已經在最前或最後。".to_string());
            }
            pages.swap(index, next as usize);
            for (position, id) in pages.iter().enumerate() {
                transaction
                    .execute(
                        "UPDATE pages SET position = ?2 WHERE id = ?1",
                        params![id, position as i64],
                    )
                    .map_err(|error| format!("無法調整頁面順序：{error}"))?;
            }
            Ok(())
        })
    }

    pub fn reorder_page(
        &self,
        page_id: &str,
        target_index: usize,
    ) -> Result<DashboardState, String> {
        self.mutate_with_undo(|transaction| {
            let mut pages = load_page_ids(transaction)?;
            let Some(current_index) = pages.iter().position(|id| id == page_id) else {
                return Err("找不到要移動的頁面。".to_string());
            };
            if target_index >= pages.len() {
                return Err("頁面放置位置無效。".to_string());
            }
            if current_index == target_index {
                return Ok(());
            }
            let page = pages.remove(current_index);
            pages.insert(target_index, page);
            for (position, id) in pages.iter().enumerate() {
                transaction
                    .execute(
                        "UPDATE pages SET position = ?2 WHERE id = ?1",
                        params![id, position as i64],
                    )
                    .map_err(|error| format!("無法拖曳調整頁面順序：{error}"))?;
            }
            Ok(())
        })
    }

    pub fn delete_page(&self, page_id: &str) -> Result<DashboardState, String> {
        self.mutate_with_undo(|transaction| {
            let count: i64 = transaction
                .query_row("SELECT COUNT(*) FROM pages", [], |row| row.get(0))
                .map_err(|error| format!("無法確認頁面數量：{error}"))?;
            if count <= 1 {
                return Err("至少需要保留一個頁面。".to_string());
            }
            let changed = transaction
                .execute("DELETE FROM pages WHERE id = ?1", [page_id])
                .map_err(|error| format!("無法刪除頁面：{error}"))?;
            if changed == 0 {
                return Err("找不到要刪除的頁面。".to_string());
            }
            for (position, id) in load_page_ids(transaction)?.iter().enumerate() {
                transaction
                    .execute(
                        "UPDATE pages SET position = ?2 WHERE id = ?1",
                        params![id, position as i64],
                    )
                    .map_err(|error| format!("無法整理頁面順序：{error}"))?;
            }
            cleanup_orphan_targets(transaction)?;
            Ok(())
        })
    }

    pub fn undo_last(&self) -> Result<DashboardState, String> {
        let snapshot_json = {
            let history = self
                .undo_history
                .lock()
                .map_err(|_| "Undo 暫時無法使用。".to_string())?;
            history
                .last()
                .cloned()
                .ok_or_else(|| "目前沒有可以復原的操作。".to_string())?
        };
        let snapshot: DashboardState = serde_json::from_str(&snapshot_json)
            .map_err(|error| format!("無法讀取 Undo 狀態：{error}"))?;
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始復原交易：{error}"))?;
        write_dashboard(&transaction, &snapshot)?;
        transaction
            .commit()
            .map_err(|error| format!("無法完成復原：{error}"))?;
        let restored = load_dashboard(&connection)?;
        drop(connection);
        let mut history = self
            .undo_history
            .lock()
            .map_err(|_| "Undo 暫時無法使用。".to_string())?;
        history.pop();
        Ok(restored)
    }

    pub(crate) fn mutate_with_undo<F>(&self, operation: F) -> Result<DashboardState, String>
    where
        F: FnOnce(&Transaction<'_>) -> Result<(), String>,
    {
        let mut connection = self.lock()?;
        let before = load_dashboard(&connection)?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始資料交易：{error}"))?;
        operation(&transaction)?;
        transaction
            .commit()
            .map_err(|error| format!("無法完成資料交易：{error}"))?;
        let after = load_dashboard(&connection)?;
        drop(connection);
        let snapshot = serde_json::to_string(&before)
            .map_err(|error| format!("無法建立 Undo 狀態：{error}"))?;
        let mut history = self
            .undo_history
            .lock()
            .map_err(|_| "Undo 暫時無法使用。".to_string())?;
        history.push(snapshot);
        if history.len() > UNDO_LIMIT {
            history.remove(0);
        }
        Ok(after)
    }

    pub(crate) fn mutate_content<F>(&self, operation: F) -> Result<DashboardState, String>
    where
        F: FnOnce(&Transaction<'_>) -> Result<(), String>,
    {
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始內容保存交易：{error}"))?;
        operation(&transaction)?;
        transaction
            .commit()
            .map_err(|error| format!("無法完成內容保存：{error}"))?;
        load_dashboard(&connection)
    }
}

fn validate_card_mutation(update: &CardMutation) -> Result<(), String> {
    if let Some(title) = &update.title {
        let count = title.trim().chars().count();
        if count == 0 || count > 120 {
            return Err("卡片名稱需要是 1 到 120 個字。".to_string());
        }
    }
    if update
        .subtitle
        .as_ref()
        .is_some_and(|value| value.chars().count() > 240)
    {
        return Err("卡片副標題不可超過 240 個字。".to_string());
    }
    if update
        .tone
        .as_deref()
        .is_some_and(|tone| !matches!(tone, "cyan" | "violet" | "amber" | "rose" | "slate"))
    {
        return Err("卡片色調無效。".to_string());
    }
    if update
        .size
        .as_deref()
        .is_some_and(|size| !matches!(size, "square" | "wide"))
    {
        return Err("卡片尺寸無效。".to_string());
    }
    Ok(())
}

fn ensure_page(transaction: &Transaction<'_>, page_id: &str) -> Result<(), String> {
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pages WHERE id = ?1)",
            [page_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("無法確認頁面：{error}"))?;
    exists
        .then_some(())
        .ok_or_else(|| "找不到目標頁面。".to_string())
}

fn ensure_top_level_group(
    transaction: &Transaction<'_>,
    group_id: &str,
    page_id: &str,
) -> Result<(), String> {
    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(
                 SELECT 1 FROM cards
                 WHERE id = ?1 AND page_id = ?2 AND card_type = 'group'
                   AND parent_group_id IS NULL
             )",
            params![group_id, page_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("無法確認群組：{error}"))?;
    exists
        .then_some(())
        .ok_or_else(|| "找不到目標群組。".to_string())
}

pub(crate) fn load_dashboard(connection: &Connection) -> Result<DashboardState, String> {
    let mut page_statement = connection
        .prepare("SELECT id, name, symbol FROM pages ORDER BY position, id")
        .map_err(|error| format!("無法準備頁面查詢：{error}"))?;
    let pages = page_statement
        .query_map([], |row| {
            Ok(Page {
                id: row.get(0)?,
                name: row.get(1)?,
                symbol: row.get(2)?,
            })
        })
        .map_err(|error| format!("無法讀取頁面：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理頁面：{error}"))?;

    let mut card_statement = connection
        .prepare(
            "SELECT id, page_id, parent_group_id, card_type, target_id,
                    title, subtitle, kind, symbol, tone, size, position,
                    note_text, resume_note, launch_enabled, last_opened_at,
                    widget_kind, widget_resource_id
             FROM cards
             ORDER BY page_id, CASE WHEN parent_group_id IS NULL THEN 0 ELSE 1 END,
                      parent_group_id, position, id",
        )
        .map_err(|error| format!("無法準備卡片查詢：{error}"))?;
    let cards = card_statement
        .query_map([], |row| {
            Ok(DashboardCard {
                id: row.get(0)?,
                page_id: row.get(1)?,
                parent_group_id: row.get(2)?,
                card_type: row.get(3)?,
                target_id: row.get(4)?,
                title: row.get(5)?,
                subtitle: row.get(6)?,
                kind: row.get(7)?,
                symbol: row.get(8)?,
                tone: row.get(9)?,
                size: row.get(10)?,
                position: row.get(11)?,
                note_text: row.get(12)?,
                resume_note: row.get(13)?,
                launch_enabled: row.get(14)?,
                last_opened_at: row.get(15)?,
                widget_kind: row.get(16)?,
                widget_resource_id: row.get(17)?,
            })
        })
        .map_err(|error| format!("無法讀取卡片：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理卡片：{error}"))?;
    Ok(DashboardState { pages, cards })
}

fn load_card_locations(connection: &Connection) -> Result<Vec<CardLocation>, String> {
    let mut statement = connection
        .prepare(
            "SELECT id, page_id, parent_group_id, card_type, position
             FROM cards ORDER BY position, id",
        )
        .map_err(|error| format!("無法準備卡片位置查詢：{error}"))?;
    let result = statement
        .query_map([], |row| {
            Ok(CardLocation {
                id: row.get(0)?,
                page_id: row.get(1)?,
                parent_group_id: row.get(2)?,
                card_type: row.get(3)?,
                position: row.get(4)?,
            })
        })
        .map_err(|error| format!("無法讀取卡片位置：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理卡片位置：{error}"));
    result
}

fn load_page_ids(connection: &Connection) -> Result<Vec<String>, String> {
    let mut statement = connection
        .prepare("SELECT id FROM pages ORDER BY position, id")
        .map_err(|error| format!("無法準備頁面順序查詢：{error}"))?;
    let result = statement
        .query_map([], |row| row.get(0))
        .map_err(|error| format!("無法讀取頁面順序：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理頁面順序：{error}"));
    result
}

fn container_ids(
    transaction: &Transaction<'_>,
    page_id: &str,
    parent_group_id: Option<&str>,
) -> Result<Vec<String>, String> {
    let mut statement = transaction
        .prepare(
            "SELECT id FROM cards
             WHERE page_id = ?1 AND parent_group_id IS ?2
             ORDER BY position, id",
        )
        .map_err(|error| format!("無法準備卡片順序查詢：{error}"))?;
    let result = statement
        .query_map(params![page_id, parent_group_id], |row| row.get(0))
        .map_err(|error| format!("無法讀取卡片順序：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理卡片順序：{error}"));
    result
}

fn set_container_order(transaction: &Transaction<'_>, card_ids: &[String]) -> Result<(), String> {
    for (position, card_id) in card_ids.iter().enumerate() {
        transaction
            .execute(
                "UPDATE cards SET position = ?2 WHERE id = ?1",
                params![card_id, position as i64],
            )
            .map_err(|error| format!("無法更新卡片順序：{error}"))?;
    }
    Ok(())
}

fn normalize_container(
    transaction: &Transaction<'_>,
    page_id: &str,
    parent_group_id: Option<&str>,
) -> Result<(), String> {
    let ids = container_ids(transaction, page_id, parent_group_id)?;
    set_container_order(transaction, &ids)
}

fn normalize_all_containers(transaction: &Transaction<'_>) -> Result<(), String> {
    for page_id in load_page_ids(transaction)? {
        normalize_container(transaction, &page_id, None)?;
        let groups = transaction
            .prepare("SELECT id FROM cards WHERE page_id = ?1 AND card_type = 'group'")
            .and_then(|mut statement| {
                statement
                    .query_map([&page_id], |row| row.get::<_, String>(0))?
                    .collect::<Result<Vec<_>, _>>()
            })
            .map_err(|error| format!("無法讀取群組：{error}"))?;
        for group_id in groups {
            normalize_container(transaction, &page_id, Some(&group_id))?;
        }
    }
    Ok(())
}

fn cleanup_orphan_targets(transaction: &Transaction<'_>) -> Result<(), String> {
    transaction
        .execute(
            "DELETE FROM targets
             WHERE NOT EXISTS(SELECT 1 FROM cards WHERE cards.target_id = targets.id)",
            [],
        )
        .map(|_| ())
        .map_err(|error| format!("無法清理未使用的啟動目標：{error}"))
}

pub(crate) fn write_dashboard(
    transaction: &Transaction<'_>,
    dashboard: &DashboardState,
) -> Result<(), String> {
    if dashboard.pages.is_empty() {
        return Err("工作台至少需要保留一個頁面。".to_string());
    }
    transaction
        .execute("DELETE FROM cards", [])
        .map_err(|error| format!("無法準備復原卡片：{error}"))?;
    transaction
        .execute("DELETE FROM pages", [])
        .map_err(|error| format!("無法準備復原頁面：{error}"))?;
    for (position, page) in dashboard.pages.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO pages(id, name, symbol, position) VALUES(?1, ?2, ?3, ?4)",
                params![page.id, page.name, page.symbol, position as i64],
            )
            .map_err(|error| format!("無法復原頁面：{error}"))?;
    }
    for child_pass in [false, true] {
        for card in dashboard
            .cards
            .iter()
            .filter(|card| card.parent_group_id.is_some() == child_pass)
        {
            transaction
                .execute(
                    "INSERT INTO cards(
                         id, page_id, parent_group_id, card_type, target_id,
                         title, subtitle, kind, symbol, tone, size, position,
                          note_text, resume_note, launch_enabled, last_opened_at,
                          widget_kind, widget_resource_id
                     ) VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12,
                               ?13, ?14, ?15, ?16, ?17, ?18)",
                    params![
                        card.id,
                        card.page_id,
                        card.parent_group_id,
                        card.card_type,
                        card.target_id,
                        card.title,
                        card.subtitle,
                        card.kind,
                        card.symbol,
                        card.tone,
                        card.size,
                        card.position,
                        card.note_text,
                        card.resume_note,
                        card.launch_enabled,
                        card.last_opened_at,
                        card.widget_kind,
                        card.widget_resource_id,
                    ],
                )
                .map_err(|error| format!("無法復原卡片 {}：{error}", card.title))?;
        }
    }
    Ok(())
}

pub(crate) fn unique_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_nanos())
        .unwrap_or_default();
    format!("{prefix}-{nanos}-{}", std::process::id())
}

#[cfg(test)]
mod tests {
    use crate::storage::{InsertItemResult, LauncherItem, WorkspaceStore};
    use std::{
        collections::HashMap,
        fs,
        path::Path,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    fn seeded_store() -> WorkspaceStore {
        let store = WorkspaceStore::in_memory().expect("create store");
        store
            .initialize(
                None,
                &HashMap::new(),
                Path::new("missing-registry"),
                Path::new("backups"),
            )
            .expect("initialize store");
        for (position, id) in ["one", "two", "three"].iter().enumerate() {
            let item = LauncherItem {
                id: format!("card-{id}"),
                workspace_id: "home".to_string(),
                title: id.to_string(),
                subtitle: "桌面應用程式".to_string(),
                kind: "local".to_string(),
                target: format!("target-{id}"),
                symbol: "◆".to_string(),
                tone: "violet".to_string(),
                size: if position == 0 { "wide" } else { "square" }.to_string(),
            };
            assert!(matches!(
                store
                    .insert_ingested_item(&item, "local", &format!("C:\\{id}.exe"), false)
                    .expect("insert item"),
                InsertItemResult::Added(_)
            ));
        }
        store
    }

    #[test]
    fn group_preserves_selected_order_and_ungroup_restores_it() {
        let store = seeded_store();
        let (grouped, group_id) = store
            .create_group(
                "home",
                &[
                    "card-one".to_string(),
                    "card-two".to_string(),
                    "card-three".to_string(),
                ],
            )
            .expect("create group");
        let group = grouped
            .cards
            .iter()
            .find(|card| card.id == group_id)
            .unwrap();
        assert_eq!(group.position, 0);
        let children = grouped
            .cards
            .iter()
            .filter(|card| card.parent_group_id.as_deref() == Some(&group_id))
            .map(|card| (card.position, card.id.as_str()))
            .collect::<Vec<_>>();
        assert_eq!(
            children,
            vec![(0, "card-one"), (1, "card-two"), (2, "card-three")]
        );

        let ungrouped = store.ungroup(&group_id).expect("ungroup");
        let order = ungrouped
            .cards
            .iter()
            .filter(|card| card.parent_group_id.is_none())
            .map(|card| card.id.as_str())
            .collect::<Vec<_>>();
        assert_eq!(order, vec!["card-one", "card-two", "card-three"]);
    }

    #[test]
    fn dashboard_with_two_hundred_cards_loads_within_the_performance_budget() {
        let store = WorkspaceStore::in_memory().expect("create store");
        store
            .initialize(
                None,
                &HashMap::new(),
                Path::new("missing-registry"),
                Path::new("backups"),
            )
            .expect("initialize store");
        for index in 0..200 {
            let item = LauncherItem {
                id: format!("performance-card-{index}"),
                workspace_id: "home".to_string(),
                title: format!("Performance {index}"),
                subtitle: "桌面應用程式".to_string(),
                kind: "local".to_string(),
                target: format!("performance-target-{index}"),
                symbol: "◆".to_string(),
                tone: "cyan".to_string(),
                size: "square".to_string(),
            };
            store
                .insert_ingested_item(
                    &item,
                    "local",
                    &format!("C:\\Performance\\{index}.exe"),
                    false,
                )
                .expect("insert performance card");
        }

        let started = Instant::now();
        let dashboard = store.get_dashboard().expect("load dashboard");
        assert_eq!(dashboard.cards.len(), 200);
        assert!(started.elapsed() < Duration::from_secs(1));
    }

    #[test]
    fn group_cannot_be_nested_and_create_can_be_undone() {
        let store = seeded_store();
        let (_, group_id) = store
            .create_group("home", &["card-one".to_string(), "card-two".to_string()])
            .expect("create group");
        assert!(store
            .move_cards(std::slice::from_ref(&group_id), "home", Some(&group_id), 0)
            .is_err());

        let restored = store.undo_last().expect("undo group creation");
        assert!(restored.cards.iter().all(|card| card.card_type == "target"));
        assert!(restored
            .cards
            .iter()
            .all(|card| card.parent_group_id.is_none()));
    }

    #[test]
    fn moving_group_to_another_page_updates_all_children_atomically() {
        let store = seeded_store();
        let (_, group_id) = store
            .create_group("home", &["card-one".to_string(), "card-two".to_string()])
            .expect("create group");
        let with_page = store.create_page().expect("create page");
        let destination = with_page
            .pages
            .iter()
            .find(|page| page.id != "home")
            .unwrap()
            .id
            .clone();
        let moved = store
            .move_cards(std::slice::from_ref(&group_id), &destination, None, 0)
            .expect("move group");
        assert!(
            moved
                .cards
                .iter()
                .filter(|card| card.id == group_id
                    || card.parent_group_id.as_deref() == Some(&group_id))
                .all(|card| card.page_id == destination)
        );
    }

    #[test]
    fn last_page_cannot_be_deleted() {
        let store = seeded_store();
        assert!(store.delete_page("home").is_err());
        assert_eq!(store.get_dashboard().unwrap().pages.len(), 1);
    }

    #[test]
    fn page_can_be_reordered_to_an_exact_drop_position_and_undone() {
        let store = seeded_store();
        store.create_page().expect("create second page");
        let before = store.create_page().expect("create third page");
        let last_id = before.pages.last().expect("last page").id.clone();

        let reordered = store.reorder_page(&last_id, 0).expect("reorder page");
        assert_eq!(reordered.pages[0].id, last_id);

        let restored = store.undo_last().expect("undo page reorder");
        assert_eq!(restored.pages.last().expect("last page").id, last_id);
    }

    #[test]
    fn note_can_live_in_group_and_content_limits_are_enforced() {
        let store = seeded_store();
        let (_, group_id) = store
            .create_group("home", &["card-one".to_string(), "card-two".to_string()])
            .expect("create group");
        let (dashboard, note_id) = store
            .create_note("home", Some(&group_id))
            .expect("create note");
        let note = dashboard
            .cards
            .iter()
            .find(|card| card.id == note_id)
            .expect("note exists");
        assert_eq!(note.card_type, "note");
        assert_eq!(note.parent_group_id.as_deref(), Some(group_id.as_str()));
        assert!(!note.launch_enabled);

        let saved = store
            .update_note_text(&note_id, "角色移動完成")
            .expect("save note");
        assert_eq!(
            saved
                .cards
                .iter()
                .find(|card| card.id == note_id)
                .unwrap()
                .note_text,
            "角色移動完成"
        );
        assert!(store
            .update_note_text(&note_id, &"界".repeat(10_001))
            .is_err());
    }

    #[test]
    fn resume_note_is_plain_text_bounded_and_persisted() {
        let store = seeded_store();
        let (_, group_id) = store
            .create_group("home", &["card-one".to_string(), "card-two".to_string()])
            .expect("create group");
        let saved = store
            .update_group_resume_note(&group_id, "上次做到角色移動")
            .expect("save resume");
        assert_eq!(
            saved
                .cards
                .iter()
                .find(|card| card.id == group_id)
                .unwrap()
                .resume_note,
            "上次做到角色移動"
        );
        assert!(store
            .update_group_resume_note(&group_id, &"界".repeat(2_001))
            .is_err());
    }

    #[test]
    fn launch_set_only_accepts_group_targets_and_risky_files_need_confirmation() {
        let store = seeded_store();
        let risky = LauncherItem {
            id: "card-risky".to_string(),
            workspace_id: "home".to_string(),
            title: "Risky".to_string(),
            subtitle: "Windows script".to_string(),
            kind: "local".to_string(),
            target: "target-risky".to_string(),
            symbol: "!".to_string(),
            tone: "rose".to_string(),
            size: "square".to_string(),
        };
        store
            .insert_ingested_item(&risky, "local", "C:\\Tools\\change.ps1", false)
            .expect("insert risky");
        assert!(store.set_launch_enabled("card-one", true, false).is_err());

        let (_, group_id) = store
            .create_group("home", &["card-one".to_string(), "card-risky".to_string()])
            .expect("create group");
        assert_eq!(
            store.set_launch_enabled("card-risky", true, false),
            Err("riskyConfirmationRequired".to_string())
        );
        let dashboard = store
            .set_launch_enabled("card-risky", true, true)
            .expect("confirm risky");
        assert!(
            dashboard
                .cards
                .iter()
                .find(|card| card.id == "card-risky")
                .unwrap()
                .launch_enabled
        );
        let items = store.group_launch_items(&group_id).expect("launch items");
        assert_eq!(items.len(), 2);
        assert!(!items[0].launch_enabled);
        assert!(items[1].launch_enabled);
    }

    #[test]
    fn ingest_duplicates_are_scoped_to_the_group_container() {
        let store = seeded_store();
        let (_, group_id) = store
            .create_group("home", &["card-one".to_string(), "card-two".to_string()])
            .expect("create group");
        let item = LauncherItem {
            id: "group-extra".to_string(),
            workspace_id: "home".to_string(),
            title: "Extra".to_string(),
            subtitle: "file".to_string(),
            kind: "local".to_string(),
            target: "target-extra".to_string(),
            symbol: "◆".to_string(),
            tone: "cyan".to_string(),
            size: "square".to_string(),
        };
        assert!(matches!(
            store
                .insert_ingested_item_in_container(
                    &item,
                    Some(&group_id),
                    "local",
                    "C:\\extra.exe",
                    false,
                )
                .expect("insert in group"),
            InsertItemResult::Added(_)
        ));
        let duplicate = LauncherItem {
            id: "group-extra-copy".to_string(),
            ..item.clone()
        };
        assert_eq!(
            store
                .insert_ingested_item_in_container(
                    &duplicate,
                    Some(&group_id),
                    "local",
                    "C:\\extra.exe",
                    false,
                )
                .expect("duplicate check"),
            InsertItemResult::Duplicate
        );
        assert!(matches!(
            store
                .insert_ingested_item(&duplicate, "local", "C:\\extra.exe", false)
                .expect("top level is separate"),
            InsertItemResult::Added(_)
        ));
    }

    #[test]
    fn unity_learning_place_survives_reopen_with_launch_set_and_resume() {
        let root = std::env::temp_dir().join(format!(
            "personal-place-unity-scenario-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("system time")
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create scenario directory");
        let database = root.join("personal-place.db");
        let group_id;

        {
            let store = WorkspaceStore::open(&database).expect("open scenario database");
            store
                .initialize(
                    None,
                    &HashMap::new(),
                    &root.join("missing-registry.json"),
                    &root.join("backups"),
                )
                .expect("initialize scenario database");

            let resources = [
                (
                    "unity",
                    "Unity",
                    "local",
                    r"C:\Program Files\Unity\Unity.exe",
                ),
                (
                    "vscode",
                    "VS Code",
                    "local",
                    r"C:\Program Files\VS Code\Code.exe",
                ),
                (
                    "course",
                    "課程網站",
                    "url",
                    "https://example.com/unity-course",
                ),
                (
                    "github",
                    "GitHub",
                    "url",
                    "https://github.com/example/unity-study",
                ),
                ("project", "專案資料夾", "local", r"C:\Projects\UnityStudy"),
            ];
            let mut card_ids = Vec::new();
            for (position, (id, title, target_kind, locator)) in resources.iter().enumerate() {
                let card_id = format!("unity-{id}");
                let item = LauncherItem {
                    id: card_id.clone(),
                    workspace_id: "home".to_string(),
                    title: (*title).to_string(),
                    subtitle: if *target_kind == "url" {
                        "網站入口".to_string()
                    } else {
                        "本機入口".to_string()
                    },
                    kind: if *target_kind == "url" {
                        "web"
                    } else {
                        "local"
                    }
                    .to_string(),
                    target: format!("unity-target-{position}"),
                    symbol: if *target_kind == "url" { "↗" } else { "◆" }.to_string(),
                    tone: "violet".to_string(),
                    size: "square".to_string(),
                };
                assert!(matches!(
                    store
                        .insert_ingested_item(&item, target_kind, locator, false)
                        .expect("insert Unity scenario resource"),
                    InsertItemResult::Added(_)
                ));
                card_ids.push(card_id);
            }

            group_id = store
                .create_group("home", &card_ids)
                .expect("create Unity learning place")
                .1;
            store
                .update_dashboard_card(
                    &group_id,
                    super::CardMutation {
                        title: Some("Unity 學習".to_string()),
                        ..Default::default()
                    },
                )
                .expect("name Unity learning place");
            for card_id in [&card_ids[0], &card_ids[1], &card_ids[4]] {
                store
                    .set_launch_enabled(card_id, true, false)
                    .expect("enable launch item");
            }
            store
                .update_group_resume_note(&group_id, "上次做到角色移動")
                .expect("save resume note");
        }

        let reopened = WorkspaceStore::open(&database).expect("reopen scenario database");
        let dashboard = reopened.get_dashboard().expect("load reopened scenario");
        let group = dashboard
            .cards
            .iter()
            .find(|card| card.id == group_id)
            .expect("find Unity learning place");
        assert_eq!(group.title, "Unity 學習");
        assert_eq!(group.resume_note, "上次做到角色移動");
        let children = dashboard
            .cards
            .iter()
            .filter(|card| card.parent_group_id.as_deref() == Some(&group_id))
            .collect::<Vec<_>>();
        assert_eq!(children.len(), 5);
        assert_eq!(
            children
                .iter()
                .map(|card| card.title.as_str())
                .collect::<Vec<_>>(),
            vec!["Unity", "VS Code", "課程網站", "GitHub", "專案資料夾"]
        );
        assert_eq!(
            children.iter().filter(|card| card.launch_enabled).count(),
            3
        );
        assert!(children[0].launch_enabled);
        assert!(children[1].launch_enabled);
        assert!(!children[2].launch_enabled);
        assert!(!children[3].launch_enabled);
        assert!(children[4].launch_enabled);

        drop(reopened);
        fs::remove_dir_all(root).expect("remove scenario directory");
    }
}
