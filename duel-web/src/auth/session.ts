/**
 * Who is signed in, fetched once and shared. Before this store every page, the nav menu and the account sync each
 * asked `/auth/me` themselves, so a cold lobby load made three requests and pages could disagree about the answer.
 *
 * The state is `loading` until the first answer, then `signed-out` or `ready` with the user. One `/auth/me`
 * request is in flight at a time, whoever asks. Sign-in and username changes put the new user in with
 * `setAuthUser` (both calls return it), and a sign-out empties it with `clearAuth`.
 */
import { useEffect } from "react";
import { createStore } from "../lib/createStore";
import { fetchAuthMe, type AuthUser } from "../net/api";

export type AuthState = { status: "loading" | "signed-out" | "ready"; user: AuthUser | null };

/** How long an answer is trusted before the next page that asks re-checks it (a ban, a role change, a lapsed session). */
export const AUTH_MAX_AGE_MS = 5 * 60_000;

const LOADING: AuthState = { status: "loading", user: null };
const store = createStore<AuthState>(LOADING);

let inflight: Promise<AuthUser | null> | null = null;
/** Bumped by `setAuthUser` / `clearAuth`, so an `/auth/me` that was already on its way cannot overwrite them. */
let epoch = 0;
let answeredAt = 0;
/** The last request failed outright (offline, 5xx): shown as signed out, but the next page that asks tries again. */
let failed = false;

function settle(user: AuthUser | null): void {
  answeredAt = Date.now();
  const next: AuthState = user ? { status: "ready", user } : { status: "signed-out", user: null };
  const cur = store.get();
  if (cur.status === next.status && JSON.stringify(cur.user) === JSON.stringify(next.user)) return;
  store.set(next);
}

function load(): Promise<AuthUser | null> {
  inflight ??= (async () => {
    const mine = epoch;
    let user: AuthUser | null = null;
    try {
      user = await fetchAuthMe();
      failed = false;
    } catch {
      failed = true;
    }
    // A failed re-check of someone already signed in must not sign them out: keep the answer we have.
    if (mine === epoch && !(failed && store.get().status === "ready")) settle(user);
    return store.get().user;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

/** The signed-in user (null when signed out), asking the server only when nothing fresh is known. Never rejects. */
export function ensureAuth(): Promise<AuthUser | null> {
  const cur = store.get();
  if (cur.status === "loading" || failed || Date.now() - answeredAt > AUTH_MAX_AGE_MS) return load();
  return Promise.resolve(cur.user);
}

/** Ask the server again whatever is cached (after something that may have changed the account on the server). */
export async function refreshAuth(): Promise<AuthUser | null> {
  if (inflight) await inflight.catch(() => undefined);
  return load();
}

/** Put a user the server just returned (sign-in claim, username change) into the store. */
export function setAuthUser(user: AuthUser | null): void {
  epoch++;
  failed = false;
  settle(user);
}

/** On sign-out: nobody is signed in any more. */
export function clearAuth(): void {
  setAuthUser(null);
}

export const getAuth = store.get;
export const subscribeAuth = store.subscribe;

/** Back to "not asked yet", between tests. */
export function resetAuthForTests(): void {
  epoch++;
  inflight = null;
  failed = false;
  answeredAt = 0;
  store.set(LOADING);
}

function useAuthSelector<S>(selector: (s: AuthState) => S): S {
  useEffect(() => {
    void ensureAuth();
  }, []);
  return store.use(selector);
}

/** The whole auth state: `loading` until the first answer. */
export const useAuth = (): AuthState => useAuthSelector((s) => s);

/** The signed-in user; null while loading or signed out. */
export const useAuthUser = (): AuthUser | null => useAuthSelector((s) => s.user);

/** The signed-in account's role; null while loading, signed out or when the API did not say. */
export const useAccountRole = (): AuthUser["role"] | null => useAuthSelector((s) => s.user?.role ?? null);
