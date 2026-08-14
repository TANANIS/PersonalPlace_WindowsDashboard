import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

type CommitReorder = (sourceId: string, targetId: string, draggedIds: string[]) => void;

interface PointerReorderOptions {
  getDragIds?: (sourceId: string) => string[];
  activationDistance?: number;
}

interface DragPreview {
  element: HTMLElement;
  offsetX: number;
  offsetY: number;
}

interface PendingDrag {
  itemId: string;
  pointerId: number;
  startX: number;
  startY: number;
  source: HTMLElement;
}

const INTERACTIVE_SELECTOR = "button, input, select, textarea, a, [contenteditable='true'], [data-no-card-drag]";

export function usePointerReorder(
  dataAttribute: `data-${string}`,
  onCommit: CommitReorder,
  disabled = false,
  options: PointerReorderOptions = {},
) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draggedIds, setDraggedIds] = useState<string[]>([]);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const draggedRef = useRef<string | null>(null);
  const dragOverRef = useRef<string | null>(null);
  const pointerIdRef = useRef<number | null>(null);
  const pendingRef = useRef<PendingDrag | null>(null);
  const draggedIdsRef = useRef<string[]>([]);
  const suppressClickRef = useRef(false);
  const previewRef = useRef<DragPreview | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const commitRef = useRef(onCommit);
  const getDragIdsRef = useRef(options.getDragIds);
  const activationDistanceRef = useRef(options.activationDistance ?? 6);

  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);

  useEffect(() => {
    getDragIdsRef.current = options.getDragIds;
    activationDistanceRef.current = options.activationDistance ?? 6;
  }, [options.activationDistance, options.getDragIds]);

  const removePreview = useCallback((animateTo?: DOMRect | null) => {
    const preview = previewRef.current;
    previewRef.current = null;
    if (!preview) return;
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    if (animateTo) {
      preview.element.classList.add("is-dropping");
      preview.element.style.setProperty("--drag-x", `${animateTo.left}px`);
      preview.element.style.setProperty("--drag-y", `${animateTo.top}px`);
      preview.element.style.setProperty("--drag-width", `${animateTo.width}px`);
      preview.element.style.setProperty("--drag-height", `${animateTo.height}px`);
      previewTimerRef.current = window.setTimeout(() => {
        preview.element.remove();
        previewTimerRef.current = null;
      }, 190);
      return;
    }
    preview.element.remove();
  }, []);

  const clear = useCallback((keepDroppingPreview = false) => {
    pendingRef.current = null;
    draggedRef.current = null;
    draggedIdsRef.current = [];
    dragOverRef.current = null;
    pointerIdRef.current = null;
    setDraggedId(null);
    setDraggedIds([]);
    setDragOverId(null);
    document.body.classList.remove("is-pointer-reordering");
    if (!keepDroppingPreview) removePreview();
  }, [removePreview]);

  useEffect(() => {
    if (disabled) clear();
    return () => clear();
  }, [clear, disabled]);

  const targetAt = useCallback((clientX: number, clientY: number) => {
    const element = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>(`[${dataAttribute}]`);
    return element?.getAttribute(dataAttribute) ?? null;
  }, [dataAttribute]);

  const beginDrag = useCallback((pending: PendingDrag, event: PointerEvent) => {
    pendingRef.current = null;
    draggedRef.current = pending.itemId;
    const nextDraggedIds = getDragIdsRef.current?.(pending.itemId) ?? [pending.itemId];
    draggedIdsRef.current = nextDraggedIds.length ? nextDraggedIds : [pending.itemId];
    dragOverRef.current = pending.itemId;
    pointerIdRef.current = pending.pointerId;
    setDraggedId(pending.itemId);
    setDraggedIds(draggedIdsRef.current);
    setDragOverId(pending.itemId);
    document.body.classList.add("is-pointer-reordering");

    const rect = pending.source.getBoundingClientRect();
    const preview = pending.source.cloneNode(true) as HTMLElement;
    preview.querySelectorAll<HTMLElement>("[id]").forEach((element) => element.removeAttribute("id"));
    preview.querySelectorAll<HTMLElement>("button, input, select, textarea, [tabindex]").forEach((element) => {
      element.setAttribute("tabindex", "-1");
    });
    preview.removeAttribute(dataAttribute);
    preview.classList.remove("is-dragging", "is-drag-over", "is-selected");
    preview.classList.add("pointer-drag-preview");
    preview.setAttribute("aria-hidden", "true");
    if (draggedIdsRef.current.length > 1) {
      const count = document.createElement("span");
      count.className = "pointer-drag-count";
      count.textContent = String(draggedIdsRef.current.length);
      preview.appendChild(count);
    }
    preview.style.setProperty("--drag-x", `${rect.left}px`);
    preview.style.setProperty("--drag-y", `${rect.top}px`);
    preview.style.setProperty("--drag-width", `${rect.width}px`);
    preview.style.setProperty("--drag-height", `${rect.height}px`);
    document.body.appendChild(preview);
    previewRef.current = {
      element: preview,
      offsetX: pending.startX - rect.left,
      offsetY: pending.startY - rect.top,
    };
    window.requestAnimationFrame(() => preview.classList.add("is-lifted"));
  }, [dataAttribute]);

  useEffect(() => {
    function handlePointerMove(event: PointerEvent) {
      const pending = pendingRef.current;
      if (pending && pending.pointerId === event.pointerId) {
        const distance = Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY);
        if (distance >= activationDistanceRef.current) beginDrag(pending, event);
      }
      if (pointerIdRef.current !== event.pointerId || !draggedRef.current) return;
      if (event.cancelable) event.preventDefault();
      const preview = previewRef.current;
      if (preview) {
        preview.element.style.setProperty("--drag-x", `${event.clientX - preview.offsetX}px`);
        preview.element.style.setProperty("--drag-y", `${event.clientY - preview.offsetY}px`);
      }
      const targetId = targetAt(event.clientX, event.clientY);
      if (!targetId || targetId === dragOverRef.current) return;
      dragOverRef.current = targetId;
      setDragOverId(targetId);
    }

    function handlePointerUp(event: PointerEvent) {
      const sourceId = draggedRef.current;
      if (pendingRef.current?.pointerId === event.pointerId && !sourceId) {
        pendingRef.current = null;
        return;
      }
      if (pointerIdRef.current !== event.pointerId || !sourceId) return;
      const targetId = targetAt(event.clientX, event.clientY) ?? dragOverRef.current;
      const targetElement = targetId
        ? [...document.querySelectorAll<HTMLElement>(`[${dataAttribute}]`)]
            .find((element) => element.getAttribute(dataAttribute) === targetId) ?? null
        : null;
      removePreview(targetElement?.getBoundingClientRect() ?? null);
      const committedIds = [...draggedIdsRef.current];
      suppressClickRef.current = true;
      clear(true);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
      if (targetId && targetId !== sourceId && !committedIds.includes(targetId)) {
        commitRef.current(sourceId, targetId, committedIds);
      }
    }

    window.addEventListener("pointermove", handlePointerMove, { passive: false });
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [beginDrag, clear, dataAttribute, removePreview, targetAt]);

  const bind = useCallback((itemId: string) => ({
    onPointerDown(event: ReactPointerEvent<HTMLElement>) {
      if (disabled || event.button !== 0) return;
      if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
      const source = event.currentTarget.closest<HTMLElement>(`[${dataAttribute}]`);
      if (!source) return;
      pendingRef.current = {
        itemId,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        source,
      };
    },
  }), [dataAttribute, disabled]);

  const shouldSuppressClick = useCallback(() => suppressClickRef.current, []);

  return { bind, draggedId, draggedIds, dragOverId, shouldSuppressClick };
}
