export const WAS_PRERENDERED: boolean = typeof document !== "undefined" && document.getElementById("root")?.hasAttribute("data-prerendered") === true;

export const SIGNED_IN_HINT_KEY = "optcg.signedIn";

function hintStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function hasSignedInHint(): boolean {
  try {
    return hintStorage()?.getItem(SIGNED_IN_HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSignedInHint(signedIn: boolean): void {
  try {
    if (signedIn) hintStorage()?.setItem(SIGNED_IN_HINT_KEY, "1");
    else hintStorage()?.removeItem(SIGNED_IN_HINT_KEY);
  } catch {
    /* storage blocked: the hint is only an optimisation */
  }
}

export const KEEP_PRERENDER_WHILE_LOADING: boolean = WAS_PRERENDERED && !hasSignedInHint();

/**
 * Hand `#root` to the app (#921). The `data-prerendered` mark must go: React replaces the children but keeps the
 * attribute, and styles.css hides `#root[data-prerendered] > *` for a signed-in browser, which would hide the whole app.
 * A signed-in browser also drops the hidden logged-out markup now, so it never shows while React mounts.
 */
export function releasePrerenderedRoot(root: HTMLElement): void {
  if (!root.hasAttribute("data-prerendered")) return;
  if (!KEEP_PRERENDER_WHILE_LOADING) root.replaceChildren();
  root.removeAttribute("data-prerendered");
}

export const META_SEED_ID = "meta-seed";

export type MetaSeed = { generatedAt: string; days: number; leaders: unknown };

export function readMetaSeed(): MetaSeed | null {
  if (typeof document === "undefined") return null;
  try {
    const raw = document.getElementById(META_SEED_ID)?.textContent;
    const v = raw ? (JSON.parse(raw) as Partial<MetaSeed>) : null;
    return v && typeof v.generatedAt === "string" && typeof v.days === "number" && v.leaders ? (v as MetaSeed) : null;
  } catch {
    return null;
  }
}
