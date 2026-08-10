interface UndoBarProps {
  busy: boolean;
  message: string;
  onUndo: () => void;
  onDismiss: () => void;
}

export function UndoBar({ busy, message, onUndo, onDismiss }: UndoBarProps) {
  return (
    <div className="undo-bar" role="status">
      <span>{message}</span>
      <button type="button" disabled={busy} onClick={onUndo}>
        {busy ? "復原中…" : "復原"}
      </button>
      <button type="button" className="undo-dismiss" aria-label="關閉復原提示" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
