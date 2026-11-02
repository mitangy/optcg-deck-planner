import { useSyncExternalStore } from "react";
import { BUILD_SHA } from "./buildInfo";

/**
 * "Am I on the latest app?" Each deploy ships `/version.json` (see
 * vite.config.ts) naming the commit it was built from. An open tab can
 * sit on an old bundle for days, so we fetch that file uncached and compare it
 * with the commit baked into the running bundle.
 */

export type DeployedVersion = { sha: string; builtAt: string | null };

export type UpdateStatus =
  | { kind: "checking" }
  /** Dev build, offline, or no version file: nothing to compare. */
  | { kind: "unknown" }
  | { kind: "latest" }
  | { kind: "update"; deployed: DeployedVersion };

/** Reads the body of `/version.json`; anything else (an HTML fallback page, junk) is null. */
export function parseDeployedVersion(body: unknown): DeployedVersion | null {
  if (!body || typeof body !== "object") return null;
  const { sha, builtAt } = body as { sha?: unknown; builtAt?: unknown };
  if (typeof sha !== "string" || !/^[0-9a-f]{7,40}$/i.test(sha.trim())) return null;
  return {
    sha: sha.trim().slice(0, 7),
    builtAt: typeof builtAt === "string" ? builtAt : null,
  };
}

/** Compares the running bundle with what is deployed now. */
export function compareVersions(
  running: string,
  deployed: DeployedVersion | null,
): Exclude<UpdateStatus, { kind: "checking" }> {
  if (!deployed || running === "dev" || running === "unknown") return { kind: "unknown" };
  if (deployed.sha === running) return { kind: "latest" };
  return { kind: "update", deployed };
}

let status: UpdateStatus = { kind: "checking" };
const listeners = new Set<() => void>();
let inFlight: Promise<void> | null = null;
let lastCheck = 0;

/** The newer sha the person pressed "Later" on; a different newer sha shows the notice again. */
let dismissedSha: string | null = null;
let pending: DeployedVersion | null = null;

/** The update to nag about, or null when there is none or this sha was dismissed. */
export function pendingUpdate(s: UpdateStatus, dismissed: string | null): DeployedVersion | null {
  return s.kind === "update" && s.deployed.sha !== dismissed ? s.deployed : null;
}

function notify() {
  const next = pendingUpdate(status, dismissedSha);
  if (next?.sha !== pending?.sha) pending = next;
  for (const l of listeners) l();
}

function setStatus(next: UpdateStatus) {
  status = next;
  notify();
}

/** Hides the update notice for this tab until a different newer build appears. */
export function dismissUpdate() {
  if (status.kind !== "update") return;
  dismissedSha = status.deployed.sha;
  notify();
}

/** Fetches `/version.json` fresh and updates the shared status. */
export function checkForUpdate(): Promise<void> {
  if (inFlight) return inFlight;
  lastCheck = Date.now();
  inFlight = (async () => {
    let deployed: DeployedVersion | null = null;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (res.ok) deployed = parseDeployedVersion(await res.json());
    } catch {
      deployed = null;
    }
    setStatus(compareVersions(BUILD_SHA, deployed));
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

const RECHECK_MS = 10 * 60_000;
const RETURN_THROTTLE_MS = 60_000;
let started = false;

/** Checks on launch, when the app comes back to the foreground, and every 10 minutes while open. */
export function startUpdateChecks() {
  if (started || typeof window === "undefined") return;
  started = true;
  void checkForUpdate();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && Date.now() - lastCheck > RETURN_THROTTLE_MS) {
      void checkForUpdate();
    }
  });
  window.setInterval(() => {
    if (document.visibilityState === "visible") void checkForUpdate();
  }, RECHECK_MS);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useUpdateStatus(): UpdateStatus {
  return useSyncExternalStore(subscribe, () => status, () => status);
}

/** The update notice should show: a newer build is live and not dismissed. */
export function usePendingUpdate(): DeployedVersion | null {
  return useSyncExternalStore(subscribe, () => pending, () => pending);
}
