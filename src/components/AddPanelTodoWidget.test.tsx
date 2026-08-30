import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddPanel } from "./AddPanel";

const mocks = vi.hoisted(() => ({ getTodoOverview: vi.fn(), createTodoList: vi.fn(), onCreateWidget: vi.fn() }));
vi.mock("../lib/platform", () => ({ ingestItems: vi.fn(), platformErrorMessage: (_error: unknown, fallback: string) => fallback, getTodoOverview: mocks.getTodoOverview, createTodoList: mocks.createTodoList }));

const active = { id: "list-unity", title: "Unity", position: 0, createdAt: 1, updatedAt: 1, archivedAt: null };
const archived = { id: "list-old", title: "舊清單", position: 1, createdAt: 1, updatedAt: 1, archivedAt: 2 };

describe("AddPanel Todo widget setup", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getTodoOverview.mockResolvedValue({ lists: [active, archived], items: [] }); mocks.createTodoList.mockResolvedValue({ lists: [active, { ...active, id: "list-new", title: "學習", position: 2 }], items: [] }); });

  it("lets the user choose an existing active list without creating another list", async () => {
    const user = userEvent.setup();
    render(<AddPanel pageId="home" onClose={vi.fn()} onCreateWidget={mocks.onCreateWidget} />);
    await user.click(screen.getByRole("button", { name: /待辦事項/ }));
    await user.click(screen.getByRole("radio", { name: /使用既有清單/ }));
    expect(screen.getByRole("option", { name: "Unity" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "舊清單" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByRole("combobox", { name: "選擇待辦清單" }), "list-unity");
    const setup = within(document.querySelector(".todo-widget-setup") as HTMLElement);
    await user.click(setup.getByRole("button", { name: "加入" }));
    await waitFor(() => expect(mocks.onCreateWidget).toHaveBeenCalledWith("todo", "list-unity"));
    expect(mocks.createTodoList).not.toHaveBeenCalled();
  });

  it("creates a new list explicitly even when a same-name list exists", async () => {
    const user = userEvent.setup();
    mocks.getTodoOverview.mockResolvedValue({ lists: [{ ...active, title: "學習" }], items: [] });
    render(<AddPanel pageId="home" onClose={vi.fn()} onCreateWidget={mocks.onCreateWidget} />);
    await user.click(screen.getByRole("button", { name: /待辦事項/ }));
    const title = screen.getByRole("textbox", { name: "新待辦清單名稱" });
    await user.clear(title); await user.type(title, "學習");
    const setup = within(document.querySelector(".todo-widget-setup") as HTMLElement);
    await user.click(setup.getByRole("button", { name: "加入" }));
    await waitFor(() => expect(mocks.createTodoList).toHaveBeenCalledWith("學習"));
    expect(mocks.onCreateWidget).toHaveBeenCalledWith("todo", "list-new");
  });

  it("keeps the created list and reports when widget creation fails", async () => {
    const user = userEvent.setup();
    mocks.onCreateWidget.mockRejectedValueOnce(new Error("widget failed"));
    render(<AddPanel pageId="home" onClose={vi.fn()} onCreateWidget={mocks.onCreateWidget} />);
    await user.click(screen.getByRole("button", { name: /待辦事項/ }));
    const setup = within(document.querySelector(".todo-widget-setup") as HTMLElement);
    await user.click(setup.getByRole("button", { name: "加入" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("清單已建立，但無法加入待辦小工具。"));
    expect(mocks.createTodoList).toHaveBeenCalledWith("待辦事項");
  });
});
