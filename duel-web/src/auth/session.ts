import { useEffect } from "react";
import { createStore } from "../lib/createStore";
import { fetchAuthMe, type AuthUser } from "../net/api";

export type AuthState = { status: "loading" | "signed-out" | "ready"; user: AuthUser | null };

export const AUTH_MAX_AGE_MS = 5 * 60_000;

const LOADING: AuthState = { status: "loading", user: null };
const store = createStore<AuthState>(LOADING);

let inflight: Promise<AuthUser | null> | null = null;
/** Bumped by `setAuthUser` / `clearAuth`, so an `/auth/me` that was already on its way cannot overwrite them. */
let epoch = 0;
let answeredAt = 0;
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
    if (mine === epoch && !(failed && store.get().status === "ready")) settle(user);
    return store.get().user;
  })().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function ensureAuth(): Promise<AuthUser | null> {
  const cur = store.get();
  if (cur.status === "loading" || failed || Date.now() - answeredAt > AUTH_MAX_AGE_MS) return load();
  return Promise.resolve(cur.user);
}

export async function refreshAuth(): Promise<AuthUser | null> {
  if (inflight) await inflight.catch(() => undefined);
  return load();
}

export function setAuthUser(user: AuthUser | null): void {
  epoch++;
  failed = false;
  settle(user);
}

export function clearAuth(): void {
  setAuthUser(null);
}

export const getAuth = store.get;
export const subscribeAuth = store.subscribe;

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

export const useAuth = (): AuthState => useAuthSelector((s) => s);

export const useAuthUser = (): AuthUser | null => useAuthSelector((s) => s.user);

export const useAccountRole = (): AuthUser["role"] | null => useAuthSelector((s) => s.user?.role ?? null);
