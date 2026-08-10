import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open, save } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BackupDialog } from "./BackupDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn(), save: vi.fn() }));

const preview = { formatVersion: 1, appVersion: "0.8.0", exportedAt: "1", pageCount: 3, cardCount: 12, groupCount: 2, noteCount: 1, targetCount: 9 };

describe("BackupDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("匯出時補上副檔名並顯示持久結果", async () => {
    vi.mocked(save).mockResolvedValue("D:\\Backup\\place");
    const onExport = vi.fn().mockResolvedValue({ path: "D:\\Backup\\place.personal-place", preview });
    const user = userEvent.setup();
    render(<BackupDialog onClose={vi.fn()} onExport={onExport} onInspect={vi.fn()} onRestore={vi.fn()} onRestored={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "選擇保存位置" }));
    await waitFor(() => expect(onExport).toHaveBeenCalledWith("D:\\Backup\\place.personal-place"));
    expect(screen.getByRole("status")).toHaveTextContent("3 個頁面");
  });

  it("先預覽備份，確認後才取代資料", async () => {
    vi.mocked(open).mockResolvedValue("D:\\Backup\\place.personal-place");
    const onInspect = vi.fn().mockResolvedValue(preview);
    const restored = { dashboard: { pages: [], cards: [] }, safetyBackupPath: "D:\\automatic\\safe.db" };
    const onRestore = vi.fn().mockResolvedValue(restored);
    const onRestored = vi.fn();
    const user = userEvent.setup();
    render(<BackupDialog onClose={vi.fn()} onExport={vi.fn()} onInspect={onInspect} onRestore={onRestore} onRestored={onRestored} />);
    await user.click(screen.getByRole("button", { name: "選擇備份檔" }));
    expect(await screen.findByText(/12 張卡片/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取代目前資料" }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith("D:\\Backup\\place.personal-place"));
    expect(onRestored).toHaveBeenCalledWith(restored);
  });
});
