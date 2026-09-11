import { resolveCardImageUrl } from "../decks/artPrefs";
import { lookupCard } from "../cards/atlas";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";

type Props = {
  defId: string;
  open: boolean;
  onClose: () => void;
};

const SWIPE_DISMISS_PX = 80;

/** Expanded card inspect: large art + ability text + alt-art picker. */
export function CardInspect({ defId, open, onClose }: Props) {
  const entry = useMemo(() => lookupCard(defId), [defId]);
  const [artTick, setArtTick] = useState(0);
  const imageUrl = useMemo(() => {
    void artTick;
    return resolveCardImageUrl(defId) ?? entry.imageUrl;
  }, [defId, entry.imageUrl, artTick]);

  const sheetRef = useRef<HTMLDivElement>(null);
  const swipeStartY = useRef<number | null>(null);
  const swipeDeltaY = useRef(0);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      swipeStartY.current = null;
      swipeDeltaY.current = 0;
      if (sheetRef.current) sheetRef.current.style.transform = "";
    }
  }, [open]);

  if (!open) return null;

  const alts = entry.altArts ?? [];

  function onSheetPointerDown(e: PointerEvent) {
    const target = e.target as HTMLElement;
    // Only swipe-dismiss from the grab handle so Done/Close keep working.
    if (!target.closest(".card-inspect-handle")) return;
    swipeStartY.current = e.clientY;
    swipeDeltaY.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  }

  function onSheetPointerMove(e: PointerEvent) {
    if (swipeStartY.current == null) return;
    const dy = e.clientY - swipeStartY.current;
    swipeDeltaY.current = dy;
    if (dy > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${dy}px)`;
    }
  }

  function onSheetPointerUp() {
    if (swipeStartY.current == null) return;
    const dy = swipeDeltaY.current;
    swipeStartY.current = null;
    swipeDeltaY.current = 0;
    if (sheetRef.current) sheetRef.current.style.transform = "";
    if (dy >= SWIPE_DISMISS_PX) onClose();
  }

  return (
    <div
      className="card-inspect-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`${entry.name} details`}
      onClick={onClose}
    >
      <div
        ref={sheetRef}
        className="card-inspect"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onSheetPointerDown}
        onPointerMove={onSheetPointerMove}
        onPointerUp={onSheetPointerUp}
        onPointerCancel={onSheetPointerUp}
      >
        <div className="card-inspect-handle" aria-hidden />
        <div className="card-inspect-toolbar">
          <h2 className="card-inspect-name">{entry.name}</h2>
          <button type="button" className="btn btn-primary card-inspect-done" onClick={onClose}>
            Done
          </button>
        </div>
        <div className="card-inspect-scroll">
          <div className="card-inspect-art">
            {imageUrl ? (
              <img src={imageUrl} alt={entry.name} className="card-inspect-img" />
            ) : (
              <div className="card-inspect-fallback">{entry.id}</div>
            )}
          </div>
          <div className="card-inspect-meta">
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
            <button type="button" className="btn btn-secondary card-inspect-close-bottom" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
