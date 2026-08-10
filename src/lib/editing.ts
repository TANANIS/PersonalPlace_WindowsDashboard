export interface SelectionChange {
  selected: Set<string>;
  anchorId: string | null;
}

export interface SelectionModifiers {
  toggle: boolean;
  range: boolean;
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
