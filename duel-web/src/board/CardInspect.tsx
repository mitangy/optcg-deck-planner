import { resolveCardImageUrl } from "../decks/artPrefs";
import { lookupCard } from "../cards/atlas";
import { useEffect, useMemo, useState } from "react";

type Props = {
  defId: string;
  open: boolean;
  onClose: () => void;
};

/** Expanded card inspect: large art + ability text + alt-art picker. */
export function CardInspect({ defId, open, onClose }: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  const [artTick, setArtTick] = useState(0);
  const imageUrl = useMemo(() => {
    void artTick;
    return resolveCardImageUrl(defId) ?? entry.imageUrl;
  }, [defId, entry.imageUrl, artTick]);

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
            <p>{entry.effectText?.trim() || "No printed effect text in atlas."}</p>
          </div>
          {alts.length > 0 ? (
            <div className="card-inspect-alts">
              <div className="card-inspect-effect-label">Artwork</div>
              <div className="card-inspect-alt-row">
                <button
                  type="button"
                  className="btn btn-secondary card-inspect-alt-btn"
                  onClick={() => {
                    import("../decks/storage").then(({ setArtPref }) => {
                      setArtPref(defId, null);
                      setArtTick((n) => n + 1);
                    });
                  }}
                >
                  Standard
                </button>
                {alts.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    className="btn btn-secondary card-inspect-alt-btn"
                    onClick={() => {
                      import("../decks/storage").then(({ setArtPref }) => {
                        setArtPref(defId, a.id);
                        setArtTick((n) => n + 1);
                      });
                    }}
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
