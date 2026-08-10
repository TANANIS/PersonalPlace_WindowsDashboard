export const zhTW = {
  brand: {
    name: "Personal Place",
    mark: "PP",
    eyebrow: "PERSONAL PLACE",
  },
  card: {
    placeSummary: (count: number) => `${count} 個項目的地方`,
    keyboardReorderHint: "Alt 加方向鍵可調整順序",
  },
  release: {
    versionStatus: (version: string) => `版本 ${version} · 未公開測試版`,
  },
} as const;
