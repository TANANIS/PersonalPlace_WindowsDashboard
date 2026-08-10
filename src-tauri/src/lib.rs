use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};
use tauri::{AppHandle, Manager, State};

mod backup;
mod dashboard;
mod ingest;
mod launcher;
mod preview;
mod recovery;
mod reliability;
mod storage;

use dashboard::{CardMutation, DashboardState};
use ingest::{IngestRequest, IngestResult};
use preview::PreviewCacheInfo;
use storage::{WorkspaceState, WorkspaceStore};

#[derive(Clone, Deserialize, Serialize)]
struct RegisteredPath {
    path: PathBuf,
}

#[derive(Default, Deserialize, Serialize)]
struct RegistryDocument {
    targets: HashMap<String, RegisteredPath>,
}

struct PersonalPlaceRuntime {
    store: Arc<WorkspaceStore>,
    database_error: Option<String>,
    database_path: PathBuf,
    legacy_registry_path: PathBuf,
    legacy_targets: Arc<HashMap<String, PathBuf>>,
    legacy_backup_dir: PathBuf,
    preview_cache_dir: PathBuf,
    preview_cache_io: Arc<Mutex<()>>,
    safety_backup_dir: PathBuf,
    recovery_backup_dir: PathBuf,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCardRequest {
    card_id: String,
    title: Option<String>,
    subtitle: Option<String>,
    tone: Option<String>,
    size: Option<String>,
    #[serde(default)]
    reset_auto: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    code: String,
    message: String,
}

impl CommandError {
    fn new(code: &str, message: impl Into<String>) -> Self {
        Self {
            code: code.to_string(),
            message: message.into(),
        }
    }

    fn storage(message: String) -> Self {
        Self::new("storageError", message)
    }
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MoveCardsRequest {
    card_ids: Vec<String>,
    destination_page_id: String,
    destination_group_id: Option<String>,
    target_index: usize,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CardIdsRequest {
    card_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateGroupRequest {
    page_id: String,
    card_ids: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct GroupRequest {
    group_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdatePageRequest {
    page_id: String,
    name: String,
    symbol: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct MovePageRequest {
    page_id: String,
    direction: i32,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageRequest {
    page_id: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateGroupResult {
    dashboard: DashboardState,
    group_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreateNoteRequest {
    page_id: String,
    parent_group_id: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CreateNoteResult {
    dashboard: DashboardState,
    note_id: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateNoteRequest {
    card_id: String,
    note_text: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateGroupResumeRequest {
    group_id: String,
    resume_note: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SetLaunchEnabledRequest {
    card_id: String,
    enabled: bool,
    #[serde(default)]
    allow_risky: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SearchRequest {
    query: String,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CheckTargetsRequest {
    page_id: String,
    parent_group_id: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RelinkTargetRequest {
    card_id: String,
    new_path: String,
    #[serde(default)]
    allow_risky: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct BackupPathRequest {
    path: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct RecoveryInfo {
    technical_error: String,
    backup_folder: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PreviewReference {
    asset_url: String,
    kind: String,
}

fn load_registry(file_path: &Path) -> RegistryDocument {
    fs::read_to_string(file_path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
        .unwrap_or_default()
}

#[tauri::command]
async fn initialize_workspace(
    legacy_state: Option<WorkspaceState>,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    if let Some(error) = runtime.database_error.as_deref() {
        return Err(CommandError::new(
            "databaseUnavailable",
            format!("Personal Place 無法開啟目前的資料庫：{error}"),
        ));
    }
    let store = Arc::clone(&runtime.store);
    let legacy_targets = Arc::clone(&runtime.legacy_targets);
    let legacy_registry_path = runtime.legacy_registry_path.clone();
    let legacy_backup_dir = runtime.legacy_backup_dir.clone();
    let result = tauri::async_runtime::spawn_blocking(move || {
        store.initialize(
            legacy_state,
            &legacy_targets,
            &legacy_registry_path,
            &legacy_backup_dir,
        )?;
        store.get_dashboard()
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("初始資料背景工作失敗：{error}"))
    })?;
    result.map_err(CommandError::storage)
}

#[tauri::command]
fn get_recovery_info(
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<RecoveryInfo, CommandError> {
    let technical_error = runtime
        .database_error
        .clone()
        .ok_or_else(|| CommandError::new("recoveryUnavailable", "目前不需要資料庫復原。"))?;
    Ok(RecoveryInfo {
        technical_error,
        backup_folder: runtime.recovery_backup_dir.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn open_recovery_backup_folder(
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<(), CommandError> {
    fs::create_dir_all(&runtime.recovery_backup_dir)
        .map_err(|error| CommandError::storage(format!("無法建立備份資料夾：{error}")))?;
    open::that(&runtime.recovery_backup_dir)
        .map_err(|error| CommandError::new("openFailed", format!("無法開啟備份資料夾：{error}")))
}

#[tauri::command]
async fn recover_database(
    request: BackupPathRequest,
    app: AppHandle,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<(), CommandError> {
    if runtime.database_error.is_none() {
        return Err(CommandError::new(
            "recoveryUnavailable",
            "目前資料庫可以正常使用，不需要執行復原。",
        ));
    }
    let database_path = runtime.database_path.clone();
    let recovery_backup_dir = runtime.recovery_backup_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        recovery::replace_database_from_backup(
            Path::new(&request.path),
            &database_path,
            &recovery_backup_dir,
        )
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "backgroundFailed",
            format!("復原資料庫背景工作失敗：{error}"),
        )
    })?
    .map_err(CommandError::storage)?;
    app.restart()
}

#[tauri::command]
async fn get_dashboard(runtime: State<'_, PersonalPlaceRuntime>) -> Result<DashboardState, String> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || store.get_dashboard())
        .await
        .map_err(|error| format!("資料讀取背景工作失敗：{error}"))?
}

#[tauri::command]
async fn ingest_items(
    request: IngestRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<IngestResult, CommandError> {
    let store = Arc::clone(&runtime.store);
    let preview_cache_dir = runtime.preview_cache_dir.clone();
    let preview_cache_io = Arc::clone(&runtime.preview_cache_io);
    tauri::async_runtime::spawn_blocking(move || {
        ingest::ingest_items(&store, &preview_cache_dir, &preview_cache_io, request)
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("新增內容背景工作失敗：{error}"))
    })
}

#[tauri::command]
async fn update_card(
    request: UpdateCardRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    validate_update_request(&request)
        .map_err(|message| CommandError::new("invalidInput", message))?;
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        let update = if request.reset_auto {
            let target = store
                .resolve_card_target(&request.card_id)?
                .ok_or_else(|| "找不到要重設的卡片。".to_string())?;
            let defaults = ingest::automatic_defaults(&target);
            CardMutation {
                title: Some(defaults.title),
                subtitle: Some(defaults.subtitle),
                symbol: Some(defaults.symbol),
                tone: Some(defaults.tone),
                size: Some(defaults.size),
            }
        } else {
            CardMutation {
                title: request.title.map(|title| title.trim().to_string()),
                subtitle: request.subtitle,
                symbol: None,
                tone: request.tone,
                size: request.size,
            }
        };
        store.update_dashboard_card(&request.card_id, update)
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("卡片更新背景工作失敗：{error}"))
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn move_cards(
    request: MoveCardsRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store.move_cards(
            &request.card_ids,
            &request.destination_page_id,
            request.destination_group_id.as_deref(),
            request.target_index,
        )
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("卡片移動背景工作失敗：{error}"))
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn delete_cards(
    request: CardIdsRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || store.delete_cards(&request.card_ids))
        .await
        .map_err(|error| {
            CommandError::new("backgroundFailed", format!("卡片刪除背景工作失敗：{error}"))
        })?
        .map_err(CommandError::storage)
}

#[tauri::command]
async fn create_group(
    request: CreateGroupRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<CreateGroupResult, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store
            .create_group(&request.page_id, &request.card_ids)
            .map(|(dashboard, group_id)| CreateGroupResult {
                dashboard,
                group_id,
            })
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("建立群組背景工作失敗：{error}"))
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn ungroup(
    request: GroupRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || store.ungroup(&request.group_id))
        .await
        .map_err(|error| {
            CommandError::new("backgroundFailed", format!("解散群組背景工作失敗：{error}"))
        })?
        .map_err(CommandError::storage)
}

#[tauri::command]
async fn create_note(
    request: CreateNoteRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<CreateNoteResult, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store
            .create_note(&request.page_id, request.parent_group_id.as_deref())
            .map(|(dashboard, note_id)| CreateNoteResult { dashboard, note_id })
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("新增筆記背景工作失敗：{error}"))
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn update_note(
    request: UpdateNoteRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store.update_note_text(&request.card_id, &request.note_text)
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("保存筆記背景工作失敗：{error}"))
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn update_group_resume(
    request: UpdateGroupResumeRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store.update_group_resume_note(&request.group_id, &request.resume_note)
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "backgroundFailed",
            format!("保存最近狀態背景工作失敗：{error}"),
        )
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn set_launch_enabled(
    request: SetLaunchEnabledRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store.set_launch_enabled(&request.card_id, request.enabled, request.allow_risky)
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "backgroundFailed",
            format!("更新一次開啟清單背景工作失敗：{error}"),
        )
    })?
    .map_err(|message| {
        if message == "riskyConfirmationRequired" {
            CommandError::new(
                "riskyConfirmationRequired",
                "開啟此卡片可能執行程式或變更系統，請再次確認。",
            )
        } else {
            CommandError::storage(message)
        }
    })
}

#[tauri::command]
async fn launch_group(
    request: GroupRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<launcher::GroupLaunchResult, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || launcher::launch_group(&store, &request.group_id))
        .await
        .map_err(|error| {
            CommandError::new("backgroundFailed", format!("開啟群組背景工作失敗：{error}"))
        })?
        .map_err(CommandError::storage)
}

#[tauri::command]
async fn search_dashboard(
    request: SearchRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<Vec<reliability::SearchResult>, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        reliability::search_dashboard(&store, &request.query)
    })
    .await
    .map_err(|error| CommandError::new("backgroundFailed", format!("搜尋背景工作失敗：{error}")))?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn check_targets(
    request: CheckTargetsRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<Vec<reliability::TargetStatus>, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        reliability::check_targets(&store, &request.page_id, request.parent_group_id.as_deref())
    })
    .await
    .map_err(|error| {
        CommandError::new(
            "backgroundFailed",
            format!("目標狀態檢查背景工作失敗：{error}"),
        )
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn relink_target(
    request: RelinkTargetRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    let cache_dir = runtime.preview_cache_dir.clone();
    let cache_io = Arc::clone(&runtime.preview_cache_io);
    tauri::async_runtime::spawn_blocking(move || {
        let relinked = reliability::relink_target(
            &store,
            &request.card_id,
            Path::new(&request.new_path),
            request.allow_risky,
        )?;
        let _guard = cache_io
            .lock()
            .map_err(|_| "縮圖儲存區暫時無法使用。".to_string())?;
        preview::remove_cached_preview(
            &cache_dir,
            &ingest::preview_cache_key(&relinked.old_target_id),
        )?;
        preview::remove_cached_preview(
            &cache_dir,
            &ingest::preview_cache_key(&relinked.new_target_id),
        )?;
        Ok::<_, String>(relinked.dashboard)
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("重新定位背景工作失敗：{error}"))
    })?
    .map_err(|message| {
        if message == "riskyConfirmationRequired" {
            CommandError::new(
                "riskyConfirmationRequired",
                "重新定位到高風險內容可能執行程式或變更系統，請再次確認。",
            )
        } else {
            CommandError::storage(message)
        }
    })
}

#[tauri::command]
async fn export_backup(
    request: BackupPathRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<backup::ExportResult, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        backup::export_backup(&store, Path::new(&request.path))
    })
    .await
    .map_err(|error| CommandError::new("backgroundFailed", format!("匯出背景工作失敗：{error}")))?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn inspect_backup(request: BackupPathRequest) -> Result<backup::BackupPreview, CommandError> {
    tauri::async_runtime::spawn_blocking(move || backup::inspect_backup(Path::new(&request.path)))
        .await
        .map_err(|error| {
            CommandError::new("backgroundFailed", format!("備份檢查背景工作失敗：{error}"))
        })?
        .map_err(CommandError::storage)
}

#[tauri::command]
async fn restore_backup(
    request: BackupPathRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<backup::RestoreResult, CommandError> {
    let store = Arc::clone(&runtime.store);
    let safety_backup_dir = runtime.safety_backup_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        backup::restore_backup(&store, Path::new(&request.path), &safety_backup_dir)
    })
    .await
    .map_err(|error| CommandError::new("backgroundFailed", format!("還原背景工作失敗：{error}")))?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn undo_last(
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || store.undo_last())
        .await
        .map_err(|error| {
            CommandError::new("backgroundFailed", format!("復原背景工作失敗：{error}"))
        })?
        .map_err(CommandError::storage)
}

#[tauri::command]
async fn create_page(
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || store.create_page())
        .await
        .map_err(|error| {
            CommandError::new("backgroundFailed", format!("新增頁面背景工作失敗：{error}"))
        })?
        .map_err(CommandError::storage)
}

#[tauri::command]
async fn update_page(
    request: UpdatePageRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store.update_page(&request.page_id, &request.name, &request.symbol)
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("頁面更新背景工作失敗：{error}"))
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn move_page(
    request: MovePageRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        store.move_page(&request.page_id, request.direction)
    })
    .await
    .map_err(|error| {
        CommandError::new("backgroundFailed", format!("頁面排序背景工作失敗：{error}"))
    })?
    .map_err(CommandError::storage)
}

#[tauri::command]
async fn delete_page(
    request: PageRequest,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<DashboardState, CommandError> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || store.delete_page(&request.page_id))
        .await
        .map_err(|error| {
            CommandError::new("backgroundFailed", format!("頁面刪除背景工作失敗：{error}"))
        })?
        .map_err(CommandError::storage)
}

fn validate_update_request(request: &UpdateCardRequest) -> Result<(), String> {
    if request.card_id.trim().is_empty() {
        return Err("卡片 ID 不能是空白。".to_string());
    }
    if request.reset_auto {
        return Ok(());
    }
    if let Some(title) = request.title.as_deref() {
        if title.trim().is_empty() {
            return Err("顯示名稱不能是空白。".to_string());
        }
        if title.chars().count() > 200 {
            return Err("顯示名稱不能超過 200 個字。".to_string());
        }
    }
    if let Some(subtitle) = request.subtitle.as_deref() {
        if subtitle.chars().count() > 500 {
            return Err("副標題不能超過 500 個字。".to_string());
        }
    }
    if let Some(tone) = request.tone.as_deref() {
        if !matches!(tone, "violet" | "cyan" | "amber" | "rose" | "slate") {
            return Err("不支援這個卡片色調。".to_string());
        }
    }
    if let Some(size) = request.size.as_deref() {
        if !matches!(size, "square" | "wide") {
            return Err("不支援這個卡片尺寸。".to_string());
        }
    }
    Ok(())
}

#[tauri::command]
async fn get_item_preview(
    card_id: String,
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<Option<PreviewReference>, String> {
    let store = Arc::clone(&runtime.store);
    tauri::async_runtime::spawn_blocking(move || {
        let target = store
            .resolve_card_target(&card_id)?
            .ok_or_else(|| "找不到要預覽的卡片。".to_string())?;
        let (kind, version) = match target.target_kind.as_str() {
            "url" => ("icon".to_string(), target.card.target.clone()),
            "local" => {
                let path = PathBuf::from(&target.locator);
                if !path.exists() {
                    return Ok(None);
                }
                (
                    preview::preview_kind_hint(&path),
                    preview::preview_version_hint(&path),
                )
            }
            "builtin" => {
                let Some(path) = ingest::built_in_path(&target.locator) else {
                    return Ok(None);
                };
                if !path.exists() {
                    return Ok(None);
                }
                ("icon".to_string(), preview::preview_version_hint(&path))
            }
            _ => return Ok(None),
        };
        let encoded_card =
            percent_encoding::utf8_percent_encode(&card_id, percent_encoding::NON_ALPHANUMERIC);
        let encoded_version =
            percent_encoding::utf8_percent_encode(&version, percent_encoding::NON_ALPHANUMERIC);
        Ok(Some(PreviewReference {
            asset_url: format!("http://preview.localhost/{encoded_card}?v={encoded_version}"),
            kind,
        }))
    })
    .await
    .map_err(|error| format!("縮圖背景工作失敗：{error}"))?
}

fn load_preview_asset(
    store: &WorkspaceStore,
    cache_dir: &Path,
    cache_io: &Mutex<()>,
    card_id: &str,
) -> Result<preview::PreviewAsset, String> {
    let target = store
        .resolve_card_target(card_id)?
        .ok_or_else(|| "找不到要預覽的卡片。".to_string())?;
    let cache_key = ingest::preview_cache_key(&target.card.target);
    let _guard = cache_io
        .lock()
        .map_err(|_| "縮圖儲存區暫時無法使用。".to_string())?;
    match target.target_kind.as_str() {
        "url" => preview::load_remote_icon(cache_dir, &cache_key)?
            .map(Ok)
            .unwrap_or_else(preview::generic_web_asset),
        "local" => {
            let path = PathBuf::from(&target.locator);
            if !path.exists() {
                return Err("預覽來源已不存在。".to_string());
            }
            preview::load_or_generate_cached(cache_dir, &cache_key, &path)?
                .ok_or_else(|| "這個項目沒有可用的預覽。".to_string())
        }
        "builtin" => {
            let path = ingest::built_in_path(&target.locator)
                .ok_or_else(|| "內建應用程式沒有可用的預覽路徑。".to_string())?;
            preview::load_or_generate_cached(cache_dir, &cache_key, &path)?
                .ok_or_else(|| "這個應用程式沒有可用的預覽。".to_string())
        }
        _ => Err("這個目標類型沒有可用的預覽。".to_string()),
    }
}

fn preview_protocol_response(
    store: Arc<WorkspaceStore>,
    cache_dir: PathBuf,
    cache_io: Arc<Mutex<()>>,
    card_id: String,
) -> tauri::http::Response<Vec<u8>> {
    match load_preview_asset(&store, &cache_dir, &cache_io, &card_id) {
        Ok(asset) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::OK)
            .header(tauri::http::header::CONTENT_TYPE, asset.mime_type)
            .header(
                tauri::http::header::CACHE_CONTROL,
                "private, max-age=31536000, immutable",
            )
            .header("X-Content-Type-Options", "nosniff")
            .body(asset.bytes)
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
        Err(message) => tauri::http::Response::builder()
            .status(tauri::http::StatusCode::NOT_FOUND)
            .header(
                tauri::http::header::CONTENT_TYPE,
                "text/plain; charset=utf-8",
            )
            .header("X-Content-Type-Options", "nosniff")
            .body(message.into_bytes())
            .unwrap_or_else(|_| tauri::http::Response::new(Vec::new())),
    }
}

#[tauri::command]
async fn get_preview_cache_info(
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<PreviewCacheInfo, String> {
    let cache_dir = runtime.preview_cache_dir.clone();
    let cache_io = Arc::clone(&runtime.preview_cache_io);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = cache_io
            .lock()
            .map_err(|_| "縮圖儲存區暫時無法使用。".to_string())?;
        preview::cache_info(&cache_dir)
    })
    .await
    .map_err(|error| format!("無法讀取縮圖儲存區：{error}"))?
}

#[tauri::command]
async fn clear_preview_cache(
    runtime: State<'_, PersonalPlaceRuntime>,
) -> Result<PreviewCacheInfo, String> {
    let cache_dir = runtime.preview_cache_dir.clone();
    let cache_io = Arc::clone(&runtime.preview_cache_io);
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = cache_io
            .lock()
            .map_err(|_| "縮圖儲存區暫時無法使用。".to_string())?;
        preview::clear_cache(&cache_dir)?;
        preview::cache_info(&cache_dir)
    })
    .await
    .map_err(|error| format!("無法清除縮圖儲存區：{error}"))?
}

#[tauri::command]
fn launch_card(card_id: String, runtime: State<'_, PersonalPlaceRuntime>) -> Result<(), String> {
    let target = runtime
        .store
        .resolve_card_target(&card_id)?
        .ok_or_else(|| "找不到要開啟的卡片。".to_string())?;
    launcher::launch_card_target(&target)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .register_asynchronous_uri_scheme_protocol("preview", |context, request, responder| {
            let runtime = context.app_handle().state::<PersonalPlaceRuntime>();
            let store = Arc::clone(&runtime.store);
            let cache_dir = runtime.preview_cache_dir.clone();
            let cache_io = Arc::clone(&runtime.preview_cache_io);
            let encoded_card = request.uri().path().trim_start_matches('/');
            let card_id = percent_encoding::percent_decode_str(encoded_card)
                .decode_utf8_lossy()
                .into_owned();
            std::thread::spawn(move || {
                responder.respond(preview_protocol_response(
                    store, cache_dir, cache_io, card_id,
                ));
            });
        })
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            fs::create_dir_all(&app_data_dir)?;
            let legacy_registry_path = app_data_dir.join("launcher-registry.json");
            let legacy_document = load_registry(&legacy_registry_path);
            let legacy_targets = legacy_document
                .targets
                .into_iter()
                .map(|(id, target)| (id, target.path))
                .collect();
            let database_path = app_data_dir.join("personal-place.db");
            let (store, database_error) = match WorkspaceStore::open(&database_path) {
                Ok(store) => (store, None),
                Err(error) => (
                    WorkspaceStore::in_memory().map_err(std::io::Error::other)?,
                    Some(error),
                ),
            };
            let preview_cache_dir = app.path().app_cache_dir()?.join("previews");
            fs::create_dir_all(&preview_cache_dir)?;
            app.manage(PersonalPlaceRuntime {
                store: Arc::new(store),
                database_error,
                database_path,
                legacy_registry_path,
                legacy_targets: Arc::new(legacy_targets),
                legacy_backup_dir: app_data_dir.join("legacy-backups"),
                preview_cache_dir,
                preview_cache_io: Arc::new(Mutex::new(())),
                safety_backup_dir: app_data_dir.join("backups").join("automatic"),
                recovery_backup_dir: app_data_dir.join("backups").join("recovery"),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initialize_workspace,
            get_recovery_info,
            open_recovery_backup_folder,
            recover_database,
            get_dashboard,
            ingest_items,
            update_card,
            move_cards,
            delete_cards,
            create_group,
            ungroup,
            create_note,
            update_note,
            update_group_resume,
            set_launch_enabled,
            launch_group,
            search_dashboard,
            check_targets,
            relink_target,
            export_backup,
            inspect_backup,
            restore_backup,
            undo_last,
            create_page,
            update_page,
            move_page,
            delete_page,
            launch_card,
            get_item_preview,
            get_preview_cache_info,
            clear_preview_cache
        ])
        .run(tauri::generate_context!())
        .expect("啟動 Personal Place 時發生錯誤");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn update_request_rejects_invalid_user_visible_values() {
        let valid = UpdateCardRequest {
            card_id: "card-1".to_string(),
            title: Some("名稱".to_string()),
            subtitle: None,
            tone: Some("cyan".to_string()),
            size: Some("wide".to_string()),
            reset_auto: false,
        };
        assert!(validate_update_request(&valid).is_ok());
        assert!(validate_update_request(&UpdateCardRequest {
            tone: Some("rainbow".to_string()),
            ..valid.clone()
        })
        .is_err());
        assert!(validate_update_request(&UpdateCardRequest {
            title: Some("   ".to_string()),
            ..valid
        })
        .is_err());
    }
}
