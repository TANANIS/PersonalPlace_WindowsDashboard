use rusqlite::{params, Connection, OptionalExtension, Transaction, MAIN_DB};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};

const SCHEMA_VERSION: i64 = 3;

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub symbol: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LauncherItem {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub subtitle: String,
    pub kind: String,
    pub target: String,
    pub symbol: String,
    pub tone: String,
    pub size: String,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct WorkspaceState {
    pub workspaces: Vec<Workspace>,
    pub items: Vec<LauncherItem>,
}

pub struct WorkspaceStore {
    pub(crate) connection: Mutex<Connection>,
    pub(crate) undo_history: Mutex<Vec<String>>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct CardTarget {
    pub card: LauncherItem,
    pub target_kind: String,
    pub locator: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum InsertItemResult {
    Added(Box<LauncherItem>),
    Duplicate,
}

impl WorkspaceStore {
    pub fn open(database_path: &Path) -> Result<Self, String> {
        if let Some(parent) = database_path.parent() {
            fs::create_dir_all(parent).map_err(|error| format!("無法建立資料庫資料夾：{error}"))?;
        }
        let connection = Connection::open(database_path)
            .map_err(|error| format!("無法開啟 Personal Place 資料庫：{error}"))?;
        connection
            .execute_batch(
                "PRAGMA foreign_keys = ON;
                 PRAGMA journal_mode = WAL;
                 PRAGMA synchronous = NORMAL;",
            )
            .map_err(|error| format!("無法設定 Personal Place 資料庫：{error}"))?;
        let current_version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .map_err(|error| format!("無法讀取資料結構版本：{error}"))?;
        if current_version == 2 {
            create_schema_backup(&connection, database_path)?;
        }
        configure_and_migrate(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            undo_history: Mutex::new(Vec::new()),
        })
    }

    #[cfg(test)]
    pub(crate) fn in_memory() -> Result<Self, String> {
        let connection =
            Connection::open_in_memory().map_err(|error| format!("無法建立測試資料庫：{error}"))?;
        configure_and_migrate(&connection)?;
        Ok(Self {
            connection: Mutex::new(connection),
            undo_history: Mutex::new(Vec::new()),
        })
    }

    pub fn initialize(
        &self,
        legacy_state: Option<WorkspaceState>,
        legacy_targets: &HashMap<String, PathBuf>,
        legacy_registry_path: &Path,
        backup_root: &Path,
    ) -> Result<WorkspaceState, String> {
        let mut connection = self.lock()?;
        if metadata_value(&connection, "bootstrap_complete")?.as_deref() == Some("1") {
            return load_state(&connection);
        }

        if legacy_state.is_some() || legacy_registry_path.exists() {
            write_legacy_backup(legacy_state.as_ref(), legacy_registry_path, backup_root)?;
        }

        let state = legacy_state
            .filter(|state| !state.workspaces.is_empty())
            .unwrap_or_else(default_state);
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始初始資料交易：{error}"))?;
        write_state(&transaction, &state, Some(legacy_targets))?;
        transaction
            .execute(
                "INSERT INTO metadata(key, value) VALUES('bootstrap_complete', '1')
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                [],
            )
            .map_err(|error| format!("無法標記資料遷移完成：{error}"))?;
        transaction
            .commit()
            .map_err(|error| format!("無法完成初始資料遷移：{error}"))?;
        load_state(&connection)
    }

    #[cfg(test)]
    fn load(&self) -> Result<WorkspaceState, String> {
        let connection = self.lock()?;
        load_state(&connection)
    }

    #[cfg(test)]
    pub fn save(&self, state: &WorkspaceState) -> Result<(), String> {
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始資料保存交易：{error}"))?;
        write_state(&transaction, state, None)?;
        transaction
            .commit()
            .map_err(|error| format!("無法保存工作台資料：{error}"))
    }

    pub fn target_exists_on_page(&self, page_id: &str, target_id: &str) -> Result<bool, String> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT EXISTS(
                     SELECT 1 FROM cards
                     WHERE page_id = ?1 AND parent_group_id IS NULL AND target_id = ?2
                 )",
                params![page_id, target_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法檢查重複項目：{error}"))
    }

    /// Finds schema-v2 URL targets by their normalized locator, including legacy
    /// IDs whose spelling/casing differs from the canonical URL.
    pub fn equivalent_url_target(
        &self,
        page_id: &str,
        normalized_url: &str,
    ) -> Result<Option<(String, bool)>, String> {
        let connection = self.lock()?;
        let mut statement = connection
            .prepare(
                "SELECT t.id, t.locator,
                        EXISTS(SELECT 1 FROM cards c
                               WHERE c.target_id = t.id AND c.page_id = ?1
                                 AND c.parent_group_id IS NULL)
                 FROM targets t WHERE t.kind = 'url' ORDER BY t.id",
            )
            .map_err(|error| format!("無法準備網址重複檢查：{error}"))?;
        let candidates = statement
            .query_map([page_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, bool>(2)?,
                ))
            })
            .map_err(|error| format!("無法檢查既有網址：{error}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("無法整理既有網址：{error}"))?;

        let mut equivalent = None;
        for (target_id, locator, on_page) in candidates {
            if normalize_http_locator(&locator).as_deref() == Some(normalized_url) {
                if on_page {
                    return Ok(Some((target_id, true)));
                }
                equivalent.get_or_insert((target_id, false));
            }
        }
        Ok(equivalent)
    }

    /// Inserts exactly one target/card pair in one transaction. A failed item never
    /// leaves a target without its card, while callers can continue the rest of a batch.
    pub fn insert_ingested_item(
        &self,
        item: &LauncherItem,
        target_kind: &str,
        locator: &str,
        allow_duplicate: bool,
    ) -> Result<InsertItemResult, String> {
        let mut connection = self.lock()?;
        let transaction = connection
            .transaction()
            .map_err(|error| format!("無法開始新增項目交易：{error}"))?;

        let page_exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM pages WHERE id = ?1)",
                [&item.workspace_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法確認目標頁面：{error}"))?;
        if !page_exists {
            return Err("找不到要加入卡片的頁面。".to_string());
        }

        let duplicate: bool = transaction
            .query_row(
                "SELECT EXISTS(
                     SELECT 1 FROM cards
                     WHERE page_id = ?1 AND parent_group_id IS NULL AND target_id = ?2
                 )",
                params![item.workspace_id, item.target],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法檢查重複項目：{error}"))?;
        if duplicate && !allow_duplicate {
            return Ok(InsertItemResult::Duplicate);
        }

        let existing_target = transaction
            .query_row(
                "SELECT kind, locator FROM targets WHERE id = ?1",
                [&item.target],
                |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
            )
            .optional()
            .map_err(|error| format!("無法確認啟動目標：{error}"))?;
        if let Some((existing_kind, existing_locator)) = existing_target {
            if existing_kind != target_kind
                || !target_locators_equivalent(target_kind, &existing_locator, locator)
            {
                return Err("目標識別發生衝突，未變更既有卡片的啟動位置。".to_string());
            }
        } else {
            transaction
                .execute(
                    "INSERT INTO targets(id, kind, locator) VALUES(?1, ?2, ?3)",
                    params![item.target, target_kind, locator],
                )
                .map_err(|error| format!("無法保存啟動目標：{error}"))?;
        }
        let position: i64 = transaction
            .query_row(
                "SELECT COALESCE(MAX(position), -1) + 1 FROM cards
                 WHERE page_id = ?1 AND parent_group_id IS NULL",
                [&item.workspace_id],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法計算卡片位置：{error}"))?;
        insert_card(&transaction, item, position)?;
        transaction
            .commit()
            .map_err(|error| format!("無法完成項目新增：{error}"))?;
        Ok(InsertItemResult::Added(Box::new(item.clone())))
    }

    pub fn resolve_card_target(&self, card_id: &str) -> Result<Option<CardTarget>, String> {
        let connection = self.lock()?;
        load_card_target(&connection, card_id)
    }

    #[cfg(test)]
    pub fn resolve_local_target(&self, target_id: &str) -> Result<Option<PathBuf>, String> {
        let connection = self.lock()?;
        connection
            .query_row(
                "SELECT locator FROM targets WHERE id = ?1 AND kind = 'local'",
                [target_id],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map(|value| value.map(PathBuf::from))
            .map_err(|error| format!("無法讀取啟動目標：{error}"))
    }

    pub(crate) fn lock(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.connection
            .lock()
            .map_err(|_| "Personal Place 資料庫暫時無法使用。".to_string())
    }
}

fn create_schema_backup(connection: &Connection, database_path: &Path) -> Result<PathBuf, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("無法建立資料庫備份時間：{error}"))?
        .as_secs();
    let backup_dir = database_path
        .parent()
        .unwrap_or_else(|| Path::new("."))
        .join("backups")
        .join("schema-migrations");
    fs::create_dir_all(&backup_dir)
        .map_err(|error| format!("無法建立 schema 遷移備份資料夾：{error}"))?;
    let backup_path = backup_dir.join(format!("personal-place-v2-{timestamp}.db"));
    connection
        .backup(MAIN_DB, &backup_path, None)
        .map_err(|error| format!("無法在 schema v3 遷移前建立一致性備份：{error}"))?;
    Ok(backup_path)
}

fn configure_and_migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "PRAGMA foreign_keys = ON;
             PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;",
        )
        .map_err(|error| format!("無法設定 Personal Place 資料庫：{error}"))?;
    let current_version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| format!("無法讀取資料結構版本：{error}"))?;
    if current_version > SCHEMA_VERSION {
        return Err(format!(
            "這份資料由較新版本的 Personal Place 建立（資料版本 {current_version}）。"
        ));
    }
    if current_version == SCHEMA_VERSION {
        return Ok(());
    }

    if current_version < 2 {
        connection
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS metadata(
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS pages(
                 id TEXT PRIMARY KEY,
                 name TEXT NOT NULL,
                 symbol TEXT NOT NULL,
                 position INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS targets(
                 id TEXT PRIMARY KEY,
                 kind TEXT NOT NULL CHECK(kind IN ('builtin', 'url', 'local', 'missing')),
                 locator TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS cards(
                 id TEXT PRIMARY KEY,
                 page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                 target_id TEXT NOT NULL REFERENCES targets(id),
                 title TEXT NOT NULL,
                 subtitle TEXT NOT NULL,
                 kind TEXT NOT NULL,
                 symbol TEXT NOT NULL,
                 tone TEXT NOT NULL,
                 size TEXT NOT NULL CHECK(size IN ('square', 'wide')),
                 position INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS cards_page_position ON cards(page_id, position);",
            )
            .map_err(|error| format!("無法建立 Personal Place 資料結構：{error}"))?;
        connection
            .execute_batch(
                "UPDATE targets
                 SET kind = 'url'
                 WHERE locator LIKE 'http://%' OR locator LIKE 'https://%';
                 UPDATE cards
                 SET kind = 'web'
                 WHERE target_id IN (SELECT id FROM targets WHERE kind = 'url');
                 PRAGMA user_version = 2;",
            )
            .map_err(|error| format!("無法修正舊網址類型：{error}"))?;
    }

    let version_after_v2: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| format!("無法確認 schema v2：{error}"))?;
    if version_after_v2 == 2 {
        let migration = connection.execute_batch(
            "BEGIN IMMEDIATE;
             CREATE TABLE cards_v3(
                 id TEXT PRIMARY KEY,
                 page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                 parent_group_id TEXT REFERENCES cards_v3(id) ON DELETE CASCADE,
                 card_type TEXT NOT NULL CHECK(card_type IN ('target', 'group', 'note')),
                 target_id TEXT REFERENCES targets(id),
                 title TEXT NOT NULL,
                 subtitle TEXT NOT NULL,
                 kind TEXT NOT NULL,
                 symbol TEXT NOT NULL,
                 tone TEXT NOT NULL,
                 size TEXT NOT NULL CHECK(size IN ('square', 'wide')),
                 position INTEGER NOT NULL,
                 note_text TEXT NOT NULL DEFAULT '',
                 resume_note TEXT NOT NULL DEFAULT '',
                 launch_enabled INTEGER NOT NULL DEFAULT 0 CHECK(launch_enabled IN (0, 1)),
                 last_opened_at TEXT,
                 CHECK(
                     (card_type = 'target' AND target_id IS NOT NULL) OR
                     (card_type IN ('group', 'note') AND target_id IS NULL)
                 ),
                 CHECK(card_type != 'group' OR parent_group_id IS NULL)
             );
             INSERT INTO cards_v3(
                 id, page_id, parent_group_id, card_type, target_id,
                 title, subtitle, kind, symbol, tone, size, position,
                 note_text, resume_note, launch_enabled, last_opened_at
             )
             SELECT id, page_id, NULL, 'target', target_id,
                    title, subtitle, kind, symbol, tone, size, position,
                    '', '', 0, NULL
             FROM cards;
             DROP TABLE cards;
             ALTER TABLE cards_v3 RENAME TO cards;
             CREATE INDEX cards_page_position ON cards(page_id, parent_group_id, position);
             CREATE INDEX cards_parent_group ON cards(parent_group_id, position);
             PRAGMA user_version = 3;
             COMMIT;",
        );
        if let Err(error) = migration {
            let _ = connection.execute_batch("ROLLBACK;");
            return Err(format!("無法將 Personal Place 升級為 schema v3：{error}"));
        }
    }

    Ok(())
}

fn metadata_value(connection: &Connection, key: &str) -> Result<Option<String>, String> {
    connection
        .query_row("SELECT value FROM metadata WHERE key = ?1", [key], |row| {
            row.get(0)
        })
        .optional()
        .map_err(|error| format!("無法讀取資料版本：{error}"))
}

fn write_state(
    transaction: &Transaction<'_>,
    state: &WorkspaceState,
    legacy_targets: Option<&HashMap<String, PathBuf>>,
) -> Result<(), String> {
    if state.workspaces.is_empty() {
        return Err("工作台至少需要保留一個頁面。".to_string());
    }

    transaction
        .execute("DELETE FROM cards", [])
        .map_err(|error| format!("無法更新舊卡片：{error}"))?;
    transaction
        .execute("DELETE FROM pages", [])
        .map_err(|error| format!("無法更新舊頁面：{error}"))?;

    for (position, workspace) in state.workspaces.iter().enumerate() {
        transaction
            .execute(
                "INSERT INTO pages(id, name, symbol, position) VALUES(?1, ?2, ?3, ?4)",
                params![
                    workspace.id,
                    workspace.name,
                    workspace.symbol,
                    position as i64
                ],
            )
            .map_err(|error| format!("無法保存頁面 {}：{error}", workspace.name))?;
    }

    for (position, item) in state.items.iter().enumerate() {
        let item = normalize_item(item);
        ensure_target(transaction, &item, legacy_targets)?;
        insert_card(transaction, &item, position as i64)?;
    }
    Ok(())
}

fn ensure_target(
    transaction: &Transaction<'_>,
    item: &LauncherItem,
    legacy_targets: Option<&HashMap<String, PathBuf>>,
) -> Result<(), String> {
    // Normal runtime saves may only rearrange cards that reference a target
    // already registered by the trusted ingest path. They must never create or
    // mutate a launch locator supplied by frontend state.
    let Some(legacy_targets) = legacy_targets else {
        let exists: bool = transaction
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM targets WHERE id = ?1)",
                [&item.target],
                |row| row.get(0),
            )
            .map_err(|error| format!("無法確認卡片目標 {}：{error}", item.title))?;
        return exists.then_some(()).ok_or_else(|| {
            format!(
                "卡片「{}」引用了未登記的目標；請使用新增介面建立卡片。",
                item.title
            )
        });
    };

    // Only the one-time legacy migration may translate old frontend/registry
    // records into targets. Runtime mutations never call this branch.
    let target = if is_web_target(&item.target) {
        Some(("url", item.target.clone()))
    } else {
        match item.kind.as_str() {
            "web" => Some(("url", item.target.clone())),
            "app" => Some(("builtin", item.target.clone())),
            "local" => legacy_targets
                .get(&item.target)
                .map(|path| ("local", path.to_string_lossy().into_owned())),
            _ => None,
        }
    };

    if let Some((kind, locator)) = target {
        transaction
            .execute(
                "INSERT INTO targets(id, kind, locator) VALUES(?1, ?2, ?3)
                 ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, locator = excluded.locator",
                params![item.target, kind, locator],
            )
            .map_err(|error| format!("無法保存卡片目標 {}：{error}", item.title))?;
        return Ok(());
    }

    let exists: bool = transaction
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM targets WHERE id = ?1)",
            [&item.target],
            |row| row.get(0),
        )
        .map_err(|error| format!("無法確認卡片目標 {}：{error}", item.title))?;
    if !exists {
        transaction
            .execute(
                "INSERT INTO targets(id, kind, locator) VALUES(?1, 'missing', '')",
                [&item.target],
            )
            .map_err(|error| format!("無法保留失效卡片 {}：{error}", item.title))?;
    }
    Ok(())
}

fn normalize_item(item: &LauncherItem) -> LauncherItem {
    let mut normalized = item.clone();
    if is_web_target(&normalized.target) {
        normalized.kind = "web".to_string();
    }
    normalized
}

fn is_web_target(target: &str) -> bool {
    target.starts_with("https://") || target.starts_with("http://")
}

fn normalize_http_locator(locator: &str) -> Option<String> {
    let url = url::Url::parse(locator.trim()).ok()?;
    matches!(url.scheme(), "http" | "https").then(|| url.as_str().to_string())
}

fn target_locators_equivalent(kind: &str, existing: &str, candidate: &str) -> bool {
    if kind == "url" {
        return normalize_http_locator(existing) == normalize_http_locator(candidate);
    }
    if kind == "local" && cfg!(windows) {
        return existing.eq_ignore_ascii_case(candidate);
    }
    existing == candidate
}

fn insert_card(
    transaction: &Transaction<'_>,
    item: &LauncherItem,
    position: i64,
) -> Result<(), String> {
    transaction
        .execute(
            "INSERT INTO cards(
                id, page_id, parent_group_id, card_type, target_id,
                title, subtitle, kind, symbol, tone, size, position,
                note_text, resume_note, launch_enabled, last_opened_at
             ) VALUES(?1, ?2, NULL, 'target', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
                      '', '', 0, NULL)
             ON CONFLICT(id) DO UPDATE SET
                page_id = excluded.page_id,
                parent_group_id = NULL,
                card_type = 'target',
                target_id = excluded.target_id,
                title = excluded.title,
                subtitle = excluded.subtitle,
                kind = excluded.kind,
                symbol = excluded.symbol,
                tone = excluded.tone,
                size = excluded.size,
                position = excluded.position",
            params![
                item.id,
                item.workspace_id,
                item.target,
                item.title,
                item.subtitle,
                item.kind,
                item.symbol,
                item.tone,
                item.size,
                position,
            ],
        )
        .map(|_| ())
        .map_err(|error| format!("無法保存卡片 {}：{error}", item.title))
}

fn load_card_target(connection: &Connection, card_id: &str) -> Result<Option<CardTarget>, String> {
    connection
        .query_row(
            "SELECT c.id, c.page_id, c.title, c.subtitle, c.kind, c.target_id,
                    c.symbol, c.tone, c.size, t.kind, t.locator
             FROM cards c
             JOIN targets t ON t.id = c.target_id
             WHERE c.id = ?1 AND c.card_type = 'target'",
            [card_id],
            |row| {
                Ok(CardTarget {
                    card: LauncherItem {
                        id: row.get(0)?,
                        workspace_id: row.get(1)?,
                        title: row.get(2)?,
                        subtitle: row.get(3)?,
                        kind: row.get(4)?,
                        target: row.get(5)?,
                        symbol: row.get(6)?,
                        tone: row.get(7)?,
                        size: row.get(8)?,
                    },
                    target_kind: row.get(9)?,
                    locator: row.get(10)?,
                })
            },
        )
        .optional()
        .map_err(|error| format!("無法讀取卡片啟動目標：{error}"))
}

fn load_state(connection: &Connection) -> Result<WorkspaceState, String> {
    let mut page_statement = connection
        .prepare("SELECT id, name, symbol FROM pages ORDER BY position, id")
        .map_err(|error| format!("無法準備頁面查詢：{error}"))?;
    let workspaces = page_statement
        .query_map([], |row| {
            Ok(Workspace {
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
            "SELECT id, page_id, title, subtitle, kind, target_id, symbol, tone, size
             FROM cards WHERE card_type = 'target' ORDER BY position, id",
        )
        .map_err(|error| format!("無法準備卡片查詢：{error}"))?;
    let items = card_statement
        .query_map([], |row| {
            Ok(LauncherItem {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                subtitle: row.get(3)?,
                kind: row.get(4)?,
                target: row.get(5)?,
                symbol: row.get(6)?,
                tone: row.get(7)?,
                size: row.get(8)?,
            })
        })
        .map_err(|error| format!("無法讀取卡片：{error}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| format!("無法整理卡片：{error}"))?;
    Ok(WorkspaceState { workspaces, items })
}

fn write_legacy_backup(
    legacy_state: Option<&WorkspaceState>,
    legacy_registry_path: &Path,
    backup_root: &Path,
) -> Result<(), String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|error| format!("無法建立備份時間：{error}"))?
        .as_secs();
    let backup_dir = backup_root.join(format!("legacy-{timestamp}"));
    fs::create_dir_all(&backup_dir).map_err(|error| format!("無法建立舊資料備份：{error}"))?;

    if let Some(state) = legacy_state {
        let content = serde_json::to_vec_pretty(state)
            .map_err(|error| format!("無法整理舊版面備份：{error}"))?;
        fs::write(backup_dir.join("local-storage-state.json"), content)
            .map_err(|error| format!("無法保存舊版面備份：{error}"))?;
    }
    if legacy_registry_path.exists() {
        fs::copy(
            legacy_registry_path,
            backup_dir.join("launcher-registry.json"),
        )
        .map_err(|error| format!("無法保存舊啟動登記備份：{error}"))?;
    }
    Ok(())
}

fn default_state() -> WorkspaceState {
    WorkspaceState {
        workspaces: vec![Workspace {
            id: "home".to_string(),
            name: "我的地方".to_string(),
            symbol: "⌂".to_string(),
        }],
        items: Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_paths(name: &str) -> (PathBuf, PathBuf, PathBuf) {
        let root = std::env::temp_dir().join(format!(
            "personal-place-storage-{name}-{}",
            std::process::id()
        ));
        let registry = root.join("launcher-registry.json");
        let backups = root.join("backups");
        (root, registry, backups)
    }

    fn legacy_state() -> WorkspaceState {
        WorkspaceState {
            workspaces: vec![Workspace {
                id: "home".to_string(),
                name: "首頁".to_string(),
                symbol: "⌂".to_string(),
            }],
            items: vec![
                LauncherItem {
                    id: "local-card".to_string(),
                    workspace_id: "home".to_string(),
                    title: "Example".to_string(),
                    subtitle: "桌面應用程式".to_string(),
                    kind: "local".to_string(),
                    target: "local-example".to_string(),
                    symbol: "◆".to_string(),
                    tone: "violet".to_string(),
                    size: "square".to_string(),
                },
                LauncherItem {
                    id: "web-card".to_string(),
                    workspace_id: "home".to_string(),
                    title: "Example Web".to_string(),
                    subtitle: "https://example.com".to_string(),
                    kind: "web".to_string(),
                    target: "https://example.com".to_string(),
                    symbol: "↗".to_string(),
                    tone: "cyan".to_string(),
                    size: "wide".to_string(),
                },
            ],
        }
    }

    #[test]
    fn new_database_starts_with_one_empty_page() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let (root, registry, backups) = test_paths("new");
        let state = store
            .initialize(None, &HashMap::new(), &registry, &backups)
            .expect("initialize store");
        assert_eq!(state.workspaces.len(), 1);
        assert_eq!(state.workspaces[0].name, "我的地方");
        assert!(state.items.is_empty());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_import_is_idempotent_and_keeps_local_targets() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let (root, registry, backups) = test_paths("legacy");
        let mut targets = HashMap::new();
        targets.insert(
            "local-example".to_string(),
            PathBuf::from(r"C:\Example.exe"),
        );
        let first = store
            .initialize(Some(legacy_state()), &targets, &registry, &backups)
            .expect("import legacy state");
        let second = store
            .initialize(Some(legacy_state()), &targets, &registry, &backups)
            .expect("repeat import");
        assert_eq!(first, second);
        assert_eq!(second.items.len(), 2);
        assert_eq!(
            store
                .resolve_local_target("local-example")
                .expect("resolve target"),
            Some(PathBuf::from(r"C:\Example.exe"))
        );
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn failed_save_keeps_the_previous_state() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let (root, registry, backups) = test_paths("rollback");
        let initial = store
            .initialize(Some(legacy_state()), &HashMap::new(), &registry, &backups)
            .expect("initialize store");
        let mut invalid = initial.clone();
        invalid.items[0].workspace_id = "missing-page".to_string();
        assert!(store.save(&invalid).is_err());
        assert_eq!(store.load().expect("reload state"), initial);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn normal_save_cannot_register_an_arbitrary_url_and_rolls_back() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let (root, registry, backups) = test_paths("reject-raw-url-save");
        let initial = store
            .initialize(Some(legacy_state()), &HashMap::new(), &registry, &backups)
            .expect("initialize store");
        let mut untrusted = initial.clone();
        untrusted.items.push(LauncherItem {
            id: "untrusted-web-card".to_string(),
            workspace_id: "home".to_string(),
            title: "Untrusted".to_string(),
            subtitle: "Website".to_string(),
            kind: "web".to_string(),
            target: "https://untrusted.invalid/launch".to_string(),
            symbol: "↗".to_string(),
            tone: "cyan".to_string(),
            size: "square".to_string(),
        });

        assert!(store.save(&untrusted).is_err());
        assert_eq!(store.load().expect("reload state"), initial);
        assert!(store
            .resolve_card_target("untrusted-web-card")
            .expect("query card")
            .is_none());
        let target_exists: bool = store
            .lock()
            .expect("lock store")
            .query_row(
                "SELECT EXISTS(SELECT 1 FROM targets WHERE id = ?1)",
                ["https://untrusted.invalid/launch"],
                |row| row.get(0),
            )
            .expect("query target");
        assert!(!target_exists);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn normal_save_preserves_an_ingested_url_target_and_locator() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let (root, registry, backups) = test_paths("preserve-ingested-url");
        store
            .initialize(None, &HashMap::new(), &registry, &backups)
            .expect("initialize store");
        let target_id = "url-target-from-ingest";
        let locator = "https://example.com/original?source=ingest";
        let card = LauncherItem {
            id: "ingested-web-card".to_string(),
            workspace_id: "home".to_string(),
            title: "Original".to_string(),
            subtitle: locator.to_string(),
            kind: "web".to_string(),
            target: target_id.to_string(),
            symbol: "↗".to_string(),
            tone: "cyan".to_string(),
            size: "square".to_string(),
        };
        assert!(matches!(
            store
                .insert_ingested_item(&card, "url", locator, false)
                .expect("ingest target"),
            InsertItemResult::Added(_)
        ));

        let mut state = store.load().expect("load ingested state");
        let saved_card = state
            .items
            .iter_mut()
            .find(|item| item.id == card.id)
            .expect("find card");
        saved_card.title = "Renamed".to_string();
        saved_card.size = "wide".to_string();
        store.save(&state).expect("save card edit");

        let resolved = store
            .resolve_card_target(&card.id)
            .expect("resolve target")
            .expect("target exists");
        assert_eq!(resolved.card.target, target_id);
        assert_eq!(resolved.card.title, "Renamed");
        assert_eq!(resolved.card.size, "wide");
        assert_eq!(resolved.target_kind, "url");
        assert_eq!(resolved.locator, locator);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn ingest_target_id_collision_never_retargets_existing_cards() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let (root, registry, backups) = test_paths("target-collision");
        store
            .initialize(None, &HashMap::new(), &registry, &backups)
            .expect("initialize store");
        let original = LauncherItem {
            id: "original-card".to_string(),
            workspace_id: "home".to_string(),
            title: "Original".to_string(),
            subtitle: "https://example.com/original".to_string(),
            kind: "web".to_string(),
            target: "forced-collision-id".to_string(),
            symbol: "↗".to_string(),
            tone: "cyan".to_string(),
            size: "square".to_string(),
        };
        store
            .insert_ingested_item(&original, "url", "https://example.com/original", false)
            .expect("insert original");
        let colliding = LauncherItem {
            id: "colliding-card".to_string(),
            title: "Collision".to_string(),
            subtitle: "https://attacker.invalid/replacement".to_string(),
            ..original.clone()
        };
        assert!(store
            .insert_ingested_item(
                &colliding,
                "url",
                "https://attacker.invalid/replacement",
                true,
            )
            .is_err());

        let preserved = store
            .resolve_card_target(&original.id)
            .expect("resolve original")
            .expect("original exists");
        assert_eq!(preserved.locator, "https://example.com/original");
        assert!(store
            .resolve_card_target(&colliding.id)
            .expect("resolve collision")
            .is_none());
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn legacy_url_mistaken_for_an_app_is_normalized() {
        let store = WorkspaceStore::in_memory().expect("create store");
        let (root, registry, backups) = test_paths("url-normalization");
        let mut state = legacy_state();
        state.items.push(LauncherItem {
            id: "misclassified-url".to_string(),
            workspace_id: "home".to_string(),
            title: "Web".to_string(),
            subtitle: "Website".to_string(),
            kind: "app".to_string(),
            target: "https://example.org/".to_string(),
            symbol: "↗".to_string(),
            tone: "cyan".to_string(),
            size: "square".to_string(),
        });
        let loaded = store
            .initialize(Some(state), &HashMap::new(), &registry, &backups)
            .expect("import legacy URL");
        let item = loaded
            .items
            .iter()
            .find(|item| item.id == "misclassified-url")
            .expect("find normalized card");
        assert_eq!(item.kind, "web");
        let _ = std::fs::remove_dir_all(root);
    }

    fn create_v2_fixture(path: &Path, invalid_target: bool) -> Connection {
        let connection = Connection::open(path).expect("open v2 fixture");
        connection
            .execute_batch(
                "PRAGMA journal_mode = WAL;
                 PRAGMA foreign_keys = OFF;
                 CREATE TABLE metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
                 CREATE TABLE pages(
                     id TEXT PRIMARY KEY, name TEXT NOT NULL,
                     symbol TEXT NOT NULL, position INTEGER NOT NULL
                 );
                 CREATE TABLE targets(
                     id TEXT PRIMARY KEY, kind TEXT NOT NULL, locator TEXT NOT NULL
                 );
                 CREATE TABLE cards(
                     id TEXT PRIMARY KEY,
                     page_id TEXT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
                     target_id TEXT NOT NULL REFERENCES targets(id),
                     title TEXT NOT NULL, subtitle TEXT NOT NULL, kind TEXT NOT NULL,
                     symbol TEXT NOT NULL, tone TEXT NOT NULL,
                     size TEXT NOT NULL CHECK(size IN ('square', 'wide')),
                     position INTEGER NOT NULL
                 );
                 CREATE INDEX cards_page_position ON cards(page_id, position);
                 INSERT INTO metadata VALUES('bootstrap_complete', '1');
                 INSERT INTO pages VALUES('home', '我的地方', '⌂', 0);
                 INSERT INTO targets VALUES('target-one', 'local', 'C:\\Fixture.exe');
                 PRAGMA user_version = 2;",
            )
            .expect("create v2 schema");
        let target = if invalid_target {
            "missing-target"
        } else {
            "target-one"
        };
        connection
            .execute(
                "INSERT INTO cards VALUES(
                     'card-one', 'home', ?1, 'Fixture', '桌面應用程式',
                     'local', '◆', 'violet', 'wide', 0
                 )",
                [target],
            )
            .expect("insert v2 card");
        connection
    }

    #[test]
    fn schema_v2_fixture_migrates_to_v3_with_consistent_backup() {
        let root = std::env::temp_dir().join(format!(
            "personal-place-v2-v3-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create fixture root");
        let database = root.join("personal-place.db");
        let writer = create_v2_fixture(&database, false);

        let store = WorkspaceStore::open(&database).expect("migrate fixture");
        let dashboard = store.get_dashboard().expect("load v3 dashboard");
        assert_eq!(dashboard.cards.len(), 1);
        let card = &dashboard.cards[0];
        assert_eq!(card.id, "card-one");
        assert_eq!(card.target_id.as_deref(), Some("target-one"));
        assert_eq!(card.card_type, "target");
        assert_eq!(card.size, "wide");
        assert_eq!(card.tone, "violet");
        assert_eq!(card.position, 0);

        let backup_dir = root.join("backups").join("schema-migrations");
        let backups = fs::read_dir(&backup_dir)
            .expect("read backups")
            .collect::<Result<Vec<_>, _>>()
            .expect("collect backups");
        assert_eq!(backups.len(), 1);
        let backup = Connection::open(backups[0].path()).expect("open backup");
        let backup_count: i64 = backup
            .query_row(
                "SELECT COUNT(*) FROM cards WHERE id = 'card-one'",
                [],
                |row| row.get(0),
            )
            .expect("query backup card");
        assert_eq!(backup_count, 1, "WAL 內的卡片也必須存在於一致性備份");

        drop(store);
        drop(writer);
        let reopened = WorkspaceStore::open(&database).expect("reopen v3");
        assert_eq!(reopened.get_dashboard().unwrap().cards.len(), 1);
        assert_eq!(
            fs::read_dir(&backup_dir)
                .unwrap()
                .filter_map(Result::ok)
                .filter(
                    |entry| entry.path().extension().and_then(|value| value.to_str()) == Some("db")
                )
                .count(),
            1
        );
        drop(reopened);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn failed_v2_to_v3_migration_keeps_schema_v2() {
        let root = std::env::temp_dir().join(format!(
            "personal-place-v2-failure-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create fixture root");
        let database = root.join("personal-place.db");
        let writer = create_v2_fixture(&database, true);
        assert!(WorkspaceStore::open(&database).is_err());
        drop(writer);

        let connection = Connection::open(&database).expect("reopen failed migration");
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read version");
        assert_eq!(version, 2);
        let has_card_type: bool = connection
            .query_row(
                "SELECT EXISTS(
                     SELECT 1 FROM pragma_table_info('cards') WHERE name = 'card_type'
                 )",
                [],
                |row| row.get(0),
            )
            .expect("inspect v2 table");
        assert!(!has_card_type);
        drop(connection);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn copied_user_database_migrates_without_touching_the_source() {
        let Ok(source_path) = std::env::var("PERSONAL_PLACE_TEST_SOURCE_DB") else {
            return;
        };
        let source_path = PathBuf::from(source_path);
        let source =
            Connection::open_with_flags(&source_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .expect("open user database read-only");
        let source_version: i64 = source
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read source schema");
        assert_eq!(
            source_version, 2,
            "驗證來源必須是尚未升級的 schema v2 副本來源"
        );
        let source_cards: i64 = source
            .query_row("SELECT COUNT(*) FROM cards", [], |row| row.get(0))
            .expect("count source cards");

        let root = std::env::temp_dir().join(format!(
            "personal-place-user-copy-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&root).expect("create copy root");
        let copied_database = root.join("personal-place.db");
        source
            .backup(MAIN_DB, &copied_database, None)
            .expect("create consistent source copy");
        drop(source);

        let store = WorkspaceStore::open(&copied_database).expect("migrate copied user database");
        let dashboard = store.get_dashboard().expect("load migrated copy");
        assert_eq!(dashboard.cards.len() as i64, source_cards);
        let connection = store.lock().expect("lock migrated copy");
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read migrated schema");
        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("integrity check");
        let foreign_key_errors: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .expect("foreign key check");
        assert_eq!(version, 3);
        assert_eq!(integrity, "ok");
        assert_eq!(foreign_key_errors, 0);
        drop(connection);
        drop(store);
        let _ = fs::remove_dir_all(root);
    }

    #[test]
    fn upgraded_user_database_and_automatic_backup_are_valid() {
        let Ok(database_path) = std::env::var("PERSONAL_PLACE_VALIDATE_DB") else {
            return;
        };
        let backup_path = std::env::var("PERSONAL_PLACE_VALIDATE_BACKUP")
            .expect("backup path is required with validation database");
        let connection =
            Connection::open_with_flags(database_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .expect("open upgraded user database read-only");
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read upgraded version");
        let integrity: String = connection
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("check upgraded integrity");
        let foreign_key_errors: i64 = connection
            .query_row("SELECT COUNT(*) FROM pragma_foreign_key_check", [], |row| {
                row.get(0)
            })
            .expect("check upgraded foreign keys");
        let card_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM cards", [], |row| row.get(0))
            .expect("count upgraded cards");
        assert_eq!(version, 3);
        assert_eq!(integrity, "ok");
        assert_eq!(foreign_key_errors, 0);

        let backup =
            Connection::open_with_flags(backup_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY)
                .expect("open automatic migration backup read-only");
        let backup_version: i64 = backup
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .expect("read backup version");
        let backup_integrity: String = backup
            .query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .expect("check backup integrity");
        let backup_card_count: i64 = backup
            .query_row("SELECT COUNT(*) FROM cards", [], |row| row.get(0))
            .expect("count backup cards");
        assert_eq!(backup_version, 2);
        assert_eq!(backup_integrity, "ok");
        assert_eq!(backup_card_count, card_count);
    }
}
