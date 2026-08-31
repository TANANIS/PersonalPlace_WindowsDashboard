import type { FocusState } from "../../platform/focus";
import type { TodoItem, TodoList } from "../../platform/todo";
import type { DashboardCard } from "../../types";

export interface FocusContext { kind: "todo" | "place" | "free"; title: string; detail?: string; resumeNote?: string; launchable: boolean; groupId?: string; todoId?: string; }
export function resolveFocusContext(state: FocusState | null, todos: TodoItem[], cards: DashboardCard[], lists: TodoList[] = []): FocusContext {
  if (!state) return { kind: "free", title: "自由專注", launchable: false };
  if (state.linkedTodoId) {
    const todo = todos.find((item) => item.id === state.linkedTodoId);
    if (todo) { const list = lists.find((item) => item.id === todo.listId)?.title; const parent = todo.parentId ? todos.find((item) => item.id === todo.parentId)?.title : undefined; return { kind: "todo", title: todo.title, detail: [list, parent].filter(Boolean).join(" · ") || undefined, launchable: false, todoId: todo.id }; }
  }
  if (state.linkedGroupId) {
    const group = cards.find((card) => card.id === state.linkedGroupId && card.cardType === "group");
    if (group) return { kind: "place", title: group.title, resumeNote: group.resumeNote || undefined, launchable: cards.some((card) => card.parentGroupId === group.id && card.cardType === "target" && card.launchEnabled), groupId: group.id };
  }
  return { kind: "free", title: state.linkedTodoId || state.linkedGroupId ? "未連結的專注" : "自由專注", launchable: false };
}
