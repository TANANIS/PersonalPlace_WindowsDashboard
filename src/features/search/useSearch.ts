import { useCallback, useEffect, useRef, useState } from "react";
import { searchDashboard, type DashboardSearchResult } from "../../platform/dashboard";
import { isTauriRuntime } from "../../platform/system";
import type { DashboardState } from "../../types";
import { searchDashboardInMemory } from "./model";

export type SearchScope = "page" | "all";

export function useSearch(getDashboardState: () => DashboardState) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("page");
  const [results, setResults] = useState<DashboardSearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setScope("all");
        setExpanded(true);
        window.setTimeout(() => inputRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, []);

  const runGlobalSearch = useCallback(async (value: string) => {
    if (isTauriRuntime()) return searchDashboard(value);
    return searchDashboardInMemory(getDashboardState(), value);
  }, [getDashboardState]);

  useEffect(() => {
    if (scope !== "all" || !query.trim()) {
      setResults([]);
      setBusy(false);
      return;
    }
    let disposed = false;
    setBusy(true);
    const timer = window.setTimeout(() => {
      void runGlobalSearch(query)
        .then((nextResults) => { if (!disposed) setResults(nextResults); })
        .catch(() => { if (!disposed) setResults([]); })
        .finally(() => { if (!disposed) setBusy(false); });
    }, 120);
    return () => {
      disposed = true;
      window.clearTimeout(timer);
    };
  }, [query, runGlobalSearch, scope]);

  return {
    query,
    setQuery,
    searchScope: scope,
    setSearchScope: setScope,
    searchResults: results,
    searchBusy: busy,
    searchExpanded: expanded,
    setSearchExpanded: setExpanded,
    searchInputRef: inputRef,
  };
}
