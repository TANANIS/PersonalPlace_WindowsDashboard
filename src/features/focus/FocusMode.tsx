import { useEffect, useMemo, useState } from "react";
import type { DashboardCard } from "../../types";
import type { TodoItem } from "../../platform/todo";
import { getTodoOverview } from "../../platform/todo";
import type { FocusState } from "../../platform/focus";
import { resolveFocusContext } from "./model";
import type { FocusController } from "./useFocusController";

function clock(seconds: number) { return `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, "0")}:${(Math.max(0, seconds) % 60).toString().padStart(2, "0")}`; }
function remaining(state: FocusState, now: number) { return state.status === "running" && state.endsAt != null ? Math.max(0, state.endsAt - now) : state.remainingSeconds ?? 0; }

export function FocusMode({ controller, todos: providedTodos, cards, onLeave, onLaunchPlace }: { controller: FocusController; todos?: TodoItem[]; cards: DashboardCard[]; onLeave: () => void; onLaunchPlace?: (groupId: string) => Promise<void>; }) {
  const [loadedTodos, setLoadedTodos] = useState<TodoItem[]>([]);
  const todos = providedTodos ?? loadedTodos;
  useEffect(() => { if (!providedTodos) void getTodoOverview().then((overview) => setLoadedTodos(overview.items)).catch(() => undefined); }, [providedTodos]);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => { const timer = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1_000); return () => window.clearInterval(timer); }, []);
  const state = controller.state;
  const context = useMemo(() => resolveFocusContext(state, todos, cards), [cards, state, todos]);
  useEffect(() => { document.getElementById("focus-mode-title")?.focus(); }, []);
  const startAgain = async (phase: FocusState["phase"], linkedTodoId: string | null, linkedGroupId: string | null) => { controller.clearCompletion(); await controller.start({ phase, linkedTodoId, linkedGroupId }); };
  if (!state || state.status === "idle") {
    const completion = controller.completion;
    const previous = completion?.previousState;
    const breakPhase = previous && previous.cycleCount > 0 && previous.cycleCount % previous.settings.longBreakInterval === 0 ? "longBreak" : "shortBreak";
    return <main className="focus-mode" aria-labelledby="focus-mode-title"><section className="focus-mode-panel" tabIndex={-1}><h1 id="focus-mode-title" tabIndex={-1}>{completion ? "這一段結束了" : "自由專注"}</h1>{completion ? <><p className="focus-completion-time">{Math.max(1, Math.round((completion.previousState.settings.focusMinutes * 60) / 60))} 分鐘</p><div className="focus-mode-actions"><button className="button primary" onClick={() => void startAgain(completion.previousState.phase, completion.previousState.linkedTodoId, completion.previousState.linkedGroupId)}>再專注一段</button><button className="button secondary" onClick={() => void startAgain(breakPhase, null, null)}>休息一下</button><button className="button secondary" onClick={() => { controller.clearCompletion(); onLeave(); }}>回到今天</button></div></> : <button className="button secondary" onClick={onLeave}>回到今天</button>}</section></main>;
  }
  const isBreak = state.phase !== "focus";
  const endBreak = async () => { await controller.stop("stopped"); onLeave(); };
  return <main className="focus-mode" aria-labelledby="focus-mode-title"><section className="focus-mode-panel" tabIndex={-1}><p className="focus-mode-eyebrow">{isBreak ? "休息一下" : context.kind === "free" ? "自由專注" : context.kind === "todo" ? "待辦" : "Place"}</p><h1 id="focus-mode-title" tabIndex={-1}>{isBreak ? "休息一下" : context.title}</h1>{!isBreak && context.detail && <p className="focus-mode-detail">{context.detail}</p>}{!isBreak && context.resumeNote && <p className="focus-mode-resume">上次做到：{context.resumeNote}</p>}<strong className="focus-mode-clock" aria-live="polite">{clock(remaining(state, now))}</strong><p className="focus-mode-status">{state.status === "paused" ? "已暫停" : "進行中"}</p><div className="focus-mode-actions">{state.status === "running" ? <button className="button primary" disabled={controller.busy} onClick={() => void controller.pause()}>暫停</button> : <button className="button primary" disabled={controller.busy} onClick={() => void controller.resume()}>繼續</button>}{isBreak ? <button className="button secondary" disabled={controller.busy} onClick={() => void endBreak()}>結束休息</button> : <><button className="button secondary" disabled={controller.busy} onClick={() => void controller.stop("stopped")}>結束這段專注</button>{context.kind === "place" && context.groupId && context.launchable && onLaunchPlace && <button className="button quiet" disabled={controller.busy} onClick={() => void onLaunchPlace(context.groupId!)}>開啟工作環境</button>}</>}</div><button type="button" className="focus-mode-leave" onClick={onLeave}>← 暫時離開專注畫面</button></section></main>;
}
