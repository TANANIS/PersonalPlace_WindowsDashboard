import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardCard, DashboardState } from "../types";
import type { TodoOverview } from "../platform/todo";
import { TodoDialog } from "./TodoDialog";

const mocks = vi.hoisted(() => ({ createTodoList: vi.fn(), getTodoOverview: vi.fn(), updateWidgetPreferences: vi.fn(), isTauriRuntime: vi.fn(), onChanged: vi.fn(), onDashboardChanged: vi.fn() }));
vi.mock("../lib/platform", () => ({ createTodoItem: vi.fn(), createTodoList: mocks.createTodoList, deleteTodoItems: vi.fn(), getTodoOverview: mocks.getTodoOverview, isTauriRuntime: mocks.isTauriRuntime, moveTodoItems: vi.fn(), platformErrorMessage: (_error: unknown, fallback: string) => fallback, setTodoCompleted: vi.fn(), updateTodoItem: vi.fn(), updateTodoList: vi.fn(), updateWidgetPreferences: mocks.updateWidgetPreferences }));

const listA = { id: "list-a", title: "原本清單", position: 0, createdAt: 1, updatedAt: 1, archivedAt: null };
const listB = { id: "list-b", title: "Unity", position: 1, createdAt: 2, updatedAt: 2, archivedAt: null };
const overview: TodoOverview = { lists: [listA], items: [] };
const createdOverview: TodoOverview = { lists: [listA, listB], items: [] };
const widget: DashboardCard = { id: "widget", pageId: "home", parentGroupId: null, cardType: "widget", targetId: null, title: "待辦", subtitle: "", kind: "note", symbol: "", tone: "cyan", size: "wide", position: 0, noteText: "", resumeNote: "", launchEnabled: false, lastOpenedAt: null, widgetKind: "todo", widgetResourceId: "list-a" };
const dashboard: DashboardState = { pages: [], cards: [widget] };

describe("TodoDialog list binding", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isTauriRuntime.mockReturnValue(true); mocks.getTodoOverview.mockResolvedValue(overview); mocks.createTodoList.mockResolvedValue(createdOverview); mocks.updateWidgetPreferences.mockResolvedValue(dashboard); });

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
});
