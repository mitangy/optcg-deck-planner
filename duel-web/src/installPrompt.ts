/**
 * Add-to-home-screen / fullscreen helpers. Pure functions over an injected
 * environment snapshot so they are testable without a DOM.
 */

export const IOS_HINT_DISMISSED_KEY = "optcg-duel.iosInstallHintDismissed";

export type InstallEnv = {
  userAgent: string;
  maxTouchPoints: number;
  /** matchMedia("(display-mode: standalone)").matches */
  standaloneMedia: boolean;
  /** iOS Safari's non-standard navigator.standalone */
  navigatorStandalone: boolean;
  fullscreenEnabled: boolean;
  storage: Pick<Storage, "getItem" | "setItem"> | null;
};

export function isStandalone(env: InstallEnv): boolean {
  return env.standaloneMedia || env.navigatorStandalone === true;
}

/** iPhone/iPad, including iPadOS which reports a "Macintosh" desktop UA. */
export function isIos(env: InstallEnv): boolean {
  if (/iPhone|iPad|iPod/.test(env.userAgent)) return true;
  return /Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1;
}

/** Only Safari can "Add to Home Screen" with the Share sheet; other iOS browsers are skinned WebKit. */
function isIosSafari(env: InstallEnv): boolean {
  return isIos(env) && !/CriOS|FxiOS|EdgiOS/.test(env.userAgent);
}

export function isIosHintDismissed(env: InstallEnv): boolean {
  try {
    return env.storage?.getItem(IOS_HINT_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissIosHint(env: InstallEnv): void {
  try {
    env.storage?.setItem(IOS_HINT_DISMISSED_KEY, "1");
  } catch {
    // Private mode: the hint just comes back next visit.
  }
}

export function shouldShowIosInstallHint(env: InstallEnv): boolean {
  return isIosSafari(env) && !isStandalone(env) && !isIosHintDismissed(env);
}

/** iOS has no Fullscreen API on iPhone, and an installed app is already chromeless. */
export function canOfferFullscreen(env: InstallEnv): boolean {
  return env.fullscreenEnabled && !isStandalone(env) && !isIos(env);
}

/** Snapshot of the real browser. Safe to call during render; returns a no-op env off the DOM. */
export function readInstallEnv(): InstallEnv {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return {
      userAgent: "",
      maxTouchPoints: 0,
      standaloneMedia: false,
      navigatorStandalone: false,
      fullscreenEnabled: false,
      storage: null,
    };
  }
  let storage: InstallEnv["storage"] = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  return {
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    standaloneMedia: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
    navigatorStandalone:
      (navigator as Navigator & { standalone?: boolean }).standalone === true,
    fullscreenEnabled: typeof document !== "undefined" && document.fullscreenEnabled === true,
    storage,
  };
}
