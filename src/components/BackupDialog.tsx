import { open, save } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type {
  BackupPreview,
  ExportBackupResult,
  RestoreBackupResult,
} from "../lib/platform";
import { platformErrorMessage } from "../lib/platform";

interface BackupDialogProps {
  onClose: () => void;
  onExport: (path: string) => Promise<ExportBackupResult>;
  onInspect: (path: string) => Promise<BackupPreview>;
  onRestore: (path: string) => Promise<RestoreBackupResult>;
  onRestored: (result: RestoreBackupResult) => void;
}

export function BackupDialog({
  onClose,
  onExport,
  onInspect,
  onRestore,
  onRestored,
}: BackupDialogProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restorePath, setRestorePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<BackupPreview | null>(null);

  async function exportNow() {
    setError(null);
    const destination = await save({
      title: "匯出 Personal Place 備份",
      defaultPath: "Personal-Place-backup.personal-place",
      filters: [{ name: "Personal Place 備份", extensions: ["personal-place"] }],
    });
    if (typeof destination !== "string") return;
    const path = destination.toLowerCase().endsWith(".personal-place")
      ? destination
      : `${destination}.personal-place`;
    setBusy(true);
    try {
      const result = await onExport(path);
      setMessage(`已匯出 ${result.preview.pageCount} 個頁面、${result.preview.cardCount} 張卡片。`);
    } catch (nextError) {
      setError(platformErrorMessage(nextError, "無法匯出備份。"));
    } finally {
      setBusy(false);
    }
  }

  async function chooseRestore() {
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
      setRestorePath(selected);
      setMessage(null);
    } catch (nextError) {
      setError(platformErrorMessage(nextError, "這份備份無法使用。"));
    } finally {
      setBusy(false);
    }
  }

  async function restoreNow() {
    if (!restorePath || !preview || busy) return;
    if (!window.confirm("還原會取代目前所有頁面與卡片。還原前會自動建立安全備份，確定繼續嗎？")) return;
    setBusy(true);
    setError(null);
    try {
      const result = await onRestore(restorePath);
      onRestored(result);
      setMessage(`還原完成。安全備份：${result.safetyBackupPath}`);
      setRestorePath(null);
      setPreview(null);
    } catch (nextError) {
      setError(platformErrorMessage(nextError, "還原失敗，目前資料保持不變。"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop">
      <section className="dialog backup-dialog" role="dialog" aria-modal="true" aria-labelledby="backup-title">
        <div className="dialog-header">
          <div><p className="eyebrow">LOCAL DATA</p><h2 id="backup-title">備份與還原</h2></div>
          <button type="button" className="icon-button" onClick={onClose} disabled={busy}>×</button>
        </div>
        <div className="backup-warning">
          <strong>備份可能包含這台電腦的絕對路徑</strong>
          <p>請像保管其他私人資料一樣妥善保存 `.personal-place` 檔案。衍生縮圖不會匯出。</p>
        </div>
        <div className="backup-actions-grid">
          <article><span aria-hidden="true">⇩</span><div><strong>匯出備份</strong><p>保存頁面、卡片、群組、筆記與啟動設定。</p></div><button type="button" className="button primary" disabled={busy} onClick={() => void exportNow()}>選擇保存位置</button></article>
          <article><span aria-hidden="true">⇧</span><div><strong>從備份還原</strong><p>先驗證與預覽內容，再取代目前資料。</p></div><button type="button" className="button secondary" disabled={busy} onClick={() => void chooseRestore()}>選擇備份檔</button></article>
        </div>
        {preview && (
          <section className="restore-preview">
            <strong>備份內容預覽</strong>
            <p>{preview.pageCount} 個頁面 · {preview.cardCount} 張卡片 · {preview.groupCount} 個地方 · {preview.noteCount} 張筆記</p>
            <small>格式 v{preview.formatVersion} · 由 Personal Place {preview.appVersion} 匯出</small>
            <button type="button" className="button danger" disabled={busy} onClick={() => void restoreNow()}>取代目前資料</button>
          </section>
        )}
        {message && <p className="backup-success" role="status">{message}</p>}
        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>完成</button></div>
      </section>
    </div>
  );
}
