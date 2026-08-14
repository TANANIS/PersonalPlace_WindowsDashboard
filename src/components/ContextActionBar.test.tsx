import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ContextActionBar } from "./ContextActionBar";
import type { DashboardCard, Page } from "../types";

const pages: Page[] = [
  { id: "home", name: "我的地方", symbol: "⌂" },
  { id: "learn", name: "學習", symbol: "◇" },
];

function card(id: string, cardType: DashboardCard["cardType"] = "target"): DashboardCard {
  return {
    id,
    pageId: "home",
    parentGroupId: null,
    cardType,
    targetId: cardType === "target" ? `target-${id}` : null,
    title: id,
    subtitle: "",
    kind: cardType === "target" ? "app" : cardType === "group" ? "group" : "note",
    symbol: "◆",
    tone: "cyan",
    size: "square",
    position: 0,
    noteText: "",
    resumeNote: "",
    launchEnabled: false,
    lastOpenedAt: null,
  };
}

function renderBar(selected: DashboardCard[]) {
  const props = {
    selected,
    pages,
    groups: [card("群組", "group")],
    currentPageId: "home",
    busy: false,
    canGroup: true,
    onClear: vi.fn(),
    onEdit: vi.fn(),
    onResize: vi.fn(),
    onCreateGroup: vi.fn(),
    onMoveToPage: vi.fn(),
    onMoveToGroup: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<ContextActionBar {...props} />);
  return props;
}

describe("ContextActionBar", () => {
  it("單選只顯示單卡操作", () => {
    const selected = card("Unity");
    const props = renderBar([selected]);
    fireEvent.click(screen.getByRole("button", { name: "編輯" }));
    fireEvent.click(screen.getByRole("button", { name: "改為寬版" }));
    expect(props.onEdit).toHaveBeenCalledWith(selected);
    expect(props.onResize).toHaveBeenCalledWith(selected);
    expect(screen.queryByRole("button", { name: "建立 Place" })).not.toBeInTheDocument();
  });

  it("多選提供群組與批次移動", () => {
    const props = renderBar([card("Unity"), card("VS Code")]);
    fireEvent.click(screen.getByRole("button", { name: "建立 Place" }));
    fireEvent.change(screen.getByLabelText("移到頁面"), { target: { value: "learn" } });
    expect(props.onCreateGroup).toHaveBeenCalledOnce();
    expect(props.onMoveToPage).toHaveBeenCalledWith("learn");
  });
});
