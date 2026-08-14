import { useEffect, useMemo, useState } from "react";
import type { FocusState, UsageSummary, WidgetSummary } from "../lib/platform";
import type { DashboardCard } from "../types";

interface WidgetCardPreviewProps {
  card: DashboardCard;
  summary: WidgetSummary | null;
  focusState: FocusState | null;
  usageSummary: UsageSummary | null;
  scopeCards: DashboardCard[];
  busy?: boolean;
  onOpen: () => void;
  onToggleTodo: (itemId: string, completed: boolean) => void;
  onFocusAction: (action: "start" | "pause" | "resume" | "skip" | "stop") => void;
}

function clock(seconds: number) {
  return `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, "0")}:${(Math.max(0, seconds) % 60).toString().padStart(2, "0")}`;
}

function remaining(state: FocusState | null) {
  if (!state) return 25 * 60;
  if (state.status === "running" && state.endsAt != null) return Math.max(0, state.endsAt - Math.floor(Date.now() / 1000));
  return state.remainingSeconds ?? state.settings.focusMinutes * 60;
}

const phaseLabel: Record<FocusState["phase"], string> = { focus: "專注", shortBreak: "短休息", longBreak: "長休息" };

export function WidgetCardPreview({ card, summary, focusState, usageSummary, scopeCards, busy = false, onOpen, onToggleTodo, onFocusAction }: WidgetCardPreviewProps) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (card.widgetKind !== "focus" || focusState?.status !== "running") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [card.widgetKind, focusState?.status]);

  const scopeTitles = useMemo(() => new Set(scopeCards.filter((candidate) => candidate.cardType === "target").map((candidate) => candidate.title.trim().toLocaleLowerCase("zh-TW")).filter(Boolean)), [scopeCards]);
  const usageApps = useMemo(() => {
    const apps = usageSummary?.apps.filter((app) => !app.excluded) ?? [];
    const related = apps.filter((app) => scopeTitles.has(app.displayName.toLocaleLowerCase("zh-TW")));
    return (related.length ? related : apps).slice(0, 3);
  }, [scopeTitles, usageSummary]);
  const totalUsage = usageApps.reduce((sum, app) => sum + app.seconds, 0);
  void now;

  if (card.widgetKind === "todo") {
    return <div className="widget-preview widget-preview-todo">
      <div className="widget-preview-heading"><strong>{summary?.primaryValue ?? "載入中…"}</strong><button type="button" onClick={onOpen}>管理</button></div>
      {summary?.items.length ? <ul className="widget-todo-list">{summary.items.map((item) => <li key={item.id}>
        <label><input type="checkbox" disabled={busy} aria-label={`完成 ${item.title}`} onChange={(event) => onToggleTodo(item.id, event.target.checked)} /><span>{item.title}</span></label>
      </li>)}</ul> : <p className="widget-empty">沒有待辦；點擊卡片新增。</p>}
    </div>;
  }

  if (card.widgetKind === "focus") {
    const state = focusState;
    const status = state?.status ?? "idle";
    return <div className="widget-preview widget-preview-focus">
      <div className="widget-focus-clock"><small>{state ? phaseLabel[state.phase] : "專注"}</small><strong>{clock(remaining(state))}</strong><span>{status === "running" ? "進行中" : status === "paused" ? "已暫停" : "準備開始"}</span></div>
      <div className="widget-focus-actions">
        {status === "idle" ? <button type="button" className="compact-primary" disabled={busy} onClick={() => onFocusAction("start")}>開始</button> : <>
          <button type="button" className="compact-primary" disabled={busy} onClick={() => onFocusAction(status === "running" ? "pause" : "resume")}>{status === "running" ? "暫停" : "繼續"}</button>
          <button type="button" disabled={busy} onClick={() => onFocusAction("skip")}>跳過</button>
          <button type="button" disabled={busy} onClick={() => onFocusAction("stop")}>結束</button>
        </>}
        <button type="button" className="compact-link" onClick={onOpen}>詳細</button>
      </div>
    </div>;
  }

  return <div className="widget-preview widget-preview-usage">
    <div className="widget-preview-heading"><strong>{usageSummary ? `${Math.floor((usageSummary.totalSeconds ?? 0) / 3600)} 小時 ${Math.floor(((usageSummary.totalSeconds ?? 0) % 3600) / 60)} 分` : "載入中…"}</strong><button type="button" onClick={onOpen}>詳細</button></div>
    {usageApps.length ? <div className="widget-usage-bars">{usageApps.map((app) => <div key={app.appId}><span><b>{app.displayName}</b><small>{Math.floor(app.seconds / 60)} 分</small></span><i><em style={{ width: `${Math.max(8, Math.round((app.seconds / Math.max(totalUsage, 1)) * 100))}%` }} /></i></div>)}</div> : <p className="widget-empty">啟用追蹤後，這裡會顯示使用中的 App。</p>}
  </div>;
}
