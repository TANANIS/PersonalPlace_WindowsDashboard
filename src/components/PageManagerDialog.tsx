import { useEffect, useState } from "react";
import type { Page } from "../types";
import { zhTW } from "../i18n/zh-TW";
import { useModalFocus } from "../lib/accessibility";
import { usePointerReorder } from "../lib/pointerReorder";
import { PageIcon, PAGE_SYMBOL_OPTIONS } from "./PageIcon";

interface PageManagerDialogProps {
  pages: Page[];
  busy: boolean;
  onClose: () => void;
  onCreate: () => void;
  onUpdate: (pageId: string, name: string, symbol: string) => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
  onReorder: (pageId: string, targetIndex: number) => void;
  onDelete: (page: Page) => void;
}

export function PageManagerDialog({
  pages,
  busy,
  onClose,
  onCreate,
  onUpdate,
  onMove,
  onReorder,
  onDelete,
}: PageManagerDialogProps) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; symbol: string }>>({});
  const dialogRef = useModalFocus<HTMLElement>(true, onClose);
  const pageReorder = usePointerReorder("data-page-reorder-id", (sourceId, targetId) => {
    const targetIndex = pages.findIndex((page) => page.id === targetId);
    if (targetIndex >= 0) onReorder(sourceId, targetIndex);
  }, busy);

  useEffect(() => {
    setDrafts(
      Object.fromEntries(pages.map((page) => [page.id, { name: page.name, symbol: page.symbol }])),
    );
  }, [pages]);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="dialog page-manager-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-manager-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">PAGES</p>
            <h2 id="page-manager-title">管理頁面</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="關閉">
            ×
          </button>
        </div>

        <div className="page-manager-list">
          {pages.map((page, index) => {
            const draft = drafts[page.id] ?? { name: page.name, symbol: page.symbol };
            const changed = draft.name !== page.name || draft.symbol !== page.symbol;
            return (
              <div
                className={`page-manager-row${pageReorder.draggedId === page.id ? " is-dragging" : ""}${pageReorder.dragOverId === page.id && pageReorder.draggedId !== page.id ? " is-drag-over" : ""}`}
                key={page.id}
                data-page-reorder-id={page.id}
              >
                <button
                  type="button"
                  className="page-drag-handle"
                  aria-label={`拖曳 ${page.name}`}
                  title="拖曳調整位置"
                  disabled={busy}
                  {...pageReorder.bind(page.id)}
                >⠿</button>
                <div className="page-symbol-field">
                  <PageIcon symbol={draft.symbol} pageName={draft.name} />
                  <select
                    aria-label={`${page.name}的符號`}
                    value={draft.symbol}
                    disabled={busy}
                    onChange={(event) =>
                      setDrafts((current) => ({
                        ...current,
                        [page.id]: { ...draft, symbol: event.target.value },
                      }))
                    }
                  >
                    {PAGE_SYMBOL_OPTIONS.map((option) => (
                      <option value={option.value} key={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
                <input
                  aria-label="頁面名稱"
                  value={draft.name}
                  maxLength={60}
                  disabled={busy}
                  onChange={(event) =>
                    setDrafts((current) => ({
                      ...current,
                      [page.id]: { ...draft, name: event.target.value },
                    }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && changed && draft.name.trim()) {
                      onUpdate(page.id, draft.name, draft.symbol);
                    }
                  }}
                />
                <button className="page-manager-icon-action" type="button" aria-label={zhTW.pages.save} title={zhTW.pages.save} disabled={busy || !changed || !draft.name.trim()} onClick={() => onUpdate(page.id, draft.name, draft.symbol)}>
                  ✓
                </button>
                <button className="page-manager-icon-action" type="button" aria-label={zhTW.pages.moveUp} title={zhTW.pages.moveUp} disabled={busy || index === 0} onClick={() => onMove(page.id, -1)}>↑</button>
                <button className="page-manager-icon-action" type="button" aria-label={zhTW.pages.moveDown} title={zhTW.pages.moveDown} disabled={busy || index === pages.length - 1} onClick={() => onMove(page.id, 1)}>↓</button>
                <button className="page-manager-icon-action danger-text" type="button" aria-label={zhTW.pages.delete} title={zhTW.pages.delete} disabled={busy || pages.length === 1} onClick={() => onDelete(page)}>×</button>
              </div>
            );
          })}
        </div>

        <div className="dialog-actions page-manager-actions">
          <button type="button" className="button secondary" disabled={busy} onClick={onCreate}>＋ 新增頁面</button>
          <button type="button" className="button primary" disabled={busy} onClick={onClose}>完成</button>
        </div>
      </section>
    </div>
  );
}
