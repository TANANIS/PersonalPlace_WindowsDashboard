export interface SystemWorkspaceDefinition {
  id: "today" | "todo" | "calendar" | "activity";
  title: string;
  icon: string;
  sidebarClassName?: string;
  searchKeywords?: readonly string[];
  navigationGroup: "core" | "support";
  navigationOrder: number;
}

const systemWorkspaces: readonly SystemWorkspaceDefinition[] = [
  {
    id: "today",
    title: "今天",
    icon: "☀",
    searchKeywords: ["today", "今天"],
    navigationGroup: "core",
    navigationOrder: 1,
  },
  {
    id: "todo",
    title: "待辦",
    icon: "✓",
    searchKeywords: ["todo", "待辦", "清單"],
    navigationGroup: "core",
    navigationOrder: 2,
  },
  {
    id: "calendar",
    title: "行事曆",
    icon: "▦",
    searchKeywords: ["calendar", "ics", "行事曆", "日曆"],
    navigationGroup: "support",
    navigationOrder: 3,
  },
  {
    id: "activity",
    title: "活動",
    icon: "◷",
    searchKeywords: ["activity", "ActivityWatch", "活動"],
    navigationGroup: "support",
    navigationOrder: 4,
  },
];

export function getSystemWorkspaces(): readonly SystemWorkspaceDefinition[] {
  return systemWorkspaces;
}

export function getSystemWorkspace(id: string): SystemWorkspaceDefinition | undefined {
  return systemWorkspaces.find((workspace) => workspace.id === id);
}
