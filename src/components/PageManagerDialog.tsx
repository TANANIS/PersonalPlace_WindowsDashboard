import { useEffect, useState } from "react";
import type { Page } from "../types";

const PAGE_SYMBOLS = ["⌂", "○", "◇", "✦", "▦", "◎", "☕", "♫"];

interface PageManagerDialogProps {
  pages: Page[];
  busy: boolean;
  onClose: () => void;
  onCreate: () => void;
  onUpdate: (pageId: string, name: string, symbol: string) => void;
  onMove: (pageId: string, direction: -1 | 1) => void;
  onDelete: (page: Page) => void;
}

export function PageManagerDialog({
  pages,
  busy,
  onClose,
  onCreate,
  onUpdate,
  onMove,
  onDelete,
}: PageManagerDialogProps) {
  const [drafts, setDrafts] = useState<Record<string, { name: string; symbol: string }>>({});

  useEffect(() => {
    setDrafts(
      Object.fromEntries(pages.map((page) => [page.id, { name: page.name, symbol: page.symbol }])),
    );
  }, [pages]);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
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
              <div className="page-manager-row" key={page.id}>
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
                  {PAGE_SYMBOLS.map((symbol) => (
                    <option value={symbol} key={symbol}>{symbol}</option>
                  ))}
                </select>
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
                />
                <button type="button" disabled={busy || !changed || !draft.name.trim()} onClick={() => onUpdate(page.id, draft.name, draft.symbol)}>
                  保存
                </button>
                <button type="button" aria-label="向前移動" disabled={busy || index === 0} onClick={() => onMove(page.id, -1)}>↑</button>
                <button type="button" aria-label="向後移動" disabled={busy || index === pages.length - 1} onClick={() => onMove(page.id, 1)}>↓</button>
                <button type="button" className="danger-text" disabled={busy || pages.length === 1} onClick={() => onDelete(page)}>刪除</button>
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
