import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { FocusState } from "../../platform/focus";
import type { DashboardCard } from "../../types";
import type { FocusController } from "./useFocusController";
import { FocusMode } from "./FocusMode";

const state = (overrides: Partial<FocusState> = {}): FocusState => ({ status: "running", phase: "focus", cycleCount: 1, startedAt: 1, endsAt: 200, remainingSeconds: null, linkedTodoId: null, linkedGroupId: null, updatedAt: 1, settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true }, ...overrides });
const controller = (current: FocusState, completion: FocusController["completion"] = null): FocusController => ({ state: current, ready: true, busy: false, error: null, completion, refresh: vi.fn(), start: vi.fn(async () => current), pause: vi.fn(async () => current), resume: vi.fn(async () => current), stop: vi.fn(async () => ({ ...current, status: "idle" as const })), clearCompletion: vi.fn() });
const place: DashboardCard = { id: "place", pageId: "home", parentGroupId: null, cardType: "group", targetId: null, title: "Unity 學習", subtitle: "", kind: "group", symbol: "", tone: "cyan", size: "wide", position: 0, noteText: "", resumeNote: "接著做 Project Ready", launchEnabled: false, lastOpenedAt: null, widgetKind: null, widgetResourceId: null };

describe("FocusMode", () => {
  it("leaves without pausing or stopping", async () => {
    const focus = controller(state()); const onLeave = vi.fn(); render(<FocusMode controller={focus} todos={[]} cards={[]} onLeave={onLeave} />); await userEvent.setup().click(screen.getByRole("button", { name: /暫時離開/ })); expect(onLeave).toHaveBeenCalled(); expect(focus.pause).not.toHaveBeenCalled(); expect(focus.stop).not.toHaveBeenCalled();
  });

  it("shows running and paused primary controls", () => {
    const focus = controller(state()); const { rerender } = render(<FocusMode controller={focus} todos={[]} cards={[]} onLeave={vi.fn()} />); expect(screen.getByRole("button", { name: "暫停" })).toBeInTheDocument(); focus.state = state({ status: "paused", endsAt: null, remainingSeconds: 100 }); rerender(<FocusMode controller={focus} todos={[]} cards={[]} onLeave={vi.fn()} />); expect(screen.getByRole("button", { name: "繼續" })).toBeInTheDocument();
  });

  it("renders completion and linked Todo / Place context", () => {
    const completed = controller(makeStateIdle(), { previousState: state({ linkedTodoId: "todo" }), outcome: "completed" }); render(<FocusMode controller={completed} todos={[{ id: "todo", listId: "list", parentId: null, seriesId: null, title: "完成驗收", notes: "", status: "active", priority: "high", dueAt: null, plannedFor: null, position: 0, recurrenceKind: "none", recurrenceInterval: 1, reminderOffsetMinutes: null, reminderState: "none", createdAt: 1, updatedAt: 1, completedAt: null, deletedAt: null }]} cards={[place]} onLeave={vi.fn()} />); expect(screen.getByRole("heading", { name: "這一段結束了" })).toBeInTheDocument(); expect(screen.getByRole("button", { name: "休息一下" })).toBeInTheDocument();
    const activePlace = controller(state({ linkedGroupId: "place" })); render(<FocusMode controller={activePlace} todos={[]} cards={[place]} onLeave={vi.fn()} />); expect(screen.getByRole("heading", { name: "Unity 學習" })).toBeInTheDocument();
  });
});

function makeStateIdle(): FocusState { return state({ status: "idle", endsAt: null, remainingSeconds: null }); }
