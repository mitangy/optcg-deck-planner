export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

/** Small seeded generator so a take's wobble is the same every run. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Eased page scroll driven from inside the page (requestAnimationFrame, ease-in-out cubic), awaited.
 * `target` is a selector (its top lands at `offset` px, default just below the sticky header) or an absolute scrollY.
 * Native `scrollIntoView({behavior:"smooth"})` is skipped here: under Xvfb it jumps or is cut short, which reads as a splice.
 */
export async function easeScrollTo(
  page: import("playwright").Page,
  target: string | number,
  opts: { ms?: number; offset?: number } = {},
): Promise<void> {
  const ms = opts.ms ?? 800;
  await page.evaluate(
    ({ target, ms, offset }: { target: string | number; ms: number; offset: number | null }) =>
      new Promise<void>((resolve) => {
        const el = document.scrollingElement || document.documentElement;
        const from = el.scrollTop;
        let to: number;
        if (typeof target === "number") to = target;
        else {
          const node = document.querySelector(target);
          if (!node) return resolve();
          const pad = offset ?? (parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0);
          to = from + node.getBoundingClientRect().top - pad;
        }
        to = Math.max(0, Math.min(to, el.scrollHeight - el.clientHeight));
        if (Math.abs(to - from) < 1) return resolve();
        const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
        const t0 = performance.now();
        const step = (now: number) => {
          const t = Math.min(1, (now - t0) / ms);
          el.scrollTop = from + (to - from) * ease(t);
          if (t < 1) requestAnimationFrame(step);
          else resolve();
        };
        requestAnimationFrame(step);
      }),
    { target, ms, offset: opts.offset ?? null },
  );
}

/** Wait until the page's height and scroll position have stopped changing (reflow after a crop, an upload, a dialog closing). */
export async function layoutSettled(page: import("playwright").Page, quietMs = 400, maxMs = 6000): Promise<void> {
  const start = Date.now();
  let last = "";
  let since = Date.now();
  while (Date.now() - start < maxMs) {
    const now = await page.evaluate(() => {
      const el = document.scrollingElement || document.documentElement;
      return `${el.scrollHeight}:${Math.round(el.scrollTop)}`;
    });
    if (now !== last) { last = now; since = Date.now(); }
    else if (Date.now() - since >= quietMs) return;
    await sleep(60);
  }
}
