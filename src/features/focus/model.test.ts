import { describe, expect, it } from "vitest";
import type { FocusState } from "../../platform/focus";
import { resolveFocusContext } from "./model";

const state = (overrides: Partial<FocusState> = {}): FocusState => ({
  status: "paused", phase: "focus", cycleCount: 1, startedAt: 1, endsAt: null, remainingSeconds: 100,
  linkedTodoId: null, linkedGroupId: null, updatedAt: 1,
  settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true },
  ...overrides,
});

describe("resolveFocusContext", () => {
  it("resolves Todo list and parent context", () => {
    const context = resolveFocusContext(state({ linkedTodoId: "child" }), [
      { id: "child", listId: "list", parentId: "parent", seriesId: null, title: "子任務", notes: "", status: "active", priority: "medium", dueAt: null, plannedFor: null, position: 1, recurrenceKind: "none", recurrenceInterval: 1, reminderOffsetMinutes: null, reminderState: "none", createdAt: 1, updatedAt: 1, completedAt: null, deletedAt: null },
      { id: "parent", listId: "list", parentId: null, seriesId: null, title: "父任務", notes: "", status: "active", priority: "medium", dueAt: null, plannedFor: null, position: 0, recurrenceKind: "none", recurrenceInterval: 1, reminderOffsetMinutes: null, reminderState: "none", createdAt: 1, updatedAt: 1, completedAt: null, deletedAt: null },
    ], [], [{ id: "list", title: "工作", position: 0, createdAt: 1, updatedAt: 1, archivedAt: null }]);
    expect(context).toMatchObject({ kind: "todo", title: "子任務", detail: "工作 · 父任務" });
  });

  it("falls back to a clear free-focus label for missing links", () => {
    expect(resolveFocusContext(state({ linkedGroupId: "missing" }), [], [])).toMatchObject({ kind: "free", title: "未連結的專注" });
    expect(resolveFocusContext(state(), [], [])).toMatchObject({ kind: "free", title: "自由專注" });
  });
});
