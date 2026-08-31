import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { FocusState } from "../platform/focus";
import { commitStartupRoute, resolveStartupRoute, useStartupRouteGate } from "./startupRouting";
import { StartupErrorScreen } from "./StartupErrorScreen";

const focus = (status: FocusState["status"]): FocusState => ({ status, phase: "focus", cycleCount: 0, startedAt: null, endsAt: null, remainingSeconds: null, linkedTodoId: null, linkedGroupId: null, updatedAt: 1, settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true } });

describe("startup routing", () => {
  it("opens Today without active Focus", () => { expect(resolveStartupRoute(focus("idle"))).toBe("today"); expect(resolveStartupRoute(null)).toBe("today"); });
  it("opens FocusMode only for running or paused Focus", () => { expect(resolveStartupRoute(focus("running"))).toBe("focusMode"); expect(resolveStartupRoute(focus("paused"))).toBe("focusMode"); });
  it("commits the startup route once", () => {
    const first = commitStartupRoute({ resolved: false, route: null }, focus("running"));
    expect(first).toEqual({ resolved: true, route: "focusMode" });
    expect(commitStartupRoute(first, focus("running"))).toEqual(first);
  });
  it("routes an initialized idle workspace to Today", () => {
    const onResolve = vi.fn();
    renderHook(() => useStartupRouteGate({ enabled: true, focusReady: true, focusState: focus("idle"), initialResolved: false, resetKey: 0, onResolve }));
    expect(onResolve).toHaveBeenCalledWith("today");
  });
  it("routes initialized running and paused workspaces to FocusMode", () => {
    for (const status of ["running", "paused"] as const) {
      const onResolve = vi.fn();
      renderHook(() => useStartupRouteGate({ enabled: true, focusReady: true, focusState: focus(status), initialResolved: false, resetKey: 0, onResolve }));
      expect(onResolve).toHaveBeenCalledWith("focusMode");
    }
  });
  it("does not let later polling hijack a route after manual leave", () => {
    const onResolve = vi.fn();
    let current = focus("running");
    const { rerender } = renderHook(() => useStartupRouteGate({ enabled: true, focusReady: true, focusState: current, initialResolved: false, resetKey: 0, onResolve }));
    expect(onResolve).toHaveBeenCalledTimes(1);
    act(() => { current = focus("running"); rerender(); });
    expect(onResolve).toHaveBeenCalledTimes(1);
  });
  it("keeps Recovery and generic startup errors outside normal routing", () => {
    const recoveryResolve = vi.fn();
    const { result } = renderHook(() => useStartupRouteGate({ enabled: false, focusReady: true, focusState: focus("running"), initialResolved: false, resetKey: 0, onResolve: recoveryResolve }));
    expect(result.current).toBe(false);
    expect(recoveryResolve).not.toHaveBeenCalled();
  });
  it("shows a retryable generic startup error instead of a permanent loading surface", async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(createElement(StartupErrorScreen, { message: "初始化失敗", onRetry }));
    expect(screen.getByRole("alert")).toHaveTextContent("Personal Place 無法開啟本機資料");
    expect(screen.getByRole("alert")).toHaveTextContent("初始化失敗");
    await user.click(screen.getByRole("button", { name: "重試" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
