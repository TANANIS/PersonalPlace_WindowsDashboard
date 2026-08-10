use crate::{
    dashboard::GroupLaunchItem,
    ingest,
    storage::{CardTarget, WorkspaceStore},
};
use serde::Serialize;
use std::{path::PathBuf, process::Command, thread, time::Duration};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupLaunchItemResult {
    pub card_id: String,
    pub title: String,
    pub status: String,
    pub message: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupLaunchResult {
    pub group_id: String,
    pub items: Vec<GroupLaunchItemResult>,
    pub state_error: Option<String>,
}

enum LaunchFailure {
    Missing(String),
    Failed(String),
}

pub fn launch_card_target(target: &CardTarget) -> Result<(), String> {
    launch_locator(&target.target_kind, &target.locator, &target.card.title).map_err(|failure| {
        match failure {
            LaunchFailure::Missing(message) | LaunchFailure::Failed(message) => message,
        }
    })
}

pub fn launch_group(store: &WorkspaceStore, group_id: &str) -> Result<GroupLaunchResult, String> {
    let candidates = store.group_launch_items(group_id)?;
    let mut items = Vec::with_capacity(candidates.len());
    let mut attempted = 0usize;
    let mut successful = false;

    for candidate in candidates {
        if !candidate.launch_enabled {
            items.push(result_for(&candidate, "skipped", None));
            continue;
        }
        if attempted > 0 {
            thread::sleep(Duration::from_millis(250));
        }
        attempted += 1;
        match launch_locator(&candidate.target_kind, &candidate.locator, &candidate.title) {
            Ok(()) => {
                successful = true;
                items.push(result_for(&candidate, "success", None));
            }
            Err(LaunchFailure::Missing(message)) => {
                items.push(result_for(&candidate, "missing", Some(message)));
            }
            Err(LaunchFailure::Failed(message)) => {
                items.push(result_for(&candidate, "failed", Some(message)));
            }
        }
    }

    let state_error = if successful {
        store.mark_group_opened(group_id).err()
    } else {
        None
    };
    Ok(GroupLaunchResult {
        group_id: group_id.to_string(),
        items,
        state_error,
    })
}

fn result_for(
    candidate: &GroupLaunchItem,
    status: &str,
    message: Option<String>,
) -> GroupLaunchItemResult {
    GroupLaunchItemResult {
        card_id: candidate.card_id.clone(),
        title: candidate.title.clone(),
        status: status.to_string(),
        message,
    }
}

fn launch_locator(kind: &str, locator: &str, title: &str) -> Result<(), LaunchFailure> {
    match kind {
        "url" => {
            let url = ingest::normalize_url(locator).map_err(LaunchFailure::Failed)?;
            open::that(url.as_str())
                .map_err(|error| LaunchFailure::Failed(format!("無法開啟網址：{error}")))
        }
        "local" => {
            let path = PathBuf::from(locator);
            if !path.exists() {
                return Err(LaunchFailure::Missing(format!(
                    "這個項目已被移動或刪除：{}",
                    path.display()
                )));
            }
            open::that(&path).map_err(|error| {
                LaunchFailure::Failed(format!("無法開啟 {}：{error}", path.display()))
            })
        }
        "builtin" => {
            let executable = match locator {
                "file-explorer" => "explorer.exe",
                "notepad" => "notepad.exe",
                "calculator" => "calc.exe",
                _ => {
                    return Err(LaunchFailure::Missing(
                        "這張舊版應用程式卡片沒有可用的啟動目標。".to_string(),
                    ));
                }
            };
            Command::new(executable)
                .spawn()
                .map(|_| ())
                .map_err(|error| LaunchFailure::Failed(format!("無法啟動 {title}：{error}")))
        }
        "missing" => Err(LaunchFailure::Missing("這張卡片的目標已遺失。".to_string())),
        _ => Err(LaunchFailure::Failed(
            "這張卡片使用不支援的目標類型。".to_string(),
        )),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::{LauncherItem, WorkspaceStore};
    use std::{collections::HashMap, path::Path, time::Instant};

    #[test]
    fn missing_local_target_is_classified_separately() {
        let result = launch_locator(
            "local",
            "Z:\\personal-place-fixture\\missing.exe",
            "Missing",
        );
        assert!(matches!(result, Err(LaunchFailure::Missing(_))));
    }

    #[test]
    fn unknown_target_is_failed_instead_of_missing() {
        let result = launch_locator("script", "anything", "Unknown");
        assert!(matches!(result, Err(LaunchFailure::Failed(_))));
    }

    #[test]
    fn group_launch_continues_after_missing_item_and_keeps_order() {
        let store = WorkspaceStore::in_memory().expect("create store");
        store
            .initialize(
                None,
                &HashMap::new(),
                Path::new("missing-registry"),
                Path::new("backups"),
            )
            .expect("initialize");
        for (position, name) in ["Unity", "VS Code"].iter().enumerate() {
            let item = LauncherItem {
                id: format!("card-{position}"),
                workspace_id: "home".to_string(),
                title: (*name).to_string(),
                subtitle: "fixture".to_string(),
                kind: "local".to_string(),
                target: format!("target-{position}"),
                symbol: "◆".to_string(),
                tone: "violet".to_string(),
                size: "square".to_string(),
            };
            store
                .insert_ingested_item(
                    &item,
                    "local",
                    &format!("Z:\\personal-place-missing-{position}.exe"),
                    false,
                )
                .expect("insert item");
        }
        let (_, group_id) = store
            .create_group("home", &["card-0".to_string(), "card-1".to_string()])
            .expect("create group");
        store
            .set_launch_enabled("card-0", true, false)
            .expect("enable first");
        store
            .set_launch_enabled("card-1", true, false)
            .expect("enable second");

        let started = Instant::now();
        let result = launch_group(&store, &group_id).expect("launch group");
        assert!(started.elapsed() >= Duration::from_millis(240));
        assert_eq!(
            result
                .items
                .iter()
                .map(|item| (item.title.as_str(), item.status.as_str()))
                .collect::<Vec<_>>(),
            vec![("Unity", "missing"), ("VS Code", "missing")]
        );
        assert!(result.state_error.is_none());
    }
}
