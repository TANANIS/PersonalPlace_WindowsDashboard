import { useEffect, useRef, useState } from "react";
import type { FocusState } from "../platform/focus";

export type StartupRoute = "today" | "focusMode";

export interface StartupRouteDecision {
  resolved: boolean;
  route: StartupRoute | null;
}

export function resolveStartupRoute(focus: FocusState | null): StartupRoute {
  return focus?.status === "running" || focus?.status === "paused" ? "focusMode" : "today";
}

export function commitStartupRoute(decision: StartupRouteDecision, focus: FocusState | null): StartupRouteDecision {
  if (decision.resolved) return decision;
  return { resolved: true, route: resolveStartupRoute(focus) };
}

export function useStartupRouteGate({ enabled, focusReady, focusState, initialResolved, resetKey, onResolve }: { enabled: boolean; focusReady: boolean; focusState: FocusState | null; initialResolved: boolean; resetKey: number; onResolve: (route: StartupRoute) => void }): boolean {
  const [resolved, setResolved] = useState(initialResolved);
  const decisionRef = useRef<StartupRouteDecision>({ resolved: initialResolved, route: initialResolved ? resolveStartupRoute(focusState) : null });

  useEffect(() => {
    decisionRef.current = { resolved: initialResolved, route: initialResolved ? resolveStartupRoute(focusState) : null };
    setResolved(initialResolved);
  }, [resetKey]);

  useEffect(() => {
    if (!enabled || !focusReady || decisionRef.current.resolved) return;
    const decision = commitStartupRoute(decisionRef.current, focusState);
    decisionRef.current = decision;
    setResolved(true);
    if (decision.route) onResolve(decision.route);
  }, [enabled, focusReady, focusState, onResolve]);

  return resolved;
}
