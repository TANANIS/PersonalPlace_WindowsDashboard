import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  importCalendarIcs,
  listCalendarDay,
  listCalendarSources,
  type CalendarDay,
  type CalendarOccurrence,
  type CalendarSource,
} from "../../platform/calendar";
import { platformErrorMessage } from "../../platform/system";

const locale = "zh-TW";

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function moveDate(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return localDateKey(new Date(year, month - 1, day + days));
}

function dateLabel(dateKey: string): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(year, month - 1, day));
}

function timeLabel(timestamp: number | null): string {
  if (timestamp === null) return "";
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

function eventRange(event: CalendarOccurrence): string {
  if (event.allDay) return "全天";
  return `${timeLabel(event.startUtc)}–${timeLabel(event.endUtc)}`;
}

function eventDateLabel(event: CalendarOccurrence): string {
  if (event.allDay && event.startDate) return dateLabel(event.startDate);
  if (event.startUtc === null) return "日期未提供";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date(event.startUtc * 1000));
}

function importedLabel(timestamp: number): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp * 1000));
}

function durationLabel(event: CalendarOccurrence): string {
  if (event.allDay || event.startUtc === null || event.endUtc === null) return "全天";
  const minutes = Math.max(0, Math.round((event.endUtc - event.startUtc) / 60));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${minutes} 分鐘`;
  return remainder === 0 ? `${hours} 小時` : `${hours} 小時 ${remainder} 分鐘`;
}

function busyLabel(event: CalendarOccurrence): string {
  return event.transparency === "transparent" ? "○ 不占用時間" : "● 占用時間";
}

function EventRow({ event, onOpen }: { event: CalendarOccurrence; onOpen: (event: CalendarOccurrence) => void }) {
  return (
    <li>
      <button type="button" className="calendar-event-row" onClick={() => onOpen(event)}>
        <span className="calendar-event-time">{eventRange(event)}</span>
        <span className="calendar-event-copy">
          <strong>{event.summary || "（無標題）"}</strong>
          <small>{event.sourceName}{event.recurring ? " · 重複事件" : ""}</small>
        </span>
        <span className={`calendar-busy ${event.transparency === "transparent" ? "is-free" : ""}`}>
          {busyLabel(event)}
        </span>
      </button>
    </li>
  );
}

function EventDetail({ event, onClose }: { event: CalendarOccurrence; onClose: () => void }) {
  return (
    <div className="calendar-detail-backdrop" role="presentation" onMouseDown={(mouseEvent) => {
      if (mouseEvent.target === mouseEvent.currentTarget) onClose();
    }}>
      <section className="calendar-detail" role="dialog" aria-modal="true" aria-labelledby="calendar-detail-title">
        <header>
          <div>
            <p className="eyebrow">CALENDAR EVENT</p>
            <h2 id="calendar-detail-title">{event.summary || "（無標題）"}</h2>
          </div>
          <button type="button" className="icon-button" aria-label="關閉事件詳細資訊" onClick={onClose}>×</button>
        </header>
        <dl>
          <div><dt>日期</dt><dd>{eventDateLabel(event)}</dd></div>
          <div><dt>時間</dt><dd>{eventRange(event)} · {durationLabel(event)}</dd></div>
          <div><dt>狀態</dt><dd>{busyLabel(event)}</dd></div>
          <div><dt>來源</dt><dd>{event.sourceName}</dd></div>
          <div><dt>重複</dt><dd>{event.recurring ? "是" : "否"}</dd></div>
          {event.lastModified !== null && (
            <div><dt>最後修改</dt><dd>{new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.lastModified * 1000))}</dd></div>
          )}
        </dl>
        <div className="calendar-description">
          <h3>描述</h3>
          <p>{event.descriptionText || "沒有描述。"}</p>
        </div>
      </section>
    </div>
  );
}

export function CalendarWorkspace() {
  const [date, setDate] = useState(() => localDateKey());
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [day, setDay] = useState<CalendarDay | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarOccurrence | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timezone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const nextSources = await listCalendarSources();
      setSources(nextSources);
      setDay(nextSources.length === 0 ? null : await listCalendarDay(date, timezone));
    } catch (loadError) {
      setError(platformErrorMessage(loadError, "無法讀取 Calendar。"));
    } finally {
      setLoading(false);
    }
  }, [date, timezone]);

  useEffect(() => { void load(); }, [load]);

  const chooseAndImport = useCallback(async (sourceId?: string) => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "iCalendar", extensions: ["ics"] }],
    });
    if (!selected || Array.isArray(selected)) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await importCalendarIcs(selected, sourceId);
      setNotice(`已匯入 ${result.importedEventCount} 個事件；${result.recurrenceCount} 個重複規則、${result.overrideCount} 個例外。`);
      await load();
    } catch (importError) {
      setError(platformErrorMessage(importError, "無法匯入 ICS。原有 Calendar 資料未變更。"));
    } finally {
      setBusy(false);
    }
  }, [load]);

  return (
    <main className="calendar-workspace">
      <header className="calendar-heading">
        <div><p className="eyebrow">SYSTEM WORKSPACE</p><h1>Calendar</h1><p>本機匯入的行程，依日期整理成可行動的 agenda。</p></div>
        {sources.length > 0 && <button type="button" className="secondary-button" disabled={busy} onClick={() => void chooseAndImport()}>匯入其他 ICS</button>}
      </header>

      {error && <div className="calendar-message is-error" role="alert">{error}</div>}
      {notice && <div className="calendar-message" role="status">{notice}</div>}

      {loading ? <div className="calendar-state" role="status">正在整理 Calendar…</div> : sources.length === 0 ? (
        <section className="calendar-empty">
          <span aria-hidden="true">▦</span>
          <h2>匯入第一個行事曆</h2>
          <p>選擇本機 .ics 檔案。資料會正規化後儲存在 Personal Place，不會上傳。</p>
          <button type="button" className="primary-button" disabled={busy} onClick={() => void chooseAndImport()}>{busy ? "正在匯入…" : "選擇 ICS 檔案"}</button>
        </section>
      ) : (
        <>
          <section className="calendar-sources" aria-label="Calendar 來源">
            {sources.map((source) => <div key={source.id}><span><strong>{source.calendarName}</strong><small>{source.displayName} · {source.timezone} · 最後匯入 {importedLabel(source.importedAt)}</small></span><button type="button" disabled={busy} onClick={() => void chooseAndImport(source.id)}>重新匯入</button></div>)}
          </section>
          <nav className="calendar-date-nav" aria-label="日期導覽">
            <button type="button" aria-label="前一天" onClick={() => setDate((value) => moveDate(value, -1))}>‹</button>
            <button type="button" onClick={() => setDate(localDateKey())}>今天</button>
            <strong>{dateLabel(date)}</strong>
            <button type="button" aria-label="後一天" onClick={() => setDate((value) => moveDate(value, 1))}>›</button>
          </nav>

          {day?.nextBlocking && (
            <section className="calendar-next" aria-labelledby="calendar-next-title">
              <div><p className="eyebrow">NEXT BLOCKING</p><h2 id="calendar-next-title">{day.nextBlocking.summary}</h2><span>{eventRange(day.nextBlocking)} · {day.nextBlocking.sourceName}</span></div>
              <button type="button" onClick={() => setSelectedEvent(day.nextBlocking)}>查看</button>
            </section>
          )}
          {day && !day.nextBlocking && <p className="calendar-next-empty">這一天接下來沒有占用時間的事件。</p>}

          <div className="calendar-agenda">
            <section aria-labelledby="calendar-all-day-title">
              <header><h2 id="calendar-all-day-title">全天</h2><span>{day?.allDay.length ?? 0}</span></header>
              {!day || day.allDay.length === 0 ? <p className="calendar-none">沒有全天事件。</p> : <ol>{day.allDay.map((event) => <EventRow key={event.occurrenceId} event={event} onOpen={setSelectedEvent} />)}</ol>}
            </section>
            <section aria-labelledby="calendar-timed-title">
              <header><h2 id="calendar-timed-title">時間表</h2><span>{day?.timed.length ?? 0}</span></header>
              {!day || day.timed.length === 0 ? <p className="calendar-none">這一天沒有排定事件。</p> : <ol>{day.timed.map((event) => <EventRow key={event.occurrenceId} event={event} onOpen={setSelectedEvent} />)}</ol>}
            </section>
          </div>
        </>
      )}
      {selectedEvent && <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />}
    </main>
  );
}
