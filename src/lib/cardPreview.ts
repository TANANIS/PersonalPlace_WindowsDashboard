import type { LauncherPreview } from "./platform";
import type { DashboardCard } from "../types";

export type PreviewPresentation = "compact" | "media";

export function isShortcutCard(card: DashboardCard): boolean {
  return card.cardType === "target" && /捷徑|shortcut/i.test(card.subtitle);
}

export function classifyShortcutPreview(width: number, height: number): PreviewPresentation {
  if (width <= 0 || height <= 0) return "compact";
  const ratio = width / height;
  return ratio >= 1.32 || ratio <= 0.76 ? "media" : "compact";
}

export function isCompactCardPreview(
  card: DashboardCard,
  preview: LauncherPreview | undefined,
  shortcutPresentation?: PreviewPresentation,
): boolean {
  if (!preview) return false;
  if (preview.kind === "icon") return true;
  return preview.kind === "thumbnail"
    && isShortcutCard(card)
    && shortcutPresentation !== "media";
}
