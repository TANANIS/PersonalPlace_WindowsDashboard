import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { open } from "@tauri-apps/plugin-dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardCard } from "../types";
import { TargetRepairDialog } from "./TargetRepairDialog";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const card: DashboardCard = {
  id: "missing-app", pageId: "home", parentGroupId: null, cardType: "target",
  targetId: "target-missing", title: "遺失的 App", subtitle: "C:\\Old\\App.exe",
  kind: "local", symbol: "↗", tone: "cyan", size: "square", position: 0,
  noteText: "", resumeNote: "", launchEnabled: false, lastOpenedAt: null,
};

describe("TargetRepairDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("選擇新檔案只更新目標並保留可見錯誤", async () => {
    vi.mocked(open).mockResolvedValue("C:\\New\\App.exe");
    const onRelink = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<TargetRepairDialog card={card} busy={false} error="先前定位失敗" onRelink={onRelink} onRemove={vi.fn()} onClose={vi.fn()} />);
    expect(screen.getByRole("alert")).toHaveTextContent("先前定位失敗");
    await user.click(screen.getByRole("button", { name: "選擇檔案" }));
    await waitFor(() => expect(onRelink).toHaveBeenCalledWith("C:\\New\\App.exe"));
    expect(open).toHaveBeenCalledWith(expect.objectContaining({ directory: false }));
  });

  it("提供稍後處理與移除卡片", async () => {
    const onClose = vi.fn();
    const onRemove = vi.fn();
    const user = userEvent.setup();
    render(<TargetRepairDialog card={card} busy={false} error={null} onRelink={vi.fn()} onRemove={onRemove} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "稍後處理" }));
    await user.click(screen.getByRole("button", { name: "移除卡片" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledOnce();
  });
});
