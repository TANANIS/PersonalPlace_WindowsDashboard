import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivitySummary } from "../lib/platform";
import { ActivityWorkspace } from "./ActivityWorkspace";

const { getActivitySummary } = vi.hoisted(() => ({ getActivitySummary: vi.fn() }));

vi.mock("../lib/platform", async () => {
  const actual = await vi.importActual<typeof import("../lib/platform")>("../lib/platform");
  return { ...actual, getActivitySummary };
});

const connectedSummary: ActivitySummary = {
  connection: { status: "connected", message: "ActivityWatch 已連線", serverVersion: "v0.13.2" },
  period: "today",
  rangeStart: "2026-08-28T00:00:00+08:00",
  rangeEnd: "2026-08-28T15:00:00+08:00",
  activeTotalSeconds: 7_500,
  apps: [{ label: "Code.exe", seconds: 3_600 }],
  websites: [{ label: "github.com", seconds: 1_800 }],
  timeline: [{ itemType: "website", label: "github.com", detail: "Repository", startedAt: "2026-08-28T14:00:00+08:00", durationSeconds: 300 }],
};

describe("ActivityWorkspace", () => {
  beforeEach(() => {
    getActivitySummary.mockReset();
    getActivitySummary.mockResolvedValue(connectedSummary);
  });

  it("顯示 Personal Place DTO 整理後的活動摘要並切換期間", async () => {
    const user = userEvent.setup();
    render(<ActivityWorkspace />);

    expect(await screen.findByText("2 小時 5 分")).toBeInTheDocument();
    expect(screen.getByText("Code.exe")).toBeInTheDocument();
    expect(screen.getAllByText("github.com").length).toBeGreaterThan(0);
    expect(getActivitySummary).toHaveBeenCalledWith("today");

    await user.click(screen.getByRole("button", { name: "近 7 天" }));
    await waitFor(() => expect(getActivitySummary).toHaveBeenCalledWith("sevenDays"));
  });

  it("ActivityWatch 不可用時提供不影響其他功能的正常狀態", async () => {
    getActivitySummary.mockResolvedValue({
      ...connectedSummary,
      connection: { status: "unavailable", message: "無法連線 ActivityWatch。請確認 ActivityWatch 正在本機執行。", serverVersion: null },
      activeTotalSeconds: 0,
      apps: [],
      websites: [],
      timeline: [],
    });

    render(<ActivityWorkspace />);

    expect(await screen.findByRole("heading", { name: "ActivityWatch 目前無法使用" })).toBeInTheDocument();
    expect(screen.getByText(/其他功能不受影響/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試一次" })).toBeEnabled();
  });
});
