import { describe, expect, it } from "vitest";
import { dashboardView, type AppView } from "./viewState";

describe("viewState", () => {
  it("建立不攜帶舊內頁狀態的 Dashboard view", () => {
    expect(dashboardView("home")).toEqual({ kind: "dashboard", pageId: "home" });
  });

  it("Activity 是不帶 pageId 的 app-level view", () => {
    const activity: AppView = { kind: "activity" };
    expect(activity).toEqual({ kind: "activity" });
    expect("pageId" in activity).toBe(false);
  });
});
