import { useState } from "react";
import type { DashboardCard, ItemSize, ItemTone } from "../types";
import { useModalFocus } from "../lib/accessibility";

export interface CardEditValues {
  title: string;
  subtitle: string;
  tone: ItemTone;
  size: ItemSize;
}

interface CardEditDialogProps {
  item: DashboardCard;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (values: CardEditValues) => void;
  onReset?: () => void;
}

const tones: Array<{ value: ItemTone; label: string }> = [
  { value: "cyan", label: "青藍" },
  { value: "violet", label: "紫色" },
  { value: "amber", label: "琥珀" },
  { value: "rose", label: "玫瑰" },
  { value: "slate", label: "灰藍" },
];

export function CardEditDialog({
  item,
  busy,
  error,
  onClose,
  onSave,
  onReset,
}: CardEditDialogProps) {
  const [title, setTitle] = useState(item.title);
  const [subtitle, setSubtitle] = useState(item.subtitle);
  const [tone, setTone] = useState<ItemTone>(item.tone);
  const [size, setSize] = useState<ItemSize>(item.size);
  const dialogRef = useModalFocus<HTMLElement>(true, onClose);

  return (
    <div className="dialog-backdrop" onMouseDown={onClose}>
      <section
        ref={dialogRef}
        tabIndex={-1}
        className="dialog card-edit-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="card-edit-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-header">
          <div>
            <p className="eyebrow">CARD APPEARANCE</p>
            <h2 id="card-edit-title">編輯卡片</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="關閉編輯視窗">
            ×
          </button>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSave({ title: title.trim(), subtitle: subtitle.trim(), tone, size });
          }}
        >
          <label>
            顯示名稱
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={200}
              required
              autoFocus
            />
          </label>
          <label>
            副標題
            <input
              value={subtitle}
              onChange={(event) => setSubtitle(event.target.value)}
              maxLength={500}
            />
          </label>
          <div className="appearance-grid">
            <label>
              色調
              <select value={tone} onChange={(event) => setTone(event.target.value as ItemTone)}>
                {tones.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              卡片大小
              <select value={size} onChange={(event) => setSize(event.target.value as ItemSize)}>
                <option value="square">標準</option>
                <option value="wide">寬版</option>
              </select>
            </label>
          </div>

          {error && <p className="form-error" role="alert">{error}</p>}

          <div className="dialog-actions split-actions">
            {onReset ? (
              <button type="button" className="button ghost" disabled={busy} onClick={onReset}>
                重設為自動值
              </button>
            ) : <span />}
            <span />
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button type="submit" className="button primary" disabled={busy || title.trim().length === 0}>
              {busy ? "保存中…" : "保存"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
