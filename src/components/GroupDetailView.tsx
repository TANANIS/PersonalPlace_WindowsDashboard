import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  GroupLaunchResult,
  LauncherPreview,
  WidgetSummary,
} from "../lib/platform";
import type { DashboardCard } from "../types";
import { usePointerReorder } from "../lib/pointerReorder";

interface GroupDetailViewProps {
  group: DashboardCard;
  cards: DashboardCard[];
  previews: Record<string, LauncherPreview>;
  widgetSummaries?: Record<string, WidgetSummary>;
  targetStatuses: Record<string, "available" | "missing" | "unavailable" | "unknown">;
  editing: boolean;
  busy: boolean;
  onBack: () => void | Promise<void>;
  backLabel?: string;
  onAddTarget: () => void;
  onCreateNote: () => void;
  onOpenCard: (card: DashboardCard) => void;
  onEditCard: (card: DashboardCard) => void;
  onMoveOutCards: (cards: DashboardCard[]) => void;
  onDeleteCards: (cards: DashboardCard[]) => void;
  onReorderCards: (cards: DashboardCard[], targetIndex: number) => void;
  onRepairCard: (card: DashboardCard) => void;
  onSetLaunchEnabled: (card: DashboardCard, enabled: boolean) => Promise<void>;
  onSaveResume: (value: string) => Promise<void>;
  onLaunch: () => Promise<GroupLaunchResult>;
}

type SaveState = "idle" | "saving" | "saved" | "failed";

const launchLabels = {
  success: "已開啟",
  failed: "開啟失敗",
  missing: "找不到目標",
  skipped: "未選取",
} as const;

export function GroupDetailView({
  group,
  cards,
  previews,
  widgetSummaries = {},
  targetStatuses,
  editing,
  busy,
  onBack,
  backLabel = "返回頁面",
  onAddTarget,
  onCreateNote,
  onOpenCard,
  onEditCard,
  onMoveOutCards,
  onDeleteCards,
  onReorderCards,
  onRepairCard,
  onSetLaunchEnabled,
  onSaveResume,
  onLaunch,
}: GroupDetailViewProps) {
  const [resumeDraft, setResumeDraft] = useState(group.resumeNote);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<GroupLaunchResult | null>(null);
  const [resumeExpanded, setResumeExpanded] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null);
  const savedValueRef = useRef(group.resumeNote);
  const resumeDraftRef = useRef(group.resumeNote);
  const saveSequenceRef = useRef(0);
  const saveChainRef = useRef(Promise.resolve());

  useEffect(() => {
    setResumeDraft(group.resumeNote);
    resumeDraftRef.current = group.resumeNote;
    savedValueRef.current = group.resumeNote;
    setSaveState("idle");
    setLaunchResult(null);
    setResumeExpanded(false);
    setSelectedIds([]);
    setSelectionAnchor(null);
  }, [group.id]);

  useEffect(() => {
    if (!editing) {
      setSelectedIds([]);
      setSelectionAnchor(null);
    }
  }, [editing]);

  const flushResume = useCallback(() => {
    const value = resumeDraftRef.current;
    if (value === savedValueRef.current) return Promise.resolve();
    const sequence = ++saveSequenceRef.current;
    setSaveState("saving");
    const task = saveChainRef.current
      .catch(() => undefined)
      .then(() => onSaveResume(value))
      .then(() => {
        if (sequence === saveSequenceRef.current) {
          savedValueRef.current = value;
          setSaveState("saved");
        }
      })
      .catch((error) => {
        if (sequence === saveSequenceRef.current) setSaveState("failed");
        throw error;
      });
    saveChainRef.current = task.catch(() => undefined);
    return task;
  }, [onSaveResume]);

  useEffect(() => {
    if (resumeDraft === savedValueRef.current) return;
    const timer = window.setTimeout(() => { void flushResume().catch(() => undefined); }, 500);
    return () => window.clearTimeout(timer);
  }, [flushResume, resumeDraft]);

  async function handleBack() {
    try {
      await flushResume();
      await onBack();
    } catch {
      // Keep the place open and preserve the draft when saving fails.
    }
  }

  const launchCount = useMemo(
    () => cards.filter((card) => card.cardType === "target" && card.launchEnabled).length,
    [cards],
  );
  const selectedCards = useMemo(
    () => cards.filter((card) => selectedIds.includes(card.id)),
    [cards, selectedIds],
  );
  const cardReorder = usePointerReorder("data-group-card-reorder-id", (_sourceId, targetId, draggedIds) => {
    const targetIndex = cards.findIndex((card) => card.id === targetId);
    const draggedCards = cards.filter((card) => draggedIds.includes(card.id));
    if (draggedCards.length && targetIndex >= 0) onReorderCards(draggedCards, targetIndex);
  }, !editing || busy, {
    getDragIds: (sourceId) => selectedIds.includes(sourceId)
      ? cards.filter((card) => selectedIds.includes(card.id)).map((card) => card.id)
      : [sourceId],
  });

  function selectCard(card: DashboardCard, shiftKey = false, toggle = false) {
    if (shiftKey && selectionAnchor) {
      const start = cards.findIndex((item) => item.id === selectionAnchor);
      const end = cards.findIndex((item) => item.id === card.id);
      if (start >= 0 && end >= 0) {
        const range = cards.slice(Math.min(start, end), Math.max(start, end) + 1).map((item) => item.id);
        setSelectedIds((current) => [...new Set([...current, ...range])]);
        return;
      }
    }
    setSelectionAnchor(card.id);
    setSelectedIds((current) => toggle
      ? current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id]
      : [card.id]);
  }

  async function runLaunch() {
    if (launching || launchCount === 0) return;
    setLaunching(true);
    try {
      setLaunchResult(await onLaunch());
    } catch {
      // The parent keeps the visible error message; the detail view remains usable.
    } finally {
      setLaunching(false);
    }
  }

  return (
    <section className="place-detail" aria-labelledby="place-detail-title">
      <header className="place-detail-header">
        <div>
          <button type="button" className="back-button" onClick={() => void handleBack()}>
            ← {backLabel}
          </button>
          <p className="eyebrow">YOUR PLACE</p>
          <h1 id="place-detail-title">{group.title}</h1>
          <p>{cards.length} 個項目{group.lastOpenedAt ? " · 最近使用過" : ""}</p>
        </div>
        <div className="place-detail-actions">
          <button
            type="button"
            className="button primary"
            disabled={busy || launching || launchCount === 0}
            onClick={() => void runLaunch()}
          >
            {launching ? "正在開啟…" : `開啟這個地方${launchCount ? ` (${launchCount})` : ""}`}
          </button>
        </div>
      </header>

      <section className={`place-resume-summary${resumeExpanded ? " is-expanded" : ""}`}>
        <button type="button" className="place-resume-toggle" aria-expanded={resumeExpanded} onClick={() => setResumeExpanded((current) => !current)}>
          <span><small>接續點</small><strong>{resumeDraft.trim() || "留下接續點"}</strong></span><span aria-hidden="true">{resumeExpanded ? "收起" : resumeDraft.trim() ? "更新" : "新增"}</span>
        </button>
        {resumeExpanded && <div className="place-resume-editor"><label className="sr-only" htmlFor="resume-note">接續點</label><textarea id="resume-note" value={resumeDraft} maxLength={2000} rows={5} autoFocus placeholder="例如：角色移動完成；下一步做跳躍動畫。" onChange={(event) => { resumeDraftRef.current = event.target.value; setResumeDraft(event.target.value); }} onBlur={() => void flushResume().catch(() => undefined)} /><div className={`save-state is-${saveState}`} role="status">{saveState === "saving" && "保存中…"}{saveState === "saved" && "已保存"}{saveState === "failed" && "保存失敗，內容仍保留在畫面上"}{saveState === "idle" && `${resumeDraft.length} / 2,000`}</div></div>}
      </section>

      <div className="place-detail-layout">
        <div className="place-main-column">
          <div className="place-section-heading">
            <div>
              <p className="eyebrow">CONTENTS</p>
              <h2>這個地方的內容</h2>
            </div>
            <div>
              <button type="button" className="button secondary" onClick={onCreateNote} disabled={busy}>
                ＋ 筆記
              </button>
              <button type="button" className="button secondary" onClick={onAddTarget} disabled={busy}>
                ＋ 項目
              </button>
            </div>
          </div>

          <div className="place-card-grid" role={editing ? "listbox" : undefined} aria-multiselectable={editing ? true : undefined}>
            {cards.map((card, index) => {
              const preview = previews[card.id];
              const widgetSummary = card.cardType === "widget" ? widgetSummaries[card.id] : null;
              const targetProblem = card.cardType === "target" && (targetStatuses[card.id] === "missing" || targetStatuses[card.id] === "unavailable");
              return (
                <article
                  className={`place-item tone-${card.tone}${targetProblem ? " is-target-missing" : ""}${selectedIds.includes(card.id) ? " is-selected" : ""}${cardReorder.draggedIds.includes(card.id) ? " is-dragging" : ""}${cardReorder.dragOverId === card.id && !cardReorder.draggedIds.includes(card.id) ? " is-drag-over" : ""}`}
                  key={card.id}
                  data-group-card-reorder-id={card.id}
                  role={editing ? "option" : undefined}
                  aria-selected={editing ? selectedIds.includes(card.id) : undefined}
                  aria-label={editing ? `${card.title}；Alt 加方向鍵可調整順序` : undefined}
                  tabIndex={editing ? 0 : undefined}
                  onClick={(event) => {
                    if (!editing || cardReorder.shouldSuppressClick()) return;
                    if ((event.target as HTMLElement).closest("button, input, select, textarea, a, [data-no-card-select]")) return;
                    selectCard(card, event.shiftKey, event.ctrlKey || event.metaKey);
                  }}
                  onKeyDown={(event) => {
                    if (!editing) return;
                    if (event.key === " " || event.key === "Enter") {
                      event.preventDefault();
                      selectCard(card, event.shiftKey, event.ctrlKey || event.metaKey);
                    } else if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowUp")) {
                      event.preventDefault();
                      onReorderCards([card], Math.max(0, index - 1));
                    } else if (event.altKey && (event.key === "ArrowRight" || event.key === "ArrowDown")) {
                      event.preventDefault();
                      onReorderCards([card], Math.min(cards.length - 1, index + 1));
                    }
                  }}
                  {...(editing ? cardReorder.bind(card.id) : {})}
                >
                  {editing ? <div className="place-item-main" aria-hidden="true">
                    <span className="item-symbol" aria-hidden="true">
                      {preview?.kind === "icon" ? (
                        <img src={preview.assetUrl} alt="" loading="lazy" decoding="async" />
                      ) : card.symbol}
                    </span>
                    <span>
                      <strong>{card.title}</strong>
                      <small>{card.cardType === "note" ? card.noteText || "空白筆記" : card.cardType === "widget" ? widgetSummary?.primaryValue ?? "載入中…" : card.subtitle}</small>
                    </span>
                  </div> : <button type="button" className="place-item-main" onClick={() => onOpenCard(card)}>
                    <span className="item-symbol" aria-hidden="true">
                      {preview?.kind === "icon" ? <img src={preview.assetUrl} alt="" loading="lazy" decoding="async" /> : card.symbol}
                    </span>
                    <span><strong>{card.title}</strong><small>{card.cardType === "note" ? card.noteText || "空白筆記" : card.cardType === "widget" ? widgetSummary?.primaryValue ?? "載入中…" : card.subtitle}</small></span>
                  </button>}
                  {editing && selectedIds.includes(card.id) && card.cardType === "target" && (
                    <label className="launch-toggle">
                      <input
                        type="checkbox"
                        checked={card.launchEnabled}
                        disabled={busy}
                        onChange={(event) => {
                          void onSetLaunchEnabled(card, event.target.checked).catch(() => undefined);
                        }}
                      />
                      一次開啟
                    </label>
                  )}
                  {targetProblem && (
                    <button type="button" className="repair-target-button" data-no-card-select onClick={() => onRepairCard(card)}>
                      ! 重新定位
                    </button>
                  )}
                </article>
              );
            })}
            {cards.length === 0 && (
              <div className="place-empty">
                <span aria-hidden="true">◇</span>
                <h2>這個地方還是空的</h2>
                <p>加入相關 App、網站、檔案或一張簡短筆記。</p>
              </div>
            )}
          </div>

          {editing && selectedCards.length > 0 && <div className="context-action-bar place-action-bar" role="toolbar" aria-label="所選項目操作">
            <strong>{selectedCards.length} 個項目</strong>
            {selectedCards.length === 1 && <button type="button" onClick={() => onEditCard(selectedCards[0])}>改名與外觀</button>}
            <button type="button" onClick={() => onMoveOutCards(selectedCards)}>移出這個地方</button>
            <button type="button" className="danger-text" onClick={() => onDeleteCards(selectedCards)}>移除</button>
            <button type="button" aria-label="清除選取" onClick={() => setSelectedIds([])}>×</button>
          </div>}
        </div>

        {launchResult && <aside className="place-context-panel">
          {(
            <section className="launch-result-panel" aria-label="開啟結果">
              <div>
                <strong>開啟結果</strong>
                <button type="button" onClick={() => setLaunchResult(null)}>關閉</button>
              </div>
              <ul>
                {launchResult.items.map((item) => {
                  const failedCard = cards.find((card) => card.id === item.cardId);
                  const canRepair =
                    failedCard?.kind === "local" &&
                    (item.status === "missing" || item.status === "failed");
                  return (
                    <li className={`is-${item.status}`} key={item.cardId}>
                      <span>{launchLabels[item.status]}</span>
                      <strong>{item.title}</strong>
                      {item.message && <small>{item.message}</small>}
                      {canRepair && failedCard && (
                        <button type="button" onClick={() => onRepairCard(failedCard)}>
                          重新定位
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {launchResult.stateError && <p>{launchResult.stateError}</p>}
            </section>
          )}
        </aside>
        }
      </div>
    </section>
  );
}
