import { invoke } from "@tauri-apps/api/core";
import { isTauriRuntime } from "./system";

export interface CalendarSource {
  id: string;
  displayName: string;
  sourceType: "ics";
  calendarName: string;
  timezone: string;
  importedAt: number;
  originalPath: string | null;
  fingerprint: string;
}

export interface CalendarOccurrence {
  occurrenceId: string;
  sourceId: string;
  sourceName: string;
  uid: string;
  recurrenceId: string | null;
  summary: string;
  descriptionText: string;
  startUtc: number | null;
  endUtc: number | null;
  startDate: string | null;
  endDate: string | null;
  allDay: boolean;
  transparency: "opaque" | "transparent";
  status: string;
  recurring: boolean;
  recurrenceRule: string | null;
  lastModified: number | null;
}

export interface CalendarDay {
  date: string;
  timezone: string;
  sources: CalendarSource[];
  allDay: CalendarOccurrence[];
  timed: CalendarOccurrence[];
  nextBlocking: CalendarOccurrence | null;
}

export interface CalendarImportSummary {
  source: CalendarSource;
  importedEventCount: number;
  recurrenceCount: number;
  overrideCount: number;
  invalidCount: number;
}

export async function listCalendarSources(): Promise<CalendarSource[]> {
  if (!isTauriRuntime()) return [];
  return invoke<CalendarSource[]>("list_calendar_sources");
}

export async function importCalendarIcs(path: string, sourceId?: string): Promise<CalendarImportSummary> {
  if (!isTauriRuntime()) throw new Error("ICS 匯入只支援桌面版。");
  return invoke<CalendarImportSummary>("import_calendar_ics", {
    request: { path, sourceId: sourceId ?? null },
  });
}

export async function listCalendarDay(date: string, timezone: string): Promise<CalendarDay> {
  if (!isTauriRuntime()) return { date, timezone, sources: [], allDay: [], timed: [], nextBlocking: null };
  return invoke<CalendarDay>("list_calendar_day", { request: { date, timezone } });
}

export async function getNextCalendarEvent(now: number, timezone: string): Promise<CalendarOccurrence | null> {
  if (!isTauriRuntime()) return null;
  return invoke<CalendarOccurrence | null>("get_next_calendar_event", { request: { now, timezone } });
}
