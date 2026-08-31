import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FocusState } from "../../platform/focus";
import { useFocusController } from "./useFocusController";

const mocks = vi.hoisted(() => ({ get: vi.fn(), start: vi.fn(), pause: vi.fn(), resume: vi.fn(), stop: vi.fn() }));
vi.mock("../../platform/focus", () => ({ getFocusState: mocks.get, startFocus: mocks.start, pauseFocus: mocks.pause, resumeFocus: mocks.resume, stopFocus: mocks.stop }));
vi.mock("../../platform/system", () => ({ platformErrorMessage: (_reason: unknown, fallback: string) => fallback }));

const makeState = (overrides: Partial<FocusState> = {}): FocusState => ({ status: "idle", phase: "focus", cycleCount: 0, startedAt: null, endsAt: null, remainingSeconds: null, linkedTodoId: null, linkedGroupId: null, updatedAt: 1, settings: { focusMinutes: 25, shortBreakMinutes: 5, longBreakMinutes: 15, longBreakInterval: 4, autoStartFocus: false, autoStartBreak: false, notificationsEnabled: true }, ...overrides });

function Harness() {
  const controller = useFocusController();
  return <div><output data-testid="status">{controller.state?.status ?? "none"}</output><output data-testid="ready">{String(controller.ready)}</output><button onClick={() => void controller.start({ phase: "focus", linkedTodoId: "todo", linkedGroupId: null })}>start</button><button onClick={() => void controller.pause()}>pause</button><button onClick={() => void controller.resume()}>resume</button><button onClick={() => void controller.stop("stopped")}>stop</button><button onClick={() => void controller.refresh()}>refresh</button><output data-testid="completion">{controller.completion?.outcome ?? "none"}</output></div>;
}

describe("useFocusController", () => {
  let backend: FocusState;
  beforeEach(() => { vi.clearAllMocks(); backend = makeState(); mocks.get.mockImplementation(async () => backend); mocks.start.mockImplementation(async (request: Partial<FocusState>) => { backend = makeState({ status: "running", phase: request.phase ?? "focus", linkedTodoId: request.linkedTodoId ?? null, linkedGroupId: request.linkedGroupId ?? null, startedAt: 100, endsAt: 200 }); return backend; }); mocks.pause.mockImplementation(async () => { backend = makeState({ ...backend, status: "paused", remainingSeconds: 100, endsAt: null }); return backend; }); mocks.resume.mockImplementation(async () => { backend = makeState({ ...backend, status: "running", endsAt: 200, remainingSeconds: null }); return backend; }); mocks.stop.mockImplementation(async () => { backend = makeState(); return backend; }); });

  it("refreshes initially and owns start pause resume stop transitions", async () => {
    const user = userEvent.setup(); render(<Harness />);
    await waitFor(() => expect(screen.getByTestId("ready")).toHaveTextContent("true"));
    await user.click(screen.getByRole("button", { name: "start" })); await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("running")); expect(mocks.start).toHaveBeenCalledWith({ phase: "focus", linkedTodoId: "todo", linkedGroupId: null });
    await user.click(screen.getByRole("button", { name: "pause" })); await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("paused"));
    await user.click(screen.getByRole("button", { name: "resume" })); await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("running"));
    await user.click(screen.getByRole("button", { name: "stop" })); await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("idle")); expect(screen.getByTestId("completion")).toHaveTextContent("stopped");
  });

  it("records completion when a running state expires", async () => {
    backend = makeState({ status: "running", linkedTodoId: "todo", startedAt: 1, endsAt: Math.floor(Date.now() / 1000) - 1 });
    const user = userEvent.setup(); render(<Harness />); await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("running")); backend = makeState(); await act(async () => { await user.click(screen.getByRole("button", { name: "refresh" })); }); await waitFor(() => expect(screen.getByTestId("completion")).toHaveTextContent("completed"));
  });
});
