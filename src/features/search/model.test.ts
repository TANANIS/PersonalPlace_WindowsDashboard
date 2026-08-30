import { describe, expect, it } from "vitest";
import type { DashboardState } from "../../types";
import { filterDashboardCards, searchDashboardInMemory } from "./model";

const state: DashboardState = {
  pages: [{ id: "home", name: "我的地方", symbol: "⌂" }],
  cards: [
    {
      id: "group",
      pageId: "home",
      parentGroupId: null,
      cardType: "group",
      targetId: null,
      title: "開發",
      subtitle: "",
      kind: "group",
      symbol: "D",
      tone: "slate",
      size: "wide",
      position: 0,
      noteText: "",
      resumeNote: "",
      launchEnabled: false,
      lastOpenedAt: null,
    },
    {
      id: "child",
      pageId: "home",
      parentGroupId: "group",
      cardType: "target",
      targetId: "target",
      title: "Unity 專案",
      subtitle: "",
      kind: "local",
      symbol: "U",
      tone: "cyan",
      size: "square",
      position: 0,
      noteText: "角色控制器",
      resumeNote: "",
      launchEnabled: false,
      lastOpenedAt: null,
    },
  ],
};

describe("search feature model", () => {
  it("keeps a Place visible when one of its children matches", () => {
    expect(filterDashboardCards([state.cards[0]], state.cards, "Unity").map((card) => card.id))
      .toEqual(["group"]);
  });

  it("returns the child with its Place context in browser demo search", () => {
    expect(searchDashboardInMemory(state, "角色")).toMatchObject([
      { id: "child", groupId: "group", groupName: "開發", pageId: "home" },
    ]);
  });
});
