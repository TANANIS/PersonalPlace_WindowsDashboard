import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { listCalendarDay, listCalendarSources, type CalendarOccurrence } from "../../platform/calendar";
import { getTodoOverview, setTodoCompleted, setTodoPlannedFor, type TodoItem, type TodoList } from "../../platform/todo";
import { getDashboard } from "../../platform/dashboard";
import type { FocusState } from "../../platform/focus";
import { useFocusController, type StartFocusRequest } from "../focus/useFocusController";
import { resolveFocusContext as resolveSharedFocusContext } from "../focus/model";
import { localDateKey, localDayBounds } from "../../lib/localDate";
import type { DashboardCard } from "../../types";

const locale = "zh-TW";
function dateLabel(date = new Date()): string { return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date); }
function timeLabel(timestamp: number | null): string { return timestamp === null ? "" : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp * 1000)); }
function durationUntil(startUtc: number, now: number): string { const minutes = Math.max(0, Math.round((startUtc - now) / 60)); const hours = Math.floor(minutes / 60); const remainder = minutes % 60; if (minutes === 0) return "現在開始"; if (hours === 0) return `還有 ${minutes} 分鐘`; return `還有 ${hours} 小時${remainder ? ` ${remainder} 分鐘` : ""}`; }
function openedAtValue(value: string | null): number { if (!value) return 0; const numeric = Number(value); return Number.isFinite(numeric) ? numeric : (Date.parse(value) || 0); }
function continueCandidate(cards: DashboardCard[]): DashboardCard | null { return cards.filter((card) => card.cardType === "group" && card.resumeNote.trim()).sort((a, b) => openedAtValue(b.lastOpenedAt) - openedAtValue(a.lastOpenedAt))[0] ?? null; }
function hasLaunchableChildren(cards: DashboardCard[], groupId: string): boolean { return cards.some((card) => card.parentGroupId === groupId && card.cardType === "target" && card.launchEnabled); }
function launchableChildCount(cards: DashboardCard[], groupId: string): number { return cards.filter((card) => card.parentGroupId === groupId && card.cardType === "target" && card.launchEnabled).length; }
function focusRemainingSeconds(state: FocusState, now: number): number { return state.status === "running" && state.endsAt !== null ? Math.max(0, state.endsAt - now) : Math.max(0, state.remainingSeconds ?? 0); }
function formatFocusRemaining(seconds: number): string { const minutes = Math.floor(seconds / 60); const remainder = seconds % 60; return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`; }
function resolveFocusContext(state: FocusState, todos: TodoItem[], cards: DashboardCard[]): { kind: string; title: string } { const context = resolveSharedFocusContext(state, todos, cards); const missingLink = (state.linkedTodoId && !todos.some((item) => item.id === state.linkedTodoId)) || (state.linkedGroupId && !cards.some((card) => card.id === state.linkedGroupId && card.cardType === "group")); return missingLink ? { kind: "專注中", title: "未連結的專注" } : { kind: context.kind === "todo" ? "待辦" : context.kind === "place" ? "Place" : "專注中", title: context.title } }

function sortByOrganization(items: TodoItem[], lists: TodoList[]): TodoItem[] { const positions = new Map(lists.map((list) => [list.id, list.position])); return [...items].sort((a, b) => (positions.get(a.listId) ?? Number.MAX_SAFE_INTEGER) - (positions.get(b.listId) ?? Number.MAX_SAFE_INTEGER) || a.position - b.position || a.id.localeCompare(b.id)); }
function todayTodoSections(items: TodoItem[], lists: TodoList[], today: string, now = new Date()): { planned: TodoItem[]; due: TodoItem[]; overdue: TodoItem[] } { const active = items.filter((item) => item.status === "active" && item.deletedAt === null); const { start, tomorrow } = localDayBounds(now); return { planned: sortByOrganization(active.filter((item) => item.plannedFor === today), lists), due: sortByOrganization(active.filter((item) => item.plannedFor !== today && item.dueAt !== null && item.dueAt >= start && item.dueAt < tomorrow), lists), overdue: sortByOrganization(active.filter((item) => item.plannedFor !== today && item.dueAt !== null && item.dueAt < start), lists) }; }

function NextSection({ event, now, loading, error }: { event: CalendarOccurrence | null; now: number; loading: boolean; error: boolean }) { if (!loading && !error && !event) return null; return <section className="today-next" aria-label="行事曆約束">{loading ? <p className="today-muted today-loading">讀取行程…</p> : error ? <p className="today-inline-error">行程暫時無法讀取</p> : event && <div className="today-next-event"><strong>{event.startUtc === null ? "" : event.startUtc <= now && event.endUtc !== null && now < event.endUtc ? "現在" : timeLabel(event.startUtc)}</strong><div><h3>{event.summary || "（無標題）"}</h3><p>{event.startUtc !== null && event.endUtc !== null && now >= event.startUtc && now < event.endUtc ? `${timeLabel(event.endUtc)} 結束` : durationUntil(event.startUtc ?? now, now)}</p></div></div>}</section>; }

export interface TodayWorkspaceProps {
  focusState: FocusState | null;
  focusReady: boolean;
  focusError: string | null;
  onStartFocus: (request: StartFocusRequest) => Promise<void>;
  onReturnToFocus?: () => void;
  onOpenTodo?: () => void;
  onCreateTodo?: () => void;
  onOpenPlace?: (groupId: string) => void;
}

function ControlledTodayWorkspace({ focusState: focus, focusReady, focusError, onStartFocus, onReturnToFocus = () => undefined, onOpenTodo = () => undefined, onCreateTodo = () => undefined, onOpenPlace }: TodayWorkspaceProps) {
  const focusLoading = !focusReady;
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [event, setEvent] = useState<CalendarOccurrence | null>(null); const [calendarLoading, setCalendarLoading] = useState(true); const [calendarError, setCalendarError] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]); const [todoLists, setTodoLists] = useState<TodoList[]>([]); const [todoLoading, setTodoLoading] = useState(true); const [todoError, setTodoError] = useState(false); const [todoMutationError, setTodoMutationError] = useState<string | null>(null); const [todoBusy, setTodoBusy] = useState<string | null>(null);
  const [dashboardCards, setDashboardCards] = useState<DashboardCard[]>([]); const [candidate, setCandidate] = useState<DashboardCard | null>(null); const [dashboardLoading, setDashboardLoading] = useState(true); const [dashboardError, setDashboardError] = useState(false); const [attentionExpanded, setAttentionExpanded] = useState(false);
  const today = useMemo(() => localDateKey(new Date(now * 1000)), [now]); const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000); return () => window.clearInterval(timer); }, []);
  const loadCalendar = useCallback(async () => { setCalendarLoading(true); try { setCalendarError(false); const sources = await listCalendarSources(); if (sources.length === 0) { setEvent(null); return; } setEvent((await listCalendarDay(today, timezone)).nextBlocking); } catch { setCalendarError(true); setEvent(null); } finally { setCalendarLoading(false); } }, [today, timezone]);
  const loadTodos = useCallback(async () => { setTodoLoading(true); try { setTodoError(false); const overview = await getTodoOverview(); setTodos(overview.items); setTodoLists(overview.lists); } catch { setTodoError(true); setTodos([]); setTodoLists([]); } finally { setTodoLoading(false); } }, []);
  const loadDashboard = useCallback(async () => { setDashboardLoading(true); try { setDashboardError(false); const cards = (await getDashboard()).cards; setDashboardCards(cards); setCandidate(continueCandidate(cards)); } catch { setDashboardError(true); setDashboardCards([]); setCandidate(null); } finally { setDashboardLoading(false); } }, []);
  useEffect(() => { void loadCalendar(); }, [loadCalendar]); useEffect(() => { void loadTodos(); }, [loadTodos]); useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  const updateTodoState = (overview: Awaited<ReturnType<typeof getTodoOverview>>) => { setTodos(overview.items); setTodoLists(overview.lists); };
  const toggleTodo = async (item: TodoItem) => { setTodoBusy(item.id); setTodoMutationError(null); try { updateTodoState(await setTodoCompleted(item.id, true)); } catch { setTodoMutationError("待辦操作失敗，請稍後再試"); } finally { setTodoBusy(null); } };
  const planTodo = async (item: TodoItem, plannedFor: string | null) => { setTodoBusy(item.id); setTodoMutationError(null); try { updateTodoState(await setTodoPlannedFor(item.id, plannedFor)); } catch { setTodoMutationError("安排日期無法更新，請稍後再試"); } finally { setTodoBusy(null); } };
  const continueWork = () => { if (candidate && onOpenPlace) onOpenPlace(candidate.id); };
  const sections = useMemo(() => todayTodoSections(todos, todoLists, today, new Date(now * 1000)), [now, today, todoLists, todos]); const activeFocus = focus?.status === "running" || focus?.status === "paused"; const focusContext = focus && resolveFocusContext(focus, todos, dashboardCards); const attentionCount = sections.due.length + sections.overdue.length;
  const beginFocus = (request: StartFocusRequest) => { if (activeFocus) return; void onStartFocus(request); };
  const todoContext = (todo: TodoItem) => { const list = todoLists.find((entry) => entry.id === todo.listId)?.title; const parent = todo.parentId ? todos.find((entry) => entry.id === todo.parentId)?.title : null; return [list, parent].filter(Boolean).join(" · "); };
  const renderPlannedTodos = (items: TodoItem[]) => <ul className="today-todos">{items.map((todo) => <li key={todo.id} className={todoBusy === todo.id ? "is-busy" : undefined}><label><input type="checkbox" checked={false} disabled={todoBusy === todo.id} onChange={() => void toggleTodo(todo)} /><span><strong>{todo.title}</strong><small>{todoContext(todo)}</small></span></label><div className="today-todo-actions"><button type="button" className="today-quiet-action" disabled={activeFocus || todoBusy === todo.id} onClick={() => beginFocus({ phase: "focus", linkedTodoId: todo.id, linkedGroupId: null })}>開始</button><button type="button" className="today-quiet-action" disabled={todoBusy === todo.id} onClick={() => void planTodo(todo, null)}>移出今天</button></div></li>)}</ul>;
  const renderAttentionTodos = (items: TodoItem[]) => <ul className="today-todos today-attention-todos">{items.map((todo) => <li key={todo.id}><span><strong>{todo.title}</strong><small>{todoContext(todo)}{todo.dueAt !== null ? ` · ${timeLabel(todo.dueAt)}` : ""}</small></span><button type="button" onClick={() => void planTodo(todo, today)}>排到今天</button></li>)}</ul>;

  return <main className="today-workspace"><header className="today-heading"><h1>今天</h1><p>{dateLabel(new Date(now * 1000))}</p></header><div className="today-sections">
    {!focusLoading && focusError && !focus && <p className="today-inline-error">{focusError}</p>}
    <NextSection event={event} now={now} loading={calendarLoading} error={calendarError} />
    {activeFocus && focus && focusContext && <section className="today-focus-section" aria-labelledby="today-focus-title"><header><h2 id="today-focus-title">正在做</h2></header><div className="today-focus-content"><div><small>{focusContext.kind}</small><h3>{focusContext.title}</h3><p className="today-focus-time">{focus.status === "paused" ? `已暫停 · ${formatFocusRemaining(focusRemainingSeconds(focus, now))}` : formatFocusRemaining(focusRemainingSeconds(focus, now))}</p></div><button type="button" onClick={onReturnToFocus}>回到專注</button></div>{focusError && <p className="today-inline-error">{focusError}</p>}</section>}
    <section className="today-plan-section" aria-labelledby="today-plan-title"><header><h2 id="today-plan-title">今天安排</h2></header>{todoLoading ? <p className="today-muted today-loading">載入中…</p> : todoError ? <p className="today-inline-error">待辦暫時無法讀取</p> : sections.planned.length === 0 ? <div className="today-empty-state"><p>今天還沒安排</p><small>選一件現在值得做的事就好。</small><div><button type="button" onClick={onOpenTodo}>從待辦選一件</button><button type="button" onClick={onCreateTodo}>新增待辦</button></div></div> : renderPlannedTodos(sections.planned)}{todoMutationError && <p className="today-inline-error" role="alert">{todoMutationError}</p>}</section>
    {attentionCount > 0 && <section className="today-attention" aria-labelledby="today-attention-title"><header><h2 id="today-attention-title">需要留意</h2><button type="button" aria-expanded={attentionExpanded} onClick={() => setAttentionExpanded((value) => !value)}>{attentionExpanded ? "收起" : "查看"}</button></header><p>今天到期 {sections.due.length} · 逾期 {sections.overdue.length}</p>{attentionExpanded && <div className="today-attention-details">{sections.due.length > 0 && <section aria-labelledby="today-due-title"><h3 id="today-due-title">今天到期</h3>{renderAttentionTodos(sections.due)}</section>}{sections.overdue.length > 0 && <section aria-labelledby="today-overdue-title"><h3 id="today-overdue-title">逾期</h3>{renderAttentionTodos(sections.overdue)}</section>}</div>}</section>}
    {dashboardLoading && <p className="today-muted today-dashboard-loading">載入最近進度…</p>}
    {!dashboardLoading && !dashboardError && candidate && <section className="today-continue-section" aria-labelledby="today-continue-title"><header><h2 id="today-continue-title">接著做</h2></header><div className="today-continue"><div><h3>{candidate.title}</h3><p><strong>上次做到：</strong>{candidate.resumeNote}</p></div><button type="button" onClick={continueWork}>接著做</button></div></section>}
  </div></main>;
}

export function TodayWorkspace(): ReactElement;
export function TodayWorkspace(props: TodayWorkspaceProps): ReactElement;
export function TodayWorkspace(props?: TodayWorkspaceProps): ReactElement {
  return props && "focusState" in props ? <ControlledTodayWorkspace {...props} /> : <StandaloneTodayWorkspace />;
}

export function StandaloneTodayWorkspace() {
  const focus = useFocusController();
  return <ControlledTodayWorkspace focusState={focus.state} focusReady={focus.ready} focusError={focus.error ? "正在做暫時無法讀取" : null} onStartFocus={(request) => focus.start(request).then(() => undefined)} onReturnToFocus={() => undefined} />;
}

export { continueCandidate, focusRemainingSeconds, hasLaunchableChildren, launchableChildCount, resolveFocusContext, sortByOrganization, todayTodoSections };
