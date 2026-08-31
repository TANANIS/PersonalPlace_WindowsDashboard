import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { GuideDialog } from "./GuideDialog";

describe("GuideDialog", () => {
  it("依序顯示五個步驟並在完成時關閉", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<GuideDialog onClose={onClose} />);

    expect(screen.getByRole("heading", { name: "建立你的空間" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "上一步" })).toBeDisabled();
    expect(screen.getByLabelText("第 1 / 5 步")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "記下要做的事" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "從 Today 開始一天" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "開始專注，接著做" })).toBeInTheDocument();
    expect(screen.getByLabelText("第 4 / 5 步")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "下一步" }));
    expect(screen.getByRole("heading", { name: "回顧與保護你的資料" })).toBeInTheDocument();
    expect(screen.getByLabelText("第 5 / 5 步")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "完成" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("支援返回、Escape 關閉與焦點循環", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();

    render(<GuideDialog onClose={onClose} />);

    const dialog = screen.getByRole("dialog");
    const close = screen.getByRole("button", { name: "關閉新手教學" });
    expect(dialog).toHaveFocus();

    await user.tab();
    expect(close).toHaveFocus();
    await user.tab();
    const next = screen.getByRole("button", { name: "下一步" });
    expect(next).toHaveFocus();
    await user.tab();
    expect(close).toHaveFocus();

    await user.click(next);
    await user.click(screen.getByRole("button", { name: "上一步" }));
    expect(screen.getByRole("heading", { name: "建立你的空間" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
