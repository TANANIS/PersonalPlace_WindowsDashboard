import { describe, expect, it } from "vitest";
import { dashboardView, isRootView, systemWorkspaceView, type ViewOrigin } from "./navigation";

describe("app navigation", () => {
  it("treats dashboards and registered system workspaces as root views", () => {
    expect(isRootView(dashboardView("home"))).toBe(true);
    expect(isRootView(systemWorkspaceView("activity"))).toBe(true);
  });

  it("keeps the system workspace id in the route", () => {
    expect(systemWorkspaceView("today")).toEqual({
      kind: "systemWorkspace",
      workspaceId: "today",
    });
  });

  it("represents a nested Place from a system workspace without dashboard fields", () => {
    const origin: ViewOrigin = { kind: "systemWorkspace", workspaceId: "today", scrollY: 180 };
    const nestedPlace: ViewOrigin = { ...origin, placeId: "place-1", placeScrollY: 42 };
    expect(nestedPlace).not.toHaveProperty("pageId");
    expect(nestedPlace.placeId).toBe("place-1");
  });
});
