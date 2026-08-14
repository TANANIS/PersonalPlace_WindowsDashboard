import { describe, expect, it } from "vitest";
import { classifyShortcutPreview, isCompactCardPreview } from "./cardPreview";
import type { DashboardCard } from "../types";

const shortcut: DashboardCard = {
  id: "shortcut",
  pageId: "home",
  parentGroupId: null,
  cardType: "target",
  targetId: "target-shortcut",
  title: "ChatGPT",
  subtitle: "Windows 捷徑",
  kind: "local",
  symbol: "↗",
  tone: "cyan",
  size: "square",
  position: 0,
  noteText: "",
  resumeNote: "",
  launchEnabled: false,
  lastOpenedAt: null,
};

describe("card preview presentation", () => {
  it("keeps square shortcut artwork at icon scale", () => {
    expect(classifyShortcutPreview(256, 256)).toBe("compact");
    expect(isCompactCardPreview(shortcut, { assetUrl: "preview", kind: "thumbnail" })).toBe(true);
  });

  it("allows wide shortcut thumbnails to remain media previews", () => {
    expect(classifyShortcutPreview(360, 220)).toBe("media");
    expect(isCompactCardPreview(shortcut, { assetUrl: "preview", kind: "thumbnail" }, "media")).toBe(false);
  });

  it("always keeps true icon previews compact", () => {
    expect(isCompactCardPreview({ ...shortcut, subtitle: "圖片檔案" }, { assetUrl: "preview", kind: "icon" })).toBe(true);
  });
});
