import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UndoBar } from "./UndoBar";

describe("UndoBar", () => {
  it("保留復原入口直到使用者操作", async () => {
    const onUndo = vi.fn();
    render(<UndoBar busy={false} message="已建立群組" onUndo={onUndo} onDismiss={() => undefined} />);
    expect(screen.getByText("已建立群組")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "復原" }));
    expect(onUndo).toHaveBeenCalledOnce();
  });
});
