import { useCallback, useEffect, useMemo, useState } from "react";
import { listCalendarDay, listCalendarSources, type CalendarOccurrence } from "../../platform/calendar";
import { getTodoOverview, setTodoCompleted, type TodoItem } from "../../platform/todo";
import { getDashboard, launchGroup } from "../../platform/dashboard";
import type { DashboardCard } from "../../types";

const locale = "zh-TW";
function localDateKey(date = new Date()): string { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function dateLabel(date = new Date()): string { return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", weekday: "long" }).format(date); }
function timeLabel(timestamp: number | null): string { return timestamp === null ? "" : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(timestamp * 1000)); }
function durationUntil(startUtc: number, now: number): string { const minutes = Math.max(0, Math.round((startUtc - now) / 60)); const hours = Math.floor(minutes / 60); const remainder = minutes % 60; if (minutes === 0) return "現在開始"; if (hours === 0) return `還有 ${minutes} 分鐘`; return `還有 ${hours} 小時${remainder ? ` ${remainder} 分鐘` : ""}`; }
function openedAtValue(value: string | null): number { if (!value) return 0; const numeric = Number(value); return Number.isFinite(numeric) ? numeric : (Date.parse(value) || 0); }
function continueCandidate(cards: DashboardCard[]): DashboardCard | null { return cards.filter((card) => card.cardType === "group" && card.resumeNote.trim()).sort((a, b) => openedAtValue(b.lastOpenedAt) - openedAtValue(a.lastOpenedAt))[0] ?? null; }
function todoCandidates(items: TodoItem[]): TodoItem[] { return items.filter((item) => item.status !== "completed" && item.deletedAt === null).sort((a, b) => { const ad = a.dueAt ?? Number.MAX_SAFE_INTEGER; const bd = b.dueAt ?? Number.MAX_SAFE_INTEGER; return ad - bd || a.position - b.position; }).slice(0, 5); }

function NextSection({ event, now }: { event: CalendarOccurrence | null; now: number }) {
  return <section className="today-section today-next" aria-labelledby="today-next-title"><header><h2 id="today-next-title">接下來</h2></header>{!event ? <p className="today-muted">今天沒有固定行程</p> : <div className="today-next-event"><strong>{event.startUtc === null ? "" : timeLabel(event.startUtc)}</strong><div><h3>{event.summary || "（無標題）"}</h3><p>{event.startUtc !== null && event.endUtc !== null && now >= event.startUtc && now < event.endUtc ? "進行中" : durationUntil(event.startUtc ?? now, now)}{event.endUtc !== null && now >= event.startUtc! ? ` · ${timeLabel(event.endUtc)} 結束` : ""}</p></div></div>}</section>;
}

export function TodayWorkspace() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  const [event, setEvent] = useState<CalendarOccurrence | null>(null); const [calendarError, setCalendarError] = useState(false);
  const [todos, setTodos] = useState<TodoItem[]>([]); const [todoError, setTodoError] = useState(false); const [todoBusy, setTodoBusy] = useState<string | null>(null);
  const [candidate, setCandidate] = useState<DashboardCard | null>(null); const [dashboardError, setDashboardError] = useState(false); const [launchBusy, setLaunchBusy] = useState(false); const [launchError, setLaunchError] = useState(false);
  const today = useMemo(() => localDateKey(new Date(now * 1000)), [now]); const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);
  useEffect(() => { const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 60_000); return () => window.clearInterval(timer); }, []);
  const loadCalendar = useCallback(async () => { try { setCalendarError(false); const sources = await listCalendarSources(); if (sources.length === 0) { setEvent(null); return; } const day = await listCalendarDay(today, timezone); setEvent(day.nextBlocking); } catch { setCalendarError(true); setEvent(null); } }, [today, timezone]);
  const loadTodos = useCallback(async () => { try { setTodoError(false); setTodos(todoCandidates((await getTodoOverview()).items)); } catch { setTodoError(true); setTodos([]); } }, []);
  const loadDashboard = useCallback(async () => { try { setDashboardError(false); setCandidate(continueCandidate((await getDashboard()).cards)); } catch { setDashboardError(true); setCandidate(null); } }, []);
  useEffect(() => { void loadCalendar(); }, [loadCalendar]); useEffect(() => { void loadTodos(); }, [loadTodos]); useEffect(() => { void loadDashboard(); }, [loadDashboard]);
  const toggleTodo = async (item: TodoItem) => { setTodoBusy(item.id); try { await setTodoCompleted(item.id, item.status !== "completed"); await loadTodos(); } catch { setTodoError(true); } finally { setTodoBusy(null); } };
  const continueWork = async () => { if (!candidate || !candidate.launchEnabled) return; setLaunchBusy(true); setLaunchError(false); try { await launchGroup(candidate.id); } catch { setLaunchError(true); } finally { setLaunchBusy(false); } };
  return <main className="today-workspace"><header className="today-heading"><h1>今天</h1><p>{dateLabel(new Date(now * 1000))}</p></header><div className="today-sections"><NextSection event={event} now={now} />{calendarError && <p className="today-inline-error" role="status">接下來暫時無法讀取</p>}<section className="today-section" aria-labelledby="today-todos-title"><header><h2 id="today-todos-title">今天要處理</h2></header>{todoError ? <p className="today-muted">待辦暫時無法讀取</p> : todos.length === 0 ? <p className="today-muted">目前沒有待辦</p> : <ul className="today-todos">{todos.map((todo) => <li key={todo.id}><label><input type="checkbox" checked={todo.status === "completed"} disabled={todoBusy === todo.id} onChange={() => void toggleTodo(todo)} /><span>{todo.title}</span></label></li>)}</ul>}</section><section className="today-section" aria-labelledby="today-continue-title"><header><h2 id="today-continue-title">繼續</h2></header>{dashboardError ? <p className="today-muted">最近進度暫時無法讀取</p> : !candidate ? <p className="today-muted">還沒有最近進度</p> : <div className="today-continue"><div><h3>{candidate.title}</h3><p>{candidate.resumeNote}</p></div>{candidate.launchEnabled && <button type="button" className="primary-button" disabled={launchBusy} onClick={() => void continueWork()}>{launchBusy ? "啟動中…" : "繼續工作"}</button>}{launchError && <small className="today-inline-error" role="status">目前無法啟動這個地方</small>}</div>}</section></div></main>;
}

export { continueCandidate, todoCandidates };
