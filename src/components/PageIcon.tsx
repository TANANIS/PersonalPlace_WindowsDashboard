export const PAGE_SYMBOL_OPTIONS = [
  { value: "⌂", label: "首頁" },
  { value: "○", label: "日常" },
  { value: "◇", label: "地方" },
  { value: "✦", label: "收藏" },
  { value: "▦", label: "專案" },
  { value: "◎", label: "專注" },
  { value: "☕", label: "休息" },
  { value: "♫", label: "音樂" },
] as const;

export type PageIconKind =
  | "home"
  | "orbit"
  | "place"
  | "spark"
  | "grid"
  | "focus"
  | "coffee"
  | "music"
  | "book"
  | "game"
  | "layers"
  | "draw";

const symbolKinds: Record<string, PageIconKind> = {
  "⌂": "home",
  "○": "orbit",
  "◇": "place",
  "✦": "spark",
  "▦": "grid",
  "◎": "focus",
  "☕": "coffee",
  "♫": "music",
};

export function resolvePageIconKind(symbol: string, pageName = ""): PageIconKind {
  const name = pageName.trim().toLocaleLowerCase("zh-TW");

  if (/live\s*2d|live2d|動畫|模型/.test(name)) return "layers";
  if (/遊戲|gaming|game|steam|play/.test(name)) return "game";
  if (/學習|課程|study|learn|course|unity/.test(name)) return "book";
  if (/繪|畫|設計|創作|draw|art|design/.test(name)) return "draw";

  return symbolKinds[symbol] ?? "orbit";
}

interface PageIconProps {
  symbol: string;
  pageName?: string;
  className?: string;
}

export function PageIcon({ symbol, pageName = "", className = "" }: PageIconProps) {
  const kind = resolvePageIconKind(symbol, pageName);
  const iconClass = ["page-icon", className].filter(Boolean).join(" ");

  return (
    <span className={iconClass} aria-hidden="true" data-page-icon={kind}>
      <svg viewBox="0 0 24 24" focusable="false">
        {kind === "home" && <><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V20h11v-9.5M10 20v-5h4v5" /></>}
        {kind === "orbit" && <><circle cx="12" cy="12" r="7.25" /><circle className="page-icon-accent" cx="12" cy="12" r="1.5" /></>}
        {kind === "place" && <><path d="m12 3.5 7 8.5-7 8.5L5 12l7-8.5Z" /><path className="page-icon-accent" d="m12 8 3.2 4-3.2 4-3.2-4 3.2-4Z" /></>}
        {kind === "spark" && <><path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4-5.7-1.8L10.2 9 12 3.5Z" /><path className="page-icon-accent" d="m18.5 16 .7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-.7-2.1-2.1-.7 2.1-.7.7-2.1Z" /></>}
        {kind === "grid" && <><rect x="4" y="4" width="6" height="6" rx="1.2" /><rect x="14" y="4" width="6" height="6" rx="1.2" /><rect x="4" y="14" width="6" height="6" rx="1.2" /><rect x="14" y="14" width="6" height="6" rx="1.2" /></>}
        {kind === "focus" && <><circle cx="12" cy="12" r="7.5" /><circle className="page-icon-accent" cx="12" cy="12" r="3" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2" /></>}
        {kind === "coffee" && <><path d="M5 8h11v5.5A4.5 4.5 0 0 1 11.5 18h-2A4.5 4.5 0 0 1 5 13.5V8Z" /><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16M8 3.5v2M12 3.5v2" /></>}
        {kind === "music" && <><path d="M9 18V7l10-2v11" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="16.5" cy="16" r="2.5" /></>}
        {kind === "book" && <><path d="M4.5 5.5h4A3.5 3.5 0 0 1 12 9v10a3.5 3.5 0 0 0-3.5-3.5h-4v-10Z" /><path d="M19.5 5.5h-4A3.5 3.5 0 0 0 12 9v10a3.5 3.5 0 0 1 3.5-3.5h4v-10Z" /></>}
        {kind === "game" && <><path d="M8 9h8a5 5 0 0 1 4.7 6.7l-.5 1.4a2.1 2.1 0 0 1-3.4.9l-2-1.8H9.2l-2 1.8a2.1 2.1 0 0 1-3.4-.9l-.5-1.4A5 5 0 0 1 8 9Z" /><path d="M8 12v4M6 14h4M16.5 12.5h.01M18.5 14.5h.01" /></>}
        {kind === "layers" && <><path d="m12 4 8 4-8 4-8-4 8-4Z" /><path d="m4 12 8 4 8-4M4 16l8 4 8-4" /></>}
        {kind === "draw" && <><path d="m5 19 1.2-4.5L16.7 4a1.8 1.8 0 0 1 2.6 0l.7.7a1.8 1.8 0 0 1 0 2.6L9.5 17.8 5 19Z" /><path d="m14.8 5.9 3.3 3.3M6.2 14.5l3.3 3.3" /></>}
      </svg>
    </span>
  );
}
