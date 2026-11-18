import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { placeTip } from "../panels/statusIcons";

export type AttackWarn = { id: string; reason: string; nonce: number };

const SHOW_MS = 2400;
const FLASH_MS = 900;

// Overlays only, so nothing shifts and BoardMotion's own transform on the tile is left alone.
export function AttackWarning({ warn }: { warn: AttackWarn | null }) {
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [visible, setVisible] = useState<AttackWarn | null>(null);

  useEffect(() => {
    if (!warn) return;
    const tile = document.querySelector<HTMLElement>(`.side-you [data-instance-id="${CSS.escape(warn.id)}"]`);
    if (!tile) return;
    tile.removeAttribute("data-cant-attack");
    void tile.offsetWidth;
    tile.setAttribute("data-cant-attack", "");
    setPos(null);
    setVisible(warn);
    const t1 = window.setTimeout(() => tile.removeAttribute("data-cant-attack"), FLASH_MS);
    const t2 = window.setTimeout(() => setVisible(null), SHOW_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      tile.removeAttribute("data-cant-attack");
    };
  }, [warn]);

  useLayoutEffect(() => {
    if (!visible || !tipRef.current) return;
    const tile = document.querySelector<HTMLElement>(`.side-you [data-instance-id="${CSS.escape(visible.id)}"]`);
    if (!tile) return;
    const r = tile.getBoundingClientRect();
    const vv = window.visualViewport;
    setPos(
      placeTip(
        { left: r.left, top: r.top, width: r.width, height: r.height },
        { width: tipRef.current.offsetWidth, height: tipRef.current.offsetHeight },
        { width: vv?.width ?? window.innerWidth, height: vv?.height ?? window.innerHeight },
      ),
    );
  }, [visible]);

  if (!visible) return null;
  return createPortal(
    <div
      ref={tipRef}
      className="attack-warning"
      role="status"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      {visible.reason}
    </div>,
    document.body,
  );
}
