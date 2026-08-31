import { useCallback, useEffect, useRef, useState } from "react";
import { getFocusState, pauseFocus, resumeFocus, startFocus, stopFocus, type FocusState } from "../../platform/focus";
import { platformErrorMessage } from "../../platform/system";

export type StartFocusRequest = Parameters<typeof startFocus>[0];
export interface FocusCompletionSnapshot { previousState: FocusState; outcome: "completed" | "stopped" | "skipped"; }
export interface FocusController {
  state: FocusState | null;
  ready: boolean;
  busy: boolean;
  error: string | null;
  completion: FocusCompletionSnapshot | null;
  refresh: () => Promise<FocusState | null>;
  start: (request: StartFocusRequest) => Promise<FocusState>;
  pause: () => Promise<FocusState>;
  resume: () => Promise<FocusState>;
  stop: (outcome: "stopped" | "skipped") => Promise<FocusState>;
  clearCompletion: () => void;
}

export function useFocusController(): FocusController {
  const [state, setState] = useState<FocusState | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completion, setCompletion] = useState<FocusCompletionSnapshot | null>(null);
  const previousRef = useRef<FocusState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await getFocusState();
      const previous = previousRef.current;
      if (previous && previous.status === "running" && next.status === "idle" && previous.endsAt != null && previous.endsAt <= Math.floor(Date.now() / 1000)) {
        setCompletion({ previousState: previous, outcome: "completed" });
      }
      previousRef.current = next;
      setState(next);
      setError(null);
      return next;
    } catch (reason) {
      setError(platformErrorMessage(reason, "無法讀取 Focus 狀態。"));
      return null;
    } finally { setReady(true); }
  }, []);

  useEffect(() => { void refresh(); const timer = window.setInterval(() => void refresh(), 1_000); return () => window.clearInterval(timer); }, [refresh]);

  const operate = useCallback(async (operation: () => Promise<FocusState>, outcome?: "stopped" | "skipped") => {
    if (busy) throw new Error("Focus 操作進行中");
    setBusy(true); setError(null);
    const previous = state;
    try {
      const next = await operation();
      previousRef.current = next;
      setState(next);
      if (outcome && previous && previous.status !== "idle") setCompletion({ previousState: previous, outcome });
      return next;
    } catch (reason) {
      const message = platformErrorMessage(reason, "Focus 操作失敗，請稍後再試。");
      setError(message); throw reason;
    } finally { setBusy(false); }
  }, [busy, state]);
  const startAction = useCallback((request: StartFocusRequest) => operate(() => startFocus(request)), [operate]);
  const pauseAction = useCallback(() => operate(pauseFocus), [operate]);
  const resumeAction = useCallback(() => operate(resumeFocus), [operate]);
  const stopAction = useCallback((outcome: "stopped" | "skipped") => operate(() => stopFocus(outcome), outcome), [operate]);
  const clearCompletion = useCallback(() => setCompletion(null), []);
  return { state, ready, busy, error, completion, refresh, start: startAction, pause: pauseAction, resume: resumeAction, stop: stopAction, clearCompletion };
}
