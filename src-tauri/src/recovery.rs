use crate::backup;
use std::{
    fs,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

pub fn replace_database_from_backup(
    backup_path: &Path,
    database_path: &Path,
    recovery_root: &Path,
) -> Result<PathBuf, String> {
    let parent = database_path
        .parent()
        .ok_or_else(|| "資料庫路徑沒有有效的上層資料夾。".to_string())?;
    fs::create_dir_all(parent).map_err(|error| format!("無法建立資料目錄：{error}"))?;
    fs::create_dir_all(recovery_root).map_err(|error| format!("無法建立復原備份目錄：{error}"))?;

    let stamp = unix_timestamp()?;
    let temporary = parent.join(format!("personal-place-recovery-new-{stamp}.db"));
    backup::restore_into_new_database(backup_path, &temporary)?;

    let archive = recovery_root.join(format!("database-error-{stamp}"));
    fs::create_dir_all(&archive).map_err(|error| {
        cleanup_temporary_database(&temporary);
        format!("無法建立損壞資料保存目錄：{error}")
    })?;

    let original_files = database_files(database_path);
    let mut moved = Vec::new();
    for original in original_files.iter().filter(|path| path.exists()) {
        let file_name = original
            .file_name()
            .ok_or_else(|| "資料庫檔案名稱無效。".to_string())?;
        let archived = archive.join(file_name);
        if let Err(error) = fs::rename(original, &archived) {
            rollback_moves(&moved);
            cleanup_temporary_database(&temporary);
            return Err(format!("無法保存原始資料庫，未進行復原：{error}"));
        }
        moved.push((original.clone(), archived));
    }

    if let Err(error) = fs::rename(&temporary, database_path) {
        rollback_moves(&moved);
        cleanup_temporary_database(&temporary);
        return Err(format!("無法啟用復原後的資料庫，已還原原始檔案：{error}"));
    }

    Ok(archive)
}

fn database_files(database_path: &Path) -> [PathBuf; 3] {
    let base = database_path.to_string_lossy();
    [
        database_path.to_path_buf(),
        PathBuf::from(format!("{base}-wal")),
        PathBuf::from(format!("{base}-shm")),
    ]
}

fn rollback_moves(moved: &[(PathBuf, PathBuf)]) {
    for (original, archived) in moved.iter().rev() {
        let _ = fs::rename(archived, original);
    }
}

fn cleanup_temporary_database(database_path: &Path) {
    for path in database_files(database_path) {
        if path.exists() {
            let _ = fs::remove_file(path);
        }
    }
}

fn unix_timestamp() -> Result<u64, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .map_err(|error| format!("無法建立復原時間戳記：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::WorkspaceStore;
    use std::{collections::HashMap, fs};

    #[test]
    fn replaces_corrupt_database_and_preserves_original_file() {
        let root = std::env::temp_dir().join(format!(
            "personal-place-recovery-test-{}",
            unix_timestamp().expect("timestamp")
        ));
        fs::create_dir_all(&root).expect("test dir");
        let source_path = root.join("source.db");
        let source = WorkspaceStore::open(&source_path).expect("source store");
        source
            .initialize(
                None,
                &HashMap::new(),
                &root.join("none.json"),
                &root.join("legacy"),
            )
            .expect("initialize source");
        let package = root.join("valid.personal-place");
        backup::export_backup(&source, &package).expect("export");
        drop(source);

        let damaged = root.join("personal-place.db");
        fs::write(&damaged, b"not a sqlite database").expect("damage fixture");
        let archive = replace_database_from_backup(&package, &damaged, &root.join("recovery"))
            .expect("recover");

        assert!(archive.join("personal-place.db").exists());
        assert_eq!(
            fs::read(archive.join("personal-place.db")).expect("archived bytes"),
            b"not a sqlite database"
        );
        let restored = WorkspaceStore::open(&damaged).expect("restored store");
        assert!(!restored
            .get_dashboard()
            .expect("dashboard")
            .pages
            .is_empty());
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn invalid_backup_does_not_touch_original_database() {
        let root = std::env::temp_dir().join(format!(
            "personal-place-recovery-invalid-test-{}",
            unix_timestamp().expect("timestamp")
        ));
        fs::create_dir_all(&root).expect("test dir");
        let original = root.join("personal-place.db");
        fs::write(&original, b"keep me").expect("fixture");
        let invalid = root.join("invalid.personal-place");
        fs::write(&invalid, b"invalid zip").expect("invalid backup");

        assert!(replace_database_from_backup(&invalid, &original, &root.join("recovery")).is_err());
        assert_eq!(fs::read(&original).expect("original bytes"), b"keep me");
        let _ = fs::remove_dir_all(root);
    }
}
