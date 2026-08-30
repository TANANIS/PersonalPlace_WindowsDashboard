import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CalendarDay, CalendarOccurrence, CalendarSource } from "../../platform/calendar";
import type { TodoOverview } from "../../platform/todo";
import type { DashboardState } from "../../types";
import { TodayWorkspace } from "./TodayWorkspace";

const mocks = vi.hoisted(() => ({ listCalendarSources: vi.fn(), listCalendarDay: vi.fn(), getTodoOverview: vi.fn(), setTodoCompleted: vi.fn(), getDashboard: vi.fn(), launchGroup: vi.fn() }));
vi.mock("../../platform/calendar", () => ({ listCalendarSources: mocks.listCalendarSources, listCalendarDay: mocks.listCalendarDay }));
vi.mock("../../platform/todo", () => ({ getTodoOverview: mocks.getTodoOverview, setTodoCompleted: mocks.setTodoCompleted }));
vi.mock("../../platform/dashboard", () => ({ getDashboard: mocks.getDashboard, launchGroup: mocks.launchGroup }));

const source: CalendarSource = { id: "source", displayName: "work.ics", sourceType: "ics", calendarName: "工作", timezone: "Asia/Taipei", importedAt: 1, originalPath: "work.ics", fingerprint: "x" };
const event: CalendarOccurrence = { occurrenceId: "event", sourceId: source.id, sourceName: source.calendarName, uid: "event", recurrenceId: null, summary: "Project Ready", descriptionText: "", startUtc: Math.floor(Date.now() / 1000) + 3600, endUtc: Math.floor(Date.now() / 1000) + 7200, startDate: null, endDate: null, allDay: false, transparency: "opaque", status: "confirmed", recurring: false, recurrenceRule: null, lastModified: null };
const day: CalendarDay = { date: "2026-08-31", timezone: "Asia/Taipei", sources: [source], allDay: [], timed: [event], nextBlocking: event };
const dashboard: DashboardState = { pages: [], cards: [{ id: "place", pageId: "home", parentGroupId: null, cardType: "group", targetId: null, title: "Unity 學習", subtitle: "", kind: "group", symbol: "", tone: "cyan", size: "wide", position: 0, noteText: "", resumeNote: "第四節完成，接著做 Project Ready", launchEnabled: true, lastOpenedAt: "200", widgetKind: null, widgetResourceId: null }] };
const overview: TodoOverview = { lists: [], items: [{ id: "todo", listId: "list", parentId: null, seriesId: null, title: "完成 Unity 驗收", notes: "", status: "active", priority: "high", dueAt: null, position: 0, recurrenceKind: "none", recurrenceInterval: 1, reminderOffsetMinutes: null, reminderState: "none", createdAt: 1, updatedAt: 1, completedAt: null, deletedAt: null }] };

describe("TodayWorkspace", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.listCalendarSources.mockResolvedValue([source]); mocks.listCalendarDay.mockResolvedValue(day); mocks.getTodoOverview.mockResolvedValue(overview); mocks.setTodoCompleted.mockResolvedValue({ ...overview, items: [] }); mocks.getDashboard.mockResolvedValue(dashboard); mocks.launchGroup.mockResolvedValue({}); });
  it("shows the next blocking event, todo and recent place", async () => { render(<TodayWorkspace />); expect(await screen.findByText("Project Ready")).toBeInTheDocument(); expect(screen.getByText("完成 Unity 驗收")).toBeInTheDocument(); expect(screen.getByText("Unity 學習")).toBeInTheDocument(); });
  it("gracefully shows no fixed schedule without a calendar source", async () => { mocks.listCalendarSources.mockResolvedValue([]); render(<TodayWorkspace />); expect(await screen.findByText("今天沒有固定行程")).toBeInTheDocument(); expect(screen.getByText("完成 Unity 驗收")).toBeInTheDocument(); });
  it("shows at most five active todos and refreshes after completing one", async () => { const items = Array.from({ length: 6 }, (_, index) => ({ ...overview.items[0], id: `todo-${index}`, title: `待辦 ${index}` })); mocks.getTodoOverview.mockResolvedValue({ ...overview, items }); const user = userEvent.setup(); render(<TodayWorkspace />); expect((await screen.findAllByRole("checkbox")).length).toBe(5); await user.click(screen.getAllByRole("checkbox")[0]); await waitFor(() => expect(mocks.setTodoCompleted).toHaveBeenCalledWith("todo-0", true)); });
  it("launches the most recently opened resumable place", async () => { const user = userEvent.setup(); render(<TodayWorkspace />); await user.click(await screen.findByRole("button", { name: "繼續工作" })); expect(mocks.launchGroup).toHaveBeenCalledWith("place"); });
  it("keeps calendar visible when todo loading fails", async () => { mocks.getTodoOverview.mockRejectedValue(new Error("todo")); render(<TodayWorkspace />); expect(await screen.findByText("Project Ready")).toBeInTheDocument(); expect(await screen.findByText("待辦暫時無法讀取")).toBeInTheDocument(); });
  it("keeps todo visible when calendar loading fails", async () => { mocks.listCalendarSources.mockRejectedValue(new Error("calendar")); render(<TodayWorkspace />); expect(await screen.findByText("接下來暫時無法讀取")).toBeInTheDocument(); expect(await screen.findByText("完成 Unity 驗收")).toBeInTheDocument(); });
  it("handles a dashboard without a resumable place", async () => { mocks.getDashboard.mockResolvedValue({ pages: [], cards: [] }); render(<TodayWorkspace />); expect(await screen.findByText("還沒有最近進度")).toBeInTheDocument(); });
});
