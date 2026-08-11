import type { DashboardCard } from "../types";
import { zhTW } from "../i18n/zh-TW";
import { useModalFocus } from "../lib/accessibility";

interface NoteViewDialogProps {
  note: DashboardCard;
  onEdit: () => void;
  onClose: () => void;
}

export function NoteViewDialog({ note, onEdit, onClose }: NoteViewDialogProps) {
  const dialogRef = useModalFocus<HTMLElement>(true, onClose);
  const content = note.noteText.trim();

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="dialog note-view-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="note-view-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">NOTE</p>
            <h2 id="note-view-title">{note.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label={zhTW.notes.closeViewer}>×</button>
        </div>
        <div className={`note-view-content${content ? "" : " is-empty"}`}>
          {content || zhTW.notes.empty}
        </div>
        <div className="dialog-actions note-view-actions">
          <button type="button" className="button secondary" onClick={onClose}>{zhTW.notes.close}</button>
          <button type="button" className="button primary" onClick={onEdit}>{zhTW.notes.edit}</button>
        </div>
      </section>
    </div>
  );
}
