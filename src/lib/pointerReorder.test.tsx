import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePointerReorder } from "./pointerReorder";

function ReorderHarness({ onCommit, multi = false }: { onCommit: (sourceId: string, targetId: string, draggedIds: string[]) => void; multi?: boolean }) {
  const reorder = usePointerReorder("data-reorder-id", onCommit, false, {
    getDragIds: (sourceId) => multi && sourceId === "first" ? ["first", "third"] : [sourceId],
  });
  return (
    <div>
      {["first", "second", "third"].map((id) => (
        <article
          key={id}
          data-reorder-id={id}
          className={`${reorder.draggedId === id ? "is-dragging" : ""}${reorder.dragOverId === id ? " is-drag-over" : ""}`}
        >
          <span>{id}</span>
          <button type="button" aria-label={`操作 ${id}`}>⋯</button>
          <span aria-label={`拖曳 ${id}`} {...reorder.bind(id)}>⠿</span>
        </article>
      ))}
    </div>
  );
}

afterEach(() => {
  document.querySelectorAll(".pointer-drag-preview").forEach((element) => element.remove());
  document.body.classList.remove("is-pointer-reordering");
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("usePointerReorder", () => {
  it("拖曳期間建立跟隨游標的浮動預覽並標示目標", () => {
    vi.useFakeTimers();
    const onCommit = vi.fn();
    render(<ReorderHarness onCommit={onCommit} />);
    const first = screen.getByText("first").closest("article")!;
    const second = screen.getByText("second").closest("article")!;
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({
      x: 10, y: 20, left: 10, top: 20, right: 210, bottom: 120, width: 200, height: 100, toJSON: () => ({}),
    });
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue({
      x: 240, y: 20, left: 240, top: 20, right: 440, bottom: 120, width: 200, height: 100, toJSON: () => ({}),
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => second),
    });

    fireEvent.pointerDown(screen.getByLabelText("拖曳 first"), {
      button: 0,
      pointerId: 7,
      clientX: 30,
      clientY: 40,
    });

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 38, clientY: 48 });

    const preview = document.querySelector<HTMLElement>(".pointer-drag-preview");
    expect(preview).not.toBeNull();
    expect(preview).toHaveTextContent("first");
    expect(document.body).toHaveClass("is-pointer-reordering");

    fireEvent.pointerMove(window, { pointerId: 7, clientX: 300, clientY: 80 });
    expect(preview?.style.getPropertyValue("--drag-x")).toBe("280px");
    expect(second).toHaveClass("is-drag-over");

    fireEvent.pointerUp(window, { pointerId: 7, clientX: 300, clientY: 80 });
    expect(onCommit).toHaveBeenCalledWith("first", "second", ["first"]);
    expect(preview).toHaveClass("is-dropping");
    expect(document.body).not.toHaveClass("is-pointer-reordering");
    vi.advanceTimersByTime(200);
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();
  });

  it("不會從互動控制開始拖曳，並在多選拖曳時顯示數量", () => {
    const onCommit = vi.fn();
    render(<ReorderHarness onCommit={onCommit} multi />);
    const first = screen.getByText("first").closest("article")!;
    const second = screen.getByText("second").closest("article")!;
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100, toJSON: () => ({}),
    });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => second) });

    fireEvent.pointerDown(screen.getByRole("button", { name: "操作 first" }), { button: 0, pointerId: 3, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 3, clientX: 100, clientY: 80 });
    expect(document.querySelector(".pointer-drag-preview")).toBeNull();

    fireEvent.pointerDown(screen.getByLabelText("拖曳 first"), { button: 0, pointerId: 4, clientX: 20, clientY: 20 });
    fireEvent.pointerMove(window, { pointerId: 4, clientX: 100, clientY: 80 });
    expect(document.querySelector(".pointer-drag-count")).toHaveTextContent("2");
    fireEvent.pointerUp(window, { pointerId: 4, clientX: 300, clientY: 80 });
    expect(onCommit).toHaveBeenCalledWith("first", "second", ["first", "third"]);
  });
});
