export interface SelectionChange {
  selected: Set<string>;
  anchorId: string | null;
}

export interface SelectionModifiers {
  toggle: boolean;
  range: boolean;
}

export type CardReorderKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

interface PositionedCard {
  id: string;
  pageId: string;
  parentGroupId: string | null;
  cardType: string;
  position: number;
}

interface DashboardLike<TCard extends PositionedCard, TPage> {
  pages: TPage[];
  cards: TCard[];
}

interface MoveCardsLike {
  cardIds: string[];
  destinationPageId: string;
  destinationGroupId: string | null;
  targetIndex: number;
}

export function moveDashboardCardsInMemory<TCard extends PositionedCard, TPage>(
  state: DashboardLike<TCard, TPage>,
  request: MoveCardsLike,
): DashboardLike<TCard, TPage> {
  const movingIds = new Set(request.cardIds);
  const moving = state.cards
    .filter((card) => movingIds.has(card.id))
    .sort((left, right) => left.position - right.position);
  if (moving.length === 0) return state;

  const sourceContainers = new Set(moving.map((card) => `${card.pageId}\u0000${card.parentGroupId ?? ""}`));
  const destinationKey = `${request.destinationPageId}\u0000${request.destinationGroupId ?? ""}`;
  const nextCards = state.cards.map((card) => {
    if (movingIds.has(card.id)) {
      return { ...card, pageId: request.destinationPageId, parentGroupId: request.destinationGroupId };
    }
    if (moving.some((candidate) => candidate.cardType === "group" && candidate.id === card.parentGroupId)) {
      return { ...card, pageId: request.destinationPageId };
    }
    return { ...card };
  });

  const affected = new Set([...sourceContainers, destinationKey]);
  for (const key of affected) {
    const [pageId, parentGroupIdValue] = key.split("\u0000");
    const parentGroupId = parentGroupIdValue || null;
    const container = nextCards
      .filter((card) => card.pageId === pageId && card.parentGroupId === parentGroupId)
      .sort((left, right) => left.position - right.position);
    const ordered = key === destinationKey
      ? (() => {
          const withoutMoving = container.filter((card) => !movingIds.has(card.id));
          const inserted = moving.map((card) => nextCards.find((candidate) => candidate.id === card.id)!).filter(Boolean);
          const targetIndex = Math.max(0, Math.min(request.targetIndex, withoutMoving.length));
          return [...withoutMoving.slice(0, targetIndex), ...inserted, ...withoutMoving.slice(targetIndex)];
        })()
      : container;
    ordered.forEach((card, position) => {
      const stored = nextCards.find((candidate) => candidate.id === card.id);
      if (stored) stored.position = position;
    });
  }

  return { pages: state.pages, cards: nextCards };
}

export function keyboardReorderTarget(
  currentIndex: number,
  itemCount: number,
  key: string,
): number | null {
  if (currentIndex < 0 || itemCount < 1) return null;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return null;
  const delta = key === "ArrowLeft" || key === "ArrowUp" ? -1 : 1;
  const targetIndex = Math.max(0, Math.min(itemCount - 1, currentIndex + delta));
  return targetIndex === currentIndex ? null : targetIndex;
}

export function changeSelection(
  current: ReadonlySet<string>,
  clickedId: string,
  orderedIds: readonly string[],
  anchorId: string | null,
  modifiers: SelectionModifiers,
): SelectionChange {
  if (modifiers.range && anchorId) {
    const from = orderedIds.indexOf(anchorId);
    const to = orderedIds.indexOf(clickedId);
    if (from >= 0 && to >= 0) {
      const range = orderedIds.slice(Math.min(from, to), Math.max(from, to) + 1);
      return {
        selected: modifiers.toggle ? new Set([...current, ...range]) : new Set(range),
        anchorId,
      };
    }
  }

  if (modifiers.toggle) {
    const selected = new Set(current);
    if (selected.has(clickedId)) selected.delete(clickedId);
    else selected.add(clickedId);
    return { selected, anchorId: clickedId };
  }

  return { selected: new Set([clickedId]), anchorId: clickedId };
}
