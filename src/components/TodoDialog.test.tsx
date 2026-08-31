import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardCard, DashboardState } from "../types";
import type { TodoOverview } from "../platform/todo";
import { TodoDialog } from "./TodoDialog";
import { localDateKey, localDayBounds, localTomorrowKey } from "../lib/localDate";

const mocks = vi.hoisted(() => ({ createTodoItem: vi.fn(), createTodoList: vi.fn(), getTodoOverview: vi.fn(), setTodoPlannedFor: vi.fn(), updateWidgetPreferences: vi.fn(), isTauriRuntime: vi.fn(), onChanged: vi.fn(), onDashboardChanged: vi.fn() }));
vi.mock("../lib/platform", () => ({ createTodoItem: mocks.createTodoItem, createTodoList: mocks.createTodoList, deleteTodoItems: vi.fn(), getDashboard: vi.fn(), getTodoOverview: mocks.getTodoOverview, isTauriRuntime: mocks.isTauriRuntime, moveTodoItems: vi.fn(), platformErrorMessage: (_error: unknown, fallback: string) => fallback, setTodoCompleted: vi.fn(), setTodoPlannedFor: mocks.setTodoPlannedFor, updateTodoItem: vi.fn(), updateTodoList: vi.fn(), updateWidgetPreferences: mocks.updateWidgetPreferences }));

const listA = { id: "list-a", title: "原本清單", position: 0, createdAt: 1, updatedAt: 1, archivedAt: null };
const listB = { id: "list-b", title: "Unity", position: 1, createdAt: 2, updatedAt: 2, archivedAt: null };
const overview: TodoOverview = { lists: [listA], items: [] };
const createdOverview: TodoOverview = { lists: [listA, listB], items: [] };
const widget: DashboardCard = { id: "widget", pageId: "home", parentGroupId: null, cardType: "widget", targetId: null, title: "待辦", subtitle: "", kind: "note", symbol: "", tone: "cyan", size: "wide", position: 0, noteText: "", resumeNote: "", launchEnabled: false, lastOpenedAt: null, widgetKind: "todo", widgetResourceId: "list-a" };
const dashboard: DashboardState = { pages: [], cards: [widget] };

describe("TodoDialog list binding", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isTauriRuntime.mockReturnValue(true); mocks.getTodoOverview.mockResolvedValue(overview); mocks.createTodoList.mockResolvedValue(createdOverview); mocks.createTodoItem.mockResolvedValue(overview); mocks.setTodoPlannedFor.mockResolvedValue(overview); mocks.updateWidgetPreferences.mockResolvedValue(dashboard); });

  it("persists the widget binding when creating a list", async () => {
    const user = userEvent.setup();
    render(<TodoDialog widget={widget} onClose={vi.fn()} onDashboardChanged={mocks.onDashboardChanged} onChanged={mocks.onChanged} />);
    await user.type(await screen.findByRole("textbox", { name: "新增清單名稱" }), "Unity");
    await user.click(screen.getByRole("button", { name: "建立清單" }));
    await waitFor(() => expect(mocks.createTodoList).toHaveBeenCalledWith("Unity"));
    await waitFor(() => expect(mocks.updateWidgetPreferences).toHaveBeenCalledWith("widget", "list-b"));
    expect(mocks.onDashboardChanged).toHaveBeenCalledWith(dashboard);
    expect(screen.getByDisplayValue("Unity")).toBeInTheDocument();
  });

  it("keeps the created list and reports a binding failure", async () => {
    const user = userEvent.setup();
    mocks.updateWidgetPreferences.mockRejectedValue(new Error("persist failed"));
    render(<TodoDialog widget={widget} onClose={vi.fn()} onDashboardChanged={mocks.onDashboardChanged} onChanged={mocks.onChanged} />);
    await user.type(await screen.findByRole("textbox", { name: "新增清單名稱" }), "Unity");
    await user.click(screen.getByRole("button", { name: "建立清單" }));
    expect(await screen.findByDisplayValue("Unity")).toBeInTheDocument();
    expect(await screen.findByRole("alert")).toHaveTextContent("清單已建立，但無法將目前小工具切換到新清單。");
    expect(mocks.onDashboardChanged).not.toHaveBeenCalled();
  });

  it("edits planning independently with Today, Tomorrow, Clear, and an arbitrary date", async () => {
    const user = userEvent.setup();
    render(<TodoDialog widget={widget} onClose={vi.fn()} onDashboardChanged={mocks.onDashboardChanged} onChanged={mocks.onChanged} />);
    await user.click(await screen.findByRole("button", { name: "＋ 新增" }));
    const input = screen.getByLabelText("安排日期");
    await user.click(screen.getByRole("button", { name: "今天" }));
    expect(input).toHaveValue(localDateKey());
    await user.click(screen.getByRole("button", { name: "明天" }));
    expect(input).toHaveValue(localTomorrowKey());
    await user.click(screen.getByRole("button", { name: "清除" }));
    expect(input).toHaveValue("");
    await user.type(input, "2026-09-18");
    expect(input).toHaveValue("2026-09-18");
  });

  it("quick-plans active items and hides planning controls for completed items", async () => {
    const user = userEvent.setup();
    const active = { id: "active", listId: "list-a", parentId: null, seriesId: null, title: "Active", notes: "", status: "active" as const, priority: "none" as const, dueAt: null, plannedFor: null, position: 0, recurrenceKind: "none" as const, recurrenceInterval: 1, reminderOffsetMinutes: null, reminderState: "none" as const, createdAt: 1, updatedAt: 1, completedAt: null, deletedAt: null };
    const completed = { ...active, id: "completed", title: "Completed", status: "completed" as const, position: 1, completedAt: 2 };
    const itemOverview = { lists: [listA], items: [active, completed] };
    mocks.getTodoOverview.mockResolvedValue(itemOverview);
    mocks.setTodoPlannedFor.mockResolvedValue({ ...itemOverview, items: [{ ...active, plannedFor: localDateKey() }, completed] });
    render(<TodoDialog widget={widget} onClose={vi.fn()} onDashboardChanged={mocks.onDashboardChanged} onChanged={mocks.onChanged} />);
    await user.click(await screen.findByRole("button", { name: "排到今天" }));
    expect(mocks.setTodoPlannedFor).toHaveBeenCalledWith("active", localDateKey());
    await user.click(screen.getByRole("button", { name: "已完成" }));
    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "排到今天" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "移出今天" })).not.toBeInTheDocument();
  });

  it("filters planned Today and due Today independently", async () => {
    const user = userEvent.setup();
    const base = { id: "planned", listId: "list-a", parentId: null, seriesId: null, title: "Planned", notes: "", status: "active" as const, priority: "none" as const, dueAt: null, plannedFor: localDateKey(), position: 0, recurrenceKind: "none" as const, recurrenceInterval: 1, reminderOffsetMinutes: null, reminderState: "none" as const, createdAt: 1, updatedAt: 1, completedAt: null, deletedAt: null };
    const due = { ...base, id: "due", title: "Due", dueAt: localDayBounds().start + 60, plannedFor: null, position: 1 };
    mocks.getTodoOverview.mockResolvedValue({ lists: [listA], items: [base, due] });
    render(<TodoDialog widget={widget} onClose={vi.fn()} onDashboardChanged={mocks.onDashboardChanged} onChanged={mocks.onChanged} />);
    await user.click(await screen.findByRole("button", { name: "今天安排" }));
    expect(screen.getByText("Planned")).toBeInTheDocument();
    expect(screen.queryByText("Due")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "今天到期" }));
    expect(screen.getByText("Due")).toBeInTheDocument();
    expect(screen.queryByText("Planned")).not.toBeInTheDocument();
  });
});
