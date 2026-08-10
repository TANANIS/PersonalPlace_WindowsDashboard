import type { WorkspaceState } from "../types";

const STORAGE_KEY = "personal-workspace.state.v1";

export function loadLegacyState(): WorkspaceState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<WorkspaceState>;
    if (!Array.isArray(parsed.workspaces) || !Array.isArray(parsed.items)) {
      return null;
    }

    return parsed as WorkspaceState;
  } catch {
    return null;
  }
}

export function saveBrowserState(state: WorkspaceState): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}
