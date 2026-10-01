/**
 * What to do when this browser's playmat / card back meets the account's.
 * Pure so it can be unit tested; account/cosmeticsSync.ts carries it out.
 */

/** This browser's copy: is an image stored, and which account upload is it (null = local only). */
export type LocalCosmetic = { hasImage: boolean; accountId: number | null };

export type SyncPlan = {
  /** Upload the local-only image: make it the account's choice, or just keep it in history. */
  upload: "activate" | "history" | null;
  /** Then: download the account's choice, clear the local copy, or leave it. */
  apply: { download: number } | "clear" | null;
};

export function planCosmeticSync(local: LocalCosmetic, accountActive: number | null): SyncPlan {
  const localOnly = local.hasImage && local.accountId === null;
  if (accountActive === null) {
    // First sign-in from a browser that already had art: the account adopts it.
    if (localOnly) return { upload: "activate", apply: null };
    // The account went back to the default (on another device, or deleted).
    return { upload: null, apply: local.hasImage ? "clear" : null };
  }
  const upload = localOnly ? "history" : null;
  if (local.hasImage && local.accountId === accountActive) return { upload, apply: null };
  return { upload, apply: { download: accountActive } };
}
