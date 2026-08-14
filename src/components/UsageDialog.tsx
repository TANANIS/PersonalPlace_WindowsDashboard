import { useEffect, useMemo, useState } from "react";
import {
  clearUsageHistory,
  getTrackingState,
  getUsageSummary,
  platformErrorMessage,
  updateTrackedApp,
  updateTrackingSettings,
  type TrackingSettings,
  type UsageSummary,
} from "../lib/platform";
import { useModalFocus } from "../lib/accessibility";

interface UsageDialogProps {
  onClose: () => void;
  onChanged: (summary: UsageSummary, tracking: TrackingSettings) => void;
  embedded?: boolean;
  backLabel?: string;
}

type UsagePeriod = "today" | "7days" | "30days";

const PERIOD_LABELS: Record<UsagePeriod, string> = {
  today: "今天",
  "7days": "近 7 天",
  "30days": "近 30 天",
};

function duration(seconds: number) {
  if (seconds < 60) return "少於 1 分鐘";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return hours ? `${hours} 小時 ${minutes} 分` : `${minutes} 分鐘`;
}

function rangeFor(period: UsagePeriod) {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (period === "7days") from.setDate(from.getDate() - 6);
  if (period === "30days") from.setDate(from.getDate() - 29);
  return { from: Math.floor(from.getTime() / 1000), to: Math.floor(Date.now() / 1000) };
}

function timeLabel(timestamp: number) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp * 1000));
}

export function UsageDialog({ onClose, onChanged, embedded = false, backLabel = "返回頁面" }: UsageDialogProps) {
  const [tracking, setTracking] = useState<TrackingSettings | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [period, setPeriod] = useState<UsagePeriod>("today");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const dialogRef = useModalFocus<HTMLElement>(!embedded, onClose);

  async function load(selectedPeriod = period) {
    const range = rangeFor(selectedPeriod);
    const [nextTracking, nextSummary] = await Promise.all([
      getTrackingState(),
      getUsageSummary(range.from, range.to),
    ]);
    setTracking(nextTracking);
    setSummary(nextSummary);
    if (selectedPeriod === "today") onChanged(nextSummary, nextTracking);
    else {
      const today = rangeFor("today");
      onChanged(await getUsageSummary(today.from, today.to), nextTracking);
    }
  }

  useEffect(() => {
    let disposed = false;
    setLoading(true);
    setError(null);
    void load(period)
      .catch((reason) => {
        if (!disposed) setError(platformErrorMessage(reason, "無法讀取使用時間。"));
      })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [period]);

  async function run(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
      await load(period);
    } catch (reason) {
      setError(platformErrorMessage(reason, "無法更新使用時間設定。"));
    } finally {
      setBusy(false);
    }
  }

  const maxSeconds = Math.max(1, ...(summary?.apps.map((app) => app.seconds) ?? []));
  const includedApps = summary?.apps.filter((app) => !app.excluded) ?? [];
  const recentSegments = useMemo(() => summary?.segments.slice(0, 8) ?? [], [summary]);

  const content = (
      <section ref={dialogRef} tabIndex={-1} className={embedded ? "tool-workspace-surface usage-workspace" : "dialog tool-dialog usage-dialog"} role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-labelledby="usage-title" onMouseDown={(event) => event.stopPropagation()}>
        <header className={embedded ? "workspace-view-header" : "dialog-header"}>
          <div>
            {embedded && <button type="button" className="back-button" onClick={onClose}>← {backLabel}</button>}
            <p className="eyebrow">USAGE</p>
            <h2 id="usage-title">使用時間</h2>
            <small className="dialog-subtitle">只呈現 App 使用概況，不判斷你的時間好壞</small>
          </div>
          {embedded ? <button className={`button secondary${settingsOpen ? " is-active" : ""}`} type="button" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((current) => !current)}>追蹤與資料設定</button> : <button className="icon-button" type="button" aria-label="關閉使用時間" onClick={onClose}>×</button>}
        </header>

        <div className={`usage-layout${embedded ? " is-workspace" : ""}${settingsOpen ? " has-settings" : ""}`}>
          <main className="usage-main">
            <div className="usage-overview-header">
              <div className="usage-period-tabs" aria-label="統計期間">
                {(Object.keys(PERIOD_LABELS) as UsagePeriod[]).map((value) => (
                  <button type="button" key={value} className={period === value ? "is-active" : ""} aria-pressed={period === value} onClick={() => setPeriod(value)}>{PERIOD_LABELS[value]}</button>
                ))}
              </div>
              {loading && <span className="usage-loading" role="status">更新中…</span>}
            </div>

            <section className="usage-metric-grid" aria-label={`${PERIOD_LABELS[period]}摘要`}>
              <article className="usage-total-card"><small>{PERIOD_LABELS[period]}總時間</small><strong>{summary ? duration(summary.totalSeconds) : "—"}</strong><span>{tracking?.enabled ? "追蹤中" : "尚未啟用追蹤"}</span></article>
              <article><small>使用過的 App</small><strong>{includedApps.length}</strong><span>不包含已排除項目</span></article>
              <article><small>最常使用</small><strong>{includedApps[0]?.displayName ?? "—"}</strong><span>{includedApps[0] ? duration(includedApps[0].seconds) : "尚無資料"}</span></article>
            </section>

            <section className="usage-panel usage-ranking" aria-labelledby="usage-ranking-title">
              <div className="tool-section-heading"><div><p className="eyebrow">APP RANKING</p><h3 id="usage-ranking-title">App 使用排行</h3></div><small>{summary?.apps.length ?? 0} 個 App</small></div>
              <div className="usage-app-list">
                {summary?.apps.length ? summary.apps.map((app) => (
                  <div className={app.excluded ? "is-excluded" : ""} key={app.appId}>
                    <span className="usage-app-mark" aria-hidden="true">{app.displayName.slice(0, 1).toLocaleUpperCase("zh-TW")}</span>
                    <span className="usage-app-copy"><strong>{app.displayName}</strong><span className="usage-bar"><i style={{ width: `${Math.max(3, app.seconds / maxSeconds * 100)}%` }} /></span></span>
                    <strong className="usage-app-time">{duration(app.seconds)}</strong>
                    <label className="usage-include-toggle"><input type="checkbox" checked={!app.excluded} disabled={busy} onChange={(event) => void run(() => updateTrackedApp(app.appId, app.displayName, !event.target.checked))} /><span>{app.excluded ? "已排除" : "納入"}</span></label>
                    <button type="button" className="icon-action danger-text" aria-label={`清除 ${app.displayName} 的紀錄`} disabled={busy} onClick={() => { if (window.confirm(`清除「${app.displayName}」的使用紀錄？`)) void run(() => clearUsageHistory(app.appId)); }}>×</button>
                  </div>
                )) : <div className="tool-empty"><span aria-hidden="true">◷</span><strong>尚未有使用紀錄</strong><small>啟用追蹤後，新的 App 使用時間會顯示在這裡。</small></div>}
              </div>
            </section>

            <section className="usage-panel usage-recent" aria-labelledby="usage-recent-title">
              <div className="tool-section-heading"><div><p className="eyebrow">RECENT</p><h3 id="usage-recent-title">最近使用</h3></div></div>
              {recentSegments.length ? <div className="usage-segment-list">{recentSegments.map((segment, index) => <div key={`${segment.appId}-${segment.startedAt}-${index}`}><span className="usage-segment-dot" /><strong>{segment.displayName}</strong><small>{timeLabel(segment.startedAt)}</small><span>{duration(Math.max(0, segment.endedAt - segment.startedAt))}</span></div>)}</div> : <p className="muted-copy">這個期間沒有最近使用區段。</p>}
            </section>
          </main>

          {(!embedded || settingsOpen) && <aside className="usage-side">
            {embedded && <div className="workspace-drawer-heading"><strong>追蹤與資料設定</strong><button type="button" className="icon-button" aria-label="關閉設定" onClick={() => setSettingsOpen(false)}>×</button></div>}
            <section className="usage-privacy"><span aria-hidden="true">◇</span><div><strong>只記錄 App 身分與時間</strong><p>不讀取視窗標題、文件名稱、網址、鍵鼠內容或畫面。</p></div></section>
            {tracking && <section className="usage-settings-card"><div className="setting-toggle-row"><span><strong>前景 App 追蹤</strong><small>關閉後立即停止新增紀錄</small></span><label className="switch"><input type="checkbox" checked={tracking.enabled} disabled={busy} onChange={(event) => void run(() => updateTrackingSettings({ ...tracking, enabled: event.target.checked }).then(() => undefined))} /><span /></label></div><label className="tracking-idle-field">閒置時間<select value={tracking.idleSeconds} disabled={busy || !tracking.enabled} onChange={(event) => void run(() => updateTrackingSettings({ ...tracking, idleSeconds: Number(event.target.value) }).then(() => undefined))}><option value="60">1 分鐘後排除</option><option value="300">5 分鐘後排除</option><option value="900">15 分鐘後排除</option><option value="0">不排除閒置</option></select></label></section>}
            <section className="usage-data-card"><strong>紀錄管理</strong><p>清除後無法復原，Dashboard 與其他資料不受影響。</p><button type="button" className="button secondary danger-text" disabled={busy || !summary?.apps.length} onClick={() => { if (window.confirm("清除所有使用時間紀錄？")) void run(() => clearUsageHistory()); }}>清除全部紀錄</button></section>
            {error && <p className="form-error" role="alert">{error}</p>}
            {!embedded && <button type="button" className="button primary usage-done" onClick={onClose}>完成</button>}
          </aside>}
        </div>
      </section>
  );
  return embedded ? content : <div className="dialog-backdrop" onMouseDown={onClose}>{content}</div>;
}
