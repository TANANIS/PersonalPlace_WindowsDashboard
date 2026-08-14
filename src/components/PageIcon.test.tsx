import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PageIcon, resolvePageIconKind } from "./PageIcon";

describe("PageIcon", () => {
  it("uses the selected symbol when the page has no recognizable context", () => {
    expect(resolvePageIconKind("♫", "我的收藏")).toBe("music");
  });

  it("turns generic legacy circles into useful context icons", () => {
    expect(resolvePageIconKind("○", "學習")).toBe("book");
    expect(resolvePageIconKind("○", "遊戲")).toBe("game");
    expect(resolvePageIconKind("○", "Live2D")).toBe("layers");
    expect(resolvePageIconKind("○", "繪圖")).toBe("draw");
  });

  it("renders a stable SVG instead of relying on font glyph support", () => {
    const { container } = render(<PageIcon symbol="⌂" pageName="我的地方" />);
    expect(container.querySelector('[data-page-icon="home"] svg')).toBeTruthy();
  });
});
