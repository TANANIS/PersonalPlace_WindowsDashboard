import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { FocusDialogSafe } from "./FocusDialogSafe";

const callbacks = vi.hoisted(() => [] as Array<(state: unknown) => void>);

vi.mock("./components/FocusDialog", () => ({
  FocusDialog: ({ onChanged }: { onChanged: (state: unknown) => void }) => {
    callbacks.push(onChanged);
    return null;
  },
}));

describe("FocusDialogSafe", () => {
  it("keeps the polling callback stable when App supplies a new summary handler", () => {
    callbacks.length = 0;
    const { rerender } = render(<FocusDialogSafe onClose={vi.fn()} onChanged={vi.fn()} />);
    rerender(<FocusDialogSafe onClose={vi.fn()} onChanged={vi.fn()} />);

    expect(callbacks).toHaveLength(2);
    expect(callbacks[1]).toBe(callbacks[0]);
  });
});
