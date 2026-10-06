import { useEffect, useRef } from "react";

/** Wait this long after the last change before telling the server (a drag or sort settles first). */
export const HAND_ORDER_DEBOUNCE_MS = 150;

/**
 * Sends the order of your hand (instance ids, left to right) to the room so
 * spectators can show their fans in it. Changes within `delayMs` collapse into
 * one message, and an order the server already has is never sent again.
 */
export function createHandOrderSender(send: (ids: string[]) => void, delayMs = HAND_ORDER_DEBOUNCE_MS) {
  let sent: readonly string[] | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    update(ids: readonly string[]) {
      if (timer != null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        if (sent && sent.length === ids.length && sent.every((id, i) => id === ids[i])) return;
        sent = ids;
        send([...ids]);
      }, delayMs);
    },
    cancel() {
      if (timer != null) clearTimeout(timer);
      timer = null;
    },
  };
}

/**
 * Online players: keep the room told about the hand's display order. `ids` is
 * null when there is nothing to send (spectators, hotseat, no match yet).
 */
export function useHandOrderSync(ids: readonly string[] | null, send: ((ids: string[]) => void) | undefined) {
  const sendRef = useRef(send);
  sendRef.current = send;
  const sender = useRef<ReturnType<typeof createHandOrderSender> | null>(null);
  const active = ids != null && send != null;
  const key = active ? ids.join("\n") : null;
  useEffect(() => {
    if (key == null) return;
    sender.current ??= createHandOrderSender((next) => sendRef.current?.(next));
    sender.current.update(key === "" ? [] : key.split("\n"));
  }, [key]);
  useEffect(() => () => sender.current?.cancel(), []);
}
