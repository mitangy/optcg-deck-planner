/** Account-backed duel settings and uploaded playmats / card backs. */
import { getApiBaseUrl } from "../config";
import { ApiError } from "./api";

export type CosmeticKind = "playmat" | "cardBack";

export type AccountCosmetic = {
  id: number;
  kind: CosmeticKind;
  size: number;
  created_at: string;
  /**
   * Signed, cookie-free path (relative to the API base) the opponent's board can
   * load: `/duel/cosmetics/<id>/public/<sig>`. Absent on older APIs.
   */
  public_path?: string;
};

export type AccountCosmetics = {
  items: AccountCosmetic[];
  active: Record<CosmeticKind, number | null>;
};

async function call<T>(path: string, init: RequestInit = {}, fallback = "Request failed"): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, { credentials: "include", ...init });
  if (!res.ok) {
    let detail = `${fallback} (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      if (typeof body.detail === "string" && body.detail) detail = body.detail;
    } catch {
      /* non-JSON body */
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function fetchAccountSettings(): Promise<{ settings: Record<string, unknown> | null }> {
  return call("/duel/settings");
}

export function putAccountSettings(settings: Record<string, string | number | boolean>): Promise<unknown> {
  return call("/duel/settings", { method: "PUT", ...json({ settings }) }, "Could not save settings");
}

export function fetchAccountCosmetics(): Promise<AccountCosmetics> {
  return call("/duel/cosmetics");
}

export function uploadAccountCosmetic(
  kind: CosmeticKind,
  image: Blob,
  activate = true,
): Promise<AccountCosmetics> {
  return call(
    `/duel/cosmetics/${kind}?activate=${activate}`,
    { method: "POST", headers: { "Content-Type": image.type || "application/octet-stream" }, body: image },
    "Could not save the image to your account",
  );
}

export function selectAccountCosmetic(kind: CosmeticKind, id: number | null): Promise<AccountCosmetics> {
  return call("/duel/cosmetics/active", { method: "PUT", ...json({ kind, id }) }, "Could not switch image");
}

export function deleteAccountCosmetic(id: number): Promise<AccountCosmetics> {
  return call(`/duel/cosmetics/${id}`, { method: "DELETE" }, "Could not delete image");
}

/** URL of one of your uploads (needs your session cookie, so same-site only). */
export function accountCosmeticUrl(id: number): string {
  return `${getApiBaseUrl()}/duel/cosmetics/${id}/image`;
}

export async function downloadAccountCosmetic(id: number): Promise<Blob> {
  const res = await fetch(accountCosmeticUrl(id), { credentials: "include" });
  if (!res.ok) throw new ApiError(res.status, `Could not load image (${res.status})`);
  return res.blob();
}

/** A saved duel deck as the account stores it (the browser's `SavedDeck` minus its id and time). */
export type AccountDeckBody = {
  name: string;
  leaderId: string;
  cards: string[];
  artPrefs?: Record<string, string>;
  plannerDeckId?: number;
  editedLocally?: boolean;
};

export type AccountDeck = {
  id: string;
  updatedAt: number;
  deleted: boolean;
  deck?: AccountDeckBody | null;
};

export function fetchAccountDecks(): Promise<{ decks: AccountDeck[] }> {
  return call("/duel/decks");
}

export function putAccountDecks(
  decks: { id: string; deck: AccountDeckBody; updatedAt: number }[],
): Promise<{ decks: AccountDeck[] }> {
  return call("/duel/decks", { method: "PUT", ...json({ decks }) }, "Could not save decks");
}

/** Resolves to the account's copy: yours if it won, the stored one if that was newer. */
export function putAccountDeck(id: string, deck: AccountDeckBody, updatedAt: number): Promise<AccountDeck> {
  return call(
    `/duel/decks/${encodeURIComponent(id)}`,
    { method: "PUT", ...json({ deck, updatedAt }) },
    "Could not save deck",
  );
}

export function deleteAccountDeck(id: string, updatedAt: number): Promise<AccountDeck> {
  return call(
    `/duel/decks/${encodeURIComponent(id)}?updatedAt=${updatedAt}`,
    { method: "DELETE" },
    "Could not delete deck",
  );
}
