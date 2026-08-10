import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  DashboardState,
  ItemSize,
  ItemTone,
  LauncherItem,
  WorkspaceState,
} from "../types";

export interface LauncherPreview {
  assetUrl: string;
  kind: "icon" | "thumbnail" | "text";
}

export interface PreviewCacheInfo {
  entries: number;
  bytes: number;
}

export type IngestInputType = "path" | "url";

export interface IngestInput {
  inputType: IngestInputType;
  value: string;
}

export type IngestIssueCode =
  | "duplicate"
  | "risky"
  | "invalid"
  | "missing"
  | "unsupported"
  | "metadataUnavailable";

export interface IngestProblem {
  inputIndex: number;
  inputType: IngestInputType;
  value: string;
  code: IngestIssueCode;
  message: string;
  cardId?: string;
  title?: string;
}

export interface IngestRequest {
  pageId: string;
  parentGroupId?: string | null;
  inputs: IngestInput[];
  allowDuplicate: boolean;
  allowRisky: boolean;
}

export interface IngestResult {
  added: LauncherItem[];
  issues: IngestProblem[];
  errors: IngestProblem[];
}

export interface CardAppearanceUpdate {
  cardId: string;
  title?: string;
  subtitle?: string;
  tone?: ItemTone;
  size?: ItemSize;
  resetAuto?: boolean;
}

export interface MoveCardsRequest {
  cardIds: string[];
  destinationPageId: string;
  destinationGroupId: string | null;
  targetIndex: number;
}

export interface CreateGroupResult {
  dashboard: DashboardState;
  groupId: string;
}

export interface CreateNoteResult {
  dashboard: DashboardState;
  noteId: string;
}

export type GroupLaunchStatus = "success" | "failed" | "missing" | "skipped";

export interface GroupLaunchItemResult {
  cardId: string;
  title: string;
  status: GroupLaunchStatus;
  message?: string;
}

export interface GroupLaunchResult {
  groupId: string;
  items: GroupLaunchItemResult[];
  stateError?: string;
}

export interface DashboardSearchResult {
  id: string;
  resultType: "page" | "target" | "group" | "note";
  title: string;
  subtitle: string;
  pageId: string;
  pageName: string;
  groupId?: string;
  groupName?: string;
  cardType?: "target" | "group" | "note";
  score: number;
}

export type TargetAvailability = "available" | "missing" | "unavailable" | "unknown";

export interface TargetStatusResult {
  cardId: string;
  status: TargetAvailability;
}

export interface BackupPreview {
  formatVersion: number;
  appVersion: string;
  exportedAt: string;
  pageCount: number;
  cardCount: number;
  groupCount: number;
  noteCount: number;
  targetCount: number;
}

export interface ExportBackupResult {
  path: string;
  preview: BackupPreview;
}

export interface RestoreBackupResult {
  dashboard: DashboardState;
  safetyBackupPath: string;
}

export interface RecoveryInfo {
  technicalError: string;
  backupFolder: string;
}

export type NativeDragEvent =
  | { type: "enter"; paths: string[] }
  | { type: "over" }
  | { type: "drop"; paths: string[] }
  | { type: "leave" };

export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export async function initializeWorkspace(
  legacyState: WorkspaceState | null,
): Promise<DashboardState> {
  if (!isTauriRuntime()) {
    throw new Error("資料庫初始化只支援桌面版。");
  }
  return invoke<DashboardState>("initialize_workspace", { legacyState });
}

export async function getDashboard(): Promise<DashboardState> {
  if (!isTauriRuntime()) {
    throw new Error("資料庫讀取只支援桌面版。");
  }
  return invoke<DashboardState>("get_dashboard");
}

export async function listenForNativeFileDrops(
  listener: (event: NativeDragEvent) => void,
): Promise<(() => void) | null> {
  if (!isTauriRuntime()) return null;

  return getCurrentWindow().onDragDropEvent((event) => {
    listener(event.payload as NativeDragEvent);
  });
}

export async function ingestItems(request: IngestRequest): Promise<IngestResult> {
  if (!isTauriRuntime()) {
    throw new Error("新增本機項目只支援桌面版。");
  }
  return invoke<IngestResult>("ingest_items", { request });
}

export async function getLauncherPreview(
  cardId: string,
): Promise<LauncherPreview | null> {
  if (!isTauriRuntime()) return null;
  return invoke<LauncherPreview | null>("get_item_preview", { cardId });
}

export async function getPreviewCacheInfo(): Promise<PreviewCacheInfo | null> {
  if (!isTauriRuntime()) return null;
  return invoke<PreviewCacheInfo>("get_preview_cache_info");
}

export async function clearPreviewCache(): Promise<PreviewCacheInfo> {
  if (!isTauriRuntime()) {
    throw new Error("縮圖儲存區只支援桌面版。");
  }
  return invoke<PreviewCacheInfo>("clear_preview_cache");
}

export async function launchCard(cardId: string): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error("瀏覽器預覽模式無法啟動項目。請使用桌面版。");
  }
  await invoke("launch_card", { cardId });
}

export async function updateCard(
  update: CardAppearanceUpdate,
): Promise<DashboardState> {
  if (!isTauriRuntime()) {
    throw new Error("卡片編輯只支援桌面版。");
  }
  return invoke<DashboardState>("update_card", { request: update });
}

export async function moveCards(request: MoveCardsRequest): Promise<DashboardState> {
  return invoke<DashboardState>("move_cards", { request });
}

export async function deleteCards(cardIds: string[]): Promise<DashboardState> {
  return invoke<DashboardState>("delete_cards", { request: { cardIds } });
}

export async function createGroup(
  pageId: string,
  cardIds: string[],
): Promise<CreateGroupResult> {
  return invoke<CreateGroupResult>("create_group", { request: { pageId, cardIds } });
}

export async function ungroup(groupId: string): Promise<DashboardState> {
  return invoke<DashboardState>("ungroup", { request: { groupId } });
}

export async function createNote(
  pageId: string,
  parentGroupId: string | null,
): Promise<CreateNoteResult> {
  return invoke<CreateNoteResult>("create_note", {
    request: { pageId, parentGroupId },
  });
}

export async function updateNote(
  cardId: string,
  noteText: string,
): Promise<DashboardState> {
  return invoke<DashboardState>("update_note", {
    request: { cardId, noteText },
  });
}

export async function updateGroupResume(
  groupId: string,
  resumeNote: string,
): Promise<DashboardState> {
  return invoke<DashboardState>("update_group_resume", {
    request: { groupId, resumeNote },
  });
}

export async function setLaunchEnabled(
  cardId: string,
  enabled: boolean,
  allowRisky = false,
): Promise<DashboardState> {
  return invoke<DashboardState>("set_launch_enabled", {
    request: { cardId, enabled, allowRisky },
  });
}

export async function launchGroup(groupId: string): Promise<GroupLaunchResult> {
  return invoke<GroupLaunchResult>("launch_group", { request: { groupId } });
}

export async function searchDashboard(query: string): Promise<DashboardSearchResult[]> {
  return invoke<DashboardSearchResult[]>("search_dashboard", { request: { query } });
}

export async function checkTargets(
  pageId: string,
  parentGroupId: string | null,
): Promise<TargetStatusResult[]> {
  return invoke<TargetStatusResult[]>("check_targets", {
    request: { pageId, parentGroupId },
  });
}

export async function relinkTarget(
  cardId: string,
  newPath: string,
  allowRisky = false,
): Promise<DashboardState> {
  return invoke<DashboardState>("relink_target", {
    request: { cardId, newPath, allowRisky },
  });
}

export async function exportBackup(path: string): Promise<ExportBackupResult> {
  return invoke<ExportBackupResult>("export_backup", { request: { path } });
}

export async function inspectBackup(path: string): Promise<BackupPreview> {
  return invoke<BackupPreview>("inspect_backup", { request: { path } });
}

export async function restoreBackup(path: string): Promise<RestoreBackupResult> {
  return invoke<RestoreBackupResult>("restore_backup", { request: { path } });
}

export async function getRecoveryInfo(): Promise<RecoveryInfo> {
  return invoke<RecoveryInfo>("get_recovery_info");
}

export async function openRecoveryBackupFolder(): Promise<void> {
  await invoke("open_recovery_backup_folder");
}

export async function recoverDatabase(path: string): Promise<void> {
  await invoke("recover_database", { request: { path } });
}

export async function undoLast(): Promise<DashboardState> {
  return invoke<DashboardState>("undo_last");
}

export async function createPage(): Promise<DashboardState> {
  return invoke<DashboardState>("create_page");
}

export async function updatePage(
  pageId: string,
  name: string,
  symbol: string,
): Promise<DashboardState> {
  return invoke<DashboardState>("update_page", { request: { pageId, name, symbol } });
}

export async function movePage(pageId: string, direction: -1 | 1): Promise<DashboardState> {
  return invoke<DashboardState>("move_page", { request: { pageId, direction } });
}

export async function deletePage(pageId: string): Promise<DashboardState> {
  return invoke<DashboardState>("delete_page", { request: { pageId } });
}

export function platformErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function platformErrorCode(error: unknown): string | null {
  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === "string" ? code : null;
  }
  return null;
}
