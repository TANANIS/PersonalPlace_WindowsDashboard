import { describe, expect, it } from "vitest";
import { dashboardView } from "./viewState";

describe("viewState", () => {
  it("建立不攜帶舊內頁狀態的 Dashboard view", () => {
    expect(dashboardView("home")).toEqual({ kind: "dashboard", pageId: "home" });
  });
});
