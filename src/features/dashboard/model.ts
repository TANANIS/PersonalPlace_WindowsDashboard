import type { DashboardCard, DashboardState, WorkspaceState } from "../../types";

export function dashboardFromLegacy(state: WorkspaceState): DashboardState {
  return {
    pages: state.workspaces.map((workspace) => ({ ...workspace })),
    cards: state.items.map((item, position) => ({
      id: item.id,
      pageId: item.workspaceId,
      parentGroupId: null,
      cardType: "target" as const,
      targetId: item.target,
      title: item.title,
      subtitle: item.subtitle,
      kind: item.kind,
      symbol: item.symbol,
      tone: item.tone,
      size: item.size,
      position,
      noteText: "",
      resumeNote: "",
      launchEnabled: false,
      lastOpenedAt: null,
    })),
  };
}

export function selectPageCards(state: DashboardState, pageId: string): DashboardCard[] {
  return state.cards.filter((card) => card.pageId === pageId);
}

export function selectTopLevelCards(cards: DashboardCard[]): DashboardCard[] {
  return cards
    .filter((card) => card.parentGroupId === null)
    .sort((left, right) => left.position - right.position);
}
