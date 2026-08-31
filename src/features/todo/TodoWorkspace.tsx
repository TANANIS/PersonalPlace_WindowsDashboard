import { TodoDialog } from "../../components/TodoDialog";

export function TodoWorkspace() {
  return <TodoDialog embedded showBackButton={false} onClose={() => undefined} />;
}
