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
};

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

/** POST /analyst/access/request. Resolves to "pending"; rejects with the server's reason (e.g. the 24 hour wait). */
export async function requestAccess(apiBase: string, note: string, fetchImpl: typeof fetch = fetch): Promise<AccessState> {
  await call(apiBase, "/request", { method: "POST", ...json({ note: note.trim().slice(0, NOTE_MAX) }) }, fetchImpl);
  return "pending";
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
  };
}

/** GET /analyst/access/requests (owners only), in the order the API sends them. */
export async function listAccessRequests(apiBase: string, fetchImpl: typeof fetch = fetch): Promise<AccessRequest[]> {
  const res = await call(apiBase, "/requests", {}, fetchImpl);
  const body = (await res.json()) as { requests?: unknown };
  return (Array.isArray(body.requests) ? body.requests : []).map(parseRow).filter((r): r is AccessRequest => r !== null);
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

/** Pending first, then approved, then denied; the incoming (newest-first) order is kept within each. */
export function sortRequests(rows: AccessRequest[]): AccessRequest[] {
  return [...rows].sort((a, b) => RANK[a.status] - RANK[b.status]);
}
