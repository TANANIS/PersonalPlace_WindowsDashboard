import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NoteEditDialog } from "./NoteEditDialog";
import type { DashboardCard } from "../types";

const note: DashboardCard = {
  id: "note-1",
  pageId: "home",
  parentGroupId: null,
  cardType: "note",
  targetId: null,
  title: "新筆記",
  subtitle: "純文字筆記",
  kind: "note",
  symbol: "≡",
  tone: "amber",
  size: "wide",
  position: 0,
  noteText: "原本內容",
  resumeNote: "",
  launchEnabled: false,
  lastOpenedAt: null,
};

afterEach(() => vi.useRealTimers());

describe("NoteEditDialog", () => {
  it("純文字內容會在 500ms 後自動保存", async () => {
    const onSaveText = vi.fn().mockResolvedValue(undefined);
    render(
      <NoteEditDialog
        note={note}
        busy={false}
        onSaveText={onSaveText}
        onSaveAppearance={vi.fn().mockResolvedValue(undefined)}
        onClose={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("內容"), { target: { value: "新的內容" } });
    await waitFor(() => expect(onSaveText).toHaveBeenCalledWith("新的內容"), {
      timeout: 1200,
    });
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("內容已保存"));
  });
});
