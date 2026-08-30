import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  DashboardState,
  ItemSize,
  ItemTone,
  LauncherItem,
  WorkspaceState,
  WidgetKind,
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

export interface CreateWidgetResult {
  dashboard: DashboardState;
  widgetId: string;
}

export interface WidgetSummaryItem {
  id: string;
  title: string;
  dueAt: number | null;
  priority: TodoPriority;
}

export interface WidgetSummary {
  cardId: string;
  widgetKind: WidgetKind;
  title: string;
  primaryValue: string;
  secondaryValue: string;
  items: WidgetSummaryItem[];
}

export type TodoPriority = "none" | "low" | "medium" | "high";
export type TodoStatus = "active" | "completed" | "deleted";
export type TodoRecurrence = "none" | "daily" | "weekdays" | "weekly" | "monthly" | "yearly" | "custom_days" | "custom_weeks" | "custom_months";

export interface TodoList {
  id: string;
  title: string;
  position: number;
  createdAt: number;
  updatedAt: number;
  archivedAt: number | null;
}

export interface TodoItem {
  id: string;
  listId: string;
  parentId: string | null;
  seriesId: string | null;
  title: string;
  notes: string;
  status: TodoStatus;
  priority: TodoPriority;
  dueAt: number | null;
  position: number;
  recurrenceKind: TodoRecurrence;
  recurrenceInterval: number;
  reminderOffsetMinutes: number | null;
  reminderState: "none" | "pending" | "delivered" | "missed";
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  deletedAt: number | null;
}

export interface TodoOverview {
  lists: TodoList[];
  items: TodoItem[];
}

export interface TodoItemInput {
  title: string;
  notes: string;
  priority: TodoPriority;
  dueAt: number | null;
  recurrenceKind: TodoRecurrence;
  recurrenceInterval: number;
  reminderOffsetMinutes: number | null;
  parentId: string | null;
}

export interface FocusSettings {
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  longBreakInterval: number;
  autoStartFocus: boolean;
  autoStartBreak: boolean;
  notificationsEnabled: boolean;
}

export interface FocusState {
  status: "idle" | "running" | "paused";
  phase: "focus" | "shortBreak" | "longBreak";
  cycleCount: number;
  startedAt: number | null;
  endsAt: number | null;
  remainingSeconds: number | null;
  linkedTodoId: string | null;
  linkedGroupId: string | null;
  updatedAt: number;
  settings: FocusSettings;
}
export interface FocusSession { id: string; phase: FocusState["phase"]; plannedSeconds: number; actualSeconds: number; outcome: string; startedAt: number; endedAt: number; }

export interface TrackingSettings { enabled: boolean; idleSeconds: number; }
export interface UsageApp { appId: string; displayName: string; seconds: number; excluded: boolean; }
export interface UsageSegment { appId: string; displayName: string; startedAt: number; endedAt: number; }
export interface UsageSummary { totalSeconds: number; apps: UsageApp[]; segments: UsageSegment[]; }

export type ActivityPeriod = "today" | "sevenDays" | "thirtyDays";
export interface ActivityConnectionStatus {
  status: "connected" | "unavailable";
  message: string;
  serverVersion: string | null;
}
export interface ActivityRankItem { key: string; label: string; seconds: number; }
export interface ActivityTimelineItem {
  label: string;
  context: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}
export type ActivityDetailKind = "app" | "website";
export interface ActivityDetailItem {
  title: string | null;
  url: string | null;
  startedAt: string;
  endedAt: string;
  durationSeconds: number;
}
export interface ActivityDetail {
  kind: ActivityDetailKind;
  label: string;
  period: ActivityPeriod;
  totalSeconds: number;
  items: ActivityDetailItem[];
}
export interface ActivitySummary {
  connection: ActivityConnectionStatus;
  period: ActivityPeriod;
  rangeStart: string;
  rangeEnd: string;
  activeTotalSeconds: number;
  apps: ActivityRankItem[];
  websites: ActivityRankItem[];
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
  resultType: "page" | "target" | "group" | "note" | "widget";
  title: string;
  subtitle: string;
  pageId: string;
  pageName: string;
  groupId?: string;
  groupName?: string;
  cardType?: "target" | "group" | "note" | "widget";
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

function isBrowserDemo(): boolean {
  return !isTauriRuntime() && new URLSearchParams(window.location.search).has("demo");
}

let browserTodoState: TodoOverview | null = null;
let browserFocusState: FocusState | null = null;
let browserTrackingSettings: TrackingSettings = { enabled: true, idleSeconds: 300 };

function browserDemoTodoOverview(): TodoOverview {
  if (browserTodoState) return structuredClone(browserTodoState);
  const now = Math.floor(Date.now() / 1000);
  const lists: TodoList[] = [
    { id: "demo-today", title: "今天", position: 0, createdAt: now, updatedAt: now, archivedAt: null },
    { id: "demo-personal", title: "個人計畫", position: 1, createdAt: now, updatedAt: now, archivedAt: null },
  ];
  const base = (id: string, listId: string, title: string, position: number, extra: Partial<TodoItem> = {}): TodoItem => ({
    id, listId, parentId: null, seriesId: null, title, notes: "", status: "active", priority: "none",
    dueAt: null, position, recurrenceKind: "none", recurrenceInterval: 1, reminderOffsetMinutes: null,
    reminderState: "none", createdAt: now, updatedAt: now, completedAt: null, deletedAt: null, ...extra,
  });
  browserTodoState = {
    lists,
    items: [
      base("demo-task-1", "demo-today", "整理 Unity 專案輸入設定", 0, { priority: "high", dueAt: now + 3_600 }),
      base("demo-task-2", "demo-today", "完成角色跳躍動畫", 1, { priority: "medium", dueAt: now + 14_400 }),
      base("demo-task-3", "demo-today", "記錄下一次練習進度", 2, { notes: "把參數整理到 Inspector。" }),
      base("demo-subtask", "demo-today", "確認鍵盤與控制器輸入", 0, { parentId: "demo-task-1" }),
      base("demo-task-4", "demo-personal", "整理下載資料夾", 0),
    ],
  };
  return structuredClone(browserTodoState);
}

function browserDemoUsageSummary(from: number, to: number): UsageSummary {
  const now = Math.min(Math.floor(Date.now() / 1000), to);
  const spanDays = Math.max(1, Math.ceil((to - from) / 86_400));
  const apps: UsageApp[] = [
    { appId: "demo-vscode", displayName: "Visual Studio Code", seconds: 5_820 * spanDays, excluded: false },
    { appId: "demo-edge", displayName: "Microsoft Edge", seconds: 3_960 * spanDays, excluded: false },
    { appId: "demo-unity", displayName: "Unity", seconds: 2_740 * spanDays, excluded: false },
    { appId: "demo-discord", displayName: "Discord", seconds: 1_380 * spanDays, excluded: false },
  ];
  return {
    totalSeconds: apps.reduce((total, app) => total + app.seconds, 0),
    apps,
    segments: apps.map((app, index) => ({ appId: app.appId, displayName: app.displayName, startedAt: now - (index + 1) * 2_100, endedAt: now - (index + 1) * 2_100 + Math.min(app.seconds, 1_800) })),
  };
}

function browserDemoFocusState(): FocusState {
  if (!browserFocusState) {
    browserFocusState = {
      status: "idle",
      phase: "focus",
      cycleCount: 2,
      startedAt: null,
      endsAt: null,
      remainingSeconds: 25 * 60,
      linkedTodoId: null,
      linkedGroupId: null,
      updatedAt: Math.floor(Date.now() / 1000),
      settings: {
        focusMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        longBreakInterval: 4,
        autoStartFocus: false,
        autoStartBreak: false,
        notificationsEnabled: true,
      },
    };
  }
  return structuredClone(browserFocusState);
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
  if (!isTauriRuntime()) {
    if (!isBrowserDemo()) return null;
    if (cardId === "demo-shortcut") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#68e0ff"/><stop offset="1" stop-color="#5277ff"/></linearGradient></defs><rect width="128" height="128" rx="30" fill="#0d1a28"/><path d="M64 23 101 44v41L64 106 27 85V44l37-21Z" fill="url(#g)"/><path d="M64 42 83 53v22L64 86 45 75V53l19-11Z" fill="#0d1a28"/><circle cx="64" cy="64" r="7" fill="#b7f4ff"/></svg>`;
      return { assetUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, kind: "thumbnail" };
    }
    if (cardId === "demo-image") {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 220"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#4f67d8"/><stop offset=".48" stop-color="#7b4a9b"/><stop offset="1" stop-color="#e17b79"/></linearGradient></defs><rect width="360" height="220" rx="24" fill="url(#g)"/><circle cx="286" cy="54" r="30" fill="#ffd89b" opacity=".9"/><path d="m0 177 82-76 65 55 55-42 83 63 75-70v113H0Z" fill="#101827" opacity=".74"/><path d="m0 194 91-54 58 38 65-32 58 34 88-47v87H0Z" fill="#0a101b" opacity=".8"/></svg>`;
      return { assetUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, kind: "thumbnail" };
    }
    return null;
  }
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

export async function createWidget(
  pageId: string,
  parentGroupId: string | null,
  widgetKind: WidgetKind,
  todoListId?: string,
): Promise<CreateWidgetResult> {
  return invoke<CreateWidgetResult>("create_widget", {
    request: { pageId, parentGroupId, widgetKind, todoListId: todoListId ?? null },
  });
}

export async function getWidgetSummary(cardId: string): Promise<WidgetSummary> {
  if (isBrowserDemo()) {
    if (cardId.includes("focus")) {
      const focus = browserDemoFocusState();
      const remaining = focus.status === "running" && focus.endsAt ? Math.max(0, focus.endsAt - Math.floor(Date.now() / 1000)) : focus.remainingSeconds ?? focus.settings.focusMinutes * 60;
      return { cardId, widgetKind: "focus", title: "Focus Timer", primaryValue: `${Math.floor(remaining / 60).toString().padStart(2, "0")}:${(remaining % 60).toString().padStart(2, "0")}`, secondaryValue: focus.status === "running" ? "進行中" : focus.status === "paused" ? "已暫停" : "準備開始", items: [] };
    }
    if (cardId.includes("usage")) {
      const now = Math.floor(Date.now() / 1000);
      const usage = browserDemoUsageSummary(now - 86_400, now);
      return { cardId, widgetKind: "usage", title: "使用時間", primaryValue: `${Math.floor(usage.totalSeconds / 3600)} 小時 ${Math.floor((usage.totalSeconds % 3600) / 60)} 分`, secondaryValue: usage.apps.slice(0, 3).map((app) => app.displayName).join(" · "), items: [] };
    }
    const overview = browserDemoTodoOverview();
    const items = overview.items.filter((item) => item.status === "active" && item.parentId === null).sort((left, right) => left.position - right.position).slice(0, 3);
    return { cardId, widgetKind: "todo", title: "待辦事項", primaryValue: `${overview.items.filter((item) => item.status === "active").length} 項待辦`, secondaryValue: items.length ? "從卡片直接完成下一步" : "目前沒有待辦", items: items.map((item) => ({ id: item.id, title: item.title, dueAt: item.dueAt, priority: item.priority })) };
  }
  return invoke<WidgetSummary>("get_widget_summary", { request: { cardId } });
}

export async function updateWidgetPreferences(cardId: string, listId: string): Promise<DashboardState> {
  return invoke<DashboardState>("update_widget_preferences", { request: { cardId, listId } });
}

export async function getTodoOverview(): Promise<TodoOverview> {
  if (isBrowserDemo()) return browserDemoTodoOverview();
  return invoke<TodoOverview>("get_todo_overview");
}

export async function createTodoList(title: string): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    const now = Math.floor(Date.now() / 1000);
    overview.lists.push({ id: `demo-list-${now}`, title, position: overview.lists.length, createdAt: now, updatedAt: now, archivedAt: null });
    browserTodoState = overview;
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("create_todo_list", { request: { title } });
}

export async function updateTodoList(listId: string, title: string, archived: boolean): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    const now = Math.floor(Date.now() / 1000);
    browserTodoState = { ...overview, lists: overview.lists.map((list) => list.id === listId ? { ...list, title, archivedAt: archived ? now : null, updatedAt: now } : list) };
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("update_todo_list", { request: { listId, title, archived } });
}

export async function createTodoItem(listId: string, item: TodoItemInput): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    const now = Math.floor(Date.now() / 1000);
    overview.items.push({ id: `demo-task-${now}`, listId, parentId: item.parentId, seriesId: null, title: item.title, notes: item.notes, status: "active", priority: item.priority, dueAt: item.dueAt, position: overview.items.filter((entry) => entry.listId === listId && entry.parentId === item.parentId).length, recurrenceKind: item.recurrenceKind, recurrenceInterval: item.recurrenceInterval, reminderOffsetMinutes: item.reminderOffsetMinutes, reminderState: "none", createdAt: now, updatedAt: now, completedAt: null, deletedAt: null });
    browserTodoState = overview;
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("create_todo_item", { request: { listId, item } });
}

export async function updateTodoItem(itemId: string, item: TodoItemInput): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    browserTodoState = { ...overview, items: overview.items.map((entry) => entry.id === itemId ? { ...entry, ...item, updatedAt: Math.floor(Date.now() / 1000) } : entry) };
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("update_todo_item", { request: { itemId, item } });
}

export async function setTodoCompleted(itemId: string, completed: boolean): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    const now = Math.floor(Date.now() / 1000);
    browserTodoState = { ...overview, items: overview.items.map((entry) => entry.id === itemId ? { ...entry, status: completed ? "completed" : "active", completedAt: completed ? now : null, updatedAt: now } : entry) };
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("set_todo_completed", { request: { itemId, completed } });
}

export async function moveTodoItems(itemIds: string[], listId: string, parentId: string | null, targetIndex: number): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    const movingIds = new Set(itemIds);
    const moving = overview.items
      .filter((item) => movingIds.has(item.id) && item.parentId === parentId)
      .sort((left, right) => left.position - right.position);
    const siblings = overview.items
      .filter((item) => item.listId === listId && item.parentId === parentId && !movingIds.has(item.id))
      .sort((left, right) => left.position - right.position);
    const insertAt = Math.max(0, Math.min(targetIndex, siblings.length));
    const ordered = [...siblings.slice(0, insertAt), ...moving, ...siblings.slice(insertAt)];
    const positions = new Map(ordered.map((item, position) => [item.id, position]));
    browserTodoState = {
      ...overview,
      items: overview.items.map((item) => positions.has(item.id)
        ? { ...item, listId, parentId, position: positions.get(item.id)! }
        : item),
    };
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("move_todo_items", { request: { itemIds, listId, parentId, targetIndex } });
}

export async function deleteTodoItems(itemIds: string[]): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    const deleting = new Set(itemIds);
    const now = Math.floor(Date.now() / 1000);
    browserTodoState = { ...overview, items: overview.items.map((entry) => deleting.has(entry.id) ? { ...entry, status: "deleted", deletedAt: now, updatedAt: now } : entry) };
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("delete_todo_items", { request: { itemIds } });
}

export async function restoreTodoItems(itemIds: string[]): Promise<TodoOverview> {
  if (isBrowserDemo()) {
    const overview = browserDemoTodoOverview();
    const restoring = new Set(itemIds);
    browserTodoState = { ...overview, items: overview.items.map((entry) => restoring.has(entry.id) ? { ...entry, status: "active", deletedAt: null, updatedAt: Math.floor(Date.now() / 1000) } : entry) };
    return browserDemoTodoOverview();
  }
  return invoke<TodoOverview>("restore_todo_items", { request: { itemIds } });
}

export async function getFocusState(): Promise<FocusState> { return isBrowserDemo() ? browserDemoFocusState() : invoke<FocusState>("get_focus_state"); }
export async function startFocus(request: { phase?: FocusState["phase"]; linkedTodoId?: string | null; linkedGroupId?: string | null } = {}): Promise<FocusState> {
  if (isBrowserDemo()) { const current = browserDemoFocusState(); const now = Math.floor(Date.now() / 1000); const phase = request.phase ?? current.phase; const minutes = phase === "focus" ? current.settings.focusMinutes : phase === "shortBreak" ? current.settings.shortBreakMinutes : current.settings.longBreakMinutes; browserFocusState = { ...current, status: "running", phase, startedAt: now, endsAt: now + minutes * 60, remainingSeconds: minutes * 60, linkedTodoId: request.linkedTodoId ?? null, linkedGroupId: request.linkedGroupId ?? null, updatedAt: now }; return browserDemoFocusState(); }
  return invoke<FocusState>("start_focus", { request });
}
export async function pauseFocus(): Promise<FocusState> { if (isBrowserDemo()) { const current = browserDemoFocusState(); const now = Math.floor(Date.now() / 1000); browserFocusState = { ...current, status: "paused", remainingSeconds: current.endsAt ? Math.max(0, current.endsAt - now) : current.remainingSeconds, endsAt: null, updatedAt: now }; return browserDemoFocusState(); } return invoke<FocusState>("pause_focus"); }
export async function resumeFocus(): Promise<FocusState> { if (isBrowserDemo()) { const current = browserDemoFocusState(); const now = Math.floor(Date.now() / 1000); const seconds = current.remainingSeconds ?? current.settings.focusMinutes * 60; browserFocusState = { ...current, status: "running", endsAt: now + seconds, updatedAt: now }; return browserDemoFocusState(); } return invoke<FocusState>("resume_focus"); }
export async function stopFocus(outcome: "stopped" | "skipped"): Promise<FocusState> { if (isBrowserDemo()) { const current = browserDemoFocusState(); const phase = outcome === "skipped" ? (current.phase === "focus" ? "shortBreak" : "focus") : current.phase; const minutes = phase === "focus" ? current.settings.focusMinutes : phase === "shortBreak" ? current.settings.shortBreakMinutes : current.settings.longBreakMinutes; browserFocusState = { ...current, status: "idle", phase, startedAt: null, endsAt: null, remainingSeconds: minutes * 60, updatedAt: Math.floor(Date.now() / 1000) }; return browserDemoFocusState(); } return invoke<FocusState>("stop_focus", { request: { outcome } }); }
export async function updateFocusSettings(settings: FocusSettings): Promise<FocusState> { if (isBrowserDemo()) { browserFocusState = { ...browserDemoFocusState(), settings, remainingSeconds: settings.focusMinutes * 60, updatedAt: Math.floor(Date.now() / 1000) }; return browserDemoFocusState(); } return invoke<FocusState>("update_focus_settings", { settings }); }
export async function getFocusSessions(from: number, to: number): Promise<FocusSession[]> { if (isBrowserDemo()) { const now = Math.min(Math.floor(Date.now() / 1000), to); return [{ id: "demo-focus-1", phase: "focus", plannedSeconds: 1500, actualSeconds: 1500, outcome: "completed", startedAt: Math.max(from, now - 7200), endedAt: Math.max(from, now - 5700) }, { id: "demo-focus-2", phase: "focus", plannedSeconds: 1500, actualSeconds: 1320, outcome: "stopped", startedAt: Math.max(from, now - 3600), endedAt: Math.max(from, now - 2280) }]; } return invoke<FocusSession[]>("get_focus_sessions", { request: { from, to } }); }
export async function getTrackingState(): Promise<TrackingSettings> {
  if (isBrowserDemo()) return structuredClone(browserTrackingSettings);
  return invoke<TrackingSettings>("get_tracking_state");
}
export async function updateTrackingSettings(settings: TrackingSettings): Promise<TrackingSettings> { if (isBrowserDemo()) { browserTrackingSettings = structuredClone(settings); return structuredClone(browserTrackingSettings); } return invoke<TrackingSettings>("update_tracking_settings", { settings }); }
export async function getUsageSummary(from: number, to: number): Promise<UsageSummary> {
  if (isBrowserDemo()) return browserDemoUsageSummary(from, to);
  return invoke<UsageSummary>("get_usage_summary", { request: { from, to } });
}
export async function getActivitySummary(period: ActivityPeriod): Promise<ActivitySummary> {
  if (isBrowserDemo()) {
    const now = new Date();
    return {
      connection: { status: "connected", message: "ActivityWatch 已連線", serverVersion: "demo" },
      period,
      rangeStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString(),
      rangeEnd: now.toISOString(),
      activeTotalSeconds: 18_540,
      apps: [
        { key: "Visual Studio Code", label: "Visual Studio Code", seconds: 7_840 },
        { key: "Microsoft Edge", label: "Microsoft Edge", seconds: 4_930 },
        { key: "Figma", label: "Figma", seconds: 2_160 },
      ],
      websites: [
        { key: "github.com", label: "github.com", seconds: 2_420 },
        { key: "docs.rs", label: "docs.rs", seconds: 1_180 },
        { key: "figma.com", label: "figma.com", seconds: 760 },
      ],
    };
  }
  return invoke<ActivitySummary>("get_activity_summary", { period });
}
export async function getActivityTimeline(): Promise<ActivityTimelineItem[]> {
  if (isBrowserDemo()) {
    const now = new Date();
    const firstStart = new Date(now.getTime() - 2_100_000);
    const firstEnd = new Date(now.getTime() - 1_140_000);
    const secondStart = new Date(now.getTime() - 4_200_000);
    const secondEnd = new Date(now.getTime() - 3_540_000);
    return [
      { label: "Microsoft Edge", context: "youtube.com · 人體繪畫教學", startedAt: firstStart.toISOString(), endedAt: firstEnd.toISOString(), durationSeconds: 960 },
      { label: "Discord", context: null, startedAt: secondStart.toISOString(), endedAt: secondEnd.toISOString(), durationSeconds: 660 },
    ];
  }
  return invoke<ActivityTimelineItem[]>("get_activity_timeline");
}
export async function getActivityDetail(period: ActivityPeriod, kind: ActivityDetailKind, key: string): Promise<ActivityDetail> {
  if (isBrowserDemo()) {
    const now = new Date();
    const startedAt = new Date(now.getTime() - 1_200_000);
    const endedAt = new Date(now.getTime() - 240_000);
    return {
      kind,
      label: key,
      period,
      totalSeconds: 960,
      items: [{
        title: kind === "website" ? "ActivityWatch documentation" : "Personal Place — Activity Workspace",
        url: kind === "website" ? `https://${key}/example` : null,
        startedAt: startedAt.toISOString(),
        endedAt: endedAt.toISOString(),
        durationSeconds: 960,
      }],
    };
  }
  return invoke<ActivityDetail>("get_activity_detail", { period, kind, key });
}
export async function updateTrackedApp(appId: string, displayName: string, excluded: boolean): Promise<void> { if (isBrowserDemo()) return; await invoke("update_tracked_app", { request: { appId, displayName, excluded } }); }
export async function clearUsageHistory(appId?: string): Promise<void> { if (isBrowserDemo()) return; await invoke("clear_usage_history", { request: { appId } }); }

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

export async function reorderPage(pageId: string, targetIndex: number): Promise<DashboardState> {
  return invoke<DashboardState>("reorder_page", { request: { pageId, targetIndex } });
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
