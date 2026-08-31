import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { FocusState } from "../platform/focus";
import type { FocusController } from "../features/focus/useFocusController";
import { FocusDialog } from "./FocusDialog";

const updateFocusSettings = vi.hoisted(() => vi.fn());
vi.mock("../lib/platform", () => ({ getFocusSessions: vi.fn(async () => []), updateFocusSettings, getFocusState: vi.fn(), pauseFocus: vi.fn(), resumeFocus: vi.fn(), startFocus: vi.fn(), stopFocus: vi.fn(), platformErrorMessage: (_reason: unknown, fallback: string) => fallback }));

const current: FocusState = { status: "idle", phase: "focus", cycleCount: 0, startedAt: null, endsAt: null, remainingSeconds: null, linkedTodoId: null, linkedGroupId: null, updatedAt: 1, settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true } };
const fakeController = (): FocusController => ({ state: current, ready: true, busy: false, error: null, completion: null, refresh: vi.fn(async () => current), start: vi.fn(async () => current), pause: vi.fn(async () => current), resume: vi.fn(async () => current), stop: vi.fn(async () => current), clearCompletion: vi.fn() });

describe("FocusDialog controlled settings", () => {
  it("commits the settings draft and refreshes the canonical controller", async () => { updateFocusSettings.mockResolvedValue({ ...current, settings: { ...current.settings, focusMinutes: 40 } }); const controller = fakeController(); render(<FocusDialog embedded controller={controller} onClose={vi.fn()} onChanged={vi.fn()} />); fireEvent.click(screen.getByText("計時設定")); const input = screen.getByLabelText("專注分鐘"); fireEvent.change(input, { target: { value: "40" } }); fireEvent.blur(input); await waitFor(() => expect(updateFocusSettings).toHaveBeenCalledWith(expect.objectContaining({ focusMinutes: 40 }))); expect(controller.refresh).toHaveBeenCalled(); });
});
