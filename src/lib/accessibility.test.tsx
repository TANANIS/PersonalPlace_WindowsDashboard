import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { useModalFocus } from "./accessibility";

function Harness() {
  const [open, setOpen] = useState(false);
  const dialogRef = useModalFocus<HTMLElement>(open, () => setOpen(false));
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>開啟</button>
      {open && (
        <section ref={dialogRef} tabIndex={-1} role="dialog" aria-label="測試視窗">
          <button type="button" data-initial-focus>第一個</button>
          <button type="button">最後一個</button>
        </section>
      )}
    </>
  );
}

describe("useModalFocus", () => {
  it("鎖定 Tab、Escape 關閉並把焦點還給觸發按鈕", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "開啟" });
    await user.click(trigger);
    expect(screen.getByRole("button", { name: "第一個" })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole("button", { name: "最後一個" })).toHaveFocus();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
