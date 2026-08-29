import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActivitySummary } from "../lib/platform";
import { ActivityWorkspace } from "./ActivityWorkspace";

const { getActivitySummary, getActivityTimeline, getActivityDetail } = vi.hoisted(() => ({ getActivitySummary: vi.fn(), getActivityTimeline: vi.fn(), getActivityDetail: vi.fn() }));

vi.mock("../lib/platform", async () => {
  const actual = await vi.importActual<typeof import("../lib/platform")>("../lib/platform");
  return { ...actual, getActivitySummary, getActivityTimeline, getActivityDetail };
});

const connectedSummary: ActivitySummary = {
  connection: { status: "connected", message: "ActivityWatch 已連線", serverVersion: "v0.13.2" },
  period: "today",
  rangeStart: "2026-08-28T00:00:00+08:00",
  rangeEnd: "2026-08-28T15:00:00+08:00",
  activeTotalSeconds: 7_500,
  apps: [{ key: "Visual Studio Code", label: "Visual Studio Code", seconds: 3_600 }],
  websites: [{ key: "github.com", label: "github.com", seconds: 1_800 }],
};

describe("ActivityWorkspace", () => {
  beforeEach(() => {
    getActivitySummary.mockReset();
    getActivityTimeline.mockReset();
    getActivityDetail.mockReset();
    getActivitySummary.mockResolvedValue(connectedSummary);
    getActivityTimeline.mockResolvedValue([
      { label: "Microsoft Edge", context: "github.com · Repository", startedAt: "2026-08-28T14:00:00+08:00", endedAt: "2026-08-28T14:05:00+08:00", durationSeconds: 300 },
      { label: "Discord", context: null, startedAt: "2026-08-28T13:50:00+08:00", endedAt: "2026-08-28T13:50:20+08:00", durationSeconds: 20 },
    ]);
    getActivityDetail.mockResolvedValue({
      kind: "website",
      label: "github.com",
      period: "today",
      totalSeconds: 300,
      items: [{ title: "Repository", url: "https://github.com/TANANIS/PersonalPlace_WindowsDashboard", startedAt: "2026-08-28T14:00:00+08:00", endedAt: "2026-08-28T14:05:00+08:00", durationSeconds: 300 }],
    });
  });

  it("顯示 Personal Place DTO 整理後的活動摘要並切換期間", async () => {
    const user = userEvent.setup();
    render(<ActivityWorkspace />);

    expect(await screen.findByText("2 小時 5 分")).toBeInTheDocument();
    expect(screen.getByText("Visual Studio Code")).toBeInTheDocument();
    expect(screen.getAllByText("github.com").length).toBeGreaterThan(0);
    expect(screen.getByText("不到 1 分")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "今日時間軸" })).toBeInTheDocument();
    expect(screen.getByText("Microsoft Edge")).toBeInTheDocument();
    expect(screen.getByText(/瀏覽器正在播放聲音的時段仍會計入/)).toBeInTheDocument();
    expect(getActivitySummary).toHaveBeenCalledWith("today");
    expect(getActivityTimeline).toHaveBeenCalledTimes(1);

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
    });

    render(<ActivityWorkspace />);

    expect(await screen.findByRole("heading", { name: "ActivityWatch 目前無法使用" })).toBeInTheDocument();
    expect(screen.getByText(/其他功能不受影響/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "再試一次" })).toBeEnabled();
  });

  it("點擊排行後才載入 drill-down DTO，並可返回排行", async () => {
    const user = userEvent.setup();
    render(<ActivityWorkspace />);

    await user.click(await screen.findByRole("button", { name: "查看 github.com 詳細活動" }));
    expect(getActivityDetail).toHaveBeenCalledWith("today", "website", "github.com");
    expect(await screen.findByRole("heading", { name: "github.com" })).toBeInTheDocument();
    expect(screen.getByText("Repository")).toBeInTheDocument();
    expect(screen.getByText(/https:\/\/github.com/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "← 返回排行" }));
    expect(screen.getByRole("heading", { name: "Website domain 使用排行" })).toBeInTheDocument();
  });
});
