import { TodoDialog } from "../../components/TodoDialog";

export function TodoWorkspace({ initialCreate = false, onClose = () => undefined, backLabel = "返回頁面" }: { initialCreate?: boolean; onClose?: () => void; backLabel?: string }) {
  return <TodoDialog embedded showBackButton onClose={onClose} backLabel={backLabel} initialCreate={initialCreate} />;
}
