import { useCallback, useEffect, useRef } from "react";
import { FocusDialog } from "./components/FocusDialog";
import type { FocusState } from "./lib/platform";
import type { FocusController } from "./features/focus/useFocusController";

interface FocusDialogSafeProps {
  onClose: () => void;
  onChanged: (state: FocusState) => void;
  embedded?: boolean;
  backLabel?: string;
  onController?: FocusController;
}

/**
 * Keeps FocusDialog's summary callback stable for its entire mounted life.
 *
 * The dashboard supplies an inline callback so it can refresh the card
 * summary. Passing that callback directly made FocusDialog's polling effect
 * restart after every summary update, creating an immediate invoke/re-render
 * loop. The latest handler is still used through the ref.
 */
export function FocusDialogSafe({ onClose, onChanged, embedded = false, backLabel, onController }: FocusDialogSafeProps) {
  const onChangedRef = useRef(onChanged);

  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const handleChanged = useCallback((state: FocusState) => {
    onChangedRef.current(state);
  }, []);

  return <FocusDialog onClose={onClose} onChanged={handleChanged} controller={onController} embedded={embedded} backLabel={backLabel} />;
}
