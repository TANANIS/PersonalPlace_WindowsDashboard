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
import { NoteEditDialog } from "./components/NoteEditDialog";
import { UndoBar } from "./components/UndoBar";
import { defaultState } from "./data/defaults";
import { placesDemoState } from "./data/demo";
import { changeSelection } from "./lib/editing";
import { loadLegacyState } from "./lib/storage";
import {
  clearPreviewCache,
  createGroup,
  createNote,
  createPage,
  deleteCards,
  deletePage,
  getDashboard,
  getLauncherPreview,
  getPreviewCacheInfo,
  ingestItems,
  initializeWorkspace,
  isTauriRuntime,
  launchCard,
  launchGroup,
  listenForNativeFileDrops,
  moveCards,
  movePage,
  platformErrorMessage,
  platformErrorCode,
  setLaunchEnabled,
  undoLast,
  ungroup,
  updateCard,
  updateGroupResume,
  updateNote,
  updatePage,
} from "./lib/platform";
import type {
  IngestInput,
  IngestProblem,
  IngestRequest,
  IngestResult,
  LauncherPreview,
  PreviewCacheInfo,
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
  if (card.kind === "web") return "WEB";
  if (card.kind === "local") return "LOCAL";
  return "APP";
}

function formatStorageSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function App() {
  const [legacyState] = useState<WorkspaceState | null>(() => loadLegacyState());
  const browserInitial =
    import.meta.env.DEV && new URLSearchParams(window.location.search).get("demo") === "places"
      ? placesDemoState
      : dashboardFromLegacy(legacyState ?? defaultState);
  const [state, setState] = useState<DashboardState>(browserInitial);
  const [activePageId, setActivePageId] = useState(browserInitial.pages[0]?.id ?? "home");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [mutationBusy, setMutationBusy] = useState(false);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pageManagerOpen, setPageManagerOpen] = useState(false);
  const [groupContentsId, setGroupContentsId] = useState<string | null>(null);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [addGroupId, setAddGroupId] = useState<string | null>(null);
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
  const [cardBeingEdited, setCardBeingEdited] = useState<DashboardCard | null>(null);
  const [noteBeingEdited, setNoteBeingEdited] = useState<DashboardCard | null>(null);
  const [cardEditError, setCardEditError] = useState<string | null>(null);
  const [persistenceReady, setPersistenceReady] = useState(false);
  const stateRef = useRef(state);
  const activePageIdRef = useRef(activePageId);
  const openGroupIdRef = useRef(openGroupId);
  const groupNavigationRef = useRef<{
    pageId: string;
    query: string;
    scrollY: number;
    editing: boolean;
  } | null>(null);
  const readyRef = useRef(false);
  const dropApprovalsRef = useRef(
    new Map<string, { allowDuplicate: boolean; allowRisky: boolean }>(),
  );
  const dropBusyRef = useRef(false);
  const dropResultRef = useRef<IngestResult | null>(null);
  const requestedPreviewsRef = useRef(new Set<string>());
  const previewMountedRef = useRef(true);

  useEffect(() => {
    previewMountedRef.current = true;
    return () => {
      previewMountedRef.current = false;
    };
  }, []);

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
      .catch((error) => setNotice(platformErrorMessage(error, "無法載入本機資料庫。")));
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

  const activePage =
    state.pages.find((page) => page.id === activePageId) ??
    state.pages[0] ??
    { id: "home", name: "我的地方", symbol: "⌂" };
  const pageCards = useMemo(
    () => state.cards.filter((card) => card.pageId === activePage?.id),
    [activePage?.id, state.cards],
  );
  const topLevelCards = useMemo(
    () => pageCards.filter((card) => card.parentGroupId === null).sort((a, b) => a.position - b.position),
    [pageCards],
  );
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
    const previewCards = pageCards.filter((card) => card.cardType === "target");
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
  }, [pageCards, previewGeneration]);

  useEffect(() => {
    if (!settingsOpen) return;
    void getPreviewCacheInfo().then(setCacheInfo).catch(() => setCacheInfo(null));
  }, [settingsOpen]);

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

  async function runSerializedIngest(request: IngestRequest): Promise<IngestResult> {
    return ingestItems(request);
  }

  async function ingestDroppedPaths(
    inputs: IngestInput[],
    pageId = activePageIdRef.current,
    parentGroupId = openGroupIdRef.current,
  ) {
    if (inputs.length === 0) return;
    if (!canStartNewIngest(dropBusyRef.current, Boolean(dropResultRef.current))) {
      if (dropResultRef.current) setNotice("請先關閉上一批新增結果，再拖入新的項目。");
      return;
    }
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

  async function launch(card: DashboardCard) {
    if (editing) return;
    if (card.cardType === "group") {
      groupNavigationRef.current = {
        pageId: activePage.id,
        query,
        scrollY: window.scrollY,
        editing,
      };
      setOpenGroupId(card.id);
      return;
    }
    if (card.cardType === "note") {
      setNoteBeingEdited(card);
      return;
    }
    try {
      await launchCard(card.id);
    } catch (error) {
      setNotice(platformErrorMessage(error, "無法開啟這個項目。"));
    }
  }

  function leaveGroup() {
    const navigation = groupNavigationRef.current;
    setOpenGroupId(null);
    if (!navigation) return;
    setActivePageId(navigation.pageId);
    setQuery(navigation.query);
    setEditing(navigation.editing);
    window.setTimeout(() => window.scrollTo({ top: navigation.scrollY }), 0);
  }

  async function createNoteInContainer(parentGroupId: string | null) {
    if (mutationBusy) return;
    setMutationBusy(true);
    try {
      const result = await createNote(activePage.id, parentGroupId);
      adoptDashboard(result.dashboard);
      const note = result.dashboard.cards.find((card) => card.id === result.noteId);
      if (note) setNoteBeingEdited(note);
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
      setCardBeingEdited(null);
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

  const groupContents = groupContentsId
    ? pageCards
        .filter((card) => card.parentGroupId === groupContentsId)
        .sort((a, b) => a.position - b.position)
    : [];
  const openGroup = openGroupId
    ? state.cards.find((card) => card.id === openGroupId && card.cardType === "group") ?? null
    : null;
  const openGroupCards = openGroup
    ? state.cards
        .filter((card) => card.parentGroupId === openGroup.id)
        .sort((left, right) => left.position - right.position)
    : [];
  const currentNoteBeingEdited = noteBeingEdited
    ? state.cards.find((card) => card.id === noteBeingEdited.id && card.cardType === "note") ?? null
    : null;
  const selectedCards = topLevelCards.filter((card) => selectedIds.has(card.id));
  const canGroup = selectedCards.length >= 2 && selectedCards.every((card) => card.cardType !== "group");
  const canMoveIntoGroup = selectedCards.length > 0 && selectedCards.every((card) => card.cardType !== "group");

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="頁面">
        <div className="brand" aria-label="個人工作台"><span className="brand-mark">PW</span></div>
        <nav className="workspace-list">
          {state.pages.map((page) => (
            <button
              className={`workspace-button ${page.id === activePage.id ? "is-active" : ""}`}
              key={page.id}
              onClick={() => {
                groupNavigationRef.current = null;
                setOpenGroupId(null);
                setActivePageId(page.id);
              }}
              title={page.name}
            >
              <span aria-hidden="true">{page.symbol}</span><small>{page.name}</small>
            </button>
          ))}
          {editing && (
            <button className="workspace-button add-page-button" onClick={() => setPageManagerOpen(true)} title="管理頁面">
              <span aria-hidden="true">＋</span><small>頁面</small>
            </button>
          )}
        </nav>
        <button className="workspace-button settings-button" onClick={() => setSettingsOpen(true)} title="設定">
          <span aria-hidden="true">⚙</span><small>設定</small>
        </button>
      </aside>

      <main className={`main-content${openGroup ? " is-place-detail" : ""}`}>
        {openGroup ? (
          <GroupDetailView
            group={openGroup}
            cards={openGroupCards}
            previews={previews}
            editing={editing}
            busy={mutationBusy}
            onBack={leaveGroup}
            onToggleEditing={() => setEditing((current) => !current)}
            onAddTarget={() => setAddGroupId(openGroup.id)}
            onCreateNote={() => void createNoteInContainer(openGroup.id)}
            onOpenCard={(card) => void launch(card)}
            onEditCard={(card) => {
              if (card.cardType === "note") setNoteBeingEdited(card);
              else {
                setCardEditError(null);
                setCardBeingEdited(card);
              }
            }}
            onMoveOut={(card) => void commitMutation("已移出群組", () => moveCards({
              cardIds: [card.id],
              destinationPageId: openGroup.pageId,
              destinationGroupId: null,
              targetIndex: topLevelCards.length,
            }))}
            onDeleteCard={(card) => void commitMutation("已移除卡片", () => deleteCards([card.id]))}
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
          <div><p className="eyebrow">PERSONAL WORKSPACE</p><h1>{activePage.name}</h1></div>
          <div className="topbar-actions">
            <label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋這個頁面" /></label>
            <button className="button secondary" disabled={!persistenceReady || mutationBusy} onClick={() => {
              setEditing((current) => !current);
              setSelectedIds(new Set());
              setSelectionAnchor(null);
            }}>{editing ? "完成" : "編輯"}</button>
            <button className="button secondary" disabled={!persistenceReady || mutationBusy} onClick={() => void createNoteInContainer(null)}>＋ 筆記</button>
            <button className="button primary" disabled={!persistenceReady || mutationBusy} onClick={() => setDialogOpen(true)}>＋ 新增</button>
          </div>
        </header>

        <section className="status-strip" aria-label="頁面狀態">
          <span className="status-dot" />
          <span>{!persistenceReady ? "正在準備本機資料…" : editing ? `編輯模式：已選取 ${selectedIds.size} 張卡片` : "本機優先 · 資料只存在這台裝置"}</span>
          <strong>{visibleCards.length} 個項目</strong>
        </section>

        {editing && (
          <section className="edit-selection-bar" aria-label="選取操作">
            <button type="button" onClick={() => setSelectedIds(new Set(visibleCards.map((card) => card.id)))}>全選目前頁面</button>
            <button type="button" disabled={selectedIds.size === 0} onClick={() => { setSelectedIds(new Set()); setSelectionAnchor(null); }}>清除選取</button>
            <button type="button" disabled={!canGroup || mutationBusy} onClick={() => void createSelectedGroup()}>建立群組</button>
            <label>移到頁面
              <select disabled={selectedIds.size === 0 || mutationBusy} value="" onChange={(event) => {
                const destination = event.target.value;
                if (destination) void commitMutation("已移動卡片", () => moveCards({ cardIds: [...selectedIds], destinationPageId: destination, destinationGroupId: null, targetIndex: state.cards.filter((card) => card.pageId === destination && card.parentGroupId === null).length }));
              }}>
                <option value="">選擇…</option>
                {state.pages.filter((page) => page.id !== activePage.id).map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
              </select>
            </label>
            <label>移入群組
              <select disabled={!canMoveIntoGroup || groups.length === 0 || mutationBusy} value="" onChange={(event) => {
                const groupId = event.target.value;
                const group = groups.find((candidate) => candidate.id === groupId);
                if (group) void commitMutation("已移入群組", () => moveCards({ cardIds: [...selectedIds], destinationPageId: group.pageId, destinationGroupId: group.id, targetIndex: pageCards.filter((card) => card.parentGroupId === group.id).length }));
              }}>
                <option value="">選擇…</option>
                {groups.filter((group) => !selectedIds.has(group.id)).map((group) => <option key={group.id} value={group.id}>{group.title}</option>)}
              </select>
            </label>
            <button className="danger-text" type="button" disabled={selectedIds.size === 0 || mutationBusy} onClick={() => void commitMutation("已移除卡片", () => deleteCards([...selectedIds]))}>移除選取</button>
          </section>
        )}

        <section className={`launcher-grid ${editing ? "is-editing" : ""}`}>
          {visibleCards.map((card) => {
            const preview = previews[card.id];
            const children = card.cardType === "group"
              ? pageCards.filter((candidate) => candidate.parentGroupId === card.id).sort((a, b) => a.position - b.position)
              : [];
            const selected = selectedIds.has(card.id);
            return (
              <article
                className={`launcher-card size-${card.size} tone-${card.tone}${preview ? ` has-preview preview-${preview.kind}` : ""}${selected ? " is-selected" : ""}${card.cardType === "group" ? " group-card" : ""}`}
                key={card.id}
                draggable={editing && !mutationBusy}
                onDragStart={() => setDraggedId(card.id)}
                onDragOver={(event) => editing && event.preventDefault()}
                onDrop={() => {
                  if (draggedId && draggedId !== card.id) {
                    const index = topLevelCards.findIndex((candidate) => candidate.id === card.id);
                    void commitMutation("已調整卡片順序", () => moveCards({ cardIds: [draggedId], destinationPageId: activePage.id, destinationGroupId: null, targetIndex: index }));
                  }
                  setDraggedId(null);
                }}
                onClick={(event) => editing ? selectCard(event, card.id) : void launch(card)}
              >
                {preview && preview.kind !== "icon" && <div className="card-preview-media" aria-hidden="true"><img src={preview.dataUrl} alt="" loading="lazy" decoding="async" /></div>}
                <div className="card-glow" />
                <div className="card-heading">
                  {card.cardType === "group" ? (
                    <span className="group-symbol-stack" aria-hidden="true">
                      {children.slice(0, 4).map((child) => <span key={child.id}>{previews[child.id]?.kind === "icon" ? <img src={previews[child.id].dataUrl} alt="" /> : child.symbol}</span>)}
                    </span>
                  ) : (
                    <span className="item-symbol" aria-hidden="true">{preview?.kind === "icon" ? <img className="system-icon" src={preview.dataUrl} alt="" loading="lazy" decoding="async" /> : card.symbol}</span>
                  )}
                  <span className="kind-label">{kindLabel(card)}</span>
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
                  <p>{card.cardType === "group" ? `${children.length} 個項目` : card.subtitle}</p>
                </div>
                {card.cardType === "target" && <span className="open-indicator" aria-hidden="true">↗</span>}
                {editing && (
                  <div className="edit-controls" onClick={(event) => event.stopPropagation()}>
                    {card.cardType === "group" && <button onClick={() => setGroupContentsId(card.id)} title="管理群組內容">▦</button>}
                    <button onClick={() => { setCardEditError(null); setCardBeingEdited(card); }} title="編輯卡片">⋯</button>
                    <button onClick={() => void commitMutation("已調整卡片大小", () => updateCard({ cardId: card.id, size: (card.size === "wide" ? "square" : "wide") as ItemSize }))} title="切換大小">◫</button>
                    {card.cardType === "group" && <button onClick={() => void commitMutation("已解散群組", () => ungroup(card.id))} title="解散群組">⇱</button>}
                    <button onClick={() => void commitMutation("已移除卡片", () => deleteCards([card.id]))} title="移除">×</button>
                  </div>
                )}
              </article>
            );
          })}

          {visibleCards.length === 0 && (
            <div className="empty-state"><span>＋</span><h2>這個頁面還沒有項目</h2><p>新增桌面應用程式、網頁或資料夾，建立自己的入口。</p><button className="button primary" disabled={!persistenceReady} onClick={() => setDialogOpen(true)}>新增第一個項目</button></div>
          )}
        </section>
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

      {settingsOpen && <div className="dialog-backdrop" onMouseDown={() => setSettingsOpen(false)}><section className="dialog settings-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-header"><div><p className="eyebrow">SETTINGS</p><h2>設定</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)}>×</button></div><div className="settings-list"><button className="settings-row" onClick={() => { setSettingsOpen(false); setGuideOpen(true); }}><span className="settings-row-icon" aria-hidden="true">?</span><span><strong>使用介紹</strong><small>查看拖放、新增與整理項目的方法</small></span><span className="settings-row-arrow" aria-hidden="true">›</span></button><div className="settings-row cache-row"><span className="settings-row-icon" aria-hidden="true">▧</span><span><strong>縮圖儲存區</strong><small>{cacheInfo ? `${cacheInfo.entries} 個預覽 · ${formatStorageSize(cacheInfo.bytes)}` : "正在讀取使用量…"}</small></span><button className="cache-clear-button" disabled={cacheBusy || !cacheInfo || cacheInfo.entries === 0} onClick={() => void clearStoredPreviews()}>{cacheBusy ? "清除中" : "清除"}</button></div></div><footer className="settings-footer"><span>個人工作台</span><span>版本 0.7.0</span></footer></section></div>}

      {guideOpen && <div className="dialog-backdrop" onMouseDown={() => setGuideOpen(false)}><section className="dialog guide-dialog" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-header"><div><p className="eyebrow">QUICK GUIDE</p><h2>使用介紹</h2></div><button className="icon-button" onClick={() => setGuideOpen(false)}>×</button></div><div className="guide-hero"><span aria-hidden="true">＋</span><div><strong>直接拖進來即可新增</strong><p>支援 EXE、捷徑、資料夾與各種檔案，也能一次拖入多個項目。</p></div></div><div className="guide-steps"><article><span>01</span><strong>選擇頁面</strong><p>新增的內容會放進目前頁面；編輯模式可以新增、重新命名與排序頁面。</p></article><article><span>02</span><strong>多選整理</strong><p>在編輯模式使用 Ctrl 或 Shift 多選卡片，再建立群組或移到其他頁面。</p></article><article><span>03</span><strong>放心調整</strong><p>排序、調整大小、刪除與群組操作都能從畫面下方復原。</p></article></div><div className="dialog-actions"><button className="button primary" onClick={() => setGuideOpen(false)}>知道了</button></div></section></div>}

      {dialogOpen && <AddPanel pageId={activePage.id} performIngest={runSerializedIngest} onAdded={() => void refreshDashboard()} onClose={() => setDialogOpen(false)} />}
      {addGroupId && <AddPanel pageId={activePage.id} parentGroupId={addGroupId} performIngest={runSerializedIngest} onAdded={() => void refreshDashboard()} onClose={() => setAddGroupId(null)} />}
      {currentNoteBeingEdited && <NoteEditDialog key={currentNoteBeingEdited.id} note={currentNoteBeingEdited} busy={mutationBusy} onSaveText={(value) => saveNoteText(currentNoteBeingEdited.id, value)} onSaveAppearance={async (title, size) => {
        setMutationBusy(true);
        try {
          adoptDashboard(await updateCard({ cardId: currentNoteBeingEdited.id, title, size }));
          setUndoMessage("已更新筆記");
        } catch (error) {
          setNotice(platformErrorMessage(error, "無法更新筆記。"));
          throw error;
        } finally {
          setMutationBusy(false);
        }
      }} onClose={() => setNoteBeingEdited(null)} />}
      {cardBeingEdited && <CardEditDialog key={cardBeingEdited.id} item={cardBeingEdited} busy={mutationBusy} error={cardEditError} onClose={() => { if (!mutationBusy) setCardBeingEdited(null); }} onSave={(values) => void persistCardAppearance(cardBeingEdited, values, false)} onReset={cardBeingEdited.cardType === "target" ? () => void persistCardAppearance(cardBeingEdited, { title: cardBeingEdited.title, subtitle: cardBeingEdited.subtitle, tone: cardBeingEdited.tone, size: cardBeingEdited.size }, true) : undefined} />}
      {pageManagerOpen && <PageManagerDialog pages={state.pages} busy={mutationBusy} onClose={() => setPageManagerOpen(false)} onCreate={() => void commitMutation("已新增頁面", createPage)} onUpdate={(pageId, name, symbol) => void commitMutation("已更新頁面", () => updatePage(pageId, name, symbol))} onMove={(pageId, direction) => void commitMutation("已調整頁面順序", () => movePage(pageId, direction))} onDelete={(page: Page) => {
        const count = state.cards.filter((card) => card.pageId === page.id).length;
        if (count > 0 && !window.confirm(`「${page.name}」包含 ${count} 張卡片，確定要刪除嗎？`)) return;
        void commitMutation("已刪除頁面", () => deletePage(page.id));
      }} />}
      {groupContentsId && <div className="dialog-backdrop" onMouseDown={() => setGroupContentsId(null)}><section className="dialog group-contents-dialog" role="dialog" aria-modal="true" aria-labelledby="group-contents-title" onMouseDown={(event) => event.stopPropagation()}><div className="dialog-header"><div><p className="eyebrow">GROUP CONTENTS</p><h2 id="group-contents-title">群組內容</h2></div><button className="icon-button" onClick={() => setGroupContentsId(null)}>×</button></div><div className="group-contents-list">{groupContents.length === 0 ? <p className="muted-copy">這個群組目前沒有卡片。</p> : groupContents.map((card) => <div key={card.id} className="group-content-row"><span>{card.symbol}</span><strong>{card.title}</strong><button disabled={mutationBusy} onClick={() => void commitMutation("已移出群組", () => moveCards({ cardIds: [card.id], destinationPageId: card.pageId, destinationGroupId: null, targetIndex: topLevelCards.length }))}>移出群組</button></div>)}</div><div className="dialog-actions"><button className="button secondary" onClick={() => setGroupContentsId(null)}>完成</button></div></section></div>}
    </div>
  );
}

export default App;
