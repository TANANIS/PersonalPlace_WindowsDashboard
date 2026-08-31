import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusState } from "../../platform/focus";
import type { TodoOverview } from "../../platform/todo";
import type { DashboardState } from "../../types";
import { localDateKey } from "../../lib/localDate";
import { TodayWorkspace } from "./TodayWorkspace";

const mocks = vi.hoisted(() => ({ sources: vi.fn(), day: vi.fn(), todos: vi.fn(), dashboard: vi.fn(), launch: vi.fn(), getFocusState: vi.fn() }));
vi.mock("../../platform/calendar", () => ({ listCalendarSources: mocks.sources, listCalendarDay: mocks.day }));
vi.mock("../../platform/todo", () => ({ getTodoOverview: mocks.todos, setTodoCompleted: vi.fn(), setTodoPlannedFor: vi.fn() }));
vi.mock("../../platform/dashboard", () => ({ getDashboard: mocks.dashboard, launchGroup: mocks.launch }));
vi.mock("../../platform/focus", () => ({ getFocusState: mocks.getFocusState }));

const focus = (overrides: Partial<FocusState> = {}): FocusState => ({ status: "running", phase: "focus", cycleCount: 0, startedAt: 1, endsAt: Math.floor(Date.now() / 1000) + 100, remainingSeconds: null, linkedTodoId: null, linkedGroupId: null, updatedAt: 1, settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true }, ...overrides });
const overview: TodoOverview = { lists: [{ id: "list", title: "工作", position: 0, createdAt: 1, updatedAt: 1, archivedAt: null }], items: [{ id: "todo", listId: "list", parentId: null, seriesId: null, title: "完成驗收", notes: "", status: "active", priority: "high", dueAt: null, plannedFor: localDateKey(), position: 0, recurrenceKind: "none", recurrenceInterval: 1, reminderOffsetMinutes: null, reminderState: "none", createdAt: 1, updatedAt: 1, completedAt: null, deletedAt: null }] };
const dashboard: DashboardState = { pages: [], cards: [{ id: "place", pageId: "home", parentGroupId: null, cardType: "group", targetId: null, title: "Unity", subtitle: "", kind: "group", symbol: "", tone: "cyan", size: "wide", position: 0, noteText: "", resumeNote: "", launchEnabled: false, lastOpenedAt: null, widgetKind: null, widgetResourceId: null }] };

describe("TodayWorkspace controlled boundary", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.sources.mockResolvedValue([]); mocks.todos.mockResolvedValue(overview); mocks.dashboard.mockResolvedValue(dashboard); });
  it("does not create a second focus polling lifecycle and only shows return", async () => { const onStartFocus = vi.fn(async () => undefined); render(<TodayWorkspace focusState={focus({ linkedTodoId: "todo" })} focusReady={true} focusError={null} onStartFocus={onStartFocus} onReturnToFocus={vi.fn()} />); expect(await screen.findByRole("heading", { name: "正在做" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "回到專注" })).toBeInTheDocument(); expect(screen.queryByRole("button", { name: "暫停" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "繼續" })).not.toBeInTheDocument(); expect(screen.queryByRole("button", { name: "結束" })).not.toBeInTheDocument(); expect(mocks.getFocusState).not.toHaveBeenCalled(); });
  it("passes Todo and Place focus requests without launching Place", async () => { const onStartFocus = vi.fn(async () => undefined); const user = userEvent.setup(); render(<TodayWorkspace focusState={null} focusReady={true} focusError={null} onStartFocus={onStartFocus} />); await user.click((await screen.findAllByRole("button", { name: "開始專注" }))[0]); expect(onStartFocus).toHaveBeenCalledWith({ phase: "focus", linkedTodoId: "todo", linkedGroupId: null }); expect(mocks.launch).not.toHaveBeenCalled(); });
});
