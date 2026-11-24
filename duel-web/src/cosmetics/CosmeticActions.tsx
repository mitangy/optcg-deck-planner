import { useCallback, useState } from "react";
import { chooseCosmetic, saveCosmetic } from "../account/cosmeticsSync";
import { errorMessage } from "../lib/errors";
import type { CosmeticKind } from "../net/prefsApi";

export function useCosmeticSlot(kind: CosmeticKind) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const upload = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      setBusy(true);
      setError(null);
      try {
        await saveCosmetic(kind, file);
      } catch (e) {
        setError(errorMessage(e, "Upload failed"));
      } finally {
        setBusy(false);
      }
    },
    [kind],
  );
  const reset = useCallback(() => {
    void chooseCosmetic(kind, null).catch((e: unknown) => setError(errorMessage(e, "Could not switch")));
  }, [kind]);
  return { busy, error, upload, reset };
}

export function CosmeticActions({
  hasArt,
  busy,
  resetLabel,
  onPick,
  onReset,
}: {
  hasArt: boolean;
  busy: boolean;
  resetLabel: string;
  onPick: (file: File) => void;
  onReset: () => void;
}) {
  return (
    <>
      <label className={`btn btn-secondary${busy ? " is-busy" : ""}`}>
        <input
          type="file"
          accept="image/*"
          className="visually-hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onPick(f);
            e.target.value = "";
          }}
        />
        {busy ? "Processing…" : hasArt ? "Replace image" : "Upload image"}
      </label>
      {hasArt ? (
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={onReset}>
          {resetLabel}
        </button>
      ) : null}
    </>
  );
}
