import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroupDetailView } from "./GroupDetailView";
import type { DashboardCard } from "../types";

function card(overrides: Partial<DashboardCard>): DashboardCard {
  return {
    id: "card-1",
    pageId: "home",
    parentGroupId: "group-1",
    cardType: "target",
    targetId: "target-1",
    title: "Unity",
    subtitle: "桌面應用程式",
    kind: "app",
    symbol: "◆",
    tone: "violet",
    size: "square",
    position: 0,
    noteText: "",
    resumeNote: "",
    launchEnabled: false,
    lastOpenedAt: null,
    ...overrides,
  };
}

const group = card({
  id: "group-1",
  parentGroupId: null,
  cardType: "group",
  targetId: null,
  title: "Unity 學習",
  kind: "group",
});

function renderView(overrides: Record<string, unknown> = {}) {
  const props = {
    group,
    cards: [card({})],
    previews: {},
    targetStatuses: {},
    editing: false,
    busy: false,
    onBack: vi.fn(),
    onAddTarget: vi.fn(),
    onCreateNote: vi.fn(),
    onOpenCard: vi.fn(),
    onEditCard: vi.fn(),
    onMoveOutCards: vi.fn(),
    onDeleteCards: vi.fn(),
    onReorderCards: vi.fn(),
    onRepairCard: vi.fn(),
    onSetLaunchEnabled: vi.fn().mockResolvedValue(undefined),
    onSaveResume: vi.fn().mockResolvedValue(undefined),
    onLaunch: vi.fn().mockResolvedValue({
      groupId: "group-1",
      items: [{ cardId: "card-1", title: "Unity", status: "success" }],
    }),
    ...overrides,
  };
  render(<GroupDetailView {...props} />);
  return props;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("GroupDetailView", () => {
  it("在 500ms 後自動保存上次做到這裡", async () => {
    const props = renderView();
    fireEvent.click(screen.getByRole("button", { name: /上次做到這裡/ }));
    fireEvent.change(screen.getByLabelText("上次做到這裡"), {
      target: { value: "角色移動完成" },
    });
    expect(props.onSaveResume).not.toHaveBeenCalled();
    await waitFor(
      () => expect(props.onSaveResume).toHaveBeenCalledWith("角色移動完成"),
      { timeout: 1200 },
    );
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("已保存"));
  });

  it("Launch Set 預設不勾選，勾選時只傳卡片 ID 對應的卡片", () => {
    const props = renderView({ editing: true });
    fireEvent.click(screen.getByText("Unity"));
    const checkbox = screen.getByRole("checkbox", { name: "一次開啟" });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    expect(props.onSetLaunchEnabled).toHaveBeenCalledWith(
      expect.objectContaining({ id: "card-1" }),
      true,
    );
  });

  it("逐項開啟結果會停留直到使用者關閉", async () => {
    renderView({ cards: [card({ launchEnabled: true })] });
    fireEvent.click(screen.getByRole("button", { name: /開啟這個地方/ }));
    expect(await screen.findByText("開啟結果")).toBeInTheDocument();
    expect(screen.getByText("已開啟")).toBeInTheDocument();
    expect(screen.getAllByText("Unity")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "關閉" }));
    await waitFor(() => expect(screen.queryByText("開啟結果")).not.toBeInTheDocument());
  });

  it("捷徑或本機目標開啟失敗時提供重新定位", async () => {
    const localCard = card({ kind: "local", launchEnabled: true });
    const onRepairCard = vi.fn();
    renderView({
      cards: [localCard],
      onRepairCard,
      onLaunch: vi.fn().mockResolvedValue({
        groupId: "group-1",
        items: [{ cardId: "card-1", title: "Unity", status: "failed", message: "捷徑目標無法開啟" }],
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: /開啟這個地方/ }));
    const repair = await screen.findByRole("button", { name: "重新定位" });
    fireEvent.click(repair);
    expect(onRepairCard).toHaveBeenCalledWith(localCard);
  });
});
