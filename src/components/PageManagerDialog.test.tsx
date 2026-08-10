import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
        onDelete={() => undefined}
      />,
    );
    expect(screen.getByRole("button", { name: "刪除" })).toBeDisabled();
  });
});
