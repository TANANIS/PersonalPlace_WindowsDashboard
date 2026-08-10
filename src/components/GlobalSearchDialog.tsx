import { useEffect, useRef, useState } from "react";
import type { DashboardSearchResult } from "../lib/platform";

interface GlobalSearchDialogProps {
  onClose: () => void;
  onSearch: (query: string) => Promise<DashboardSearchResult[]>;
  onChoose: (result: DashboardSearchResult) => void;
}

export function GlobalSearchDialog({ onClose, onSearch, onChoose }: GlobalSearchDialogProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DashboardSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const normalized = query.trim();
    if (!normalized) {
      setResults([]);
      setBusy(false);
      setError(null);
      return;
    }
    const requestId = ++requestIdRef.current;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void onSearch(normalized)
        .then((next) => {
          if (requestId !== requestIdRef.current) return;
          setResults(next);
          setActiveIndex(0);
          setError(null);
        })
        .catch(() => {
          if (requestId === requestIdRef.current) setError("搜尋暫時無法使用。");
        })
        .finally(() => {
          if (requestId === requestIdRef.current) setBusy(false);
        });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [onSearch, query]);

  function chooseActive() {
    const result = results[activeIndex];
    if (result) onChoose(result);
  }

  return (
    <div className="dialog-backdrop search-backdrop" onMouseDown={onClose}>
      <section
        className="global-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-search-title"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActiveIndex((current) => Math.min(current + 1, results.length - 1));
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActiveIndex((current) => Math.max(current - 1, 0));
          }
          if (event.key === "Enter") {
            event.preventDefault();
            chooseActive();
          }
        }}
      >
        <h2 id="global-search-title" className="visually-hidden">搜尋所有地方</h2>
        <div className="global-search-input">
          <span aria-hidden="true">⌕</span>
          <input
            value={query}
            autoFocus
            placeholder="搜尋所有頁面、地方、卡片與筆記"
            onChange={(event) => setQuery(event.target.value)}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="global-search-results" role="listbox" aria-label="搜尋結果">
          {!query.trim() && <p className="search-guidance">輸入名稱、來源或筆記內容。按 Enter 開啟。</p>}
          {query.trim() && busy && <p className="search-guidance">搜尋中…</p>}
          {error && <p className="search-error" role="alert">{error}</p>}
          {!busy && !error && query.trim() && results.length === 0 && (
            <p className="search-guidance">找不到相符內容。</p>
          )}
          {results.map((result, index) => (
            <button
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={index === activeIndex ? "is-active" : ""}
              key={`${result.resultType}-${result.id}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => onChoose(result)}
            >
              <span className="search-result-symbol" aria-hidden="true">
                {result.resultType === "page" ? "○" : result.resultType === "group" ? "◇" : result.resultType === "note" ? "≡" : "↗"}
              </span>
              <span>
                <strong>{result.title}</strong>
                <small>{result.pageName}{result.groupName ? ` › ${result.groupName}` : ""}</small>
              </span>
              <span className="search-result-type">{result.resultType === "page" ? "頁面" : result.resultType === "group" ? "地方" : result.resultType === "note" ? "筆記" : "卡片"}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
