/** Asking for Log Pose, and (for owners) answering those requests. Cookie auth against the API. */
import type { AccessState } from "./session";

export type AccessStatus = "pending" | "approved" | "denied";
export type AccessRequest = {
  userId: number;
  name: string;
  note: string;
  status: AccessStatus;
  createdAt: string | null;
  decidedAt: string | null;
  /** Approved at once by a free spot. */
  autoApproved: boolean;
  /** This month's credit (null for an owner) and what the player has used of it. */
  creditUsd: number | null;
  creditSpentUsd: number;
  /** When the player, out of credit, asked for more. */
  topupRequestedAt: string | null;
};
export type AccessList = { requests: AccessRequest[]; freeSpots: number; spotsUsed: number };

export const NOTE_MAX = 500;
const FAILED = "Something went wrong. Try again in a moment.";

/** The API's `detail` text for a failed call, or a generic line. */
async function failure(res: Response): Promise<Error> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail.trim()) return new Error(body.detail.trim().slice(0, 300));
  } catch {
    /* not JSON */
  }
  return new Error(FAILED);
}

async function call(apiBase: string, path: string, init: RequestInit, fetchImpl: typeof fetch): Promise<Response> {
  let res: Response;
  try {
    res = await fetchImpl(`${apiBase}/analyst/access${path}`, { credentials: "include", ...init });
  } catch {
    throw new Error(FAILED);
  }
  if (!res.ok) throw await failure(res);
  return res;
}

const json = (body: unknown): RequestInit => ({ headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/**
 * POST /analyst/access/request. Resolves to "approved" when a free spot was left (Log Pose is on at once) or "pending"
 * for the waitlist; rejects with the server's reason (e.g. the 24 hour wait).
 */
export async function requestAccess(apiBase: string, note: string, fetchImpl: typeof fetch = fetch): Promise<"pending" | "approved"> {
  const res = await call(apiBase, "/request", { method: "POST", ...json({ note: note.trim().slice(0, NOTE_MAX) }) }, fetchImpl);
  const body = (await res.json().catch(() => ({}))) as { access?: unknown };
  return body.access === "approved" ? "approved" : "pending";
}

function parseRow(raw: unknown): AccessRequest | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const status = r.status;
  if (typeof r.user_id !== "number" || (status !== "pending" && status !== "approved" && status !== "denied")) return null;
  return {
    userId: r.user_id,
    name: typeof r.name === "string" && r.name ? r.name : "Unknown player",
    note: typeof r.note === "string" ? r.note : "",
    status,
    createdAt: typeof r.created_at === "string" ? r.created_at : null,
    decidedAt: typeof r.decided_at === "string" ? r.decided_at : null,
    autoApproved: r.auto_approved === true,
    creditUsd: typeof r.credit_usd === "number" ? r.credit_usd : null,
    creditSpentUsd: typeof r.credit_spent_usd === "number" ? r.credit_spent_usd : 0,
    topupRequestedAt: typeof r.topup_requested_at === "string" ? r.topup_requested_at : null,
  };
}

/** GET /analyst/access/requests (owners only): the requests in the order the API sends them, and how many free spots there are and are taken. */
export async function listAccessRequests(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<AccessList> {
  const res = await call(apiBase, "/requests", {}, fetchImpl);
  const body = (await res.json()) as { requests?: unknown; free_spots?: unknown; spots_used?: unknown };
  return {
    requests: (Array.isArray(body.requests) ? body.requests : []).map(parseRow).filter((r): r is AccessRequest => r !== null),
    freeSpots: typeof body.free_spots === "number" ? body.free_spots : 0,
    spotsUsed: typeof body.spots_used === "number" ? body.spots_used : 0,
  };
}

/** PUT /analyst/access/free-spots (owners only): how many players are approved at once. */
export async function setFreeSpots(apiBase: string, freeSpots: number, fetchImpl: typeof fetch = fetch): Promise<{ freeSpots: number; spotsUsed: number }> {
  const res = await call(apiBase, "/free-spots", { method: "PUT", ...json({ free_spots: freeSpots }) }, fetchImpl);
  const body = (await res.json()) as { free_spots?: unknown; spots_used?: unknown };
  if (typeof body.free_spots !== "number") throw new Error(FAILED);
  return { freeSpots: body.free_spots, spotsUsed: typeof body.spots_used === "number" ? body.spots_used : 0 };
}

/** POST /analyst/access/requests/{userId}/topup (owners only): add $5 for this month to a player who asked, or dismiss the ask. */
export async function answerTopup(apiBase: string, userId: number, action: "add" | "dismiss", fetchImpl: typeof fetch = fetch): Promise<AccessRequest> {
  const res = await call(apiBase, `/requests/${encodeURIComponent(String(userId))}/topup`, { method: "POST", ...json({ action }) }, fetchImpl);
  const row = parseRow(await res.json());
  if (!row) throw new Error(FAILED);
  return row;
}

/** POST /analyst/access/requests/{userId}: approve, or deny (which also revokes an approved player). */
export async function decideAccess(
  apiBase: string,
  userId: number,
  status: "approved" | "denied",
  fetchImpl: typeof fetch = fetch,
): Promise<AccessRequest> {
  const res = await call(apiBase, `/requests/${encodeURIComponent(String(userId))}`, { method: "POST", ...json({ status }) }, fetchImpl);
  const row = parseRow(await res.json());
  if (!row) throw new Error(FAILED);
  return row;
}

const RANK: Record<AccessStatus, number> = { pending: 0, approved: 1, denied: 2 };

const rank = (r: AccessRequest) => (r.topupRequestedAt ? -1 : RANK[r.status]);

/** Players asking for more credit first, then pending, approved and denied; the incoming (newest-first) order is kept within each. */
export function sortRequests(rows: AccessRequest[]): AccessRequest[] {
  return [...rows].sort((a, b) => rank(a) - rank(b));
}
