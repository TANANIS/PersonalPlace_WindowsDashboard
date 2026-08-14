import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { NoteWorkspace } from "./NoteWorkspace";
import type { DashboardCard } from "../types";

const note: DashboardCard = {
  id: "note-1",
  pageId: "home",
  parentGroupId: null,
  cardType: "note",
  targetId: null,
  title: "研究紀錄",
  subtitle: "純文字筆記",
  kind: "note",
  symbol: "≡",
  tone: "amber",
  size: "wide",
  position: 0,
  noteText: "第一行\n第二行",
  resumeNote: "",
  launchEnabled: false,
  lastOpenedAt: null,
};

describe("NoteWorkspace", () => {
  it("預設先閱讀，明確點擊後才進入編輯", () => {
    render(<NoteWorkspace note={note} busy={false} onBack={vi.fn()} onSaveText={vi.fn()} onSaveAppearance={vi.fn()} />);
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent === "第一行\n第二行")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "內容" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    expect(screen.getByRole("textbox", { name: "內容" })).toHaveValue("第一行\n第二行");
  });

  it("完成編輯前保存內容與卡片外觀", async () => {
    const onSaveText = vi.fn().mockResolvedValue(undefined);
    const onSaveAppearance = vi.fn().mockResolvedValue(undefined);
    render(<NoteWorkspace note={note} busy={false} startEditing onBack={vi.fn()} onSaveText={onSaveText} onSaveAppearance={onSaveAppearance} />);
    fireEvent.change(screen.getByRole("textbox", { name: "內容" }), { target: { value: "新的內容" } });
    fireEvent.change(screen.getByLabelText("名稱"), { target: { value: "新名稱" } });
    fireEvent.click(screen.getByRole("button", { name: "完成編輯" }));
    await waitFor(() => expect(onSaveText).toHaveBeenCalledWith("新的內容"));
    await waitFor(() => expect(onSaveAppearance).toHaveBeenCalledWith("新名稱", "wide"));
    expect(await screen.findByText("新的內容")).toBeInTheDocument();
  });
});
