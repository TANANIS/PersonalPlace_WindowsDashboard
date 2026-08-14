import type { DashboardCard, Page } from "../types";

interface ContextActionBarProps {
  selected: DashboardCard[];
  pages: Page[];
  groups: DashboardCard[];
  currentPageId: string;
  busy: boolean;
  canGroup: boolean;
  onClear: () => void;
  onEdit: (card: DashboardCard) => void;
  onResize: (card: DashboardCard) => void;
  onCreateGroup: () => void;
  onMoveToPage: (pageId: string) => void;
  onMoveToGroup: (groupId: string) => void;
  onDelete: () => void;
}

export function ContextActionBar({
  selected,
  pages,
  groups,
  currentPageId,
  busy,
  canGroup,
  onClear,
  onEdit,
  onResize,
  onCreateGroup,
  onMoveToPage,
  onMoveToGroup,
  onDelete,
}: ContextActionBarProps) {
  if (!selected.length) return null;
  const only = selected.length === 1 ? selected[0] : null;
  return (
    <aside className="context-action-bar" aria-label="已選取卡片操作">
      <div className="context-selection-count"><strong>{selected.length}</strong><span>已選取</span></div>
      {only && <>
        <button type="button" disabled={busy} onClick={() => onEdit(only)}>編輯</button>
        <button type="button" disabled={busy} onClick={() => onResize(only)}>{only.size === "wide" ? "改為方形" : "改為寬版"}</button>
      </>}
      {selected.length > 1 && <button type="button" disabled={busy || !canGroup} onClick={onCreateGroup}>建立 Place</button>}
      <label><span>移到頁面</span><select value="" disabled={busy} onChange={(event) => event.target.value && onMoveToPage(event.target.value)}><option value="">移到頁面…</option>{pages.filter((page) => page.id !== currentPageId).map((page) => <option value={page.id} key={page.id}>{page.name}</option>)}</select></label>
      <label><span>移入 Place</span><select value="" disabled={busy || !groups.length} onChange={(event) => event.target.value && onMoveToGroup(event.target.value)}><option value="">移入 Place…</option>{groups.filter((group) => !selected.some((card) => card.id === group.id)).map((group) => <option value={group.id} key={group.id}>{group.title}</option>)}</select></label>
      <button type="button" className="danger-text" disabled={busy} onClick={onDelete}>移除</button>
      <button type="button" className="context-close" onClick={onClear} aria-label="清除選取">×</button>
    </aside>
  );
}
