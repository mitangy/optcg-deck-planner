/**
 * A visible, good-looking cursor for screen captures. The browser's own cursor never reaches x11grab, so a
 * page overlay follows the (CDP-driven) mouse instead, with a soft click ripple. `Pointer` moves it like a
 * hand: curved paths, eased speed, a beat before clicking.
 */
import type { BrowserContext, Locator, Page } from "playwright";
import { easeInOutCubic, rng, sleep } from "./util";

export type CursorStyle = "arrow" | "touch";

/** Installed before any page script runs; survives navigations by remembering its place in sessionStorage. */
export async function installCursor(ctx: BrowserContext, style: CursorStyle = "arrow"): Promise<void> {
  await ctx.addInitScript((styleName: string) => {
    const mount = () => {
      if (document.getElementById("__trailer-cursor")) return;
      const css = document.createElement("style");
      css.textContent = `
        #__trailer-cursor{position:fixed;left:0;top:0;width:0;height:0;z-index:2147483647;pointer-events:none;will-change:transform;opacity:0;transition:opacity .25s}
        #__trailer-cursor.on{opacity:1}
        #__trailer-cursor .tc-arrow{position:absolute;left:-3px;top:-2px;width:30px;height:38px;filter:drop-shadow(0 3px 5px rgba(0,0,0,.45));transform-origin:4px 3px;transition:transform .09s ease-out}
        #__trailer-cursor.down .tc-arrow{transform:scale(.88)}
        #__trailer-cursor .tc-touch{position:absolute;left:-26px;top:-26px;width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.34);border:2px solid rgba(255,255,255,.75);box-shadow:0 2px 14px rgba(0,0,0,.35);transition:transform .1s ease-out,background .1s}
        #__trailer-cursor.down .tc-touch{transform:scale(.78);background:rgba(255,255,255,.55)}
        .__trailer-ripple{position:fixed;z-index:2147483646;pointer-events:none;border-radius:50%;border:3px solid rgba(255,255,255,.9);box-shadow:0 0 18px rgba(255,214,120,.55);transform:translate(-50%,-50%) scale(.2);opacity:.95;animation:__trailer-ripple .55s cubic-bezier(.2,.7,.3,1) forwards}
        @keyframes __trailer-ripple{to{transform:translate(-50%,-50%) scale(1);opacity:0}}
      `;
      const el = document.createElement("div");
      el.id = "__trailer-cursor";
      el.innerHTML =
        styleName === "touch"
          ? '<div class="tc-touch"></div>'
          : '<svg class="tc-arrow" viewBox="0 0 30 38" xmlns="http://www.w3.org/2000/svg"><path d="M3.2 2.2 L3.2 28.4 L9.6 22.6 L14.1 33.6 L19.1 31.5 L14.6 20.7 L23.4 20.3 Z" fill="#fff" stroke="#10151b" stroke-width="2.2" stroke-linejoin="round"/></svg>';
      document.documentElement.append(css, el);
      let x = 0, y = 0;
      try {
        const saved = JSON.parse(sessionStorage.getItem("__trailer-cursor") || "null");
        if (saved) { x = saved.x; y = saved.y; el.classList.add("on"); }
      } catch { /* storage blocked */ }
      const place = () => { el.style.transform = `translate(${x}px,${y}px)`; };
      place();
      const move = (e: MouseEvent) => {
        x = e.clientX; y = e.clientY;
        el.classList.add("on");
        place();
        try { sessionStorage.setItem("__trailer-cursor", JSON.stringify({ x, y })); } catch { /* ignore */ }
      };
      addEventListener("mousemove", move, true);
      addEventListener("mousedown", (e) => {
        move(e);
        el.classList.add("down");
        const r = document.createElement("div");
        r.className = "__trailer-ripple";
        r.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:${styleName === "touch" ? 90 : 64}px;height:${styleName === "touch" ? 90 : 64}px`;
        document.documentElement.append(r);
        setTimeout(() => r.remove(), 650);
      }, true);
      addEventListener("mouseup", () => el.classList.remove("down"), true);
    };
    if (document.documentElement) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
    // A React root swap never removes it (it hangs off <html>), but a full document replace would: re-mount.
    new MutationObserver(() => { if (!document.getElementById("__trailer-cursor") && document.documentElement) mount(); }).observe(document, { childList: true });
  }, style);
}

export type MoveOpts = {
  /** Total time in ms; default scales with distance. */
  ms?: number;
  /** 0 = straight, 1 = a big arc. */
  curve?: number;
};

const FRAME_MS = 1000 / 60;

export class Pointer {
  x: number;
  y: number;
  private rand: () => number;

  constructor(
    readonly page: Page,
    start = { x: 960, y: 540 },
    seed = 7,
  ) {
    this.x = start.x;
    this.y = start.y;
    this.rand = rng(seed);
  }

  /** Put the cursor somewhere without a visible trip (before the recording starts). */
  async park(x: number, y: number): Promise<void> {
    this.x = x;
    this.y = y;
    await this.page.mouse.move(x, y);
  }

  async moveTo(x: number, y: number, opts: MoveOpts = {}): Promise<void> {
    const dx = x - this.x;
    const dy = y - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1.5) return;
    const ms = opts.ms ?? Math.max(260, Math.min(1250, 220 + dist * 0.62));
    const curve = opts.curve ?? 0.35;
    // A control point to one side of the straight line, so the hand arcs a little.
    const side = this.rand() < 0.5 ? -1 : 1;
    const bend = dist * 0.12 * curve * (0.6 + this.rand() * 0.8) * side;
    const nx = -dy / dist;
    const ny = dx / dist;
    const c1 = { x: this.x + dx * 0.3 + nx * bend, y: this.y + dy * 0.3 + ny * bend };
    const c2 = { x: this.x + dx * 0.72 + nx * bend * 0.5, y: this.y + dy * 0.72 + ny * bend * 0.5 };
    const p0 = { x: this.x, y: this.y };
    const start = performance.now();
    for (;;) {
      const t = Math.min(1, (performance.now() - start) / ms);
      const e = easeInOutCubic(t);
      const u = 1 - e;
      const px = u * u * u * p0.x + 3 * u * u * e * c1.x + 3 * u * e * e * c2.x + e * e * e * x;
      const py = u * u * u * p0.y + 3 * u * u * e * c1.y + 3 * u * e * e * c2.y + e * e * e * y;
      await this.page.mouse.move(px, py);
      if (t >= 1) break;
      await sleep(FRAME_MS);
    }
    this.x = x;
    this.y = y;
  }

  /** Centre of an element, nudged a little off true centre like a real click. */
  async centerOf(target: Locator | { x: number; y: number }): Promise<{ x: number; y: number }> {
    if ("x" in target) return target;
    await target.scrollIntoViewIfNeeded();
    const box = await target.boundingBox();
    if (!box) throw new Error("pointer target has no box");
    const jx = (this.rand() - 0.5) * Math.min(box.width * 0.25, 14);
    const jy = (this.rand() - 0.5) * Math.min(box.height * 0.25, 10);
    return { x: box.x + box.width / 2 + jx, y: box.y + box.height / 2 + jy };
  }

  async hover(target: Locator | { x: number; y: number }, opts: MoveOpts = {}): Promise<void> {
    const p = await this.centerOf(target);
    await this.moveTo(p.x, p.y, opts);
  }

  async click(target: Locator | { x: number; y: number }, opts: MoveOpts & { settle?: number } = {}): Promise<void> {
    const p = await this.centerOf(target);
    await this.moveTo(p.x, p.y, opts);
    await sleep(opts.settle ?? 140 + this.rand() * 90);
    await this.page.mouse.down();
    await sleep(70 + this.rand() * 40);
    await this.page.mouse.up();
  }

  async doubleClick(target: Locator | { x: number; y: number }): Promise<void> {
    await this.click(target);
    await sleep(90);
    await this.page.mouse.down();
    await sleep(60);
    await this.page.mouse.up();
  }

  /** Press, travel and release; used for arrows, panels and sliders. `via` adds a stop on the way. */
  async drag(
    from: Locator | { x: number; y: number },
    to: Locator | { x: number; y: number },
    opts: MoveOpts & { hold?: number } = {},
  ): Promise<void> {
    const a = await this.centerOf(from);
    await this.moveTo(a.x, a.y, { ms: opts.ms ? undefined : undefined });
    await sleep(140);
    await this.page.mouse.down();
    await sleep(opts.hold ?? 160);
    const b = await this.centerOf(to);
    await this.moveTo(b.x, b.y, { ms: opts.ms ?? 700, curve: opts.curve ?? 0.2 });
    await sleep(opts.hold ?? 160);
    await this.page.mouse.up();
  }

  /** A mouse wheel scroll spread over `ms`. */
  async scroll(totalY: number, ms = 900): Promise<void> {
    const start = performance.now();
    let done = 0;
    for (;;) {
      const t = Math.min(1, (performance.now() - start) / ms);
      const target = totalY * easeInOutCubic(t);
      const step = target - done;
      if (Math.abs(step) >= 1) {
        await this.page.mouse.wheel(0, step);
        done += step;
      }
      if (t >= 1) break;
      await sleep(FRAME_MS);
    }
  }
}
