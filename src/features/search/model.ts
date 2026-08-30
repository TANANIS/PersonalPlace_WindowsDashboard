import type { DashboardSearchResult } from "../../lib/platform";
import type { DashboardCard, DashboardState } from "../../types";

function includesQuery(value: string, query: string): boolean {
  return value.toLocaleLowerCase("zh-TW").includes(query);
}

export function filterDashboardCards(
  topLevelCards: DashboardCard[],
  pageCards: DashboardCard[],
  query: string,
): DashboardCard[] {
  const normalized = query.trim().toLocaleLowerCase("zh-TW");
  if (!normalized) return topLevelCards;
  return topLevelCards.filter((card) => {
    const directMatch = includesQuery(card.title, normalized)
      || includesQuery(card.subtitle, normalized)
      || includesQuery(card.noteText, normalized)
      || includesQuery(card.resumeNote, normalized);
    if (directMatch || card.cardType !== "group") return directMatch;
    return pageCards.some((child) => child.parentGroupId === card.id
      && (includesQuery(child.title, normalized)
        || includesQuery(child.subtitle, normalized)
        || includesQuery(child.noteText, normalized)));
  });
}

export function searchDashboardInMemory(
  state: DashboardState,
  value: string,
): DashboardSearchResult[] {
  const needle = value.trim().toLocaleLowerCase("zh-TW");
  if (!needle) return [];
  const pageById = new Map(state.pages.map((page) => [page.id, page]));
  const cardById = new Map(state.cards.map((card) => [card.id, card]));
  const results: DashboardSearchResult[] = [];
  for (const page of state.pages) {
    if (includesQuery(page.name, needle)) {
      results.push({
        id: page.id,
        resultType: "page",
        title: page.name,
        subtitle: "頁面",
        pageId: page.id,
        pageName: page.name,
        score: page.name.toLocaleLowerCase("zh-TW") === needle ? 0 : 2,
      });
    }
  }
  for (const card of state.cards) {
    const page = pageById.get(card.pageId);
    if (!page) continue;
    const group = card.parentGroupId ? cardById.get(card.parentGroupId) : undefined;
    const title = card.title.toLocaleLowerCase("zh-TW");
    const groupMatches = Boolean(group && includesQuery(group.title, needle));
    const matches = title.includes(needle)
      || includesQuery(card.subtitle, needle)
      || includesQuery(card.noteText, needle)
      || includesQuery(card.resumeNote, needle)
      || groupMatches;
    if (!matches) continue;
    results.push({
      id: card.id,
      resultType: card.cardType,
      title: card.title,
      subtitle: card.subtitle,
      pageId: page.id,
      pageName: page.name,
      groupId: group?.id,
      groupName: group?.title,
      cardType: card.cardType,
      score: title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : groupMatches ? 3 : 4,
    });
  }
  return results.sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, "zh-TW"));
}
