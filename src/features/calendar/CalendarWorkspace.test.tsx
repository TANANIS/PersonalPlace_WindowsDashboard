import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarDay, CalendarOccurrence, CalendarSource } from "../../platform/calendar";
import { CalendarSourceManagement, CalendarWorkspace } from "./CalendarWorkspace";

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  listCalendarSources: vi.fn(),
  listCalendarDay: vi.fn(),
  importCalendarIcs: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));
vi.mock("../../platform/calendar", () => ({
  listCalendarSources: mocks.listCalendarSources,
  listCalendarDay: mocks.listCalendarDay,
  importCalendarIcs: mocks.importCalendarIcs,
}));

const source: CalendarSource = {
  id: "source-one",
  displayName: "work.ics",
  sourceType: "ics",
  calendarName: "工作",
  timezone: "Asia/Taipei",
  importedAt: 1_700_000_000,
  originalPath: "C:\\Calendar\\work.ics",
  fingerprint: "abc",
};
const secondSource: CalendarSource = { ...source, id: "source-two", displayName: "personal.ics", calendarName: "個人" };

const opaqueEvent: CalendarOccurrence = {
  occurrenceId: "event-one",
  sourceId: source.id,
  sourceName: source.calendarName,
  uid: "one",
  recurrenceId: null,
  summary: "設計檢查",
  descriptionText: "安全內容 <script>不執行</script>",
  startUtc: 1_788_152_400,
  endUtc: 1_788_156_000,
  startDate: null,
  endDate: null,
  allDay: false,
  transparency: "opaque",
  status: "confirmed",
  recurring: true,
  recurrenceRule: "FREQ=WEEKLY",
  lastModified: 1_788_100_000,
};

const transparentEvent: CalendarOccurrence = {
  ...opaqueEvent,
  occurrenceId: "event-two",
  uid: "two",
  summary: "參考行程",
  descriptionText: "",
  transparency: "transparent",
  recurring: false,
};

const day: CalendarDay = {
  date: "2026-08-31",
  timezone: "Asia/Taipei",
  sources: [source],
  allDay: [],
  timed: [opaqueEvent, transparentEvent],
  nextBlocking: opaqueEvent,
};

describe("CalendarWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listCalendarSources.mockResolvedValue([source]);
    mocks.listCalendarDay.mockResolvedValue(day);
    mocks.importCalendarIcs.mockResolvedValue({
      source,
      importedEventCount: 2,
      recurrenceCount: 1,
      overrideCount: 0,
      invalidCount: 0,
    });
  });

  it("shows a local ICS empty state and imports through an explicit file choice", async () => {
    const user = userEvent.setup();
    mocks.listCalendarSources.mockResolvedValueOnce([]).mockResolvedValue([source]);
    mocks.open.mockResolvedValue("C:\\Calendar\\work.ics");
    render(<CalendarWorkspace />);

    expect(await screen.findByRole("heading", { name: "還沒有行事曆" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "選擇 ICS 檔案" }));

    await waitFor(() => expect(mocks.importCalendarIcs).toHaveBeenCalledWith("C:\\Calendar\\work.ics"));
    expect(await screen.findByText(/已匯入 2 個事件/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "時間表" })).toBeInTheDocument();
  });

  it("renders busy semantics and opens a read-only plain-text event detail", async () => {
    const user = userEvent.setup();
    const { container } = render(<CalendarWorkspace />);

    expect(await screen.findByText("● 占用時間")).toBeInTheDocument();
    expect(screen.getByText("○ 不占用時間")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /設計檢查/ }));

    expect(await screen.findByRole("dialog", { name: "設計檢查" })).toBeInTheDocument();
    expect(screen.getByText("安全內容 <script>不執行</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByText("是")).toBeInTheDocument();
    expect(container.querySelector(".calendar-event-copy small")?.textContent).toContain("重複事件");
    await user.click(screen.getByRole("button", { name: /參考行程/ }));
    expect(screen.queryByText("重複：否")).not.toBeInTheDocument();
  });

  it("does not show an empty all-day card or a source name for one source", async () => {
    render(<CalendarWorkspace />);
    expect(await screen.findByRole("heading", { name: "時間表" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "全天" })).not.toBeInTheDocument();
    expect(screen.queryByText("工作")).not.toBeInTheDocument();
  });

  it("reimports one selected source from Settings management", async () => {
    const user = userEvent.setup();
    mocks.open.mockResolvedValue("C:\\Calendar\\work-new.ics");
    render(<CalendarSourceManagement />);

    await user.click(await screen.findByRole("button", { name: "重新匯入" }));
    await waitFor(() => expect(mocks.importCalendarIcs).toHaveBeenCalledWith("C:\\Calendar\\work-new.ics", source.id));
  });

  it("does not show next-event content when browsing a past date", async () => {
    const user = userEvent.setup();
    render(<CalendarWorkspace />);
    await screen.findByRole("heading", { name: "時間表" });
    await user.click(screen.getByRole("button", { name: "前一天" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "下一個行程" })).not.toBeInTheDocument());
  });

  it("shows source metadata when more than one calendar is present", async () => {
    mocks.listCalendarSources.mockResolvedValue([source, secondSource]);
    render(<CalendarWorkspace />);
    await screen.findByRole("heading", { name: "時間表" });
    expect(screen.getAllByText("工作").length).toBeGreaterThan(0);
  });

  it("can import a new ICS from Settings when no source exists", async () => {
    const user = userEvent.setup();
    mocks.listCalendarSources.mockResolvedValue([]);
    mocks.open.mockResolvedValue("C:\\Calendar\\first.ics");
    render(<CalendarSourceManagement />);
    await user.click(screen.getByRole("button", { name: "＋ 匯入 ICS" }));
    await waitFor(() => expect(mocks.importCalendarIcs).toHaveBeenCalledWith("C:\\Calendar\\first.ics", undefined));
  });
});
