import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { DashboardCard } from "../types";
import { NoteViewDialog } from "./NoteViewDialog";

const note: DashboardCard = {
  id: "note-1",
  pageId: "home",
  parentGroupId: null,
  cardType: "note",
  targetId: null,
  title: "學習紀錄",
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

describe("NoteViewDialog", () => {
  it("顯示完整純文字並由編輯按鈕進入編輯", () => {
    const onEdit = vi.fn();
    render(<NoteViewDialog note={note} onEdit={onEdit} onClose={vi.fn()} />);
    expect(screen.getByText(/第一行/)).toHaveTextContent("第一行 第二行");
    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    expect(onEdit).toHaveBeenCalledOnce();
  });

  it("空白內容顯示明確提示", () => {
    render(<NoteViewDialog note={{ ...note, noteText: "" }} onEdit={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByText("空白筆記")).toBeInTheDocument();
  });
});
