import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RecoveryScreen } from "./RecoveryScreen";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const preview = { formatVersion: 1, appVersion: "0.8.0", exportedAt: "1", pageCount: 2, cardCount: 8, groupCount: 1, noteCount: 1, targetCount: 6 };

describe("RecoveryScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(window, "confirm").mockReturnValue(true);
  });

  it("不建立空白資料，驗證備份後才允許復原", async () => {
    vi.mocked(open).mockResolvedValue("D:\\Backup\\safe.personal-place");
    const onInspect = vi.fn().mockResolvedValue(preview);
    const onRecover = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RecoveryScreen info={{ technicalError: "database disk image is malformed", backupFolder: "D:\\Recovery" }} onInspect={onInspect} onRecover={onRecover} onOpenBackupFolder={vi.fn()} />);
    expect(screen.getByText(/沒有建立空白資料/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "選擇備份復原" }));
    expect(await screen.findByText(/8 張卡片/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "取代並重新啟動" }));
    await waitFor(() => expect(onRecover).toHaveBeenCalledWith("D:\\Backup\\safe.personal-place"));
  });

  it("可開啟備份資料夾並查看技術錯誤", async () => {
    const onOpenBackupFolder = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RecoveryScreen info={{ technicalError: "locked database", backupFolder: "D:\\Recovery" }} onInspect={vi.fn()} onRecover={vi.fn()} onOpenBackupFolder={onOpenBackupFolder} />);
    await user.click(screen.getByRole("button", { name: "開啟備份資料夾" }));
    expect(onOpenBackupFolder).toHaveBeenCalledOnce();
    await user.click(screen.getByText("技術錯誤資訊"));
    expect(screen.getByText("locked database")).toBeInTheDocument();
  });
});
