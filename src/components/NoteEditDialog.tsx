import { useEffect, useRef, useState } from "react";
import type { DashboardCard, ItemSize } from "../types";
import { zhTW } from "../i18n/zh-TW";
import { useModalFocus } from "../lib/accessibility";

interface NoteEditDialogProps {
  note: DashboardCard;
  busy: boolean;
  onSaveText: (value: string) => Promise<void>;
  onSaveAppearance: (title: string, size: ItemSize) => Promise<void>;
  onClose: () => void;
}

type SaveState = "idle" | "saving" | "saved" | "failed";

export function NoteEditDialog({
  note,
  busy,
  onSaveText,
  onSaveAppearance,
  onClose,
}: NoteEditDialogProps) {
  const [title, setTitle] = useState(note.title);
  const [size, setSize] = useState<ItemSize>(note.size);
  const [text, setText] = useState(note.noteText);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const savedTextRef = useRef(note.noteText);
  const dialogRef = useModalFocus<HTMLElement>(true, onClose);

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

  useEffect(() => {
    if (text === savedTextRef.current) return;
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
  }, [onSaveText, text]);

  async function saveAndClose() {
    if (!title.trim() || busy || saveState === "saving") return;
    if (!(await savePendingText())) return;
    try {
      await onSaveAppearance(title.trim(), size);
      onClose();
    } catch {
      // The parent surfaces the error and keeps this dialog open for retry.
    }
  }

  async function returnAfterSaving() {
    if (busy || saveState === "saving") return;
    if (await savePendingText()) onClose();
  }

  return (
    <div className="dialog-backdrop">
      <section ref={dialogRef} tabIndex={-1} className="dialog note-dialog" role="dialog" aria-modal="true" aria-labelledby="note-dialog-title">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">NOTE</p>
            <h2 id="note-dialog-title">編輯筆記</h2>
          </div>
          <button type="button" className="icon-button" onClick={() => void returnAfterSaving()} disabled={busy || saveState === "saving"} aria-label={zhTW.notes.returnToViewer}>×</button>
        </div>
        <label>
          名稱
          <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          尺寸
          <select value={size} onChange={(event) => setSize(event.target.value as ItemSize)}>
            <option value="square">方形</option>
            <option value="wide">寬版</option>
          </select>
        </label>
        <label>
          內容
          <textarea
            value={text}
            maxLength={10000}
            rows={12}
            autoFocus
            placeholder="寫下一段簡短內容…"
            onChange={(event) => setText(event.target.value)}
          />
        </label>
        <div className={`save-state is-${saveState}`} role="status">
          {saveState === "saving" ? "內容保存中…" : saveState === "saved" ? "內容已保存" : saveState === "failed" ? "保存失敗，請稍後重試" : `${text.length} / 10,000`}
        </div>
        <div className="dialog-actions">
          <button type="button" className="button secondary" onClick={() => void returnAfterSaving()} disabled={busy || saveState === "saving"}>{zhTW.notes.returnToViewer}</button>
          <button type="button" className="button primary" onClick={() => void saveAndClose()} disabled={busy || saveState === "saving" || !title.trim()}>{zhTW.notes.saveAndReturn}</button>
        </div>
      </section>
    </div>
  );
}
