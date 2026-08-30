import type { ReactNode } from "react";
import { ActivityWorkspace } from "../components/ActivityWorkspace";
import { CalendarWorkspace } from "../features/calendar/CalendarWorkspace";

export interface SystemWorkspaceDefinition {
  id: string;
  title: string;
  icon: ReactNode;
  sidebarClassName?: string;
  searchKeywords?: readonly string[];
  render: () => ReactNode;
}

const systemWorkspaces: readonly SystemWorkspaceDefinition[] = [
  {
    id: "activity",
    title: "活動",
    icon: "◷",
    sidebarClassName: "activity-sidebar-button",
    searchKeywords: ["activity", "ActivityWatch", "活動"],
    render: () => <ActivityWorkspace />,
  },
  {
    id: "calendar",
    title: "行事曆",
    icon: "▦",
    searchKeywords: ["calendar", "ics", "行事曆", "日曆"],
    render: () => <CalendarWorkspace />,
  },
];

export function getSystemWorkspaces(): readonly SystemWorkspaceDefinition[] {
  return systemWorkspaces;
}

export function getSystemWorkspace(id: string): SystemWorkspaceDefinition | undefined {
  return systemWorkspaces.find((workspace) => workspace.id === id);
}
