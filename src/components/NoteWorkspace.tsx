import { useEffect, useRef, useState } from "react";
import type { DashboardCard, ItemSize } from "../types";

interface NoteWorkspaceProps {
  note: DashboardCard;
  busy: boolean;
  startEditing?: boolean;
  backLabel?: string;
  onBack: () => void;
  onSaveText: (value: string) => Promise<void>;
  onSaveAppearance: (title: string, size: ItemSize) => Promise<void>;
}

type SaveState = "idle" | "saving" | "saved" | "failed";

export function NoteWorkspace({
  note,
  busy,
  startEditing = false,
  backLabel = "返回頁面",
  onBack,
  onSaveText,
  onSaveAppearance,
}: NoteWorkspaceProps) {
  const [editing, setEditing] = useState(startEditing);
  const [title, setTitle] = useState(note.title);
  const [size, setSize] = useState<ItemSize>(note.size);
  const [text, setText] = useState(note.noteText);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTextRef = useRef(note.noteText);

  useEffect(() => {
    setEditing(startEditing);
    setTitle(note.title);
    setSize(note.size);
    setText(note.noteText);
    setSaveState("idle");
    savedTextRef.current = note.noteText;
  }, [note.id, note.noteText, note.size, note.title, startEditing]);

  useEffect(() => {
    if (!editing || text === savedTextRef.current) return;
    setSaveState("idle");
    const timer = window.setTimeout(() => {
      setSaveState("saving");
      void onSaveText(text)
        .then(() => {
          savedTextRef.current = text;
          setSaveState("saved");
        })
        .catch(() => setSaveState("failed"));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [editing, onSaveText, text]);

  async function savePendingText(): Promise<boolean> {
    if (text === savedTextRef.current) return true;
    setSaveState("saving");
    try {
      await onSaveText(text);
      savedTextRef.current = text;
      setSaveState("saved");
      return true;
    } catch {
      setSaveState("failed");
      return false;
    }
  }

  async function finishEditing() {
    if (busy || saveState === "saving" || !title.trim()) return;
    if (!(await savePendingText())) return;
    try {
      await onSaveAppearance(title.trim(), size);
      setEditing(false);
    } catch {
      setSaveState("failed");
    }
  }

  return (
    <section className="content-workspace note-workspace" aria-labelledby="note-workspace-title">
      <header className="workspace-view-header">
        <div>
          <button type="button" className="back-button" onClick={editing ? () => void finishEditing() : onBack}>
            {editing ? "← 返回閱讀" : `← ${backLabel}`}
          </button>
          <p className="eyebrow">NOTE</p>
          <h1 id="note-workspace-title">{editing ? "編輯筆記" : title}</h1>
        </div>
        {!editing && <button type="button" className="button primary" onClick={() => setEditing(true)}>編輯</button>}
      </header>

      {editing ? (
        <div className="note-editor-workspace">
          <div className="note-editor-meta">
            <label>名稱<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} /></label>
            <label>卡片尺寸<select value={size} onChange={(event) => setSize(event.target.value as ItemSize)}><option value="square">方形</option><option value="wide">寬版</option></select></label>
          </div>
          <label className="note-editor-body">
            <span className="sr-only">內容</span>
            <textarea value={text} maxLength={10000} autoFocus placeholder="寫下一段內容…" onChange={(event) => setText(event.target.value)} />
          </label>
          <footer className="note-editor-footer">
            <span className={`save-state is-${saveState}`} role="status">
              {saveState === "saving" ? "內容保存中…" : saveState === "saved" ? "內容已保存" : saveState === "failed" ? "保存失敗，內容仍保留在畫面上" : `${text.length} / 10,000`}
            </span>
            <button type="button" className="button primary" disabled={busy || saveState === "saving" || !title.trim()} onClick={() => void finishEditing()}>完成編輯</button>
          </footer>
        </div>
      ) : (
        <article className="note-reader">
          {text.trim() ? <p>{text}</p> : <div className="note-reader-empty"><span aria-hidden="true">≡</span><strong>空白筆記</strong><small>點擊編輯開始記錄。</small></div>}
        </article>
      )}
    </section>
  );
}
