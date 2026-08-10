use crate::{
    dashboard::{self, DashboardCard, DashboardState, Page},
    ingest,
    storage::WorkspaceStore,
};
use rusqlite::{params, MAIN_DB};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashSet,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const FORMAT_VERSION: u32 = 1;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupTarget {
    pub id: String,
    pub kind: String,
    pub locator: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupManifest {
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub pages: Vec<Page>,
    pub cards: Vec<DashboardCard>,
    pub targets: Vec<BackupTarget>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPreview {
    pub format_version: u32,
    pub app_version: String,
    pub exported_at: String,
    pub page_count: usize,
    pub card_count: usize,
    pub group_count: usize,
    pub note_count: usize,
    pub target_count: usize,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub path: String,
    pub preview: BackupPreview,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub dashboard: DashboardState,
    pub safety_backup_path: String,
}

pub fn export_backup(store: &WorkspaceStore, destination: &Path) -> Result<ExportResult, String> {
    let manifest = consistent_manifest(store)?;
    validate_manifest(&manifest)?;
    if destination.extension().and_then(|value| value.to_str()) != Some("personal-place") {
        return Err("備份檔名需要使用 .personal-place 副檔名。".to_string());
    }
    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("無法建立備份資料夾：{error}"))?;
    }
    let temporary = destination.with_extension(format!("personal-place.tmp-{}", unix_timestamp()?));
    let result = (|| {
        let file = File::create(&temporary).map_err(|error| format!("無法建立備份檔：{error}"))?;
        let mut zip = ZipWriter::new(file);
        zip.start_file(
            "manifest.json",
            SimpleFileOptions::default().compression_method(CompressionMethod::Deflated),
        )
        .map_err(|error| format!("無法建立備份容器：{error}"))?;
        let json = serde_json::to_vec_pretty(&manifest)
            .map_err(|error| format!("無法序列化備份內容：{error}"))?;
        zip.write_all(&json)
            .map_err(|error| format!("無法寫入備份內容：{error}"))?;
        zip.finish()
            .map_err(|error| format!("無法完成備份容器：{error}"))?;
        if destination.exists() {
            fs::remove_file(destination).map_err(|error| format!("無法取代既有備份檔：{error}"))?;
        }
        fs::rename(&temporary, destination).map_err(|error| format!("無法完成備份檔：{error}"))?;
        Ok::<(), String>(())
    })();
    if result.is_err() {
        let _ = fs::remove_file(&temporary);
    }
    result?;
    Ok(ExportResult {
        path: destination.to_string_lossy().into_owned(),
        preview: preview_for(&manifest),
    })
}

pub fn inspect_backup(path: &Path) -> Result<BackupPreview, String> {
    let manifest = read_manifest(path)?;
    validate_manifest(&manifest)?;
    Ok(preview_for(&manifest))
}

pub fn restore_into_new_database(path: &Path, database_path: &Path) -> Result<(), String> {
    if database_path.exists() {
        return Err("復原暫存資料庫已存在，已停止以避免覆寫。".to_string());
    }
    let manifest = read_manifest(path)?;
    validate_manifest(&manifest)?;
    let store = WorkspaceStore::open(database_path)?;
    import_manifest(&store, &manifest)?;
    {
        let connection = store.lock()?;
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|error| format!("無法完成復原資料庫的一致性檢查：{error}"))?;
    }
    drop(store);
    Ok(())
}

pub fn restore_backup(
    store: &WorkspaceStore,
    path: &Path,
    safety_backup_dir: &Path,
) -> Result<RestoreResult, String> {
    let manifest = read_manifest(path)?;
    validate_manifest(&manifest)?;
    let safety_backup = create_safety_backup(store, safety_backup_dir, "before-restore")?;
    import_manifest(store, &manifest)?;
    Ok(RestoreResult {
        dashboard: store.get_dashboard()?,
        safety_backup_path: safety_backup.to_string_lossy().into_owned(),
    })
}

pub fn create_safety_backup(
    store: &WorkspaceStore,
    backup_dir: &Path,
    label: &str,
) -> Result<PathBuf, String> {
    fs::create_dir_all(backup_dir).map_err(|error| format!("無法建立自動備份資料夾：{error}"))?;
    let path = backup_dir.join(format!("personal-place-{label}-{}.db", unix_timestamp()?));
    let connection = store.lock()?;
    connection
        .backup(MAIN_DB, &path, None)
        .map_err(|error| format!("無法建立還原前安全備份：{error}"))?;
    Ok(path)
}

fn consistent_manifest(store: &WorkspaceStore) -> Result<BackupManifest, String> {
    let mut connection = store.lock()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("無法開始一致性備份快照：{error}"))?;
    let dashboard = dashboard::load_dashboard(&transaction)?;
    let targets = {
        let mut statement = transaction
            .prepare("SELECT id, kind, locator FROM targets ORDER BY id")
            .map_err(|error| format!("無法準備備份目標查詢：{error}"))?;
        let targets = statement
            .query_map([], |row| {
                Ok(BackupTarget {
                    id: row.get(0)?,
                    kind: row.get(1)?,
                    locator: row.get(2)?,
                })
            })
            .map_err(|error| format!("無法讀取備份目標：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("無法整理備份目標：{error}"))?;
        targets
    };
    transaction
        .commit()
        .map_err(|error| format!("無法完成一致性備份快照：{error}"))?;
    Ok(BackupManifest {
        format_version: FORMAT_VERSION,
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        exported_at: unix_timestamp()?.to_string(),
        pages: dashboard.pages,
        cards: dashboard.cards,
        targets,
    })
}

fn read_manifest(path: &Path) -> Result<BackupManifest, String> {
    if path.extension().and_then(|value| value.to_str()) != Some("personal-place") {
        return Err("請選擇 .personal-place 備份檔。".to_string());
    }
    let file = File::open(path).map_err(|error| format!("無法開啟備份檔：{error}"))?;
    let mut zip = ZipArchive::new(file).map_err(|error| format!("備份 ZIP 已損壞：{error}"))?;
    let entry = zip
        .by_name("manifest.json")
        .map_err(|_| "備份缺少 manifest.json。".to_string())?;
    if entry.size() > MAX_MANIFEST_BYTES {
        return Err("備份 manifest 超過允許大小。".to_string());
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .take(MAX_MANIFEST_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format!("無法讀取備份 manifest：{error}"))?;
    if bytes.len() as u64 > MAX_MANIFEST_BYTES {
        return Err("備份 manifest 超過允許大小。".to_string());
    }
    serde_json::from_slice(&bytes).map_err(|error| format!("備份 manifest 格式無效：{error}"))
}

fn validate_manifest(manifest: &BackupManifest) -> Result<(), String> {
    if manifest.format_version > FORMAT_VERSION {
        return Err(format!(
            "這份備份使用較新的格式版本 {}，目前版本無法還原。",
            manifest.format_version
        ));
    }
    if manifest.format_version == 0 {
        return Err("備份格式版本無效。".to_string());
    }
    if manifest.pages.is_empty() {
        return Err("備份至少需要一個頁面。".to_string());
    }
    let page_ids = unique_ids(manifest.pages.iter().map(|page| page.id.as_str()), "頁面")?;
    let target_ids = unique_ids(
        manifest.targets.iter().map(|target| target.id.as_str()),
        "目標",
    )?;
    let card_ids = unique_ids(manifest.cards.iter().map(|card| card.id.as_str()), "卡片")?;

    for target in &manifest.targets {
        match target.kind.as_str() {
            "url" => {
                ingest::normalize_url(&target.locator)
                    .map_err(|_| format!("目標 {} 不是有效的 HTTP/HTTPS 網址。", target.id))?;
            }
            "local" | "builtin" | "missing" => {}
            _ => return Err(format!("目標 {} 使用未知類型。", target.id)),
        }
    }
    for card in &manifest.cards {
        if !page_ids.contains(card.page_id.as_str()) {
            return Err(format!("卡片 {} 連到不存在的頁面。", card.id));
        }
        match card.card_type.as_str() {
            "target" => {
                let target_id = card
                    .target_id
                    .as_deref()
                    .ok_or_else(|| format!("Target 卡片 {} 缺少目標。", card.id))?;
                if !target_ids.contains(target_id) {
                    return Err(format!("卡片 {} 連到不存在的目標。", card.id));
                }
            }
            "group" => {
                if card.parent_group_id.is_some() || card.target_id.is_some() {
                    return Err(format!("群組 {} 違反單層群組限制。", card.id));
                }
            }
            "note" => {
                if card.target_id.is_some() || card.launch_enabled {
                    return Err(format!("筆記 {} 不可包含啟動目標。", card.id));
                }
            }
            _ => return Err(format!("卡片 {} 使用未知類型。", card.id)),
        }
        if let Some(group_id) = card.parent_group_id.as_deref() {
            let group = manifest
                .cards
                .iter()
                .find(|candidate| candidate.id == group_id)
                .ok_or_else(|| format!("卡片 {} 的群組不存在。", card.id))?;
            if group.card_type != "group"
                || group.parent_group_id.is_some()
                || group.page_id != card.page_id
            {
                return Err(format!("卡片 {} 的群組層級無效。", card.id));
            }
        }
    }
    if card_ids.iter().any(|id| page_ids.contains(id)) {
        return Err("頁面與卡片不可使用相同主鍵。".to_string());
    }
    Ok(())
}

fn unique_ids<'a>(
    values: impl Iterator<Item = &'a str>,
    label: &str,
) -> Result<HashSet<&'a str>, String> {
    let mut ids = HashSet::new();
    for value in values {
        if value.trim().is_empty() || !ids.insert(value) {
            return Err(format!("備份包含空白或重複的{label}主鍵。"));
        }
    }
    Ok(ids)
}

fn import_manifest(store: &WorkspaceStore, manifest: &BackupManifest) -> Result<(), String> {
    let mut connection = store.lock()?;
    let transaction = connection
        .transaction()
        .map_err(|error| format!("無法開始還原交易：{error}"))?;
    transaction
        .execute("DELETE FROM cards", [])
        .map_err(|error| format!("無法清理舊卡片：{error}"))?;
    transaction
        .execute("DELETE FROM targets", [])
        .map_err(|error| format!("無法清理舊目標：{error}"))?;
    for target in &manifest.targets {
        transaction
            .execute(
                "INSERT INTO targets(id, kind, locator) VALUES(?1, ?2, ?3)",
                params![target.id, target.kind, target.locator],
            )
            .map_err(|error| format!("無法還原目標 {}：{error}", target.id))?;
    }
    dashboard::write_dashboard(
        &transaction,
        &DashboardState {
            pages: manifest.pages.clone(),
            cards: manifest.cards.clone(),
        },
    )?;
    let has_foreign_key_error = {
        let mut statement = transaction
            .prepare("PRAGMA foreign_key_check")
            .map_err(|error| format!("無法準備還原外鍵驗證：{error}"))?;
        let mut rows = statement
            .query([])
            .map_err(|error| format!("無法驗證還原外鍵：{error}"))?;
        rows.next()
            .map_err(|error| format!("無法讀取還原外鍵結果：{error}"))?
            .is_some()
    };
    if has_foreign_key_error {
        return Err("還原資料違反關聯完整性，已取消還原。".to_string());
    }
    let integrity: String = transaction
        .query_row("PRAGMA integrity_check", [], |row| row.get(0))
        .map_err(|error| format!("無法驗證還原資料庫：{error}"))?;
    if integrity != "ok" {
        return Err(format!("還原資料庫完整性檢查失敗：{integrity}"));
    }
    transaction
        .commit()
        .map_err(|error| format!("無法完成還原交易：{error}"))
}

fn preview_for(manifest: &BackupManifest) -> BackupPreview {
    BackupPreview {
        format_version: manifest.format_version,
        app_version: manifest.app_version.clone(),
        exported_at: manifest.exported_at.clone(),
        page_count: manifest.pages.len(),
        card_count: manifest.cards.len(),
        group_count: manifest
            .cards
            .iter()
            .filter(|card| card.card_type == "group")
            .count(),
        note_count: manifest
            .cards
            .iter()
            .filter(|card| card.card_type == "note")
            .count(),
        target_count: manifest.targets.len(),
    }
}

fn unix_timestamp() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("無法建立備份時間：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::WorkspaceStore;
    use rusqlite::Connection;
    use std::collections::HashMap;

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

    fn temporary_root(label: &str) -> PathBuf {
        std::env::temp_dir().join(format!(
            "personal-place-backup-{label}-{}-{}",
            std::process::id(),
            unix_timestamp().expect("timestamp")
        ))
    }

    #[test]
    fn export_and_restore_round_trip_uses_versioned_zip_and_safety_backup() {
        let source = initialized_store();
        let (dashboard, note_id) = source.create_note("home", None).expect("create note");
        source
            .update_note_text(&note_id, "備份內容")
            .expect("write note");
        let root = temporary_root("round-trip");
        fs::create_dir_all(&root).expect("create root");
        let backup_path = root.join("my-place.personal-place");
        let exported = export_backup(&source, &backup_path).expect("export");
        assert_eq!(exported.preview.format_version, 1);
        assert_eq!(exported.preview.page_count, 1);
        assert_eq!(exported.preview.note_count, 1);
        assert_eq!(inspect_backup(&backup_path).unwrap(), exported.preview);

        let destination = initialized_store();
        let restored =
            restore_backup(&destination, &backup_path, &root.join("automatic")).expect("restore");
        assert_eq!(
            restored.dashboard,
            source.get_dashboard().expect("source dashboard")
        );
        assert_ne!(restored.dashboard, dashboard);
        let safety = PathBuf::from(restored.safety_backup_path);
        assert!(safety.exists());
        let safety_db = Connection::open(safety).expect("open safety backup");
        assert_eq!(
            safety_db
                .query_row("PRAGMA integrity_check", [], |row| row.get::<_, String>(0))
                .unwrap(),
            "ok"
        );
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn damaged_backup_never_changes_existing_dashboard() {
        let store = initialized_store();
        let before = store.get_dashboard().expect("before");
        let root = temporary_root("damaged");
        fs::create_dir_all(&root).expect("create root");
        let path = root.join("damaged.personal-place");
        fs::write(&path, b"not a zip").expect("write damaged");
        assert!(restore_backup(&store, &path, &root.join("automatic")).is_err());
        assert_eq!(store.get_dashboard().unwrap(), before);
        assert!(!root.join("automatic").exists());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn export_includes_committed_data_still_present_in_wal() {
        let root = temporary_root("wal");
        fs::create_dir_all(&root).expect("create root");
        let database_path = root.join("source.db");
        let store = WorkspaceStore::open(&database_path).expect("file store");
        store
            .initialize(
                None,
                &HashMap::new(),
                Path::new("missing-registry"),
                &root.join("legacy"),
            )
            .expect("initialize");
        {
            let connection = store.lock().expect("lock");
            connection
                .execute_batch("PRAGMA wal_autocheckpoint = 0;")
                .expect("disable automatic checkpoint");
        }
        let (_, note_id) = store.create_note("home", None).expect("create note");
        store
            .update_note_text(&note_id, "仍在 WAL 的最新內容")
            .expect("write note");
        let wal_path = PathBuf::from(format!("{}-wal", database_path.to_string_lossy()));
        assert!(wal_path.metadata().expect("wal metadata").len() > 0);

        let package = root.join("wal.personal-place");
        let exported = export_backup(&store, &package).expect("export wal state");
        assert_eq!(exported.preview.note_count, 1);
        let manifest = read_manifest(&package).expect("manifest");
        assert!(manifest
            .cards
            .iter()
            .any(|card| card.id == note_id && card.note_text == "仍在 WAL 的最新內容"));
        drop(store);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn newer_format_and_nested_groups_are_rejected_before_import() {
        let store = initialized_store();
        let mut manifest = consistent_manifest(&store).expect("manifest");
        manifest.format_version = FORMAT_VERSION + 1;
        assert!(validate_manifest(&manifest)
            .unwrap_err()
            .contains("較新的格式版本"));

        manifest.format_version = FORMAT_VERSION;
        manifest.cards.push(DashboardCard {
            id: "group-parent".to_string(),
            page_id: "home".to_string(),
            parent_group_id: None,
            card_type: "group".to_string(),
            target_id: None,
            title: "Parent".to_string(),
            subtitle: String::new(),
            kind: "group".to_string(),
            symbol: "◇".to_string(),
            tone: "violet".to_string(),
            size: "wide".to_string(),
            position: 0,
            note_text: String::new(),
            resume_note: String::new(),
            launch_enabled: false,
            last_opened_at: None,
        });
        let mut child_group = manifest.cards.last().unwrap().clone();
        child_group.id = "group-child".to_string();
        child_group.parent_group_id = Some("group-parent".to_string());
        manifest.cards.push(child_group);
        assert!(validate_manifest(&manifest)
            .unwrap_err()
            .contains("單層群組限制"));
    }
}
