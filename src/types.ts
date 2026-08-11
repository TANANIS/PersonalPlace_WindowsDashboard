export type ItemKind = "app" | "web" | "local";
export type ItemSize = "square" | "wide";
export type ItemTone = "cyan" | "violet" | "amber" | "rose" | "slate";

export interface Workspace {
  id: string;
  name: string;
  symbol: string;
}

export interface LauncherItem {
  id: string;
  workspaceId: string;
  title: string;
  subtitle: string;
  kind: ItemKind;
  target: string;
  symbol: string;
  tone: ItemTone;
  size: ItemSize;
}

export interface WorkspaceState {
  workspaces: Workspace[];
  items: LauncherItem[];
}

export type CardType = "target" | "group" | "note" | "widget";
export type WidgetKind = "todo" | "focus" | "usage";

export interface Page {
  id: string;
  name: string;
  symbol: string;
}

export interface DashboardCard {
  id: string;
  pageId: string;
  parentGroupId: string | null;
  cardType: CardType;
  targetId: string | null;
  title: string;
  subtitle: string;
  kind: ItemKind | "group" | "note";
  symbol: string;
  tone: ItemTone;
  size: ItemSize;
  position: number;
  noteText: string;
  resumeNote: string;
  launchEnabled: boolean;
  lastOpenedAt: string | null;
  widgetKind?: WidgetKind | null;
  widgetResourceId?: string | null;
}

export interface DashboardState {
  pages: Page[];
  cards: DashboardCard[];
}
