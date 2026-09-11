import { resolveCardImageUrl } from "../decks/artPrefs";
import {
  getArtPrefsTick,
  setSeatArtPref,
  subscribeArtPrefs,
  type Seat,
} from "../decks/seatArtPrefs";
import { setArtPref } from "../decks/storage";
import { lookupCard } from "../cards/atlas";
import { useEffect, useMemo, useSyncExternalStore } from "react";

type Props = {
  defId: string;
  open: boolean;
  onClose: () => void;
  /** Seat whose cards own this art (display). */
  ownerSeat?: Seat;
  /** Seat controlling the UI — alt picks update this seat's prefs. */
  viewingSeat?: Seat;
};

/** Expanded card inspect: large art + ability text + alt-art picker. */
export function CardInspect({
  defId,
  open,
  onClose,
  ownerSeat,
  viewingSeat,
}: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  const artTick = useSyncExternalStore(
    subscribeArtPrefs,
    getArtPrefsTick,
    getArtPrefsTick,
  );
  const imageUrl = useMemo(() => {
    void artTick;
    return (
      resolveCardImageUrl(defId, {
        ownerSeat: ownerSeat ?? viewingSeat,
      }) ?? entry.imageUrl
    );
  }, [defId, entry.imageUrl, artTick, ownerSeat, viewingSeat]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const alts = entry.altArts ?? [];
  const prefSeat = viewingSeat ?? ownerSeat;

  function applyAlt(altId: string | null) {
    if (prefSeat === 0 || prefSeat === 1) {
      setSeatArtPref(prefSeat, defId, altId);
    }
    // Persist for next match seed (local player).
    setArtPref(defId, altId);
  }

  return (
    <div
      className="card-inspect-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.name} details`}
      onClick={onClose}
    >
      <div className="card-inspect" onClick={(e) => e.stopPropagation()}>
        <div className="card-inspect-art">
          {imageUrl ? (
            <img src={imageUrl} alt={entry.name} className="card-inspect-img" />
          ) : (
            <div className="card-inspect-fallback">{entry.id}</div>
          )}
        </div>
        <div className="card-inspect-meta">
          <h2 className="card-inspect-name">{entry.name}</h2>
          <p className="card-inspect-id">
            {entry.id} · {entry.type} · {entry.colors.join("/")} · cost {entry.cost}
            {entry.power != null ? ` · ${entry.power} power` : ""}
            {entry.counter != null ? ` · ${entry.counter} counter` : ""}
            {entry.life != null ? ` · ${entry.life} life` : ""}
            {entry.blocker ? " · Blocker" : ""}
          </p>
          <div className="card-inspect-effect">
            <div className="card-inspect-effect-label">Ability</div>
            <p>
              {(() => {
                const t = entry.effectText?.trim() ?? "";
                if (!t || t === "—" || t === "-") return "No printed ability.";
                return t;
              })()}
            </p>
          </div>
          {alts.length > 0 && prefSeat != null ? (
            <div className="card-inspect-alts">
              <div className="card-inspect-effect-label">Artwork</div>
              <div className="card-inspect-alt-row">
                <button
                  type="button"
                  className="btn btn-secondary card-inspect-alt-btn"
                  onClick={() => applyAlt(null)}
                >
                  Standard
                </button>
                {alts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="btn btn-secondary card-inspect-alt-btn"
                    onClick={() => applyAlt(a.id)}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          <button type="button" className="btn btn-primary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
