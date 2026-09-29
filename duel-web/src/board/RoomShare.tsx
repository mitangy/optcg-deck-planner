import { useEffect, useRef, useState } from "react";
import { copyText, roomInviteUrl } from "./clipboard";

type Copied = "id" | "link" | "auto" | "failed" | null;

function useCopyFlash() {
  const [copied, setCopied] = useState<Copied>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  async function copy(text: string, kind: Exclude<Copied, null | "failed">) {
    const ok = await copyText(text);
    // A blocked auto-copy (no focus / gesture) stays quiet; buttons report it.
    if (!ok && kind === "auto") return ok;
    setCopied(ok ? kind : "failed");
    if (timer.current) window.clearTimeout(timer.current);
    // The auto-copy notice stays up: the creator may glance over much later.
    if (kind !== "auto") timer.current = window.setTimeout(() => setCopied(null), 2200);
    return ok;
  }
  return { copied, copy };
}

/** Compact "Room <id> [Copy]" chip for the HUD. */
export function RoomChip({ roomId }: { roomId: string | null }) {
  const { copied, copy } = useCopyFlash();
  if (!roomId) return <span className="match-id">Room —</span>;
  return (
    <span className="room-chip" title={roomId}>
      <span className="match-id">Room {roomId}</span>
      <button
        type="button"
        className="room-copy-btn"
        onClick={() => void copy(roomId, "id")}
        aria-label="Copy room id"
      >
        {copied === "id" ? "Copied" : copied === "failed" ? "Failed" : "Copy"}
      </button>
    </span>
  );
}

/**
 * Waiting-room invite card: big room id with copy buttons. Copies the id
 * once on mount when `autoCopy` (the room creator) so it's ready to paste.
 */
export function RoomInvite({ roomId, autoCopy }: { roomId: string | null; autoCopy: boolean }) {
  const { copied, copy } = useCopyFlash();
  const didAuto = useRef(false);

  useEffect(() => {
    if (!autoCopy || !roomId || didAuto.current) return;
    didAuto.current = true;
    void copy(roomId, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCopy, roomId]);

  if (!roomId) {
    return <div className="room-invite"><p className="room-invite-hint">Creating room…</p></div>;
  }

  const status =
    copied === "auto"
      ? "Room id copied to your clipboard — paste it to your friend."
      : copied === "id"
        ? "Room id copied."
        : copied === "link"
          ? "Invite link copied — opening it fills in the room id."
          : copied === "failed"
            ? "Couldn't reach the clipboard — select the id and copy it."
            : "Share the room id — the match starts when both seats join.";

  return (
    <div className="room-invite" role="group" aria-label="Invite a friend">
      <p className="room-invite-kicker">Private room</p>
      <code className="room-invite-id" aria-label="Room id">
        {roomId}
      </code>
      <div className="room-invite-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void copy(roomId, "id")}
        >
          {copied === "id" || copied === "auto" ? "Copied ✓" : "Copy room id"}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void copy(roomInviteUrl(roomId), "link")}
        >
          {copied === "link" ? "Link copied ✓" : "Copy invite link"}
        </button>
      </div>
      <p className="room-invite-hint" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
