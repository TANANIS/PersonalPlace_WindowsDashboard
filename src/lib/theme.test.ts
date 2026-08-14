import { describe, expect, it } from "vitest";
import { applyColorTheme, isColorTheme, loadColorTheme, saveColorTheme } from "./theme";

describe("color theme", () => {
  it("未知設定會回到預設青色", () => {
    expect(loadColorTheme({ getItem: () => "unknown" })).toBe("cyan");
    expect(isColorTheme("violet")).toBe(true);
  });

  it("會保存並套用使用者選擇", () => {
    let stored = "";
    saveColorTheme("mint", { setItem: (_key, value) => { stored = value; } });
    const root = document.createElement("div");
    applyColorTheme("mint", root);
    expect(stored).toBe("mint");
    expect(root.dataset.colorTheme).toBe("mint");
  });
});
