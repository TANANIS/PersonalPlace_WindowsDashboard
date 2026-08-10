import { describe, expect, it } from "vitest";
import { changeSelection, keyboardReorderTarget } from "./editing";

const ids = ["one", "two", "three", "four"];

describe("changeSelection", () => {
  it("以一般點擊建立單一選取", () => {
    const result = changeSelection(new Set(["one", "two"]), "three", ids, "two", {
      toggle: false,
      range: false,
    });
    expect([...result.selected]).toEqual(["three"]);
  });

  it("以 Ctrl 點擊增減選取", () => {
    const added = changeSelection(new Set(["one"]), "three", ids, "one", {
      toggle: true,
      range: false,
    });
    expect([...added.selected]).toEqual(["one", "three"]);
    const removed = changeSelection(added.selected, "one", ids, "three", {
      toggle: true,
      range: false,
    });
    expect([...removed.selected]).toEqual(["three"]);
  });

  it("以 Shift 點擊連續選取", () => {
    const result = changeSelection(new Set(["two"]), "four", ids, "two", {
      toggle: false,
      range: true,
    });
    expect([...result.selected]).toEqual(["two", "three", "four"]);
  });

  it("將方向鍵轉成有邊界的卡片排序位置", () => {
    expect(keyboardReorderTarget(1, 4, "ArrowLeft")).toBe(0);
    expect(keyboardReorderTarget(1, 4, "ArrowUp")).toBe(0);
    expect(keyboardReorderTarget(1, 4, "ArrowRight")).toBe(2);
    expect(keyboardReorderTarget(1, 4, "ArrowDown")).toBe(2);
    expect(keyboardReorderTarget(0, 4, "ArrowLeft")).toBeNull();
    expect(keyboardReorderTarget(3, 4, "ArrowRight")).toBeNull();
    expect(keyboardReorderTarget(1, 4, "Enter")).toBeNull();
  });
});
