import { useEffect, useState } from "react";
import {
  getFocusState,
  getFocusSessions,
  pauseFocus,
  platformErrorMessage,
  resumeFocus,
  startFocus,
  stopFocus,
  updateFocusSettings,
  type FocusState,
  type FocusSession,
} from "../lib/platform";
import { useModalFocus } from "../lib/accessibility";
import type { FocusController } from "../features/focus/useFocusController";

interface FocusDialogProps {
  onClose: () => void;
  onChanged: (state: FocusState) => void;
  embedded?: boolean;
  backLabel?: string;
  controller?: FocusController;
}

const phaseLabels: Record<FocusState["phase"], string> = {
  focus: "專注",
  shortBreak: "短休息",
  longBreak: "長休息",
};

function remaining(state: FocusState): number {
  if (state.status === "running" && state.endsAt != null) {
    return Math.max(0, state.endsAt - Math.floor(Date.now() / 1000));
  }
  return state.remainingSeconds ?? state.settings.focusMinutes * 60;
}

function clock(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}

export function FocusDialog({ onClose, onChanged, controller, embedded = false, backLabel = "返回頁面" }: FocusDialogProps) {
  const [localState, setLocalState] = useState<FocusState | null>(null);
  const state = controller?.state ?? localState;
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<FocusSession[]>([]);
  const dialogRef = useModalFocus<HTMLElement>(!embedded, onClose);

  useEffect(() => {
    if (controller) { onChanged(controller.state ?? { status: "idle", phase: "focus", cycleCount: 0, startedAt: null, endsAt: null, remainingSeconds: null, linkedTodoId: null, linkedGroupId: null, updatedAt: 0, settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true } }); return; }
    let disposed = false;
    const from = new Date(); from.setHours(0, 0, 0, 0);
    const load = () => void getFocusState().then((next) => {
      if (!disposed) { setLocalState(next); onChanged(next); }
    }).catch((reason) => !disposed && setError(platformErrorMessage(reason, "無法讀取 Focus Timer。")));
    void getFocusSessions(Math.floor(from.getTime() / 1000), Math.floor(Date.now() / 1000)).then((next) => !disposed && setSessions(next)).catch(() => undefined);
    load();
    const timer = window.setInterval(() => { setNow(Date.now()); load(); }, 5_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [controller, onChanged]);

  async function run(operation: () => Promise<FocusState>, controlled?: () => Promise<FocusState>) {
    if (busy) return;
    setBusy(true); setError(null);
    try { const next = await (controlled ? controlled() : operation()); setLocalState(next); onChanged(next); const from = new Date(); from.setHours(0, 0, 0, 0); setSessions(await getFocusSessions(Math.floor(from.getTime() / 1000), Math.floor(Date.now() / 1000))); }
    catch (reason) { setError(platformErrorMessage(reason, "無法更新 Focus Timer。")); }
    finally { setBusy(false); }
  }

  const seconds = state ? remaining(state) : 0;
  void now;
  const content = (
      <section ref={dialogRef} tabIndex={-1} className={embedded ? "tool-workspace-surface focus-workspace" : "dialog focus-dialog"} role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-labelledby="focus-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={embedded ? "workspace-view-header" : "dialog-header"}><div>{embedded && <button type="button" className="back-button" onClick={onClose}>← {backLabel}</button>}<p className="eyebrow">FOCUS TIMER</p><h2 id="focus-title">專注計時</h2>{embedded && <small>一次只專注眼前這段時間</small>}</div>{!embedded && <button type="button" className="icon-button" onClick={onClose} aria-label="關閉 Focus Timer">×</button>}</header>
        {!state ? <p className="muted-copy">正在讀取計時器…</p> : <>
          <div className="focus-clock" aria-live="polite"><small>{phaseLabels[state.phase]}</small><strong>{clock(seconds)}</strong><span>{state.status === "idle" ? "準備開始" : state.status === "paused" ? "已暫停" : "進行中"}</span></div>
          <div className="focus-actions">
            {state.status === "idle" && <button className="button primary" disabled={busy} onClick={() => void run(() => startFocus({ phase: state.phase }), controller ? () => controller.start({ phase: state.phase }) : undefined)}>開始 {phaseLabels[state.phase]}</button>}
            {state.status === "running" && <button className="button primary" disabled={busy} onClick={() => void run(pauseFocus, controller?.pause)}>暫停</button>}
            {state.status === "paused" && <button className="button primary" disabled={busy} onClick={() => void run(resumeFocus, controller?.resume)}>繼續</button>}
            {state.status !== "idle" && <><button className="button secondary" disabled={busy} onClick={() => void run(() => stopFocus("skipped"), controller ? () => controller.stop("skipped") : undefined)}>跳過</button><button className="button secondary" disabled={busy} onClick={() => void run(() => stopFocus("stopped"), controller ? () => controller.stop("stopped") : undefined)}>提前結束</button></>}
          </div>
          <div className="focus-phases" aria-label="選擇階段">
            {(["focus", "shortBreak", "longBreak"] as FocusState["phase"][]).map((phase) => <button type="button" key={phase} disabled={busy || state.status !== "idle"} className={phase === state.phase ? "is-active" : ""} onClick={() => void run(() => startFocus({ phase }), controller ? () => controller.start({ phase }) : undefined)}>{phaseLabels[phase]}</button>)}
          </div>
          <section className="focus-history" aria-label="今日專注紀錄">
            <div><strong>今日紀錄</strong><small>{sessions.filter((session) => session.phase === "focus").length} 次專注</small></div>
            {sessions.length ? <ul>{sessions.slice(0, 5).map((session) => <li key={session.id}><span>{phaseLabels[session.phase]}</span><strong>{Math.max(1, Math.round(session.actualSeconds / 60))} 分</strong><small>{session.outcome === "completed" ? "完成" : session.outcome === "skipped" ? "跳過" : "提前結束"}</small></li>)}</ul> : <p>今天還沒有完成的計時紀錄。</p>}
          </section>
          <details className="focus-settings"><summary>計時設定</summary><div>
            {([ ["focusMinutes", "專注分鐘", 1, 180], ["shortBreakMinutes", "短休息分鐘", 1, 120], ["longBreakMinutes", "長休息分鐘", 1, 180], ["longBreakInterval", "長休息間隔", 1, 12] ] as const).map(([key, label, min, max]) => <label key={key}>{label}<input type="number" min={min} max={max} value={state.settings[key]} onChange={(event) => setLocalState((current) => current ? { ...current, settings: { ...current.settings, [key]: Math.max(min, Math.min(max, Number(event.target.value) || min)) } } : current)} onBlur={() => void run(() => updateFocusSettings(state.settings))} /></label>)}
          </div></details>
        </>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>
  );
  return embedded ? content : <div className="dialog-backdrop" onMouseDown={onClose}>{content}</div>;
}
