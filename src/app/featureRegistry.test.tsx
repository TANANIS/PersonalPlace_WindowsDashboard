import { describe, expect, it } from "vitest";
import { getSystemWorkspace, getSystemWorkspaces } from "./featureRegistry";

describe("system workspace registry", () => {
  it("exposes system workspaces through stable definitions", () => {
    expect(getSystemWorkspaces().map((workspace) => workspace.id)).toEqual(["today", "todo", "activity", "calendar"]);
    expect(getSystemWorkspace("activity")).toMatchObject({
      id: "activity",
      title: "活動",
      searchKeywords: ["activity", "ActivityWatch", "活動"],
    });
    expect(getSystemWorkspace("calendar")).toMatchObject({
      id: "calendar",
      title: "行事曆",
      searchKeywords: ["calendar", "ics", "行事曆", "日曆"],
    });
  });

  it("returns undefined for a workspace that is not registered", () => {
    expect(getSystemWorkspace("unknown-workspace")).toBeUndefined();
  });
});
