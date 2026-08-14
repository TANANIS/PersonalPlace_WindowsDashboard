import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageManagerDialog } from "./PageManagerDialog";

describe("PageManagerDialog", () => {
  it("最後一個頁面的刪除按鈕不可使用", () => {
    render(
      <PageManagerDialog
        pages={[{ id: "home", name: "我的地方", symbol: "⌂" }]}
        busy={false}
        onClose={() => undefined}
        onCreate={() => undefined}
        onUpdate={() => undefined}
      onMove={() => undefined}
      onReorder={() => undefined}
        onDelete={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "刪除頁面" })).toBeDisabled();
  });

  it("頁面名稱變更後可按 Enter 儲存", () => {
    const onUpdate = vi.fn();
    render(
      <PageManagerDialog
        pages={[{ id: "home", name: "我的地方", symbol: "⌂" }]}
        busy={false}
        onClose={() => undefined}
        onCreate={() => undefined}
        onUpdate={onUpdate}
      onMove={() => undefined}
      onReorder={() => undefined}
        onDelete={() => undefined}
      />,
    );
    const input = screen.getByRole("textbox", { name: "頁面名稱" });
    expect(screen.getByRole("button", { name: "儲存頁面" })).toBeDisabled();
    fireEvent.change(input, { target: { value: "新的地方" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onUpdate).toHaveBeenCalledWith("home", "新的地方", "⌂");
  });
});
