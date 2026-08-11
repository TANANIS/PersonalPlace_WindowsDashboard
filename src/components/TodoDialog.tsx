import { useEffect, useMemo, useState } from "react";
import type { DashboardCard, DashboardState } from "../types";
import {
  createTodoItem,
  createTodoList,
  deleteTodoItems,
  getTodoOverview,
  moveTodoItems,
  platformErrorMessage,
  setTodoCompleted,
  updateTodoItem,
  updateTodoList,
  updateWidgetPreferences,
  type TodoItem,
  type TodoItemInput,
  type TodoOverview,
  type TodoPriority,
  type TodoRecurrence,
} from "../lib/platform";
import { useModalFocus } from "../lib/accessibility";

type TodoFilter = "all" | "today" | "upcoming" | "overdue" | "completed";

interface TodoDialogProps {
  widget: DashboardCard;
  onClose: () => void;
  onDashboardChanged: (dashboard: DashboardState) => void;
  onChanged: () => void;
}

const emptyInput: TodoItemInput = {
  title: "",
  notes: "",
  priority: "none",
  dueAt: null,
  recurrenceKind: "none",
  recurrenceInterval: 1,
  reminderOffsetMinutes: null,
  parentId: null,
};

const priorityLabels: Record<TodoPriority, string> = {
  none: "無",
  low: "低",
  medium: "中",
  high: "高",
};

const recurrenceLabels: Record<TodoRecurrence, string> = {
  none: "不重複",
  daily: "每天",
  weekdays: "工作日",
  weekly: "每週",
  monthly: "每月",
  yearly: "每年",
  custom_days: "每 N 天",
  custom_weeks: "每 N 週",
  custom_months: "每 N 月",
};

function localInputValue(timestamp: number | null): string {
  if (timestamp == null) return "";
  const date = new Date(timestamp * 1000);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : null;
}

function formatDue(timestamp: number | null): string {
  if (timestamp == null) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

function startOfToday(): number {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

function itemToInput(item: TodoItem): TodoItemInput {
  return {
    title: item.title,
    notes: item.notes,
    priority: item.priority,
    dueAt: item.dueAt,
    recurrenceKind: item.recurrenceKind,
    recurrenceInterval: item.recurrenceInterval,
    reminderOffsetMinutes: item.reminderOffsetMinutes,
    parentId: item.parentId,
  };
}

export function TodoDialog({ widget, onClose, onDashboardChanged, onChanged }: TodoDialogProps) {
  const [overview, setOverview] = useState<TodoOverview | null>(null);
  const [listId, setListId] = useState(widget.widgetResourceId ?? "");
  const [filter, setFilter] = useState<TodoFilter>("all");
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<TodoItemInput>(emptyInput);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newListTitle, setNewListTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalFocus<HTMLElement>(true, onClose);

  useEffect(() => {
    let disposed = false;
    void getTodoOverview()
      .then((result) => {
        if (disposed) return;
        setOverview(result);
        if (!listId) setListId(result.lists.find((list) => !list.archivedAt)?.id ?? "");
      })
      .catch((reason) => !disposed && setError(platformErrorMessage(reason, "無法讀取待辦事項。")));
    return () => { disposed = true; };
  }, []);

  const activeList = overview?.lists.find((list) => list.id === listId) ?? null;
  const listItems = useMemo(() => {
    if (!overview) return [];
    const now = Math.floor(Date.now() / 1000);
    const today = startOfToday();
    const tomorrow = today + 24 * 60 * 60;
    const needle = query.trim().toLocaleLowerCase("zh-TW");
    return overview.items.filter((item) => {
      if (item.listId !== listId) return false;
      if (needle && !`${item.title}\n${item.notes}`.toLocaleLowerCase("zh-TW").includes(needle)) return false;
      if (filter === "completed") return item.status === "completed";
      if (item.status !== "active") return false;
      if (filter === "today") return item.dueAt != null && item.dueAt >= today && item.dueAt < tomorrow;
      if (filter === "upcoming") return item.dueAt != null && item.dueAt >= tomorrow;
      if (filter === "overdue") return item.dueAt != null && item.dueAt < now;
      return true;
    });
  }, [filter, listId, overview, query]);

  const topLevel = listItems.filter((item) => item.parentId == null);

  async function run(operation: () => Promise<TodoOverview>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setOverview(await operation());
      onChanged();
    } catch (reason) {
      setError(platformErrorMessage(reason, "待辦操作失敗。"));
    } finally {
      setBusy(false);
    }
  }

  async function saveItem() {
    if (!draft.title.trim() || !listId) return;
    const input = { ...draft, title: draft.title.trim() };
    await run(() => editingId ? updateTodoItem(editingId, input) : createTodoItem(listId, input));
    setEditingId(null);
    setDraft(emptyInput);
  }

  async function chooseList(nextListId: string) {
    setListId(nextListId);
    setEditingId(null);
    setDraft(emptyInput);
    if (nextListId !== widget.widgetResourceId) {
      try {
        onDashboardChanged(await updateWidgetPreferences(widget.id, nextListId));
      } catch (reason) {
        setError(platformErrorMessage(reason, "無法切換小工具清單。"));
      }
    }
  }

  function renderItem(item: TodoItem, depth = 0) {
    const siblings = listItems.filter((candidate) => candidate.parentId === item.parentId);
    const index = siblings.findIndex((candidate) => candidate.id === item.id);
    const overdue = item.status === "active" && item.dueAt != null && item.dueAt < Date.now() / 1000;
    return (
      <div className={`todo-item-row${depth ? " is-subtask" : ""}${overdue ? " is-overdue" : ""}`} key={item.id}>
        <input
          type="checkbox"
          checked={item.status === "completed"}
          disabled={busy}
          aria-label={`完成 ${item.title}`}
          onChange={(event) => void run(() => setTodoCompleted(item.id, event.target.checked))}
        />
        <button type="button" className="todo-item-copy" onClick={() => { setEditingId(item.id); setDraft(itemToInput(item)); }}>
          <strong>{item.title}</strong>
          <span>
            {item.dueAt != null && <small>{overdue ? "已逾期 · " : ""}{formatDue(item.dueAt)}</small>}
            {item.priority !== "none" && <small className={`priority-${item.priority}`}>{priorityLabels[item.priority]}優先</small>}
            {item.recurrenceKind !== "none" && <small>{recurrenceLabels[item.recurrenceKind]}</small>}
          </span>
        </button>
        <div className="todo-item-actions">
          <button type="button" disabled={busy || index <= 0} aria-label={`上移 ${item.title}`} onClick={() => void run(() => moveTodoItems([item.id], item.listId, item.parentId, index - 1))}>↑</button>
          <button type="button" disabled={busy || index >= siblings.length - 1} aria-label={`下移 ${item.title}`} onClick={() => void run(() => moveTodoItems([item.id], item.listId, item.parentId, index + 1))}>↓</button>
          <button type="button" className="danger-text" disabled={busy} aria-label={`刪除 ${item.title}`} onClick={() => void run(() => deleteTodoItems([item.id]))}>×</button>
        </div>
      </div>
    );
  }

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section ref={dialogRef} tabIndex={-1} className="dialog tool-dialog todo-dialog" role="dialog" aria-modal="true" aria-labelledby="todo-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className="dialog-header">
          <div><p className="eyebrow">TODO</p><h2 id="todo-dialog-title">待辦事項</h2></div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="關閉待辦事項">×</button>
        </header>

        <div className="todo-layout">
          <aside className="todo-lists" aria-label="待辦清單">
            <strong>清單</strong>
            {overview?.lists.filter((list) => !list.archivedAt).map((list) => (
              <button type="button" className={list.id === listId ? "is-active" : ""} key={list.id} onClick={() => void chooseList(list.id)}>
                <span>{list.title}</span>
                <small>{overview.items.filter((item) => item.listId === list.id && item.status === "active").length}</small>
              </button>
            ))}
            <form onSubmit={(event) => { event.preventDefault(); if (!newListTitle.trim()) return; void run(async () => { const result = await createTodoList(newListTitle.trim()); const created = result.lists.filter((list) => !overview?.lists.some((old) => old.id === list.id)).at(-1); if (created) setListId(created.id); setNewListTitle(""); return result; }); }}>
              <input value={newListTitle} maxLength={120} onChange={(event) => setNewListTitle(event.target.value)} placeholder="新增清單" aria-label="新增清單名稱" />
              <button type="submit" disabled={!newListTitle.trim() || busy} aria-label="建立清單">＋</button>
            </form>
          </aside>

          <main className="todo-main">
            <div className="todo-toolbar">
              <div className="todo-filters" aria-label="篩選待辦">
                {(["all", "today", "upcoming", "overdue", "completed"] as TodoFilter[]).map((value) => (
                  <button type="button" className={filter === value ? "is-active" : ""} key={value} onClick={() => setFilter(value)}>
                    {{ all: "全部", today: "今天", upcoming: "即將到期", overdue: "已逾期", completed: "已完成" }[value]}
                  </button>
                ))}
              </div>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋待辦" aria-label="搜尋待辦" />
            </div>

            {activeList && (
              <div className="todo-list-heading">
                <input value={activeList.title} aria-label="目前清單名稱" onChange={(event) => setOverview((current) => current ? { ...current, lists: current.lists.map((list) => list.id === activeList.id ? { ...list, title: event.target.value } : list) } : current)} onBlur={(event) => { const title = event.target.value.trim(); if (title) void run(() => updateTodoList(activeList.id, title, false)); }} />
                <button type="button" className="danger-text" disabled={busy || (overview?.lists.filter((list) => !list.archivedAt).length ?? 0) <= 1} onClick={() => { if (window.confirm(`封存「${activeList.title}」？`)) void run(() => updateTodoList(activeList.id, activeList.title, true)); }}>封存清單</button>
              </div>
            )}

            <section className="todo-items" aria-live="polite">
              {topLevel.map((item) => (
                <div className="todo-item-group" key={item.id}>
                  {renderItem(item)}
                  {listItems.filter((child) => child.parentId === item.id).map((child) => renderItem(child, 1))}
                </div>
              ))}
              {!overview && <p className="muted-copy">正在讀取待辦事項…</p>}
              {overview && topLevel.length === 0 && <div className="todo-empty"><span aria-hidden="true">✓</span><strong>這裡目前沒有待辦</strong><small>在下方建立一項，或切換其他篩選。</small></div>}
            </section>

            <form className="todo-editor" onSubmit={(event) => { event.preventDefault(); void saveItem(); }}>
              <div className="todo-editor-heading">
                <strong>{editingId ? "編輯待辦" : "新增待辦"}</strong>
                {editingId && <button type="button" onClick={() => { setEditingId(null); setDraft(emptyInput); }}>取消編輯</button>}
              </div>
              <input value={draft.title} maxLength={300} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="要做什麼？" aria-label="待辦名稱" />
              <textarea value={draft.notes} maxLength={10000} rows={2} onChange={(event) => setDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="備註（選填）" aria-label="待辦備註" />
              <div className="todo-editor-grid">
                <label>截止時間<input type="datetime-local" value={localInputValue(draft.dueAt)} onChange={(event) => setDraft((current) => ({ ...current, dueAt: fromLocalInput(event.target.value), reminderOffsetMinutes: event.target.value ? current.reminderOffsetMinutes : null }))} /></label>
                <label>優先順序<select value={draft.priority} onChange={(event) => setDraft((current) => ({ ...current, priority: event.target.value as TodoPriority }))}>{Object.entries(priorityLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>重複<select value={draft.recurrenceKind} onChange={(event) => setDraft((current) => ({ ...current, recurrenceKind: event.target.value as TodoRecurrence }))}>{Object.entries(recurrenceLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                {draft.recurrenceKind.startsWith("custom_") && <label>間隔<input type="number" min="1" max="365" value={draft.recurrenceInterval} onChange={(event) => setDraft((current) => ({ ...current, recurrenceInterval: Math.max(1, Number(event.target.value) || 1) }))} /></label>}
                <label>提醒<select value={draft.reminderOffsetMinutes ?? ""} disabled={draft.dueAt == null} onChange={(event) => setDraft((current) => ({ ...current, reminderOffsetMinutes: event.target.value === "" ? null : Number(event.target.value) }))}><option value="">不提醒</option><option value="0">截止時</option><option value="10">提前 10 分鐘</option><option value="60">提前 1 小時</option><option value="1440">提前 1 天</option></select></label>
                <label>父待辦<select value={draft.parentId ?? ""} onChange={(event) => setDraft((current) => ({ ...current, parentId: event.target.value || null }))}><option value="">頂層待辦</option>{overview?.items.filter((item) => item.listId === listId && item.parentId == null && item.status === "active" && item.id !== editingId).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
              </div>
              <button type="submit" className="button primary" disabled={busy || !draft.title.trim() || !listId}>{busy ? "保存中…" : editingId ? "保存修改" : "新增待辦"}</button>
            </form>
            {error && <p className="form-error" role="alert">{error}</p>}
          </main>
        </div>
      </section>
    </div>
  );
}
