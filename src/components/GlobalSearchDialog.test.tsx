import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DashboardSearchResult } from "../lib/platform";
import { GlobalSearchDialog } from "./GlobalSearchDialog";

const result: DashboardSearchResult = {
  id: "card-unity",
  resultType: "target",
  title: "Unity",
  subtitle: "Unity Hub",
  pageId: "learning",
  pageName: "學習",
  groupId: "group-unity",
  groupName: "Unity 學習",
  cardType: "target",
  score: 0,
};

describe("GlobalSearchDialog", () => {
  it("搜尋所有地方、顯示路徑並可用 Enter 開啟", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn().mockResolvedValue([result]);
    const onChoose = vi.fn();
    render(<GlobalSearchDialog onClose={vi.fn()} onSearch={onSearch} onChoose={onChoose} />);

    const input = screen.getByPlaceholderText("搜尋所有頁面、地方、卡片與筆記");
    await user.type(input, "Unity");
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith("Unity"));
    expect(await screen.findByText("學習 › Unity 學習")).toBeInTheDocument();
    await user.type(input, "{Enter}");
    expect(onChoose).toHaveBeenCalledWith(result);
  });

  it("Escape 會關閉搜尋", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<GlobalSearchDialog onClose={onClose} onSearch={vi.fn()} onChoose={vi.fn()} />);
    await user.type(screen.getByPlaceholderText("搜尋所有頁面、地方、卡片與筆記"), "{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
  });
});
