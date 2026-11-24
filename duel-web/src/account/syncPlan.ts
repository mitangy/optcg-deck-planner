export type LocalCosmetic = { hasImage: boolean; accountId: number | null };

export type SyncPlan = {
  upload: "activate" | "history" | null;
  apply: { download: number } | "clear" | null;
};

export function planCosmeticSync(local: LocalCosmetic, accountActive: number | null): SyncPlan {
  const localOnly = local.hasImage && local.accountId === null;
  if (accountActive === null) {
    if (localOnly) return { upload: "activate", apply: null };
    return { upload: null, apply: local.hasImage ? "clear" : null };
  }
  const upload = localOnly ? "history" : null;
  if (local.hasImage && local.accountId === accountActive) return { upload, apply: null };
  return { upload, apply: { download: accountActive } };
}
