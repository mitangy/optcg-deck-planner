/**
 * True when this page came from the build-time pre-render (#914): its `#root` held real markup before the app started.
 * Read once at startup, before React replaces the markup. While the session loads, the public routes keep showing that
 * same page instead of a skeleton, so a visitor sees no flash between the HTML and the app.
 */
export const WAS_PRERENDERED: boolean = typeof document !== "undefined" && document.getElementById("root")?.hasAttribute("data-prerendered") === true;

/** Id of the `<script type="application/json">` holding the leaders the pre-render fetched. */
export const META_SEED_ID = "meta-seed";

export type MetaSeed = { generatedAt: string; days: number; leaders: unknown };

/** The leaders response embedded in a pre-rendered `/meta`, or null. */
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
