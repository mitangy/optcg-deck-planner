import { useEffect, useRef } from "react";

export const HAND_ORDER_DEBOUNCE_MS = 150;

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
