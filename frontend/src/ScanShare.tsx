/** Tray footer note: the switch for sharing card crops, and deleting what was shared (#852). */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type User } from "./api";

export const SCAN_PRIVACY_HREF = "/privacy#scanner-crops";

export function ScanShare() {
  const qc = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: api.me });
  const shared = useQuery({ queryKey: ["scan-samples", "mine"], queryFn: api.myScanSamples });
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const setShare = useMutation({
    mutationFn: (value: boolean) => api.updatePreferences({ share_scans: value }),
    onMutate: (value) => {
      const prev = qc.getQueryData<User | null>(["me"]);
      qc.setQueryData<User | null>(["me"], (old) => (old ? { ...old, share_scans: value } : old));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["me"], ctx.prev);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ["me"] }),
  });

  const remove = useMutation({
    mutationFn: api.deleteMyScanSamples,
    onSuccess: () => {
      setDeleted(true);
      setConfirming(false);
      qc.setQueryData(["scan-samples", "mine"], { count: 0 });
    },
    onError: () => setConfirming(false),
  });

  // Signed-out or still loading: no switch to offer, and nothing is uploaded either.
  if (!me.data) return null;
  const count = shared.data?.count ?? 0;

  return (
    <div className="scan-share">
      <label className="scan-share-toggle">
        <input
          type="checkbox"
          checked={me.data.share_scans === true}
          onChange={(e) => setShare.mutate(e.target.checked)}
        />
        <span>Share card crops to improve the scanner</span>
      </label>
      <p className="scan-share-note muted">
        Only the cropped cards, never the whole photo.{" "}
        <a href={SCAN_PRIVACY_HREF} target="_blank" rel="noreferrer">
          Learn more
        </a>
        {setShare.isError && <span className="scan-share-err"> Couldn't save that. Try again.</span>}
        {remove.isError && <span className="scan-share-err"> Couldn't delete. Try again.</span>}
      </p>
      {(count > 0 || deleted) && (
        <p className="scan-share-delete">
          {deleted && count === 0 ? (
            <span role="status" className="muted">
              Deleted
            </span>
          ) : confirming ? (
            <>
              <span>Delete your {count} shared {count === 1 ? "crop" : "crops"}?</span>
              <button
                type="button"
                className="ghost scan-share-danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate()}
              >
                Delete
              </button>
              <button type="button" className="ghost" disabled={remove.isPending} onClick={() => setConfirming(false)}>
                Keep
              </button>
            </>
          ) : (
            <button type="button" className="scan-share-link" onClick={() => setConfirming(true)}>
              Delete my shared crops
            </button>
          )}
        </p>
      )}
    </div>
  );
}
