import type { FocusState } from "../platform/focus";

export type StartupRoute = "today" | "focusMode";

export function resolveStartupRoute(focus: FocusState | null): StartupRoute {
  return focus?.status === "running" || focus?.status === "paused" ? "focusMode" : "today";
}
