use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::{Arc, Mutex},
};
use tauri::{Manager, State};

mod dashboard;
mod ingest;
mod preview;
mod storage;

use dashboard::{CardMutation, DashboardState};
use ingest::{IngestRequest, IngestResult};
use preview::{PreviewCacheInfo, PreviewPayload};
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
    legacy_registry_path: PathBuf,
    legacy_targets: Arc<HashMap<String, PathBuf>>,
    legacy_backup_dir: PathBuf,
    preview_cache_dir: PathBuf,
    preview_cache_io: Arc<Mutex<()>>,
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
) -> Result<DashboardState, String> {
    let store = Arc::clone(&runtime.store);
    let legacy_targets = Arc::clone(&runtime.legacy_targets);
    let legacy_registry_path = runtime.legacy_registry_path.clone();
    let legacy_backup_dir = runtime.legacy_backup_dir.clone();
    tauri::async_runtime::spawn_blocking(move || {
        store.initialize(
            legacy_state,
            &legacy_targets,
            &legacy_registry_path,
            &legacy_backup_dir,
        )?;
        store.get_dashboard()
    })
    .await
    .map_err(|error| format!("初始資料背景工作失敗：{error}"))?
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
) -> Result<Option<PreviewPayload>, String> {
    let store = Arc::clone(&runtime.store);
    let cache_dir = runtime.preview_cache_dir.clone();
    let cache_io = Arc::clone(&runtime.preview_cache_io);
    tauri::async_runtime::spawn_blocking(move || {
        let target = store
            .resolve_card_target(&card_id)?
            .ok_or_else(|| "找不到要預覽的卡片。".to_string())?;
        let cache_key = ingest::preview_cache_key(&target.card.target);
        let _guard = cache_io
            .lock()
            .map_err(|_| "縮圖儲存區暫時無法使用。".to_string())?;
        match target.target_kind.as_str() {
            "url" => Ok(Some(
                preview::load_remote_icon(&cache_dir, &cache_key)?
                    .unwrap_or_else(preview::generic_web_icon),
            )),
            "local" => {
                let path = PathBuf::from(&target.locator);
                if !path.exists() {
                    return Ok(None);
                }
                preview::load_or_generate_cached(&cache_dir, &cache_key, &path)
            }
            "builtin" => {
                let Some(path) = ingest::built_in_path(&target.locator) else {
                    return Ok(None);
                };
                if !path.exists() {
                    return Ok(None);
                }
                preview::load_or_generate_cached(&cache_dir, &cache_key, &path)
            }
            _ => Ok(None),
        }
    })
    .await
    .map_err(|error| format!("縮圖背景工作失敗：{error}"))?
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
    match target.target_kind.as_str() {
        "url" => {
            let url = ingest::normalize_url(&target.locator)?;
            open::that(url.as_str()).map_err(|error| format!("無法開啟網址：{error}"))
        }
        "local" => {
            let path = PathBuf::from(&target.locator);
            if !path.exists() {
                return Err(format!("這個項目已被移動或刪除：{}", path.display()));
            }
            open::that(&path).map_err(|error| format!("無法開啟 {}：{error}", path.display()))
        }
        "builtin" => {
            let executable = match target.locator.as_str() {
                "file-explorer" => "explorer.exe",
                "notepad" => "notepad.exe",
                "calculator" => "calc.exe",
                _ => return Err("這張舊版應用程式卡片沒有可用的啟動目標。".to_string()),
            };
            Command::new(executable)
                .spawn()
                .map(|_| ())
                .map_err(|error| format!("無法啟動 {}：{error}", target.card.title))
        }
        "missing" => Err("這張卡片的目標已遺失。".to_string()),
        _ => Err("這張卡片使用不支援的目標類型。".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            let store = WorkspaceStore::open(&app_data_dir.join("personal-place.db"))
                .map_err(std::io::Error::other)?;
            let preview_cache_dir = app.path().app_cache_dir()?.join("previews");
            fs::create_dir_all(&preview_cache_dir)?;
            app.manage(PersonalPlaceRuntime {
                store: Arc::new(store),
                legacy_registry_path,
                legacy_targets: Arc::new(legacy_targets),
                legacy_backup_dir: app_data_dir.join("legacy-backups"),
                preview_cache_dir,
                preview_cache_io: Arc::new(Mutex::new(())),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            initialize_workspace,
            get_dashboard,
            ingest_items,
            update_card,
            move_cards,
            delete_cards,
            create_group,
            ungroup,
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
