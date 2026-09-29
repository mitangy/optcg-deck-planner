import { createHmac, timingSafeEqual } from "node:crypto";
import { getGameTokenSecret } from "./env.js";

export type GameTokenPayload = {
  uid: number;
  email: string;
  exp: number;
  /** Public display name (username, else account name). Absent on older tokens. */
  name?: string;
};

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function b64urlDecode(s: string): Buffer {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  return Buffer.from(b64, "base64");
}

/** Verify FastAPI HMAC game token (`body.sig`). */
export function verifyGameToken(token: string): GameTokenPayload | null {
  if (!token || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = b64url(
    createHmac("sha256", getGameTokenSecret()).update(body).digest(),
  );
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(b64urlDecode(body).toString("utf8")) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  const uid = Number(payload.uid);
  const exp = Number(payload.exp);
  const email = payload.email;
  if (!Number.isFinite(uid) || !Number.isFinite(exp) || typeof email !== "string") {
    return null;
  }
  if (exp < Math.floor(Date.now() / 1000)) return null;
  const name = sanitizeDisplayName(payload.name);
  return name ? { uid, email, exp, name } : { uid, email, exp };
}

/**
 * Normalize a player display name for the wire: trimmed, control chars
 * stripped, max 40 chars. Returns undefined when nothing usable remains.
 */
export function sanitizeDisplayName(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 40);
  return cleaned || undefined;
}
