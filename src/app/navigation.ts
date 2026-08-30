export interface ViewOrigin {
  pageId: string;
  query: string;
  searchScope: "page" | "all";
  scrollY: number;
  editing: boolean;
  placeId?: string;
  placeScrollY?: number;
}

export type ToolKind = "todo" | "focus" | "usage";

export type AppView =
  | { kind: "dashboard"; pageId: string }
  | { kind: "systemWorkspace"; workspaceId: string }
  | { kind: "place"; groupId: string; origin: ViewOrigin }
  | { kind: "tool"; widgetId: string; tool: ToolKind; origin: ViewOrigin }
  | { kind: "note"; cardId: string; origin: ViewOrigin; startEditing?: boolean };

export type RootAppView = Extract<AppView, { kind: "dashboard" | "systemWorkspace" }>;

export type OverlayState =
  | null
  | { kind: "add"; pageId: string; groupId?: string }
  | { kind: "settings" }
  | { kind: "guide" }
  | { kind: "pages" }
  | { kind: "cardInspector"; cardId: string }
  | { kind: "repair"; cardId: string }
  | { kind: "backup" };

export function dashboardView(pageId: string): AppView {
  return { kind: "dashboard", pageId };
}

export function systemWorkspaceView(workspaceId: string): AppView {
  return { kind: "systemWorkspace", workspaceId };
}

export function isRootView(view: AppView): view is RootAppView {
  return view.kind === "dashboard" || view.kind === "systemWorkspace";
}
