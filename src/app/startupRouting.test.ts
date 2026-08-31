import { describe, expect, it } from "vitest";
import type { FocusState } from "../platform/focus";
import { resolveStartupRoute } from "./startupRouting";

const focus = (status: FocusState["status"]): FocusState => ({ status, phase: "focus", cycleCount: 0, startedAt: null, endsAt: null, remainingSeconds: null, linkedTodoId: null, linkedGroupId: null, updatedAt: 1, settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true } });

describe("startup routing", () => {
  it("opens Today without active Focus", () => { expect(resolveStartupRoute(focus("idle"))).toBe("today"); expect(resolveStartupRoute(null)).toBe("today"); });
  it("opens FocusMode only for running or paused Focus", () => { expect(resolveStartupRoute(focus("running"))).toBe("focusMode"); expect(resolveStartupRoute(focus("paused"))).toBe("focusMode"); });
});
