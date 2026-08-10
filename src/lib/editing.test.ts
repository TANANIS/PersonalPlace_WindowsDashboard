import { describe, expect, it } from "vitest";
import { changeSelection } from "./editing";

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
});
