import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { DashboardCard } from "../types";
import { CardEditDialog } from "./CardEditDialog";

const item: DashboardCard = {
  id: "card-one",
  pageId: "home",
  parentGroupId: null,
  cardType: "target",
  targetId: "local-safe-id",
  title: "原始名稱",
  subtitle: "原始副標題",
  kind: "local",
  symbol: "▣",
  tone: "violet",
  size: "square",
  position: 0,
  noteText: "",
  resumeNote: "",
  launchEnabled: false,
  lastOpenedAt: null,
};

describe("CardEditDialog", () => {
  it("提供名稱、副標題、五種色調、兩種尺寸與後端重設入口", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onReset = vi.fn();
    render(
      <CardEditDialog
        item={item}
        busy={false}
        error={null}
        onClose={vi.fn()}
        onSave={onSave}
        onReset={onReset}
      />,
    );

    expect(screen.getByLabelText("色調").querySelectorAll("option")).toHaveLength(5);
    expect(screen.getByLabelText("卡片大小").querySelectorAll("option")).toHaveLength(2);

    const title = screen.getByLabelText("顯示名稱");
    await user.clear(title);
    await user.type(title, "新的名稱");
    await user.selectOptions(screen.getByLabelText("色調"), "rose");
    await user.selectOptions(screen.getByLabelText("卡片大小"), "wide");
    await user.click(screen.getByRole("button", { name: "保存" }));

    expect(onSave).toHaveBeenCalledWith({
      title: "新的名稱",
      subtitle: "原始副標題",
      tone: "rose",
      size: "wide",
    });

    await user.click(screen.getByRole("button", { name: "重設為自動值" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
