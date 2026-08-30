import { describe, expect, it } from "vitest";
import { dashboardView, isRootView, systemWorkspaceView } from "./navigation";

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
});
