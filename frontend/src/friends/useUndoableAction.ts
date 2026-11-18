import { useCallback, useEffect, useRef, useState } from "react";
import { createDelayedCall, UNDO_MS } from "./tradeLogic";

export type PendingUndo = { id: number; message: string };

/**
 * Delays a server call so it can be undone. One pending action at a time: starting another fires the
 * previous one now. Leaving the page (unmount) also fires it, so nothing is silently dropped.
 */
export function useUndoableAction() {
  const [pending, setPending] = useState<PendingUndo | null>(null);
  const call = useRef<ReturnType<typeof createDelayedCall> | null>(null);

  const schedule = useCallback((id: number, message: string, fn: () => void) => {
    call.current?.flush();
    const mine = createDelayedCall(() => {
      fn();
      if (call.current === mine) {
        call.current = null;
        setPending(null);
      }
    }, UNDO_MS);
    call.current = mine;
    setPending({ id, message });
  }, []);

  const undo = useCallback(() => {
    call.current?.cancel();
    call.current = null;
    setPending(null);
  }, []);

  useEffect(
    () => () => {
      call.current?.flush();
    },
    [],
  );
  return { pending, schedule, undo };
}
