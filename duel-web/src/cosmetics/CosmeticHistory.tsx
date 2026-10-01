import { useState } from "react";
import {
  chooseCosmetic,
  deleteCosmetic,
  useAccountCosmetics,
} from "../account/cosmeticsSync";
import { accountCosmeticUrl, type CosmeticKind } from "../net/prefsApi";

const DEFAULT_ART: Record<CosmeticKind, string | null> = {
  playmat: null,
  cardBack: "/cards/card-back.webp",
};

/**
 * Your earlier playmat / card back uploads (signed in only): tap one to use it
 * again, × to delete it. The first tile switches back to the default.
 */
export function CosmeticHistory({ kind }: { kind: CosmeticKind }) {
  const { signedIn, items, active } = useAccountCosmetics();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mine = items.filter((i) => i.kind === kind);
  if (!signedIn || mine.length === 0) return null;
  const current = active[kind];
  const label = kind === "playmat" ? "playmat" : "card back";

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cosmetic-history">
      <p className="field-hint">Your uploads</p>
      <ul className={`cosmetic-history-row is-${kind}`} aria-busy={busy}>
        <li>
          <button
            type="button"
            className="cosmetic-thumb is-default"
            aria-pressed={current === null}
            aria-label={kind === "playmat" ? "Default playmat" : "Official card back"}
            disabled={busy}
            style={DEFAULT_ART[kind] ? { backgroundImage: `url("${DEFAULT_ART[kind]}")` } : undefined}
            onClick={() => void run(() => chooseCosmetic(kind, null))}
          >
            {kind === "playmat" ? <span>Default</span> : null}
          </button>
        </li>
        {mine.map((item, n) => (
          <li key={item.id}>
            <button
              type="button"
              className="cosmetic-thumb"
              aria-pressed={current === item.id}
              aria-label={`Use ${label} upload ${n + 1}`}
              disabled={busy}
              style={{ backgroundImage: `url("${accountCosmeticUrl(item.id)}")` }}
              onClick={() => void run(() => chooseCosmetic(kind, item.id))}
            />
            <button
              type="button"
              className="cosmetic-thumb-delete"
              aria-label={`Delete ${label} upload ${n + 1}`}
              disabled={busy}
              onClick={() => void run(() => deleteCosmetic(kind, item.id))}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="error-text">{error}</p> : null}
    </div>
  );
}
