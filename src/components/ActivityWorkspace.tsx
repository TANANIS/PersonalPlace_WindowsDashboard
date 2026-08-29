import { useCallback, useEffect, useState } from "react";
import {
  getActivityDetail,
  getActivitySummary,
  getActivityTimeline,
  type ActivityDetail,
  type ActivityDetailKind,
  type ActivityPeriod,
  type ActivityRankItem,
  type ActivitySummary,
  type ActivityTimelineItem,
} from "../lib/platform";

const PERIODS: Array<{ value: ActivityPeriod; label: string }> = [
  { value: "today", label: "今天" },
  { value: "sevenDays", label: "近 7 天" },
  { value: "thirtyDays", label: "近 30 天" },
];

function formatDuration(seconds: number): string {
  const roundedMinutes = Math.max(0, Math.round(seconds / 60));
  if (seconds > 0 && roundedMinutes === 0) return "不到 1 分";
  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  if (hours === 0) return `${minutes} 分`;
  return minutes === 0 ? `${hours} 小時` : `${hours} 小時 ${minutes} 分`;
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--:--";
  return new Intl.DateTimeFormat("zh-TW", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDetailTime(startedAt: string, endedAt: string, period: ActivityPeriod): string {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  const prefix = period === "today"
    ? ""
    : `${new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric" }).format(start)} `;
  return `${prefix}${formatClock(startedAt)}–${formatClock(endedAt)}`;
}

function RankingList({ items, kind, emptyLabel, onSelect }: { items: ActivityRankItem[]; kind: ActivityDetailKind; emptyLabel: string; onSelect: (kind: ActivityDetailKind, item: ActivityRankItem) => void }) {
  if (items.length === 0) return <p className="activity-empty-list">{emptyLabel}</p>;
  const largest = Math.max(...items.map((item) => item.seconds), 1);
  return (
    <ol className="activity-ranking-list">
      {items.map((item, index) => (
        <li key={item.key}>
          <span className="activity-rank-number">{index + 1}</span>
          <button type="button" className="activity-rank-open" aria-label={`查看 ${item.label} 詳細活動`} onClick={() => onSelect(kind, item)}>
            <span className="activity-rank-body">
              <span><strong title={item.label}>{item.label}</strong><small>{formatDuration(item.seconds)}</small></span>
              <i style={{ width: `${Math.max(4, (item.seconds / largest) * 100)}%` }} />
            </span>
            <span className="activity-rank-chevron" aria-hidden="true">›</span>
          </button>
        </li>
      ))}
    </ol>
  );
}

function ActivityDetailView({ detail, loading, error, label, period, onBack }: { detail: ActivityDetail | null; loading: boolean; error: string | null; label: string; period: ActivityPeriod; onBack: () => void }) {
  return (
    <section className="activity-panel activity-detail" aria-labelledby="activity-detail-title">
      <header>
        <div className="activity-detail-heading">
          <button type="button" className="activity-detail-back" onClick={onBack}>← 返回排行</button>
          <p className="eyebrow">ACTIVITY DETAIL</p>
          <h2 id="activity-detail-title">{label}</h2>
          {detail && <small>選定期間共 {formatDuration(detail.totalSeconds)}</small>}
        </div>
      </header>
      {loading ? <div className="activity-detail-state" role="status">正在整理詳細活動…</div> : error ? <div className="activity-detail-state is-error" role="alert">{error}</div> : !detail || detail.items.length === 0 ? <p className="activity-empty-list">這段期間沒有可顯示的詳細活動。</p> : (
        <ol className="activity-detail-list">
          {detail.items.map((item, index) => (
            <li key={`${item.startedAt}-${index}`}>
              <div className="activity-detail-time"><time dateTime={item.startedAt}>{formatDetailTime(item.startedAt, item.endedAt, period)}</time><small>{formatDuration(item.durationSeconds)}</small></div>
              <div className="activity-detail-copy"><strong title={item.title ?? label}>{item.title ?? label}</strong>{item.url && <small className="activity-detail-url" title={item.url}>{item.url}</small>}</div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TodayTimeline({ items, loading }: { items: ActivityTimelineItem[]; loading: boolean }) {
  return (
    <section className="activity-panel activity-timeline" aria-labelledby="activity-timeline-title">
      <header><div><p className="eyebrow">TODAY</p><h2 id="activity-timeline-title">今日時間軸</h2></div><span>今天</span></header>
      {loading ? <p className="activity-empty-list" role="status">正在整理今日活動…</p> : items.length === 0 ? <p className="activity-empty-list">今天沒有可顯示的活動。</p> : (
        <ol>
          {items.map((item, index) => (
            <li key={`${item.startedAt}-${item.label}-${index}`}>
              <span className="activity-timeline-track" aria-hidden="true"><i /></span>
              <span className="activity-timeline-copy"><span className="activity-timeline-range"><time dateTime={item.startedAt}>{formatClock(item.startedAt)}</time><i /><time dateTime={item.endedAt}>{formatClock(item.endedAt)}</time></span><strong>{item.label}</strong>{item.context && <small title={item.context}>{item.context}</small>}</span>
              <span className="activity-timeline-duration">{formatDuration(item.durationSeconds)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function ActivityWorkspace() {
  const [period, setPeriod] = useState<ActivityPeriod>("today");
  const [summary, setSummary] = useState<ActivitySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<ActivityTimelineItem[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [detailTarget, setDetailTarget] = useState<{ kind: ActivityDetailKind; item: ActivityRankItem } | null>(null);
  const [detail, setDetail] = useState<ActivityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const loadTimeline = useCallback(async () => {
    setTimelineLoading(true);
    try {
      setTimeline(await getActivityTimeline());
    } catch {
      setTimeline([]);
    } finally {
      setTimelineLoading(false);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getActivitySummary(period);
      setSummary(result);
      if (result.connection.status === "connected") void loadTimeline();
    } catch {
      setSummary({
        connection: { status: "unavailable", message: "無法連線 ActivityWatch。請確認 ActivityWatch 正在本機執行。", serverVersion: null },
        period,
        rangeStart: "",
        rangeEnd: "",
        activeTotalSeconds: 0,
        apps: [],
        websites: [],
      });
    } finally {
      setLoading(false);
    }
  }, [loadTimeline, period]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setDetailTarget(null);
    setDetail(null);
    void getActivitySummary(period)
      .then((result) => {
        if (!active) return;
        setSummary(result);
        if (result.connection.status === "connected" && timeline.length === 0) void loadTimeline();
      })
      .catch(() => {
        if (active) setSummary({
          connection: { status: "unavailable", message: "無法連線 ActivityWatch。請確認 ActivityWatch 正在本機執行。", serverVersion: null },
          period,
          rangeStart: "",
          rangeEnd: "",
          activeTotalSeconds: 0,
          apps: [],
          websites: [],
        });
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadTimeline, period]);

  const openDetail = useCallback((kind: ActivityDetailKind, item: ActivityRankItem) => {
    setDetailTarget({ kind, item });
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    void getActivityDetail(period, kind, item.key)
      .then(setDetail)
      .catch(() => setDetailError("無法讀取這個項目的詳細活動，請稍後再試。"))
      .finally(() => setDetailLoading(false));
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
          {detailTarget ? (
            <ActivityDetailView detail={detail} loading={detailLoading} error={detailError} label={detailTarget.item.label} period={period} onBack={() => setDetailTarget(null)} />
          ) : (
            <>
              <section className="activity-total-card" aria-label="有效使用時間">
                <span className="activity-total-icon" aria-hidden="true">◷</span>
                <div><small>ACTIVE TOTAL TIME</small><strong>{formatDuration(summary.activeTotalSeconds)}</strong><p>已排除 ActivityWatch 判定的離開時間</p></div>
              </section>
              <div className="activity-ranking-grid">
                <section className="activity-panel" aria-labelledby="activity-apps-title"><header><div><p className="eyebrow">APPLICATIONS</p><h2 id="activity-apps-title">App 使用排行</h2></div><span>{summary.apps.length} 項</span></header><RankingList items={summary.apps} kind="app" emptyLabel="這段期間尚無 App 活動。" onSelect={openDetail} /></section>
                <section className="activity-panel" aria-labelledby="activity-sites-title"><header><div><p className="eyebrow">WEBSITES</p><h2 id="activity-sites-title">Website domain 使用排行</h2></div><span>{summary.websites.length} 項</span></header><RankingList items={summary.websites} kind="website" emptyLabel="這段期間尚無網站活動，或瀏覽器擴充功能尚未記錄。" onSelect={openDetail} /></section>
              </div>
              <TodayTimeline items={timeline} loading={timelineLoading} />
            </>
          )}
          <p className="activity-source-note">有效總時間、排行、詳細活動與今日時間軸會排除 ActivityWatch 判定的 AFK，但瀏覽器正在播放聲音的時段仍會計入。Personal Place 只在開啟此工作區時即時查詢，不會複製或保存原始事件。</p>
        </div>
      ) : null}
    </section>
  );
}
