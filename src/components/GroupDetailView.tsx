import { useEffect, useMemo, useRef, useState } from "react";
import type {
  GroupLaunchResult,
  LauncherPreview,
} from "../lib/platform";
import type { DashboardCard } from "../types";

interface GroupDetailViewProps {
  group: DashboardCard;
  cards: DashboardCard[];
  previews: Record<string, LauncherPreview>;
  editing: boolean;
  busy: boolean;
  onBack: () => void;
  onToggleEditing: () => void;
  onAddTarget: () => void;
  onCreateNote: () => void;
  onOpenCard: (card: DashboardCard) => void;
  onEditCard: (card: DashboardCard) => void;
  onMoveOut: (card: DashboardCard) => void;
  onDeleteCard: (card: DashboardCard) => void;
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
  editing,
  busy,
  onBack,
  onToggleEditing,
  onAddTarget,
  onCreateNote,
  onOpenCard,
  onEditCard,
  onMoveOut,
  onDeleteCard,
  onSetLaunchEnabled,
  onSaveResume,
  onLaunch,
}: GroupDetailViewProps) {
  const [resumeDraft, setResumeDraft] = useState(group.resumeNote);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [launching, setLaunching] = useState(false);
  const [launchResult, setLaunchResult] = useState<GroupLaunchResult | null>(null);
  const savedValueRef = useRef(group.resumeNote);

  useEffect(() => {
    setResumeDraft(group.resumeNote);
    savedValueRef.current = group.resumeNote;
    setSaveState("idle");
    setLaunchResult(null);
  }, [group.id]);

  useEffect(() => {
    if (resumeDraft === savedValueRef.current) return;
    setSaveState("saving");
    const timer = window.setTimeout(() => {
      void onSaveResume(resumeDraft)
        .then(() => {
          savedValueRef.current = resumeDraft;
          setSaveState("saved");
        })
        .catch(() => setSaveState("failed"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [onSaveResume, resumeDraft]);

  const launchCount = useMemo(
    () => cards.filter((card) => card.cardType === "target" && card.launchEnabled).length,
    [cards],
  );

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
          <button type="button" className="back-button" onClick={onBack}>
            ← 返回頁面
          </button>
          <p className="eyebrow">YOUR PLACE</p>
          <h1 id="place-detail-title">{group.title}</h1>
          <p>{cards.length} 個項目{group.lastOpenedAt ? " · 最近使用過" : ""}</p>
        </div>
        <div className="place-detail-actions">
          <button type="button" className="button secondary" onClick={onToggleEditing}>
            {editing ? "完成整理" : "整理這裡"}
          </button>
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

          <div className="place-card-grid">
            {cards.map((card) => {
              const preview = previews[card.id];
              return (
                <article className={`place-item tone-${card.tone}`} key={card.id}>
                  <button
                    type="button"
                    className="place-item-main"
                    onClick={() => onOpenCard(card)}
                  >
                    <span className="item-symbol" aria-hidden="true">
                      {preview?.kind === "icon" ? (
                        <img src={preview.dataUrl} alt="" />
                      ) : card.symbol}
                    </span>
                    <span>
                      <strong>{card.title}</strong>
                      <small>{card.cardType === "note" ? card.noteText || "空白筆記" : card.subtitle}</small>
                    </span>
                  </button>
                  {card.cardType === "target" && (
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
                  {editing && (
                    <div className="place-item-controls">
                      <button type="button" onClick={() => onEditCard(card)}>編輯</button>
                      <button type="button" onClick={() => onMoveOut(card)}>移出</button>
                      <button type="button" className="danger-text" onClick={() => onDeleteCard(card)}>移除</button>
                    </div>
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
        </div>

        <aside className="place-context-panel">
          <label htmlFor="resume-note">上次做到這裡</label>
          <textarea
            id="resume-note"
            value={resumeDraft}
            maxLength={2000}
            rows={8}
            placeholder="例如：角色移動完成，下一步做跳躍動畫。"
            onChange={(event) => setResumeDraft(event.target.value)}
          />
          <div className={`save-state is-${saveState}`} role="status">
            {saveState === "saving" && "保存中…"}
            {saveState === "saved" && "已保存"}
            {saveState === "failed" && "保存失敗，內容仍保留在畫面上"}
            {saveState === "idle" && `${resumeDraft.length} / 2,000`}
          </div>

          {launchResult && (
            <section className="launch-result-panel" aria-label="開啟結果">
              <div>
                <strong>開啟結果</strong>
                <button type="button" onClick={() => setLaunchResult(null)}>關閉</button>
              </div>
              <ul>
                {launchResult.items.map((item) => (
                  <li className={`is-${item.status}`} key={item.cardId}>
                    <span>{launchLabels[item.status]}</span>
                    <strong>{item.title}</strong>
                    {item.message && <small>{item.message}</small>}
                  </li>
                ))}
              </ul>
              {launchResult.stateError && <p>{launchResult.stateError}</p>}
            </section>
          )}
        </aside>
      </div>
    </section>
  );
}
