use crate::{
    dashboard::{DashboardCard, DashboardState, Page},
    ingest,
    storage::WorkspaceStore,
};
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use std::{collections::HashMap, fs, path::Path};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchResult {
    pub id: String,
    pub result_type: String,
    pub title: String,
    pub subtitle: String,
    pub page_id: String,
    pub page_name: String,
    pub group_id: Option<String>,
    pub group_name: Option<String>,
    pub card_type: Option<String>,
    pub score: u8,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TargetStatus {
    pub card_id: String,
    pub status: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RelinkResult {
    pub dashboard: DashboardState,
    pub old_target_id: String,
    pub new_target_id: String,
}

pub fn search_dashboard(store: &WorkspaceStore, query: &str) -> Result<Vec<SearchResult>, String> {
    let needle = query.trim().to_lowercase();
    if needle.is_empty() {
        return Ok(Vec::new());
    }
    let dashboard = store.get_dashboard()?;
    let pages = dashboard
        .pages
        .iter()
        .map(|page| (page.id.as_str(), page))
        .collect::<HashMap<_, _>>();
    let groups = dashboard
        .cards
        .iter()
        .filter(|card| card.card_type == "group")
        .map(|card| (card.id.as_str(), card))
        .collect::<HashMap<_, _>>();
    let mut results = Vec::new();

    for page in &dashboard.pages {
        if let Some(score) = primary_score(&page.name, &needle) {
            results.push(page_result(page, score));
        }
    }
    for card in &dashboard.cards {
        let Some(page) = pages.get(card.page_id.as_str()) else {
            continue;
        };
        let group = card
            .parent_group_id
            .as_deref()
            .and_then(|group_id| groups.get(group_id).copied());
        let score = primary_score(&card.title, &needle)
            .or_else(|| {
                group
                    .and_then(|group| contains(&group.title, &needle).then_some(3))
                    .or_else(|| contains(&page.name, &needle).then_some(3))
            })
            .or_else(|| {
                (contains(&card.subtitle, &needle)
                    || contains(&card.note_text, &needle)
                    || contains(&card.resume_note, &needle))
                .then_some(4)
            });
        if let Some(score) = score {
            results.push(card_result(card, page, group, score));
        }
    }
    results.sort_by(|left, right| {
        left.score
            .cmp(&right.score)
            .then_with(|| left.title.to_lowercase().cmp(&right.title.to_lowercase()))
            .then_with(|| left.id.cmp(&right.id))
    });
    results.truncate(100);
    Ok(results)
}

pub fn check_targets(
    store: &WorkspaceStore,
    page_id: &str,
    parent_group_id: Option<&str>,
) -> Result<Vec<TargetStatus>, String> {
    let connection = store.lock()?;
    let page_exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM pages WHERE id = ?1)",
            [page_id],
            |row| row.get(0),
        )
        .map_err(|error| format!("無法確認目標頁面：{error}"))?;
    if !page_exists {
        return Err("找不到要檢查的頁面。".to_string());
    }
    if let Some(group_id) = parent_group_id {
        let valid_group: bool = connection
            .query_row(
                "SELECT EXISTS(
                     SELECT 1 FROM cards
                     WHERE id = ?1 AND page_id = ?2 AND card_type = 'group'
                       AND parent_group_id IS NULL
                 )",
                params![group_id, page_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法確認要檢查的群組：{error}"))?;
        if !valid_group {
            return Err("找不到要檢查的群組。".to_string());
        }
    }
    let mut statement = connection
        .prepare(
            "SELECT c.id, t.kind, t.locator
             FROM cards c JOIN targets t ON t.id = c.target_id
             WHERE c.page_id = ?1 AND c.parent_group_id IS ?2 AND c.card_type = 'target'
             ORDER BY c.position, c.id",
        )
        .map_err(|error| format!("無法準備目標狀態查詢：{error}"))?;
    let statuses = statement
        .query_map(params![page_id, parent_group_id], |row| {
            let card_id = row.get::<_, String>(0)?;
            let kind = row.get::<_, String>(1)?;
            let locator = row.get::<_, String>(2)?;
            Ok(TargetStatus {
                card_id,
                status: target_status(&kind, &locator),
            })
        })
        .map_err(|error| format!("無法讀取目標狀態：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理目標狀態：{error}"))?;
    Ok(statuses)
}

pub fn relink_target(
    store: &WorkspaceStore,
    card_id: &str,
    new_path: &Path,
    allow_risky: bool,
) -> Result<RelinkResult, String> {
    let canonical = fs::canonicalize(new_path).map_err(|error| {
        if error.kind() == std::io::ErrorKind::NotFound {
            "找不到重新定位的檔案或資料夾。".to_string()
        } else {
            format!("無法讀取重新定位的路徑：{error}")
        }
    })?;
    if !(canonical.is_file() || canonical.is_dir()) {
        return Err("重新定位的項目不是檔案或資料夾。".to_string());
    }
    if !allow_risky && ingest::is_risky_path(&canonical) {
        return Err("riskyConfirmationRequired".to_string());
    }
    let new_target_id = ingest::target_id_for_path(&canonical);
    let locator = canonical.to_string_lossy().into_owned();
    let mut connection = store.lock()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("無法開始重新定位交易：{error}"))?;
    let (old_target_id, launch_enabled) = transaction
        .query_row(
            "SELECT target_id, launch_enabled FROM cards
             WHERE id = ?1 AND card_type = 'target'",
            [card_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, bool>(1)?)),
        )
        .optional()
        .map_err(|error| format!("無法讀取要重新定位的卡片：{error}"))?
        .ok_or_else(|| "找不到要重新定位的卡片。".to_string())?;
    if launch_enabled && !allow_risky && ingest::is_risky_launch_path(&canonical) {
        return Err("riskyConfirmationRequired".to_string());
    }
    let existing = transaction
        .query_row(
            "SELECT kind, locator FROM targets WHERE id = ?1",
            [&new_target_id],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .optional()
        .map_err(|error| format!("無法確認重新定位目標：{error}"))?;
    if let Some((kind, existing_locator)) = existing {
        if kind != "local"
            || (cfg!(windows) && !existing_locator.eq_ignore_ascii_case(&locator))
            || (!cfg!(windows) && existing_locator != locator)
        {
            return Err("重新定位目標識別發生衝突。".to_string());
        }
    } else {
        transaction
            .execute(
                "INSERT INTO targets(id, kind, locator) VALUES(?1, 'local', ?2)",
                params![new_target_id, locator],
            )
            .map_err(|error| format!("無法保存重新定位目標：{error}"))?;
    }
    transaction
        .execute(
            "UPDATE cards SET target_id = ?2, kind = 'local' WHERE id = ?1",
            params![card_id, new_target_id],
        )
        .map_err(|error| format!("無法更新重新定位卡片：{error}"))?;
    transaction
        .execute(
            "DELETE FROM targets
             WHERE id = ?1 AND NOT EXISTS(SELECT 1 FROM cards WHERE target_id = ?1)",
            [&old_target_id],
        )
        .map_err(|error| format!("無法清理舊啟動目標：{error}"))?;
    transaction
        .commit()
        .map_err(|error| format!("無法完成重新定位交易：{error}"))?;
    let dashboard = crate::dashboard::load_dashboard(&connection)?;
    Ok(RelinkResult {
        dashboard,
        old_target_id,
        new_target_id,
    })
}

fn target_status(kind: &str, locator: &str) -> String {
    match kind {
        "url" => "unknown".to_string(),
        "missing" => "missing".to_string(),
        "local" => match Path::new(locator).try_exists() {
            Ok(true) => "available".to_string(),
            Ok(false) => "missing".to_string(),
            Err(_) => "unavailable".to_string(),
        },
        "builtin" => ingest::built_in_path(locator)
            .and_then(|path| path.try_exists().ok())
            .map(|exists| if exists { "available" } else { "missing" })
            .unwrap_or("unknown")
            .to_string(),
        _ => "unknown".to_string(),
    }
}

fn primary_score(value: &str, needle: &str) -> Option<u8> {
    let normalized = value.to_lowercase();
    if normalized == needle {
        Some(0)
    } else if normalized.starts_with(needle) {
        Some(1)
    } else if normalized.contains(needle) {
        Some(2)
    } else {
        None
    }
}

fn contains(value: &str, needle: &str) -> bool {
    value.to_lowercase().contains(needle)
}

fn page_result(page: &Page, score: u8) -> SearchResult {
    SearchResult {
        id: page.id.clone(),
        result_type: "page".to_string(),
        title: page.name.clone(),
        subtitle: "頁面".to_string(),
        page_id: page.id.clone(),
        page_name: page.name.clone(),
        group_id: None,
        group_name: None,
        card_type: None,
        score,
    }
}

fn card_result(
    card: &DashboardCard,
    page: &Page,
    group: Option<&DashboardCard>,
    score: u8,
) -> SearchResult {
    SearchResult {
        id: card.id.clone(),
        result_type: card.card_type.clone(),
        title: card.title.clone(),
        subtitle: card.subtitle.clone(),
        page_id: page.id.clone(),
        page_name: page.name.clone(),
        group_id: group.map(|group| group.id.clone()),
        group_name: group.map(|group| group.title.clone()),
        card_type: Some(card.card_type.clone()),
        score,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{InsertItemResult, LauncherItem};
    use std::{collections::HashMap, time::SystemTime};

    fn initialized_store() -> WorkspaceStore {
        let store = WorkspaceStore::in_memory().expect("create store");
        store
            .initialize(
                None,
                &HashMap::new(),
                Path::new("missing-registry"),
                Path::new("backups"),
            )
            .expect("initialize");
        store
    }

    fn add_target(store: &WorkspaceStore, id: &str, title: &str, locator: &str) {
        let item = LauncherItem {
            id: id.to_string(),
            workspace_id: "home".to_string(),
            title: title.to_string(),
            subtitle: "桌面應用程式".to_string(),
            kind: "local".to_string(),
            target: format!("target-{id}"),
            symbol: "◆".to_string(),
            tone: "violet".to_string(),
            size: "square".to_string(),
        };
        assert!(matches!(
            store
                .insert_ingested_item(&item, "local", locator, false)
                .expect("insert target"),
            InsertItemResult::Added(_)
        ));
    }

    #[test]
    fn search_ranks_exact_prefix_contains_context_and_note_content() {
        let store = initialized_store();
        add_target(&store, "unity", "Unity", "C:\\Unity.exe");
        add_target(&store, "unity-hub", "Unity Hub", "C:\\UnityHub.exe");
        add_target(&store, "learn-unity", "Learn Unity Today", "C:\\Learn.exe");
        let (_, group_id) = store
            .create_group("home", &["unity".to_string(), "unity-hub".to_string()])
            .expect("create group");
        store
            .update_dashboard_card(
                &group_id,
                crate::dashboard::CardMutation {
                    title: Some("Unity 學習".to_string()),
                    ..Default::default()
                },
            )
            .expect("rename group");
        let (_, note_id) = store
            .create_note("home", Some(&group_id))
            .expect("create note");
        store
            .update_note_text(&note_id, "角色移動使用 Unity Input System")
            .expect("save note");

        let results = search_dashboard(&store, "Unity").expect("search");
        assert_eq!(results[0].title, "Unity");
        assert_eq!(results[0].score, 0);
        assert!(results
            .iter()
            .any(|result| result.title == "Unity Hub" && result.score == 1));
        assert!(results
            .iter()
            .any(|result| result.title == "Learn Unity Today" && result.score == 2));
        assert!(results
            .iter()
            .any(|result| result.id == note_id && result.score == 3));
    }

    #[test]
    fn visible_target_check_distinguishes_available_missing_and_url_unknown() {
        let store = initialized_store();
        let root = std::env::temp_dir().join(format!(
            "personal-place-status-{:?}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create root");
        let existing = root.join("exists.exe");
        fs::write(&existing, b"fixture").expect("write existing");
        add_target(&store, "exists", "Exists", &existing.to_string_lossy());
        add_target(
            &store,
            "missing",
            "Missing",
            &root.join("missing.exe").to_string_lossy(),
        );
        let statuses = check_targets(&store, "home", None).expect("statuses");
        assert_eq!(
            statuses
                .iter()
                .find(|status| status.card_id == "exists")
                .unwrap()
                .status,
            "available"
        );
        assert_eq!(
            statuses
                .iter()
                .find(|status| status.card_id == "missing")
                .unwrap()
                .status,
            "missing"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn relink_preserves_card_identity_group_and_launch_set() {
        let store = initialized_store();
        add_target(&store, "one", "Unity", "C:\\OldUnity.exe");
        add_target(&store, "two", "VS Code", "C:\\Code.exe");
        let (_, group_id) = store
            .create_group("home", &["one".to_string(), "two".to_string()])
            .expect("create group");
        store
            .set_launch_enabled("one", true, false)
            .expect("enable launch");
        let root = std::env::temp_dir().join(format!(
            "personal-place-relink-{}",
            SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create root");
        let replacement = root.join("Unity.exe");
        fs::write(&replacement, b"fixture").expect("write replacement");
        let result = relink_target(&store, "one", &replacement, false).expect("relink");
        let card = result
            .dashboard
            .cards
            .iter()
            .find(|card| card.id == "one")
            .unwrap();
        assert_eq!(card.parent_group_id.as_deref(), Some(group_id.as_str()));
        assert!(card.launch_enabled);
        assert_eq!(card.title, "Unity");
        assert_ne!(result.old_target_id, result.new_target_id);
        assert_eq!(
            store.resolve_card_target("one").unwrap().unwrap().locator,
            fs::canonicalize(&replacement).unwrap().to_string_lossy()
        );
        let _ = fs::remove_dir_all(root);
    }
}
