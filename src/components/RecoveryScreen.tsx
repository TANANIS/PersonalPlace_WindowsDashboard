import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { BackupPreview, RecoveryInfo } from "../lib/platform";
import { platformErrorMessage } from "../lib/platform";

interface RecoveryScreenProps {
  info: RecoveryInfo;
  onInspect: (path: string) => Promise<BackupPreview>;
  onRecover: (path: string) => Promise<void>;
  onOpenBackupFolder: () => Promise<void>;
}

export function RecoveryScreen({ info, onInspect, onRecover, onOpenBackupFolder }: RecoveryScreenProps) {
  const [backupPath, setBackupPath] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function chooseBackup() {
    setError(null);
    const selected = await open({
      directory: false,
      multiple: false,
      title: "選擇 Personal Place 備份",
      filters: [{ name: "Personal Place 備份", extensions: ["personal-place"] }],
    });
    if (typeof selected !== "string") return;
    setBusy(true);
    try {
      setPreview(await onInspect(selected));
      setBackupPath(selected);
    } catch (nextError) {
      setPreview(null);
      setBackupPath(null);
      setError(platformErrorMessage(nextError, "這份備份無法使用。"));
    } finally {
      setBusy(false);
    }
  }

  async function recoverNow() {
    if (!backupPath || !preview || busy) return;
    if (!window.confirm("復原會取代目前無法開啟的資料庫；原始檔案會先保存到復原備份資料夾。要繼續嗎？")) return;
    setBusy(true);
    setError(null);
    try {
      await onRecover(backupPath);
    } catch (nextError) {
      setError(platformErrorMessage(nextError, "復原失敗，原始資料沒有被取代。"));
      setBusy(false);
    }
  }

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText(info.technicalError);
      setCopied(true);
    } catch {
      setError("無法複製錯誤資訊，請手動選取下方內容。");
    }
  }

  return (
    <main className="recovery-screen">
      <section className="recovery-panel" aria-labelledby="recovery-title">
        <div className="recovery-mark" aria-hidden="true">!</div>
        <p className="eyebrow">LOCAL DATA RECOVERY</p>
        <h1 id="recovery-title">Personal Place 無法開啟資料</h1>
        <p className="recovery-lead">我們沒有建立空白資料，也沒有覆寫原始檔案。你可以從先前匯出的備份安全復原。</p>
        <div className="recovery-actions">
          <button type="button" className="button primary" disabled={busy} onClick={() => void chooseBackup()}>選擇備份復原</button>
          <button type="button" className="button secondary" disabled={busy} onClick={() => void onOpenBackupFolder().catch((nextError) => setError(platformErrorMessage(nextError, "無法開啟備份資料夾。")))}>開啟備份資料夾</button>
        </div>
        {preview && (
          <section className="recovery-preview" aria-label="備份內容預覽">
            <strong>備份可以使用</strong>
            <p>{preview.pageCount} 個頁面 · {preview.cardCount} 張卡片 · {preview.groupCount} 個地方 · {preview.noteCount} 張筆記</p>
            <small>格式 v{preview.formatVersion} · 由 Personal Place {preview.appVersion} 匯出</small>
            <button type="button" className="button danger" disabled={busy} onClick={() => void recoverNow()}>{busy ? "正在安全復原…" : "取代並重新啟動"}</button>
          </section>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <details className="recovery-details">
          <summary>技術錯誤資訊</summary>
          <pre>{info.technicalError}</pre>
          <button type="button" className="text-button" onClick={() => void copyDetails()}>{copied ? "已複製" : "複製錯誤資訊"}</button>
        </details>
        <p className="recovery-path">復原備份位置：{info.backupFolder}</p>
      </section>
    </main>
  );
}
