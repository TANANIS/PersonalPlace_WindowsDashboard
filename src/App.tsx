import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AddPanel,
  IngestResultPanel,
  approveAndGroupProblems,
  canStartNewIngest,
  combineIngestResults,
  ingestFailureResult,
  mergeIngestRetryResult,
} from "./components/AddPanel";
import { CardEditDialog, type CardEditValues } from "./components/CardEditDialog";
import { PageManagerDialog } from "./components/PageManagerDialog";
import { GroupDetailView } from "./components/GroupDetailView";
import { NoteWorkspace } from "./components/NoteWorkspace";
import { TargetRepairDialog } from "./components/TargetRepairDialog";
import { BackupDialog } from "./components/BackupDialog";
import { RecoveryScreen } from "./components/RecoveryScreen";
import { UndoBar } from "./components/UndoBar";
import { GuideDialog } from "./components/GuideDialog";
import { TodoDialog } from "./components/TodoDialog";
import { FocusDialogSafe } from "./FocusDialogSafe";
import { UsageDialog } from "./components/UsageDialog";
import { WidgetCardPreview } from "./components/WidgetCardPreview";
import { ContextActionBar } from "./components/ContextActionBar";
import { PageIcon } from "./components/PageIcon";
import { defaultState } from "./data/defaults";
import { performanceDemoState, placesDemoState } from "./data/demo";
import { changeSelection, keyboardReorderTarget, moveDashboardCardsInMemory } from "./lib/editing";
import { applyColorTheme, COLOR_THEMES, loadColorTheme, saveColorTheme, type ColorTheme } from "./lib/theme";
import { usePointerReorder } from "./lib/pointerReorder";
import { classifyShortcutPreview, isCompactCardPreview, isShortcutCard, type PreviewPresentation } from "./lib/cardPreview";
import { dashboardView, type AppView, type OverlayState, type ViewOrigin } from "./lib/viewState";
import { loadLegacyState } from "./lib/storage";
import { useModalFocus } from "./lib/accessibility";
import { zhTW } from "./i18n/zh-TW";
import {
  clearPreviewCache,
  checkTargets,
  createGroup,
  createNote,
  createWidget,
  createPage,
  deleteCards,
  deletePage,
  exportBackup,
  getDashboard,
  getLauncherPreview,
  getPreviewCacheInfo,
  getRecoveryInfo,
  getWidgetSummary,
  getFocusState,
  getUsageSummary,
  inspectBackup,
  ingestItems,
  initializeWorkspace,
  isTauriRuntime,
  launchCard,
  launchGroup,
  listenForNativeFileDrops,
  moveCards,
  movePage,
  reorderPage,
  platformErrorMessage,
  platformErrorCode,
  setLaunchEnabled,
  setTodoCompleted,
  startFocus,
  pauseFocus,
  resumeFocus,
  stopFocus,
  searchDashboard,
  undoLast,
  ungroup,
  updateCard,
  updateGroupResume,
  updateNote,
  relinkTarget,
  recoverDatabase,
  openRecoveryBackupFolder,
  restoreBackup,
  updatePage,
} from "./lib/platform";
import type {
  IngestInput,
  IngestProblem,
  IngestRequest,
  IngestResult,
  LauncherPreview,
  PreviewCacheInfo,
  DashboardSearchResult,
  TargetAvailability,
  RecoveryInfo,
  WidgetSummary,
  FocusState,
  UsageSummary,
  MoveCardsRequest,
} from "./lib/platform";
import type {
  DashboardCard,
  DashboardState,
  ItemSize,
  Page,
  WorkspaceState,
} from "./types";

function dashboardFromLegacy(state: WorkspaceState): DashboardState {
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

function kindLabel(card: DashboardCard): string {
  if (card.cardType === "group") return "PLACE";
  if (card.cardType === "note") return "NOTE";
  if (card.cardType === "widget") return "TOOL";
  if (card.kind === "web") return "WEB";
  if (card.kind === "local") return "LOCAL";
  return "APP";
}

function searchResultTypeLabel(result: DashboardSearchResult): string {
  if (result.subtitle) return result.subtitle;
  if (result.resultType === "group") return "Place";
  if (result.resultType === "note") return "筆記";
  if (result.resultType === "widget") return "工具";
  if (result.resultType === "page") return "頁面";
  return "入口";
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [legacyState] = useState<WorkspaceState | null>(() => loadLegacyState());
  const [shortcutPreviewPresentation, setShortcutPreviewPresentation] = useState<Record<string, PreviewPresentation>>({});
  const demoMode = !isTauriRuntime()
    ? new URLSearchParams(window.location.search).get("demo")
    : null;
  const browserInitial = demoMode === "places"
    ? placesDemoState
    : demoMode === "performance"
      ? performanceDemoState
      : dashboardFromLegacy(legacyState ?? defaultState);
  const [state, setState] = useState<DashboardState>(browserInitial);
  const [activePageId, setActivePageId] = useState(browserInitial.pages[0]?.id ?? "home");
  const [query, setQuery] = useState("");
  const [searchScope, setSearchScope] = useState<"page" | "all">("page");
  const [searchResults, setSearchResults] = useState<DashboardSearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchExpanded, setSearchExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => loadColorTheme());
  const [mutationBusy, setMutationBusy] = useState(false);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [view, setView] = useState<AppView>(() => dashboardView(browserInitial.pages[0]?.id ?? "home"));
  const [overlay, setOverlay] = useState<OverlayState>(null);
  const [renamingGroupId, setRenamingGroupId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [nativeDragActive, setNativeDragActive] = useState(false);
  const [dropResult, setDropResult] = useState<IngestResult | null>(null);
  const [dropPageId, setDropPageId] = useState(activePageId);
  const [dropGroupId, setDropGroupId] = useState<string | null>(null);
  const [dropBusy, setDropBusy] = useState(false);
  const [previews, setPreviews] = useState<Record<string, LauncherPreview>>({});
  const [previewGeneration, setPreviewGeneration] = useState(0);
  const [cacheInfo, setCacheInfo] = useState<PreviewCacheInfo | null>(null);
  const [cacheBusy, setCacheBusy] = useState(false);
  const [widgetSummaries, setWidgetSummaries] = useState<Record<string, WidgetSummary>>({});
  const [focusState, setFocusState] = useState<FocusState | null>(null);
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);
  const [widgetActionBusy, setWidgetActionBusy] = useState(false);
  const [cardEditError, setCardEditError] = useState<string | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [repairError, setRepairError] = useState<string | null>(null);
  const [targetStatuses, setTargetStatuses] = useState<Record<string, TargetAvailability>>({});
  const [recoveryInfo, setRecoveryInfo] = useState<RecoveryInfo | null>(() =>
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "recovery"
      ? {
          technicalError: "database disk image is malformed (demo)",
          backupFolder: "C:\\Users\\Demo\\AppData\\Roaming\\tw.jsrad.personal-workspace\\backups\\recovery",
        }
      : null,
  );
  const stateRef = useRef(state);
  const activePageIdRef = useRef(activePageId);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const openGroupId = view.kind === "place" ? view.groupId : null;
  const openGroupIdRef = useRef(openGroupId);
  const readyRef = useRef(false);
  const dropApprovalsRef = useRef(
    new Map<string, { allowDuplicate: boolean; allowRisky: boolean }>(),
  );
  const dropBusyRef = useRef(false);
  const dropResultRef = useRef<IngestResult | null>(null);
  const requestedPreviewsRef = useRef(new Set<string>());
  const previewMountedRef = useRef(true);
  const settingsDialogRef = useModalFocus<HTMLElement>(overlay?.kind === "settings", () => setOverlay(null));

  useEffect(() => {
    previewMountedRef.current = true;
    return () => {
      previewMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    applyColorTheme(colorTheme);
    saveColorTheme(colorTheme);
  }, [colorTheme]);

  useEffect(() => {
    let disposed = false;
    if (!isTauriRuntime()) {
      readyRef.current = true;
      setPersistenceReady(true);
      return;
    }
    void initializeWorkspace(legacyState)
      .then((dashboard) => {
        if (disposed) return;
        stateRef.current = dashboard;
        setState(dashboard);
        const firstPage = dashboard.pages[0]?.id ?? "home";
        setActivePageId((current) =>
          dashboard.pages.some((page) => page.id === current) ? current : firstPage,
        );
        readyRef.current = true;
        setPersistenceReady(true);
      })
      .catch(async (error) => {
        if (disposed) return;
        if (platformErrorCode(error) === "databaseUnavailable") {
          try {
            setRecoveryInfo(await getRecoveryInfo());
          } catch {
            setRecoveryInfo({
              technicalError: platformErrorMessage(error, "資料庫無法開啟。"),
              backupFolder: "無法取得備份資料夾位置",
            });
          }
          return;
        }
        setNotice(platformErrorMessage(error, "無法載入本機資料庫。"));
      });
    return () => {
      disposed = true;
    };
  }, [legacyState]);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    activePageIdRef.current = activePageId;
    setSelectedIds(new Set());
    setSelectionAnchor(null);
  }, [activePageId]);

  useEffect(() => {
    openGroupIdRef.current = openGroupId;
  }, [openGroupId]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    function handleGlobalShortcut(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchScope("all");
        setSearchExpanded(true);
        window.setTimeout(() => searchInputRef.current?.focus(), 0);
      }
    }
    window.addEventListener("keydown", handleGlobalShortcut);
    return () => window.removeEventListener("keydown", handleGlobalShortcut);
  }, []);

  const activePage =
    state.pages.find((page) => page.id === activePageId) ??
    state.pages[0] ??
    { id: "home", name: "我的地方", symbol: "⌂" };

  function captureOrigin(): ViewOrigin {
    const dashboardOrigin = view.kind === "place" ? view.origin : null;
    const currentScrollY = mainContentRef.current?.scrollTop ?? 0;
    return {
      pageId: activePage.id,
      query: dashboardOrigin?.query ?? query,
      searchScope: dashboardOrigin?.searchScope ?? searchScope,
      scrollY: dashboardOrigin?.scrollY ?? currentScrollY,
      editing: dashboardOrigin?.editing ?? editing,
      placeId: view.kind === "place" ? view.groupId : undefined,
      placeScrollY: view.kind === "place" ? currentScrollY : undefined,
    };
  }

  function scheduleMainScroll(top: number) {
    window.setTimeout(() => {
      if (mainContentRef.current) mainContentRef.current.scrollTop = top;
    }, 0);
  }

  function navigateToAppView(nextView: AppView) {
    setView(nextView);
    scheduleMainScroll(0);
  }

  function showDashboard(pageId: string, resetSearch = true) {
    setActivePageId(pageId);
    setView(dashboardView(pageId));
    setSelectedIds(new Set());
    setSelectionAnchor(null);
    if (resetSearch) {
      setQuery("");
      setSearchScope("page");
      setSearchExpanded(false);
    }
    scheduleMainScroll(0);
  }

  function returnToOrigin() {
    if (view.kind === "dashboard") return;
    const origin = view.origin;
    setActivePageId(origin.pageId);
    setQuery(origin.query);
    setSearchScope(origin.searchScope);
    setEditing(origin.editing);
    if (origin.placeId) {
      const { placeId, placeScrollY, ...dashboardOrigin } = origin;
      setView({ kind: "place", groupId: placeId, origin: dashboardOrigin });
      scheduleMainScroll(placeScrollY ?? 0);
    } else {
      setView(dashboardView(origin.pageId));
      scheduleMainScroll(origin.scrollY);
    }
    setSelectedIds(new Set());
    setSelectionAnchor(null);
  }
  const pageCards = useMemo(
    () => state.cards.filter((card) => card.pageId === activePage?.id),
    [activePage?.id, state.cards],
  );
  const topLevelCards = useMemo(
    () => pageCards.filter((card) => card.parentGroupId === null).sort((a, b) => a.position - b.position),
    [pageCards],
  );
  const cardReorder = usePointerReorder("data-card-reorder-id", (_sourceId, targetId, draggedIds) => {
    const targetIndex = topLevelCards.findIndex((card) => card.id === targetId);
    if (targetIndex < 0) return;
    void commitMutation("已調整卡片順序", () => moveCardsForUi({
      cardIds: draggedIds,
      destinationPageId: activePage.id,
      destinationGroupId: null,
      targetIndex,
    }));
  }, !editing || mutationBusy, {
    getDragIds: (sourceId) => selectedIds.has(sourceId)
      ? topLevelCards.filter((card) => selectedIds.has(card.id)).map((card) => card.id)
      : [sourceId],
  });
  const visibleCards = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("zh-TW");
    if (!normalized) return topLevelCards;
    return topLevelCards.filter(
      (card) => {
        const directMatch =
        card.title.toLocaleLowerCase("zh-TW").includes(normalized) ||
        card.subtitle.toLocaleLowerCase("zh-TW").includes(normalized) ||
        card.noteText.toLocaleLowerCase("zh-TW").includes(normalized) ||
        card.resumeNote.toLocaleLowerCase("zh-TW").includes(normalized);
        if (directMatch || card.cardType !== "group") return directMatch;
        return pageCards.some(
          (child) =>
            child.parentGroupId === card.id &&
            (child.title.toLocaleLowerCase("zh-TW").includes(normalized) ||
              child.subtitle.toLocaleLowerCase("zh-TW").includes(normalized) ||
              child.noteText.toLocaleLowerCase("zh-TW").includes(normalized)),
        );
      },
    );
  }, [pageCards, query, topLevelCards]);
  const groups = useMemo(
    () => topLevelCards.filter((card) => card.cardType === "group"),
    [topLevelCards],
  );

  useEffect(() => {
    const previewCards = openGroupId
      ? pageCards.filter((card) => card.cardType === "target" && card.parentGroupId === openGroupId)
      : [
          ...topLevelCards.filter((card) => card.cardType === "target"),
          ...topLevelCards
            .filter((card) => card.cardType === "group")
            .flatMap((group) => pageCards
              .filter((card) => card.cardType === "target" && card.parentGroupId === group.id)
              .sort((left, right) => left.position - right.position)
              .slice(0, 4)),
        ];
    const activeIds = new Set(previewCards.map((card) => card.id));
    requestedPreviewsRef.current = new Set(
      [...requestedPreviewsRef.current].filter((cardId) => activeIds.has(cardId)),
    );
    setPreviews((current) =>
      Object.fromEntries(Object.entries(current).filter(([cardId]) => activeIds.has(cardId))),
    );
    for (const card of previewCards) {
      if (requestedPreviewsRef.current.has(card.id)) continue;
      requestedPreviewsRef.current.add(card.id);
      void getLauncherPreview(card.id)
        .then((preview) => {
          if (previewMountedRef.current && preview) {
            setPreviews((current) => ({ ...current, [card.id]: preview }));
          }
        })
        .catch(() => undefined);
    }
  }, [openGroupId, pageCards, previewGeneration, topLevelCards]);

  useEffect(() => {
    if (overlay?.kind !== "settings") return;
    void getPreviewCacheInfo().then(setCacheInfo).catch(() => setCacheInfo(null));
  }, [overlay]);

  useEffect(() => {
    const visibleWidgets = (openGroupId
      ? pageCards.filter((card) => card.parentGroupId === openGroupId)
      : topLevelCards
    ).filter((card) => card.cardType === "widget");
    let cancelled = false;
    void Promise.all(visibleWidgets.map(async (card) => {
      try { return [card.id, await getWidgetSummary(card.id)] as const; }
      catch { return null; }
    })).then((entries) => {
      if (!cancelled) setWidgetSummaries(Object.fromEntries(entries.filter((entry): entry is readonly [string, WidgetSummary] => entry !== null)));
    });
    return () => { cancelled = true; };
  }, [openGroupId, pageCards, topLevelCards]);

  useEffect(() => {
    const hasFocus = (openGroupId ? pageCards.filter((card) => card.parentGroupId === openGroupId) : topLevelCards).some((card) => card.cardType === "widget" && card.widgetKind === "focus");
    const hasUsage = (openGroupId ? pageCards.filter((card) => card.parentGroupId === openGroupId) : topLevelCards).some((card) => card.cardType === "widget" && card.widgetKind === "usage");
    let disposed = false;
    const refresh = () => {
      if (hasFocus) void getFocusState().then((next) => !disposed && setFocusState(next)).catch(() => undefined);
      if (hasUsage) {
        const from = new Date(); from.setHours(0, 0, 0, 0);
        void getUsageSummary(Math.floor(from.getTime() / 1000), Math.floor(Date.now() / 1000)).then((next) => !disposed && setUsageSummary(next)).catch(() => undefined);
      }
    };
    refresh();
    const timer = window.setInterval(refresh, hasFocus ? 5_000 : 30_000);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [openGroupId, pageCards, topLevelCards]);

  function adoptDashboard(next: DashboardState) {
    stateRef.current = next;
    setState(next);
    if (!next.pages.some((page) => page.id === activePageIdRef.current)) {
      const nextPage = next.pages[0]?.id ?? "home";
      activePageIdRef.current = nextPage;
      setActivePageId(nextPage);
    }
  }

  async function refreshDashboard() {
    if (!isTauriRuntime()) return;
    try {
      adoptDashboard(await getDashboard());
    } catch (error) {
      setNotice(platformErrorMessage(error, "新增完成，但無法重新載入畫面。"));
    }
  }

  async function commitMutation(
    successMessage: string,
    operation: () => Promise<DashboardState>,
  ) {
    if (mutationBusy) return null;
    setMutationBusy(true);
    try {
      const dashboard = await operation();
      adoptDashboard(dashboard);
      setSelectedIds(new Set());
      setSelectionAnchor(null);
      setUndoMessage(successMessage);
      return dashboard;
    } catch (error) {
      setNotice(platformErrorMessage(error, "無法完成這項整理操作。"));
      return null;
    } finally {
      setMutationBusy(false);
    }
  }

  async function moveCardsForUi(request: MoveCardsRequest): Promise<DashboardState> {
    if (!isTauriRuntime()) {
      return moveDashboardCardsInMemory(stateRef.current, request) as DashboardState;
    }
    return moveCards(request);
  }

  async function reorderPageForUi(pageId: string, targetIndex: number): Promise<DashboardState> {
    if (!isTauriRuntime()) {
      const pages = [...stateRef.current.pages];
      const sourceIndex = pages.findIndex((page) => page.id === pageId);
      if (sourceIndex < 0) return stateRef.current;
      const [page] = pages.splice(sourceIndex, 1);
      pages.splice(Math.max(0, Math.min(targetIndex, pages.length)), 0, page);
      return { ...stateRef.current, pages };
    }
    return reorderPage(pageId, targetIndex);
  }

  async function runSerializedIngest(request: IngestRequest): Promise<IngestResult> {
    return ingestItems(request);
  }

  async function ingestDroppedPaths(
    inputs: IngestInput[],
    pageId = activePageIdRef.current,
    parentGroupId = openGroupIdRef.current,
  ) {
    if (inputs.length === 0) return;
    if (!canStartNewIngest(dropBusyRef.current, Boolean(dropResultRef.current))) return;
    dropApprovalsRef.current.clear();
    dropBusyRef.current = true;
    setDropBusy(true);
    try {
      const result = await runSerializedIngest({
        pageId,
        parentGroupId,
        inputs,
        allowDuplicate: false,
        allowRisky: false,
      });
      setDropPageId(pageId);
      setDropGroupId(parentGroupId);
      dropResultRef.current = result;
      setDropResult(result);
      if (result.added.length > 0) await refreshDashboard();
    } catch (error) {
      const failure = ingestFailureResult(inputs, error);
      dropResultRef.current = failure;
      setDropResult(failure);
    } finally {
      dropBusyRef.current = false;
      setDropBusy(false);
    }
  }

  async function retryDroppedProblems(
    problems: IngestProblem[],
    approvedCode: "duplicate" | "risky",
  ) {
    if (problems.length === 0 || dropBusyRef.current) return;
    dropBusyRef.current = true;
    setDropBusy(true);
    const approvalGroups = approveAndGroupProblems(
      problems,
      approvedCode,
      dropApprovalsRef.current,
    );
    let combined: IngestResult = { added: [], issues: [], errors: [] };
    for (const approvalGroup of approvalGroups) {
      try {
        combined = combineIngestResults(
          combined,
          await runSerializedIngest({
            pageId: dropPageId,
            parentGroupId: dropGroupId,
            inputs: approvalGroup.inputs,
            ...approvalGroup.permissions,
          }),
        );
      } catch (error) {
        combined = combineIngestResults(
          combined,
          ingestFailureResult(approvalGroup.inputs, error),
        );
      }
    }
    const current = dropResultRef.current;
    const merged = current
      ? mergeIngestRetryResult(current, combined, approvedCode, problems)
      : combined;
    dropResultRef.current = merged;
    setDropResult(merged);
    if (combined.added.length > 0) await refreshDashboard();
    dropBusyRef.current = false;
    setDropBusy(false);
  }

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;
    void listenForNativeFileDrops((event) => {
      if (event.type === "enter" || event.type === "over") {
        setNativeDragActive(
          canStartNewIngest(dropBusyRef.current, Boolean(dropResultRef.current)),
        );
        return;
      }
      if (event.type === "leave") {
        setNativeDragActive(false);
        return;
      }
      setNativeDragActive(false);
      if (!readyRef.current) {
        setNotice("本機資料仍在準備中，請稍後再拖入一次。");
        return;
      }
      void ingestDroppedPaths(
        event.paths.map((value) => ({ inputType: "path", value })),
      );
    }).then((cleanup) => {
      if (disposed) cleanup?.();
      else unlisten = cleanup;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  async function refreshWidgetSummary(cardId: string) {
    const summary = await getWidgetSummary(cardId);
    setWidgetSummaries((current) => ({ ...current, [cardId]: summary }));
  }

  async function toggleWidgetTodo(cardId: string, itemId: string, completed: boolean) {
    if (widgetActionBusy) return;
    setWidgetActionBusy(true);
    try {
      await setTodoCompleted(itemId, completed);
      await refreshWidgetSummary(cardId);
    } catch (reason) {
      setNotice(platformErrorMessage(reason, "無法更新待辦事項。"));
    } finally {
      setWidgetActionBusy(false);
    }
  }

  async function controlWidgetFocus(cardId: string, action: "start" | "pause" | "resume" | "skip" | "stop") {
    if (widgetActionBusy) return;
    setWidgetActionBusy(true);
    try {
      const next = action === "start" ? await startFocus({ phase: focusState?.phase ?? "focus" })
        : action === "pause" ? await pauseFocus()
          : action === "resume" ? await resumeFocus()
            : await stopFocus(action === "skip" ? "skipped" : "stopped");
      setFocusState(next);
      await refreshWidgetSummary(cardId);
    } catch (reason) {
      setNotice(platformErrorMessage(reason, "無法控制專注計時。"));
    } finally {
      setWidgetActionBusy(false);
    }
  }

  async function launch(card: DashboardCard) {
    if (editing) return;
    if (card.cardType === "group") {
      navigateToAppView({ kind: "place", groupId: card.id, origin: captureOrigin() });
      return;
    }
    if (card.cardType === "note") {
      navigateToAppView({ kind: "note", cardId: card.id, origin: captureOrigin() });
      return;
    }
    if (card.cardType === "widget") {
      if (card.widgetKind) navigateToAppView({ kind: "tool", widgetId: card.id, tool: card.widgetKind, origin: captureOrigin() });
      return;
    }
    try {
      await launchCard(card.id);
    } catch (error) {
      const message = platformErrorMessage(error, "無法開啟這個項目。");
      setNotice(message);
      if (card.kind === "local") {
        setRepairError(message);
        setOverlay({ kind: "repair", cardId: card.id });
      }
    }
  }

  function leaveGroup() {
    returnToOrigin();
  }

  async function createNoteInContainer(parentGroupId: string | null) {
    if (mutationBusy) return;
    setMutationBusy(true);
    try {
      const result = await createNote(activePage.id, parentGroupId);
      adoptDashboard(result.dashboard);
      const note = result.dashboard.cards.find((card) => card.id === result.noteId);
      if (note) {
        navigateToAppView({ kind: "note", cardId: note.id, origin: captureOrigin(), startEditing: true });
      }
      setUndoMessage("已新增筆記");
    } catch (error) {
      setNotice(platformErrorMessage(error, "無法新增筆記。"));
    } finally {
      setMutationBusy(false);
    }
  }

  const saveResumeNote = useCallback(async (value: string) => {
    const groupId = openGroupIdRef.current;
    if (!groupId) throw new Error("找不到目前群組。");
    try {
      adoptDashboard(await updateGroupResume(groupId, value));
    } catch (error) {
      setNotice(platformErrorMessage(error, "無法保存最近狀態。"));
      throw error;
    }
  }, []);

  async function toggleLaunchCard(card: DashboardCard, enabled: boolean) {
    try {
      adoptDashboard(await setLaunchEnabled(card.id, enabled));
      setUndoMessage(enabled ? "已加入一次開啟" : "已從一次開啟移除");
    } catch (error) {
      if (
        enabled &&
        platformErrorCode(error) === "riskyConfirmationRequired" &&
        window.confirm("開啟此卡片可能執行程式或變更系統。確定要把它加入「開啟這個地方」嗎？")
      ) {
        adoptDashboard(await setLaunchEnabled(card.id, true, true));
        setUndoMessage("已確認並加入一次開啟");
        return;
      }
      setNotice(platformErrorMessage(error, "無法更新一次開啟清單。"));
      throw error;
    }
  }

  const saveNoteText = useCallback(async (cardId: string, value: string) => {
    try {
      adoptDashboard(await updateNote(cardId, value));
    } catch (error) {
      setNotice(platformErrorMessage(error, "無法保存筆記。"));
      throw error;
    }
  }, []);

  const runGlobalSearch = useCallback(async (value: string): Promise<DashboardSearchResult[]> => {
    if (isTauriRuntime()) return searchDashboard(value);
    const needle = value.trim().toLocaleLowerCase("zh-TW");
    if (!needle) return [];
    const pageById = new Map(stateRef.current.pages.map((page) => [page.id, page]));
    const cardById = new Map(stateRef.current.cards.map((card) => [card.id, card]));
    const results: DashboardSearchResult[] = [];
    for (const page of stateRef.current.pages) {
      if (page.name.toLocaleLowerCase("zh-TW").includes(needle)) {
        results.push({ id: page.id, resultType: "page", title: page.name, subtitle: "頁面", pageId: page.id, pageName: page.name, score: page.name.toLocaleLowerCase("zh-TW") === needle ? 0 : 2 });
      }
    }
    for (const card of stateRef.current.cards) {
      const page = pageById.get(card.pageId);
      if (!page) continue;
      const group = card.parentGroupId ? cardById.get(card.parentGroupId) : undefined;
      const title = card.title.toLocaleLowerCase("zh-TW");
      const matches = title.includes(needle) || card.subtitle.toLocaleLowerCase("zh-TW").includes(needle) || card.noteText.toLocaleLowerCase("zh-TW").includes(needle) || card.resumeNote.toLocaleLowerCase("zh-TW").includes(needle) || Boolean(group?.title.toLocaleLowerCase("zh-TW").includes(needle));
      if (!matches) continue;
      results.push({ id: card.id, resultType: card.cardType, title: card.title, subtitle: card.subtitle, pageId: page.id, pageName: page.name, groupId: group?.id, groupName: group?.title, cardType: card.cardType, score: title === needle ? 0 : title.startsWith(needle) ? 1 : title.includes(needle) ? 2 : group?.title.toLocaleLowerCase("zh-TW").includes(needle) ? 3 : 4 });
    }
    return results.sort((left, right) => left.score - right.score || left.title.localeCompare(right.title, "zh-TW"));
  }, []);

  useEffect(() => {
    if (searchScope !== "all" || !query.trim()) {
      setSearchResults([]);
      setSearchBusy(false);
      return;
    }
    let disposed = false;
    setSearchBusy(true);
    const timer = window.setTimeout(() => {
      void runGlobalSearch(query)
        .then((results) => { if (!disposed) setSearchResults(results); })
        .catch(() => { if (!disposed) setSearchResults([]); })
        .finally(() => { if (!disposed) setSearchBusy(false); });
    }, 120);
    return () => { disposed = true; window.clearTimeout(timer); };
  }, [query, runGlobalSearch, searchScope]);

  function chooseSearchResult(result: DashboardSearchResult) {
    const origin = captureOrigin();
    setSearchExpanded(false);
    setActivePageId(result.pageId);
    if (result.resultType === "page") {
      showDashboard(result.pageId, false);
      return;
    }
    const card = stateRef.current.cards.find((candidate) => candidate.id === result.id);
    if (!card) return;
    if (card.cardType === "group") {
      navigateToAppView({ kind: "place", groupId: card.id, origin });
      return;
    }
    if (card.cardType === "note") {
      navigateToAppView({ kind: "note", cardId: card.id, origin });
      return;
    }
    if (card.cardType === "widget") {
      if (card.widgetKind) navigateToAppView({ kind: "tool", widgetId: card.id, tool: card.widgetKind, origin });
      return;
    }
    void launchCard(card.id).catch((error) => {
      setNotice(platformErrorMessage(error, "無法開啟搜尋結果。"));
      if (targetStatuses[card.id] === "missing" || targetStatuses[card.id] === "unavailable") {
        setOverlay({ kind: "repair", cardId: card.id });
      }
    });
  }

  function selectCard(event: React.MouseEvent, cardId: string) {
    const result = changeSelection(
      selectedIds,
      cardId,
      visibleCards.map((card) => card.id),
      selectionAnchor,
      { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey },
    );
    setSelectedIds(result.selected);
    setSelectionAnchor(result.anchorId);
  }

  function toggleEditingMode() {
    setEditing((current) => !current);
    setSelectedIds(new Set());
    setSelectionAnchor(null);
  }

  async function createSelectedGroup() {
    const selected = topLevelCards.filter((card) => selectedIds.has(card.id));
    if (selected.length < 2 || selected.some((card) => card.cardType === "group")) return;
    setMutationBusy(true);
    try {
      const result = await createGroup(activePage.id, selected.map((card) => card.id));
      adoptDashboard(result.dashboard);
      setSelectedIds(new Set([result.groupId]));
      setSelectionAnchor(result.groupId);
      setRenamingGroupId(result.groupId);
      setRenameDraft("新群組");
      setUndoMessage("已建立群組");
    } catch (error) {
      setNotice(platformErrorMessage(error, "無法建立群組。"));
    } finally {
      setMutationBusy(false);
    }
  }

  async function saveInlineGroupName(group: DashboardCard) {
    const name = renameDraft.trim();
    setRenamingGroupId(null);
    if (!name || name === group.title) return;
    await commitMutation("已重新命名群組", () => updateCard({ cardId: group.id, title: name }));
  }

  async function persistCardAppearance(
    card: DashboardCard,
    values: CardEditValues,
    resetAuto: boolean,
  ) {
    setCardEditError(null);
    setMutationBusy(true);
    try {
      const dashboard = await updateCard(
        resetAuto
          ? { cardId: card.id, resetAuto: true }
          : {
              cardId: card.id,
              title: values.title,
              subtitle: values.subtitle,
              tone: values.tone,
              size: values.size,
            },
      );
      adoptDashboard(dashboard);
      setOverlay(null);
      setUndoMessage("已更新卡片");
    } catch (error) {
      setCardEditError(platformErrorMessage(error, "無法保存卡片設定。"));
    } finally {
      setMutationBusy(false);
    }
  }

  async function clearStoredPreviews() {
    setCacheBusy(true);
    try {
      const info = await clearPreviewCache();
      setCacheInfo(info);
      requestedPreviewsRef.current = new Set();
      setPreviews({});
      setPreviewGeneration((current) => current + 1);
      setNotice("已清除縮圖儲存區；需要時會自動重建。");
    } catch (error) {
      setNotice(platformErrorMessage(error, "無法清除縮圖儲存區。"));
    } finally {
      setCacheBusy(false);
    }
  }

  const openGroup = openGroupId
    ? state.cards.find((card) => card.id === openGroupId && card.cardType === "group") ?? null
    : null;
  const openGroupCards = openGroup
    ? state.cards
        .filter((card) => card.parentGroupId === openGroup.id)
        .sort((left, right) => left.position - right.position)
    : [];
  const currentNote = view.kind === "note"
    ? state.cards.find((card) => card.id === view.cardId && card.cardType === "note") ?? null
    : null;
  const currentWidget = view.kind === "tool"
    ? state.cards.find((card) => card.id === view.widgetId && card.cardType === "widget") ?? null
    : null;
  const currentViewOrigin = view.kind === "dashboard" ? null : view.origin;
  const originPlace = currentViewOrigin?.placeId
    ? state.cards.find((card) => card.id === currentViewOrigin.placeId && card.cardType === "group") ?? null
    : null;
  const originPage = currentViewOrigin
    ? state.pages.find((page) => page.id === currentViewOrigin.pageId) ?? null
    : null;
  const viewBackLabel = originPlace ? `返回 ${originPlace.title}` : `返回 ${originPage?.name ?? "頁面"}`;
  const cardBeingEdited = overlay?.kind === "cardInspector"
    ? state.cards.find((card) => card.id === overlay.cardId) ?? null
    : null;
  const repairCard = overlay?.kind === "repair"
    ? state.cards.find((card) => card.id === overlay.cardId && card.cardType === "target") ?? null
    : null;

  useEffect(() => {
    if (!persistenceReady) return;
    let disposed = false;
    if (!isTauriRuntime()) {
      const demoStatuses = Object.fromEntries(
        stateRef.current.cards
          .filter((card) => card.cardType === "target")
          .map((card) => [card.id, card.id === "card-project" ? "missing" : card.kind === "web" ? "unknown" : "available"]),
      ) as Record<string, TargetAvailability>;
      setTargetStatuses(demoStatuses);
      return;
    }
    void checkTargets(activePage.id, openGroup?.id ?? null)
      .then((statuses) => {
        if (!disposed) setTargetStatuses(Object.fromEntries(statuses.map((status) => [status.cardId, status.status])));
      })
      .catch(() => {
        if (!disposed) setTargetStatuses({});
      });
    return () => {
      disposed = true;
    };
  }, [activePage.id, openGroup?.id, persistenceReady, previewGeneration]);

  async function performRelink(card: DashboardCard, path: string, allowRisky = false) {
    setMutationBusy(true);
    setRepairError(null);
    try {
      adoptDashboard(await relinkTarget(card.id, path, allowRisky));
      requestedPreviewsRef.current.delete(card.id);
      setPreviews((current) => {
        const next = { ...current };
        delete next[card.id];
        return next;
      });
      setPreviewGeneration((current) => current + 1);
      setOverlay(null);
      setNotice("已重新定位並保留原本的卡片設定。");
    } catch (error) {
      if (
        !allowRisky &&
        platformErrorCode(error) === "riskyConfirmationRequired" &&
        window.confirm("重新定位到這個項目可能執行程式或變更系統，確定繼續嗎？")
      ) {
        setMutationBusy(false);
        await performRelink(card, path, true);
        return;
      }
      setRepairError(platformErrorMessage(error, "無法重新定位這張卡片。"));
      throw error;
    } finally {
      setMutationBusy(false);
    }
  }
  const selectedCards = topLevelCards.filter((card) => selectedIds.has(card.id));
  const canGroup = selectedCards.length >= 2 && selectedCards.every((card) => card.cardType !== "group");
  const canMoveIntoGroup = selectedCards.length > 0 && selectedCards.every((card) => card.cardType !== "group");

  if (recoveryInfo) {
    return (
      <RecoveryScreen
        info={recoveryInfo}
        onInspect={inspectBackup}
        onRecover={recoverDatabase}
        onOpenBackupFolder={openRecoveryBackupFolder}
      />
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="頁面">
        <div className="brand" aria-label={zhTW.brand.name}><span className="brand-mark">{zhTW.brand.mark}</span></div>
        <nav className="workspace-list">
          {state.pages.map((page) => (
            <button
              className={`workspace-button ${page.id === activePage.id ? "is-active" : ""}`}
              key={page.id}
              onClick={() => showDashboard(page.id)}
              title={page.name}
            >
              <PageIcon symbol={page.symbol} pageName={page.name} /><small>{page.name}</small>
            </button>
          ))}
          {editing && (
            <button className="workspace-button add-page-button" onClick={() => setOverlay({ kind: "pages" })} title="管理頁面">
              <span aria-hidden="true">＋</span><small>頁面</small>
            </button>
          )}
        </nav>
        <div className="sidebar-footer-actions">
          <button
            className={`workspace-button edit-mode-button${editing ? " is-active" : ""}`}
            type="button"
            disabled={!persistenceReady || mutationBusy}
            aria-pressed={editing}
            onClick={toggleEditingMode}
            title={editing ? zhTW.sidebar.finishEditingTitle : zhTW.sidebar.editTitle}
          >
            <span aria-hidden="true">{editing ? "✓" : "✎"}</span>
            <small>{editing ? zhTW.sidebar.finishEditing : zhTW.sidebar.edit}</small>
          </button>
          <button className="workspace-button settings-button" onClick={() => setOverlay({ kind: "settings" })} title="設定">
            <span aria-hidden="true">⚙</span><small>{zhTW.sidebar.settings}</small>
          </button>
        </div>
      </aside>

      <main ref={mainContentRef} className={`main-content${view.kind !== "dashboard" ? " is-workspace-view" : ""}${openGroup ? " is-place-detail" : ""}`}>
        {view.kind === "note" && currentNote ? (
          <NoteWorkspace
            note={currentNote}
            busy={mutationBusy}
            startEditing={view.startEditing}
            backLabel={viewBackLabel}
            onBack={returnToOrigin}
            onSaveText={(value) => saveNoteText(currentNote.id, value)}
            onSaveAppearance={async (title, size) => {
              setMutationBusy(true);
              try {
                adoptDashboard(await updateCard({ cardId: currentNote.id, title, size }));
                setUndoMessage("已更新筆記");
              } catch (error) {
                setNotice(platformErrorMessage(error, "無法更新筆記。"));
                throw error;
              } finally {
                setMutationBusy(false);
              }
            }}
          />
        ) : view.kind === "tool" && currentWidget ? (
          <section className="content-workspace tool-workspace">
            {view.tool === "todo" && <TodoDialog embedded backLabel={viewBackLabel} widget={currentWidget} onClose={returnToOrigin} onDashboardChanged={adoptDashboard} onChanged={() => void getWidgetSummary(currentWidget.id).then((summary) => setWidgetSummaries((current) => ({ ...current, [currentWidget.id]: summary }))).catch(() => undefined)} />}
            {view.tool === "focus" && <FocusDialogSafe embedded backLabel={viewBackLabel} onClose={returnToOrigin} onChanged={(nextFocus) => setWidgetSummaries((current) => ({ ...current, [currentWidget.id]: { cardId: currentWidget.id, widgetKind: "focus", title: "Focus Timer", primaryValue: nextFocus.remainingSeconds == null ? `${nextFocus.settings.focusMinutes}:00` : `${Math.floor(nextFocus.remainingSeconds / 60).toString().padStart(2, "0")}:${(nextFocus.remainingSeconds % 60).toString().padStart(2, "0")}`, secondaryValue: nextFocus.status === "running" ? "進行中" : nextFocus.status === "paused" ? "已暫停" : "準備開始", items: [] } }))} />}
            {view.tool === "usage" && <UsageDialog embedded backLabel={viewBackLabel} onClose={returnToOrigin} onChanged={(summary, tracking) => setWidgetSummaries((current) => ({ ...current, [currentWidget.id]: { cardId: currentWidget.id, widgetKind: "usage", title: "使用時間", primaryValue: `${Math.floor(summary.totalSeconds / 3600)} 小時`, secondaryValue: tracking.enabled ? (summary.apps.slice(0, 3).map((app) => app.displayName).join(" · ") || "等待使用紀錄") : "追蹤預設關閉", items: [] } }))} />}
          </section>
        ) : openGroup ? (
          <GroupDetailView
            group={openGroup}
            cards={openGroupCards}
            previews={previews}
            widgetSummaries={widgetSummaries}
            targetStatuses={targetStatuses}
            editing={editing}
            busy={mutationBusy}
            onBack={leaveGroup}
            backLabel={`返回 ${activePage.name}`}
            onAddTarget={() => setOverlay({ kind: "add", pageId: openGroup.pageId, groupId: openGroup.id })}
            onCreateNote={() => void createNoteInContainer(openGroup.id)}
            onOpenCard={(card) => void launch(card)}
            onEditCard={(card) => {
              if (card.cardType === "note") navigateToAppView({ kind: "note", cardId: card.id, origin: captureOrigin(), startEditing: true });
              else { setCardEditError(null); setOverlay({ kind: "cardInspector", cardId: card.id }); }
            }}
            onMoveOutCards={(cards) => void commitMutation("已移出群組", () => moveCardsForUi({
              cardIds: cards.map((card) => card.id),
              destinationPageId: openGroup.pageId,
              destinationGroupId: null,
              targetIndex: topLevelCards.length,
            }))}
            onDeleteCards={(cards) => void commitMutation("已移除卡片", () => deleteCards(cards.map((card) => card.id)))}
            onReorderCards={(cards, targetIndex) => void commitMutation("已調整群組內順序", () => moveCardsForUi({
              cardIds: cards.map((card) => card.id),
              destinationPageId: openGroup.pageId,
              destinationGroupId: openGroup.id,
              targetIndex,
            }))}
            onRepairCard={(card) => {
              setRepairError(null);
              setOverlay({ kind: "repair", cardId: card.id });
            }}
            onSetLaunchEnabled={toggleLaunchCard}
            onSaveResume={saveResumeNote}
            onLaunch={async () => {
              try {
                const result = await launchGroup(openGroup.id);
                await refreshDashboard();
                return result;
              } catch (error) {
                setNotice(platformErrorMessage(error, "無法開啟這個地方。"));
                throw error;
              }
            }}
          />
        ) : (
          <>
        <header className="topbar">
          <div><p className="eyebrow">{zhTW.brand.eyebrow}</p><h1>{activePage.name}</h1></div>
          <div className="topbar-actions">
            <div className={`unified-search${searchExpanded || query ? " is-expanded" : ""}`}>
              <label className="search-box"><span aria-hidden="true">⌕</span><input ref={searchInputRef} aria-label="搜尋 Personal Place" value={query} onFocus={() => setSearchExpanded(true)} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setQuery("");
                  setSearchExpanded(false);
                  event.currentTarget.blur();
                } else if (event.key === "Enter") {
                  const result = searchScope === "all" ? searchResults[0] : null;
                  if (result) { event.preventDefault(); chooseSearchResult(result); }
                  else if (searchScope === "page" && visibleCards[0]) { event.preventDefault(); void launch(visibleCards[0]); }
                }
              }} placeholder={searchScope === "page" ? "搜尋這個頁面" : "搜尋所有地方"} /></label>
              <div className="search-scope" aria-label="搜尋範圍"><button type="button" className={searchScope === "page" ? "is-active" : ""} onClick={() => setSearchScope("page")}>本頁</button><button type="button" className={searchScope === "all" ? "is-active" : ""} onClick={() => setSearchScope("all")}>所有地方</button></div>
              {searchScope === "all" && query.trim() && <div className="unified-search-results" role="listbox" aria-label="搜尋結果">
                {searchBusy && <p>搜尋中…</p>}
                {!searchBusy && searchResults.slice(0, 12).map((result) => <button type="button" role="option" key={`${result.resultType}-${result.id}`} onClick={() => chooseSearchResult(result)}><span><strong>{result.title}</strong><small>{searchResultTypeLabel(result)}</small></span><em>{result.groupName ? `${result.pageName} › ${result.groupName}` : result.pageName}</em></button>)}
                {!searchBusy && !searchResults.length && <p>找不到符合的內容</p>}
              </div>}
            </div>
            <button className="button primary add-content-button" disabled={!persistenceReady || mutationBusy} onClick={() => setOverlay({ kind: "add", pageId: activePage.id })}>＋ 加入</button>
          </div>
        </header>

        {!persistenceReady && <section className="status-strip" aria-live="polite"><span className="status-dot" /><span>正在準備本機資料…</span></section>}
        {editing && <div className="edit-mode-hint"><span>整理模式</span><small>點選卡片後集中操作，或按住卡片空白處直接拖曳</small><button type="button" onClick={() => setSelectedIds(new Set(visibleCards.map((card) => card.id)))}>全選</button></div>}

        <section className={`launcher-grid ${editing ? "is-editing" : ""}`} role={editing ? "listbox" : undefined} aria-multiselectable={editing ? true : undefined}>
          {visibleCards.map((card) => {
            const preview = previews[card.id];
            const compactPreview = isCompactCardPreview(card, preview, shortcutPreviewPresentation[card.id]);
            const recordPreviewDimensions = (event: React.SyntheticEvent<HTMLImageElement>) => {
              if (!preview || preview.kind !== "thumbnail" || !isShortcutCard(card)) return;
              const image = event.currentTarget;
              const presentation = classifyShortcutPreview(image.naturalWidth, image.naturalHeight);
              setShortcutPreviewPresentation((current) => current[card.id] === presentation
                ? current
                : { ...current, [card.id]: presentation });
            };
            const targetProblem = card.cardType === "target" && (targetStatuses[card.id] === "missing" || targetStatuses[card.id] === "unavailable");
            const children = card.cardType === "group"
              ? pageCards.filter((candidate) => candidate.parentGroupId === card.id).sort((a, b) => a.position - b.position)
              : [];
            const widgetSummary = card.cardType === "widget" ? widgetSummaries[card.id] : null;
            const selected = selectedIds.has(card.id);
            const editSummary = card.cardType === "group"
              ? zhTW.card.placeSummary(children.length)
              : card.cardType === "note"
                ? card.noteText.trim() || zhTW.notes.empty
                : card.subtitle.trim();
            const editAccessibleName = [card.title, editSummary].filter(Boolean).join("，");
            return (
              <article
                className={`launcher-card size-${card.size} tone-${card.tone}${preview ? ` has-preview preview-${preview.kind}` : ""}${compactPreview ? " preview-compact" : ""}${selected ? " is-selected" : ""}${cardReorder.draggedId === card.id ? " is-dragging" : ""}${cardReorder.dragOverId === card.id && cardReorder.draggedId !== card.id ? " is-drag-over" : ""}${card.cardType === "group" ? " group-card" : ""}${card.cardType === "note" ? " note-card" : ""}${card.cardType === "widget" ? " widget-card" : ""}${targetProblem ? " is-target-missing" : ""}`}
                key={card.id}
                data-card-reorder-id={card.id}
                role={editing ? "option" : undefined}
                aria-selected={editing ? selected : undefined}
                aria-label={editing ? `${editAccessibleName}；${zhTW.card.keyboardReorderHint}` : undefined}
                tabIndex={editing ? 0 : undefined}
                {...(editing ? cardReorder.bind(card.id) : {})}
                onClick={(event) => {
                  if (cardReorder.shouldSuppressClick()) return;
                  if (editing) selectCard(event, card.id);
                }}
                onKeyDown={(event) => {
                  if (!editing) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    const result = changeSelection(
                      selectedIds,
                      card.id,
                      visibleCards.map((candidate) => candidate.id),
                      selectionAnchor,
                      { toggle: event.ctrlKey || event.metaKey, range: event.shiftKey },
                    );
                    setSelectedIds(result.selected);
                    setSelectionAnchor(result.anchorId);
                    return;
                  }
                  if (!editing || !event.altKey || mutationBusy) return;
                  const currentIndex = topLevelCards.findIndex((candidate) => candidate.id === card.id);
                  const targetIndex = keyboardReorderTarget(currentIndex, topLevelCards.length, event.key);
                  if (targetIndex !== null) {
                    event.preventDefault();
                    void commitMutation("已用鍵盤調整卡片順序", () => moveCardsForUi({
                      cardIds: [card.id],
                      destinationPageId: activePage.id,
                      destinationGroupId: null,
                      targetIndex,
                    }));
                  }
                }}
              >
                {!editing && <button type="button" className="card-open-surface" aria-label={`開啟 ${card.title}`} onClick={() => void launch(card)} />}
                {preview && !compactPreview && <div className="card-preview-media" aria-hidden="true"><img src={preview.assetUrl} alt="" loading="lazy" decoding="async" onLoad={recordPreviewDimensions} /></div>}
                <div className="card-glow" />
                <div className="card-heading">
                  {card.cardType === "group" ? (
                    <span className="group-symbol-stack" aria-hidden="true">
                      {children.slice(0, 4).map((child) => <span key={child.id}>{previews[child.id]?.kind === "icon" ? <img src={previews[child.id].assetUrl} alt="" loading="lazy" decoding="async" /> : child.symbol}</span>)}
                    </span>
                  ) : (
                    <span className="item-symbol" aria-hidden="true">{preview && compactPreview ? <img className="system-icon" src={preview.assetUrl} alt="" loading="lazy" decoding="async" onLoad={recordPreviewDimensions} /> : card.symbol}</span>
                  )}
                  {card.cardType !== "widget" && <span className="kind-label">{kindLabel(card)}</span>}
                </div>
                <div className="card-copy">
                  {renamingGroupId === card.id ? (
                    <input
                      className="inline-group-name"
                      value={renameDraft}
                      maxLength={120}
                      autoFocus
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onBlur={() => void saveInlineGroupName(card)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") event.currentTarget.blur();
                        if (event.key === "Escape") setRenamingGroupId(null);
                      }}
                    />
                  ) : <h2>{card.title}</h2>}
                  {card.cardType === "widget" ? (
                    <WidgetCardPreview
                      card={card}
                      summary={widgetSummary}
                      focusState={focusState}
                      usageSummary={usageSummary}
                      scopeCards={openGroupId ? pageCards.filter((candidate) => candidate.parentGroupId === openGroupId) : topLevelCards}
                      busy={widgetActionBusy}
                      onOpen={() => void launch(card)}
                      onToggleTodo={(itemId, completed) => void toggleWidgetTodo(card.id, itemId, completed)}
                      onFocusAction={(action) => void controlWidgetFocus(card.id, action)}
                    />
                  ) : <p className={card.cardType === "note" ? "note-card-preview" : undefined}>{card.cardType === "group" ? `${children.length} 個項目` : card.cardType === "note" ? card.noteText.trim() || zhTW.notes.empty : card.subtitle}</p>}
                </div>
                {card.cardType === "target" && <span className="open-indicator" aria-hidden="true">↗</span>}
                {targetProblem && !editing && <button type="button" className="card-repair-button" onClick={(event) => { event.stopPropagation(); setRepairError(null); setOverlay({ kind: "repair", cardId: card.id }); }}>! 重新定位</button>}
                {editing && selected && <button type="button" className="card-more-button" data-no-card-drag onClick={(event) => { event.stopPropagation(); setCardEditError(null); if (card.cardType === "note") navigateToAppView({ kind: "note", cardId: card.id, origin: captureOrigin(), startEditing: true }); else setOverlay({ kind: "cardInspector", cardId: card.id }); }} aria-label={`編輯 ${card.title}`}>⋯</button>}
              </article>
            );
          })}

          {visibleCards.length === 0 && (
            <div className="empty-state"><span>＋</span><h2>這個頁面還沒有項目</h2><p>加入 App、網站、檔案、資料夾或一張筆記。</p><button className="button primary" disabled={!persistenceReady} onClick={() => setOverlay({ kind: "add", pageId: activePage.id })}>加入第一個項目</button></div>
          )}
        </section>
        {editing && <ContextActionBar
          selected={selectedCards}
          pages={state.pages}
          groups={groups}
          currentPageId={activePage.id}
          busy={mutationBusy}
          canGroup={canGroup}
          onClear={() => { setSelectedIds(new Set()); setSelectionAnchor(null); }}
          onEdit={(card) => card.cardType === "note" ? navigateToAppView({ kind: "note", cardId: card.id, origin: captureOrigin(), startEditing: true }) : setOverlay({ kind: "cardInspector", cardId: card.id })}
          onResize={(card) => void commitMutation("已調整卡片大小", () => updateCard({ cardId: card.id, size: (card.size === "wide" ? "square" : "wide") as ItemSize }))}
          onCreateGroup={() => void createSelectedGroup()}
          onMoveToPage={(destination) => void commitMutation("已移動卡片", () => moveCardsForUi({ cardIds: [...selectedIds], destinationPageId: destination, destinationGroupId: null, targetIndex: state.cards.filter((card) => card.pageId === destination && card.parentGroupId === null).length }))}
          onMoveToGroup={(groupId) => { const group = groups.find((candidate) => candidate.id === groupId); if (group) void commitMutation("已移入群組", () => moveCardsForUi({ cardIds: [...selectedIds], destinationPageId: group.pageId, destinationGroupId: group.id, targetIndex: pageCards.filter((card) => card.parentGroupId === group.id).length })); }}
          onDelete={() => void commitMutation("已移除卡片", () => deleteCards([...selectedIds]))}
        />}
          </>
        )}
      </main>

      {notice && <div className="toast" role="status">{notice}</div>}
      {undoMessage && <UndoBar busy={undoBusy} message={undoMessage} onDismiss={() => setUndoMessage(null)} onUndo={() => {
        if (undoBusy) return;
        setUndoBusy(true);
        void undoLast().then((dashboard) => { adoptDashboard(dashboard); setUndoMessage(null); }).catch((error) => setNotice(platformErrorMessage(error, "無法復原。"))).finally(() => setUndoBusy(false));
      }} />}

      {nativeDragActive && <div className="native-drop-overlay" role="status"><div className="native-drop-target"><span aria-hidden="true">＋</span><strong>放開即可加入{openGroup ? "這個地方" : "目前頁面"}</strong><small>可同時加入多個檔案、捷徑或資料夾</small></div></div>}
      {dropResult && <div className="floating-ingest-result"><IngestResultPanel result={dropResult} busy={dropBusy} onDismiss={() => { dropApprovalsRef.current.clear(); dropResultRef.current = null; setDropResult(null); }} onRetryDuplicates={() => void retryDroppedProblems(dropResult.issues.filter((issue) => issue.code === "duplicate"), "duplicate")} onConfirmRisky={() => void retryDroppedProblems(dropResult.issues.filter((issue) => issue.code === "risky"), "risky")} /></div>}

      {overlay?.kind === "settings" && <div className="dialog-backdrop" onMouseDown={() => setOverlay(null)}><section ref={settingsDialogRef} tabIndex={-1} className="dialog settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-header"><div><p className="eyebrow">SETTINGS</p><h2 id="settings-title">設定</h2></div><button className="icon-button" onClick={() => setOverlay(null)} aria-label="關閉設定">×</button></div><div className="settings-list"><section className="settings-theme" aria-labelledby="settings-theme-title"><div><strong id="settings-theme-title">{zhTW.appearance.title}</strong><small>{zhTW.appearance.description}</small></div><div className="theme-options">{COLOR_THEMES.map((theme) => <button type="button" key={theme} className={`theme-option theme-${theme}`} aria-label={zhTW.appearance.options[theme]} aria-pressed={colorTheme === theme} onClick={() => setColorTheme(theme)}><span className="theme-preview" aria-hidden="true"><i /><i /><i /></span><strong>{zhTW.appearance.options[theme]}</strong>{colorTheme === theme && <b aria-hidden="true">✓</b>}</button>)}</div></section><button className="settings-row" onClick={() => setOverlay({ kind: "guide" })}><span className="settings-row-icon" aria-hidden="true">?</span><span><strong>{zhTW.guide.settingsTitle}</strong><small>{zhTW.guide.settingsDescription}</small></span><span className="settings-row-arrow" aria-hidden="true">›</span></button><button className="settings-row" onClick={() => setOverlay({ kind: "backup" })}><span className="settings-row-icon" aria-hidden="true">⇅</span><span><strong>備份與還原</strong><small>匯出或取代式還原本機資料</small></span><span className="settings-row-arrow" aria-hidden="true">›</span></button><div className="settings-row cache-row"><span className="settings-row-icon" aria-hidden="true">▧</span><span><strong>縮圖儲存區</strong><small>{cacheInfo ? `${cacheInfo.entries} 個預覽 · ${formatStorageSize(cacheInfo.bytes)}` : "正在讀取使用量…"}</small></span><button className="cache-clear-button" disabled={cacheBusy || !cacheInfo || cacheInfo.entries === 0} onClick={() => void clearStoredPreviews()}>{cacheBusy ? "清除中" : "清除"}</button></div></div><footer className="settings-footer"><span>{zhTW.brand.name}</span><span>{zhTW.release.versionStatus("1.4.0")}</span></footer></section></div>}

      {overlay?.kind === "guide" && <GuideDialog onClose={() => setOverlay({ kind: "settings" })} />}

      {overlay?.kind === "add" && <AddPanel pageId={overlay.pageId} parentGroupId={overlay.groupId} performIngest={runSerializedIngest} onAdded={() => void refreshDashboard()} onCreateWidget={async (widgetKind) => {
        const result = await createWidget(overlay.pageId, overlay.groupId ?? null, widgetKind);
        adoptDashboard(result.dashboard);
        setUndoMessage("已新增小工具");
      }} onClose={() => setOverlay(null)} onCreateNote={() => { setOverlay(null); void createNoteInContainer(overlay.groupId ?? null); }} />}
      {cardBeingEdited && <CardEditDialog key={cardBeingEdited.id} item={cardBeingEdited} busy={mutationBusy} error={cardEditError} onClose={() => { if (!mutationBusy) setOverlay(null); }} onSave={(values) => void persistCardAppearance(cardBeingEdited, values, false)} onReset={cardBeingEdited.cardType === "target" ? () => void persistCardAppearance(cardBeingEdited, { title: cardBeingEdited.title, subtitle: cardBeingEdited.subtitle, tone: cardBeingEdited.tone, size: cardBeingEdited.size }, true) : undefined} />}
      {overlay?.kind === "pages" && <PageManagerDialog pages={state.pages} busy={mutationBusy} onClose={() => setOverlay(null)} onCreate={() => void commitMutation("已新增頁面", createPage)} onUpdate={(pageId, name, symbol) => void commitMutation("已更新頁面", () => updatePage(pageId, name, symbol))} onMove={(pageId, direction) => void commitMutation("已調整頁面順序", () => movePage(pageId, direction))} onReorder={(pageId, targetIndex) => void commitMutation("已拖曳調整頁面順序", () => reorderPageForUi(pageId, targetIndex))} onDelete={(page: Page) => {
        const count = state.cards.filter((card) => card.pageId === page.id).length;
        if (count > 0 && !window.confirm(`「${page.name}」包含 ${count} 張卡片，確定要刪除嗎？`)) return;
        void commitMutation("已刪除頁面", () => deletePage(page.id));
      }} />}
      {repairCard && <TargetRepairDialog card={repairCard} busy={mutationBusy} error={repairError} onClose={() => { setOverlay(null); setRepairError(null); }} onRelink={(path) => performRelink(repairCard, path)} onRemove={() => {
        void commitMutation("已移除失效卡片", () => deleteCards([repairCard.id])).then((result) => {
          if (result) setOverlay(null);
        });
      }} />}
      {overlay?.kind === "backup" && <BackupDialog onClose={() => setOverlay(null)} onExport={exportBackup} onInspect={inspectBackup} onRestore={restoreBackup} onRestored={(result) => {
        adoptDashboard(result.dashboard);
        showDashboard(result.dashboard.pages[0]?.id ?? "home");
        setSelectedIds(new Set());
        setPreviewGeneration((current) => current + 1);
      }} />}
    </div>
  );
}

export default App;
