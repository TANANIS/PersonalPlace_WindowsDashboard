export const COLOR_THEMES = ["cyan", "violet", "mint", "amber", "rose"] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

const STORAGE_KEY = "personal-place-color-theme";

export function isColorTheme(value: string | null): value is ColorTheme {
  return COLOR_THEMES.includes(value as ColorTheme);
}

export function loadColorTheme(storage: Pick<Storage, "getItem"> = window.localStorage): ColorTheme {
  const stored = storage.getItem(STORAGE_KEY);
  return isColorTheme(stored) ? stored : "cyan";
}

export function applyColorTheme(theme: ColorTheme, root: HTMLElement = document.documentElement) {
  root.dataset.colorTheme = theme;
}

export function saveColorTheme(
  theme: ColorTheme,
  storage: Pick<Storage, "setItem"> = window.localStorage,
) {
  storage.setItem(STORAGE_KEY, theme);
}
