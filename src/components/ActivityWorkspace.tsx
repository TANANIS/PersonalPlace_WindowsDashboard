import { useCallback, useEffect, useState } from "react";
import {
  getActivitySummary,
  type ActivityPeriod,
  type ActivityRankItem,
  type ActivitySummary,
} from "../lib/platform";

const PERIODS: Array<{ value: ActivityPeriod; label: string }> = [
  { value: "today", label: "今天" },
  { value: "sevenDays", label: "近 7 天" },
  { value: "thirtyDays", label: "近 30 天" },
];

function formatDuration(seconds: number): string {
  const roundedMinutes = Math.max(0, Math.round(seconds / 60));
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours === 0) return `${minutes} 分`;
  return minutes === 0 ? `${hours} 小時` : `${hours} 小時 ${minutes} 分`;
}

function formatStartedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function RankingList({ items, emptyLabel }: { items: ActivityRankItem[]; emptyLabel: string }) {
  if (items.length === 0) return <p className="activity-empty-list">{emptyLabel}</p>;
  const largest = Math.max(...items.map((item) => item.seconds), 1);
  return (
    <ol className="activity-ranking-list">
      {items.map((item, index) => (
        <li key={`${item.label}-${index}`}>
          <span className="activity-rank-number">{index + 1}</span>
          <span className="activity-rank-body">
            <span><strong title={item.label}>{item.label}</strong><small>{formatDuration(item.seconds)}</small></span>
            <i style={{ width: `${Math.max(4, (item.seconds / largest) * 100)}%` }} />
          </span>
        </li>
      ))}
    </ol>
  );
}

export function ActivityWorkspace() {
  const [period, setPeriod] = useState<ActivityPeriod>("today");
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await getActivitySummary(period));
    } catch {
      setSummary({
        connection: { status: "unavailable", message: "無法連線 ActivityWatch。請確認 ActivityWatch 正在本機執行。", serverVersion: null },
        period,
        rangeStart: "",
        rangeEnd: "",
        activeTotalSeconds: 0,
        apps: [],
        websites: [],
        timeline: [],
      });
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void getActivitySummary(period)
      .then((result) => { if (active) setSummary(result); })
      .catch(() => {
        if (active) setSummary({
          connection: { status: "unavailable", message: "無法連線 ActivityWatch。請確認 ActivityWatch 正在本機執行。", serverVersion: null },
          period,
          rangeStart: "",
          rangeEnd: "",
          activeTotalSeconds: 0,
          apps: [],
          websites: [],
          timeline: [],
        });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [period]);

  const connected = summary?.connection.status === "connected";

  return (
    <section className="content-workspace activity-workspace" aria-labelledby="activity-title">
      <header className="workspace-view-header activity-header">
        <div>
          <p className="eyebrow">ACTIVITY</p>
          <h1 id="activity-title">活動</h1>
          <small>從本機 ActivityWatch 整理出的使用概況</small>
        </div>
        <div className="activity-header-actions">
          <span className={`activity-status${connected ? " is-connected" : ""}`}>
            <i aria-hidden="true" />
            {loading && !summary ? "連線中" : summary?.connection.message ?? "等待連線"}
            {connected && summary?.connection.serverVersion && <small>v{summary.connection.serverVersion.replace(/^v/, "")}</small>}
          </span>
          <button type="button" className="button secondary activity-refresh" onClick={() => void load()} disabled={loading}>
            {loading ? "更新中" : "重新整理"}
          </button>
        </div>
      </header>

      <div className="activity-period-tabs" role="group" aria-label="活動期間">
        {PERIODS.map((option) => (
          <button
            type="button"
            key={option.value}
            className={period === option.value ? "is-active" : ""}
            aria-pressed={period === option.value}
            onClick={() => setPeriod(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading && !summary ? (
        <div className="activity-loading" role="status"><span aria-hidden="true">◌</span><p>正在讀取本機活動…</p></div>
      ) : !connected ? (
        <div className="activity-unavailable" role="status">
          <span className="activity-unavailable-icon" aria-hidden="true">⌁</span>
          <div><p className="eyebrow">LOCAL SOURCE UNAVAILABLE</p><h2>ActivityWatch 目前無法使用</h2></div>
          <p>{summary?.connection.message ?? "請確認 ActivityWatch 正在本機執行。"}</p>
          <small>Personal Place 的其他功能不受影響；啟動 ActivityWatch 後可在此重新整理。</small>
          <button type="button" className="button primary" onClick={() => void load()} disabled={loading}>再試一次</button>
        </div>
      ) : summary ? (
        <div className="activity-content">
          <section className="activity-total-card" aria-label="有效使用時間">
            <span className="activity-total-icon" aria-hidden="true">◷</span>
            <div><small>ACTIVE TOTAL TIME</small><strong>{formatDuration(summary.activeTotalSeconds)}</strong><p>已排除 ActivityWatch 判定的離開時間</p></div>
          </section>

          <div className="activity-ranking-grid">
            <section className="activity-panel" aria-labelledby="activity-apps-title">
              <header><div><p className="eyebrow">APPLICATIONS</p><h2 id="activity-apps-title">App 使用排行</h2></div><span>{summary.apps.length} 項</span></header>
              <RankingList items={summary.apps} emptyLabel="這段期間尚無 App 活動。" />
            </section>
            <section className="activity-panel" aria-labelledby="activity-sites-title">
              <header><div><p className="eyebrow">WEBSITES</p><h2 id="activity-sites-title">Website domain 使用排行</h2></div><span>{summary.websites.length} 項</span></header>
              <RankingList items={summary.websites} emptyLabel="這段期間尚無網站活動，或瀏覽器擴充功能尚未記錄。" />
            </section>
          </div>

          <section className="activity-panel activity-timeline" aria-labelledby="activity-recent-title">
            <header><div><p className="eyebrow">RECENT</p><h2 id="activity-recent-title">最近活動</h2></div><span>最近 12 小時</span></header>
            {summary.timeline.length === 0 ? <p className="activity-empty-list">最近沒有可顯示的活動。</p> : (
              <ol>
                {summary.timeline.map((item, index) => (
                  <li key={`${item.startedAt}-${item.label}-${index}`}>
                    <span className={`activity-timeline-kind is-${item.itemType}`} aria-hidden="true">{item.itemType === "website" ? "⌁" : "▣"}</span>
                    <span className="activity-timeline-copy"><strong>{item.label}</strong>{item.detail && <small title={item.detail}>{item.detail}</small>}</span>
                    <span className="activity-timeline-meta"><time dateTime={item.startedAt}>{formatStartedAt(item.startedAt)}</time><small>{formatDuration(item.durationSeconds)}</small></span>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <p className="activity-source-note">資料即時讀取自這台電腦上的 ActivityWatch；Personal Place 不會複製或保存原始事件。</p>
        </div>
      ) : null}
    </section>
  );
}
