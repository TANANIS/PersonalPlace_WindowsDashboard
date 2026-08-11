import { useEffect, useState } from "react";
import { clearUsageHistory, getTrackingState, getUsageSummary, platformErrorMessage, updateTrackedApp, updateTrackingSettings, type TrackingSettings, type UsageSummary } from "../lib/platform";
import { useModalFocus } from "../lib/accessibility";

interface UsageDialogProps { onClose: () => void; onChanged: (summary: UsageSummary, tracking: TrackingSettings) => void; }
function duration(seconds: number) { return `${Math.floor(seconds / 3600)} 小時 ${Math.floor(seconds % 3600 / 60)} 分`; }

export function UsageDialog({ onClose, onChanged }: UsageDialogProps) {
  const [tracking, setTracking] = useState<TrackingSettings | null>(null);
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useModalFocus<HTMLElement>(true, onClose);
  const from = new Date(); from.setHours(0, 0, 0, 0);
  async function load() {
    try { const [nextTracking, nextSummary] = await Promise.all([getTrackingState(), getUsageSummary(Math.floor(from.getTime() / 1000), Math.floor(Date.now() / 1000))]); setTracking(nextTracking); setSummary(nextSummary); onChanged(nextSummary, nextTracking); }
    catch (reason) { setError(platformErrorMessage(reason, "無法讀取使用時間。")); }
  }
  useEffect(() => { void load(); }, []);
  async function run(action: () => Promise<void>) { if (busy) return; setBusy(true); setError(null); try { await action(); await load(); } catch (reason) { setError(platformErrorMessage(reason, "無法更新使用時間設定。")); } finally { setBusy(false); } }
  return <div className="dialog-backdrop" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="dialog tool-dialog usage-dialog" role="dialog" aria-modal="true" aria-labelledby="usage-title" onMouseDown={(event) => event.stopPropagation()}>
    <header className="dialog-header"><div><p className="eyebrow">USAGE</p><h2 id="usage-title">使用時間</h2></div><button className="icon-button" type="button" aria-label="關閉使用時間" onClick={onClose}>×</button></header>
    <div className="usage-privacy"><strong>只記錄 App 身分與時間。</strong><span>不讀取視窗標題、文件名稱、網址、鍵鼠內容或畫面。</span></div>
    {tracking && <section className="tracking-setting"><label><input type="checkbox" checked={tracking.enabled} disabled={busy} onChange={(event) => void run(async () => { await updateTrackingSettings({ ...tracking, enabled: event.target.checked }); })} /> 啟用前景 App 追蹤</label><select value={tracking.idleSeconds} disabled={busy || !tracking.enabled} onChange={(event) => void run(async () => { await updateTrackingSettings({ ...tracking, idleSeconds: Number(event.target.value) }); })}><option value="60">閒置 1 分鐘後排除</option><option value="300">閒置 5 分鐘後排除</option><option value="900">閒置 15 分鐘後排除</option><option value="0">不排除閒置</option></select></section>}
    <section className="usage-total"><small>今天</small><strong>{summary ? duration(summary.totalSeconds) : "讀取中…"}</strong></section>
    <section className="usage-app-list" aria-label="App 使用排名">{summary?.apps.length ? summary.apps.map((app) => <div key={app.appId}><span><strong>{app.displayName}</strong><small>{duration(app.seconds)}</small></span><label><input type="checkbox" checked={!app.excluded} onChange={(event) => void run(() => updateTrackedApp(app.appId, app.displayName, !event.target.checked))} /> 納入</label><button type="button" className="danger-text" onClick={() => { if (window.confirm(`清除「${app.displayName}」的使用紀錄？`)) void run(() => clearUsageHistory(app.appId)); }}>清除</button></div>) : <p className="muted-copy">尚未有使用紀錄。啟用後，會從目前開始記錄。</p>}</section>
    <div className="dialog-actions"><button type="button" className="button secondary" disabled={busy || !summary?.apps.length} onClick={() => { if (window.confirm("清除所有使用時間紀錄？")) void run(() => clearUsageHistory()); }}>清除全部紀錄</button><button type="button" className="button primary" onClick={onClose}>完成</button></div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section></div>;
}
