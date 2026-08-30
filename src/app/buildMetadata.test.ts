import { describe, expect, it } from "vitest";
import { buildLabel } from "./buildMetadata";

describe("build metadata", () => {
  it("formats clean and modified provenance", () => {
    expect(buildLabel("Dev", "61989e0", true)).toBe("Dev · 61989e0 · modified");
    expect(buildLabel("Release", "a83f21c", false)).toBe("Release · a83f21c");
  });
});
