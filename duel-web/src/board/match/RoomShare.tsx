import { useEffect, useRef, useState } from "react";
import { copyText, roomInviteUrl, spectateUrl } from "../input/clipboard";

type Copied = "id" | "link" | "watch" | "auto" | "autolink" | "failed" | null;

export function useCopyFlash() {
  const [copied, setCopied] = useState<Copied>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  async function copy(text: string, kind: Exclude<Copied, null | "failed">) {
    const ok = await copyText(text);
    const auto = kind === "auto" || kind === "autolink";
    if (!ok && auto) return ok;
    setCopied(ok ? kind : "failed");
    if (timer.current) window.clearTimeout(timer.current);
    if (!auto) timer.current = window.setTimeout(() => setCopied(null), 2200);
    return ok;
  }
  return { copied, copy };
}

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
      <button
        type="button"
        className="room-copy-btn room-watch-btn"
        onClick={() => void copy(spectateUrl(roomId), "watch")}
        aria-label="Copy spectate link"
        title="Copy a link anyone can open to watch this match"
      >
        {copied === "watch" ? "Copied" : copied === "failed" ? "Failed" : "Watch link"}
      </button>
    </span>
  );
}

// Only on a phone-like device: desktop browsers that expose share open a menu nobody wants here.
function canShareNatively(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.share === "function" && window.matchMedia?.("(pointer: coarse)").matches === true;
}

export function RoomInvite({ roomId, autoCopy, link = false }: { roomId: string | null; autoCopy: boolean; link?: boolean }) {
  const { copied, copy } = useCopyFlash();
  const didAuto = useRef(false);

  useEffect(() => {
    if (!autoCopy || !roomId || didAuto.current) return;
    didAuto.current = true;
    if (link) void copy(roomInviteUrl(roomId), "autolink");
    else void copy(roomId, "auto");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCopy, roomId]);

  if (!roomId) {
    return <div className="room-invite"><p className="room-invite-hint">Creating room…</p></div>;
  }

  const status =
    copied === "autolink"
      ? "Invite link copied — send it to a friend and they sit down at once."
      : copied === "auto"
      ? "Room id copied to your clipboard — paste it to your friend."
      : copied === "id"
        ? "Room id copied."
        : copied === "link"
          ? "Invite link copied — opening it seats your friend at once."
          : copied === "watch"
            ? "Spectate link copied — anyone who opens it can watch this match."
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
          className={`btn ${link ? "btn-secondary" : "btn-primary"}`}
          onClick={() => void copy(roomId, "id")}
        >
          {copied === "id" || copied === "auto" ? "Copied ✓" : "Copy room id"}
        </button>
        <button
          type="button"
          className={`btn ${link ? "btn-primary" : "btn-secondary"}`}
          onClick={() => void copy(roomInviteUrl(roomId), "link")}
        >
          {copied === "link" || copied === "autolink" ? "Link copied ✓" : "Copy invite link"}
        </button>
        {canShareNatively() ? (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              void navigator
                .share({ title: "OPTCG Duel", text: "Play a game of One Piece TCG with me", url: roomInviteUrl(roomId) })
                .catch(() => undefined)
            }
          >
            Share…
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void copy(spectateUrl(roomId), "watch")}
        >
          {copied === "watch" ? "Link copied ✓" : "Copy spectate link"}
        </button>
      </div>
      <p className="room-invite-hint" role="status" aria-live="polite">
        {status}
      </p>
    </div>
  );
}
