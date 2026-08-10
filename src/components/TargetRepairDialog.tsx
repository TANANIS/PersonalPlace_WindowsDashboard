import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { DashboardCard } from "../types";

interface TargetRepairDialogProps {
  card: DashboardCard;
  busy: boolean;
  error: string | null;
  onRelink: (path: string) => Promise<void>;
  onRemove: () => void;
  onClose: () => void;
}

export function TargetRepairDialog({
  card,
  busy,
  error,
  onRelink,
  onRemove,
  onClose,
}: TargetRepairDialogProps) {
  const [choosing, setChoosing] = useState(false);

  async function choose(directory: boolean) {
    if (busy || choosing) return;
    setChoosing(true);
    try {
      const selected = await open({
        directory,
        multiple: false,
        title: directory ? "選擇新的資料夾位置" : "選擇新的檔案位置",
      });
      if (typeof selected === "string") await onRelink(selected);
    } catch {
      // The parent keeps a visible, retryable error in this dialog.
    } finally {
      setChoosing(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="dialog repair-dialog" role="dialog" aria-modal="true" aria-labelledby="repair-title">
        <div className="dialog-header">
          <div>
            <p className="eyebrow">TARGET MISSING</p>
            <h2 id="repair-title">重新定位「{card.title}」</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy || choosing}>×</button>
        </div>
        <div className="repair-message">
          <span aria-hidden="true">!</span>
          <div>
            <strong>原本的本機位置已找不到或無法存取</strong>
            <p>卡片、群組、順序、尺寸與一次開啟設定都會保留，只更新它指向的位置。</p>
          </div>
        </div>
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="repair-choices">
          <button type="button" className="button primary" disabled={busy || choosing} onClick={() => void choose(false)}>選擇檔案</button>
          <button type="button" className="button secondary" disabled={busy || choosing} onClick={() => void choose(true)}>選擇資料夾</button>
        </div>
        <div className="dialog-actions repair-footer">
          <button type="button" className="button secondary" onClick={onClose} disabled={busy || choosing}>稍後處理</button>
          <button type="button" className="button danger" onClick={onRemove} disabled={busy || choosing}>移除卡片</button>
        </div>
      </section>
    </div>
  );
}
