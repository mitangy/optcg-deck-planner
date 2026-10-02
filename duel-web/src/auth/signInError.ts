import { ApiError } from "../net/api";

/** Thrown when the OAuth return URL has no one-time ticket. */
export class MissingTicketError extends Error {
  constructor() {
    super("Missing login ticket");
    this.name = "MissingTicketError";
  }
}

/**
 * What the sign-in landing page says when signing in fails: a plain sentence
 * for players, never the raw API text.
 */
export function signInErrorMessage(e: unknown): string {
  if (e instanceof MissingTicketError) {
    return "This sign-in link is incomplete. Please sign in again.";
  }
  if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
    return "This sign-in link has expired or was already used. Please sign in again.";
  }
  return "We couldn't finish signing you in. Please try again in a moment.";
}
