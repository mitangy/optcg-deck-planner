/**
 * Playmat / card back uploads saved to a signed-in player's account.
 *
 * The browser keeps a local copy of the image in use (IndexedDB, see
 * cosmetics/browser.ts) so the board never waits on the network; the account
 * holds every upload and which one is chosen, so another device (or this one,
 * after storage is cleared) picks the same art up on the next sync.
 */
import { useSyncExternalStore } from "react";
import { cardBackSlot } from "../cardBack";
import type { ImageSlot } from "../cosmetics/imageSlot";
import {
  deleteAccountCosmetic,
  downloadAccountCosmetic,
  fetchAccountCosmetics,
  selectAccountCosmetic,
  uploadAccountCosmetic,
  type AccountCosmetic,
  type AccountCosmetics,
  type CosmeticKind,
} from "../net/prefsApi";
import { SKIN_PUBLIC_PATH } from "../net/protocol";
import { playmatSlot } from "../playmat";
import { planCosmeticSync } from "./syncPlan";

const SLOTS: Record<CosmeticKind, ImageSlot> = { playmat: playmatSlot, cardBack: cardBackSlot };
const KINDS: readonly CosmeticKind[] = ["playmat", "cardBack"];

export type AccountCosmeticsState = {
  signedIn: boolean;
  items: AccountCosmetic[];
  active: Record<CosmeticKind, number | null>;
};

let state: AccountCosmeticsState = {
  signedIn: false,
  items: [],
  active: { playmat: null, cardBack: null },
};
const listeners = new Set<() => void>();

function setState(patch: Partial<AccountCosmeticsState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

function adopt(res: AccountCosmetics) {
  setState({ items: res.items, active: res.active });
}

/** Which account upload the local copy is (null = uploaded here while signed out). */
function accountIdKey(kind: CosmeticKind) {
  return `optcg-duel:${kind}:account-id`;
}

function localAccountId(kind: CosmeticKind): number | null {
  try {
    const raw = localStorage.getItem(accountIdKey(kind));
    return raw ? Number(raw) || null : null;
  } catch {
    return null;
  }
}

function setLocalAccountId(kind: CosmeticKind, id: number | null) {
  try {
    if (id === null) localStorage.removeItem(accountIdKey(kind));
    else localStorage.setItem(accountIdKey(kind), String(id));
  } catch {
    // Storage disabled: the next sync just downloads again.
  }
}

async function applyChoice(kind: CosmeticKind, id: number | null) {
  if (id === null) {
    await SLOTS[kind].clear();
  } else {
    await SLOTS[kind].put(await downloadAccountCosmetic(id));
  }
  setLocalAccountId(kind, id);
}

/**
 * Public path of the image this browser shows for `kind`, when it is an account
 * upload the API can serve to the opponent (null: share it as a data URL).
 */
export function activePublicPath(kind: CosmeticKind): string | null {
  if (!state.signedIn) return null;
  const id = localAccountId(kind);
  if (id === null) return null;
  const path = state.items.find((i) => i.id === id)?.public_path;
  return typeof path === "string" && SKIN_PUBLIC_PATH.test(path) ? path : null;
}

/** Bring this browser and the account in line (on sign-in and app start). */
export async function syncCosmetics(): Promise<void> {
  const res = await fetchAccountCosmetics();
  setState({ signedIn: true });
  adopt(res);
  for (const kind of KINDS) {
    const slot = SLOTS[kind];
    const hasImage = (await slot.load()) !== null;
    const plan = planCosmeticSync({ hasImage, accountId: localAccountId(kind) }, res.active[kind]);
    try {
      if (plan.upload) {
        const blob = await slot.blob();
        if (blob) {
          const up = await uploadAccountCosmetic(kind, blob, plan.upload === "activate");
          adopt(up);
          if (plan.upload === "activate") setLocalAccountId(kind, up.active[kind]);
        }
      }
      if (plan.apply === "clear") await applyChoice(kind, null);
      else if (plan.apply) await applyChoice(kind, plan.apply.download);
    } catch {
      // Keep whatever this browser has; the next sync tries again.
    }
  }
}

export function stopCosmeticsSync(): void {
  setState({ signedIn: false, items: [], active: { playmat: null, cardBack: null } });
}

/** Save a new upload here and, when signed in, to the account as the active image. */
export async function saveCosmetic(kind: CosmeticKind, file: Blob): Promise<void> {
  const blob = await SLOTS[kind].save(file);
  setLocalAccountId(kind, null);
  if (!state.signedIn) return;
  try {
    const res = await uploadAccountCosmetic(kind, blob);
    adopt(res);
    setLocalAccountId(kind, res.active[kind]);
  } catch (e) {
    const why = e instanceof Error ? e.message : "upload failed";
    throw new Error(`Saved on this device only: ${why}`);
  }
}

/** Switch to an earlier upload, or back to the default (null). */
export async function chooseCosmetic(kind: CosmeticKind, id: number | null): Promise<void> {
  if (state.signedIn) adopt(await selectAccountCosmetic(kind, id));
  await applyChoice(kind, id);
}

/** Remove an upload from the account (falls back to the default if it was in use). */
export async function deleteCosmetic(kind: CosmeticKind, id: number): Promise<void> {
  adopt(await deleteAccountCosmetic(id));
  if (localAccountId(kind) === id) await applyChoice(kind, null);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAccountCosmetics(): AccountCosmeticsState {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
