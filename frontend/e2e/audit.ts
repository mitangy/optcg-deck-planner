import { expect, type Locator, type Page } from "@playwright/test";

export type AuditIssue = {
  kind: "hscroll" | "clipped" | "spill" | "covered" | "offscreen";
  where: string;
  text: string;
  detail: string;
};

export function issueKey(i: AuditIssue): string {
  return `${i.kind} ${i.where} "${i.text}"`;
}

export function formatIssues(issues: AuditIssue[]): string {
  return issues.map((i) => `  ${issueKey(i)}: ${i.detail}`).join("\n");
}

const DEFAULT_STACKS: string[] = [];

const DEFAULT_OFFSCREEN_OK: string[] = [];

const DEFAULT_HSCROLL_OK: string[] = [];

const DEFAULT_OVERLAYS = ["[role=dialog]", "[aria-modal=true]", ".market-sales", ".head-popover-panel", ".sort-menu-panel", ".stats-pill"];

export async function auditPage(
  page: Page,
  opts: { stacks?: string[]; overlays?: string[]; offscreenOk?: string[]; ignore?: string[] } = {},
): Promise<AuditIssue[]> {
  const settle = () =>
    page
      .waitForFunction(
        () => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
        undefined,
        { timeout: 5000 },
      )
      .catch(() => undefined);
  await settle();
  const style = await page.addStyleTag({ content: "*, *::before, *::after { pointer-events: auto !important; }" });
  try {
    const seen = new Set<string>();
    const issues: AuditIssue[] = [];
    const { height, total, start } = await page.evaluate(() => ({
      height: window.innerHeight,
      total: document.documentElement.scrollHeight,
      start: window.scrollY,
    }));
    for (let y = 0; y === 0 || y < total - height * 0.2; y += Math.round(height * 0.7)) {
      await page.evaluate((top) => window.scrollTo(0, top), y);
      await settle();
      // Scrolled content passes under the sticky header; that is not overlap.
      const overlays = y > 0 ? [...(opts.overlays ?? DEFAULT_OVERLAYS), ".topbar"] : opts.overlays;
      for (const i of await runAudit(page, { ...opts, overlays })) {
        const k = `${i.kind}|${i.where}|${i.text}`;
        if (!seen.has(k)) {
          seen.add(k);
          issues.push(i);
        }
      }
    }
    await page.evaluate((top) => window.scrollTo(0, top), start);
    return issues;
  } finally {
    await style.evaluate((el) => (el as HTMLElement).remove());
  }
}

function runAudit(
  page: Page,
  opts: { stacks?: string[]; overlays?: string[]; offscreenOk?: string[]; ignore?: string[] },
): Promise<AuditIssue[]> {
  return page.evaluate(
    ({ stacks, overlays, offscreenOk, hscrollOk, ignore }) => {
      const issues: AuditIssue[] = [];
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const stackSel = stacks.join(",");
      const overlaySel = overlays.join(",");
      const ignoreSel = ignore.join(",");
      const offscreenSel = offscreenOk.join(",");
      const hscrollSel = hscrollOk.join(",");

      function where(el: Element): string {
        const parts: string[] = [];
        let cur: Element | null = el;
        for (let depth = 0; cur && cur !== document.body && depth < 3; depth += 1) {
          const cls = [...cur.classList].filter((c) => !/^(is-|active|selected|rested|dragging|hover)/.test(c)).slice(0, 2);
          parts.unshift(cur.tagName.toLowerCase() + cls.map((c) => `.${c}`).join(""));
          cur = cur.parentElement;
        }
        return parts.join(" > ");
      }
      function textOf(el: Element): string {
        return (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
      }
      function visible(el: Element): boolean {
        const r = el.getBoundingClientRect();
        if (r.width <= 2 || r.height <= 2) return false;
        for (let cur: Element | null = el; cur; cur = cur.parentElement) {
          const s = getComputedStyle(cur);
          if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false;
        }
        return true;
      }
      function ownTextLines(el: Element): DOMRect[] {
        const range = document.createRange();
        const lines: DOMRect[] = [];
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
          range.selectNodeContents(node);
          for (const r of range.getClientRects()) if (r.width > 0 && r.height > 0) lines.push(r);
        }
        return lines;
      }
      function ownTextRect(el: Element): DOMRect | null {
        const range = document.createRange();
        let box: DOMRect | null = null;
        for (const node of el.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
          range.selectNodeContents(node);
          const r = range.getBoundingClientRect();
          if (r.width === 0) continue;
          box = box
            ? new DOMRect(
                Math.min(box.left, r.left),
                Math.min(box.top, r.top),
                Math.max(box.right, r.right) - Math.min(box.left, r.left),
                Math.max(box.bottom, r.bottom) - Math.min(box.top, r.top),
              )
            : r;
        }
        return box;
      }
      function add(kind: AuditIssue["kind"], el: Element, detail: string) {
        issues.push({ kind, where: where(el), text: textOf(el), detail });
      }
      function clippingAncestor(el: Element): Element | null {
        let child: Element = el;
        for (let cur = el.parentElement; cur && cur !== document.documentElement; child = cur, cur = cur.parentElement) {
          if (getComputedStyle(child).position === "fixed") return null;
          const s = getComputedStyle(cur);
          if (s.overflowX !== "visible" || s.overflowY !== "visible") return cur;
        }
        return null;
      }
      function scrolls(el: Element): boolean {
        const s = getComputedStyle(el);
        return (
          (/(auto|scroll)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) ||
          (/(auto|scroll)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1)
        );
      }
      function intentionalOverlap(el: Element, hit: Element): boolean {
        if (stackSel) {
          const pile = el.closest(stackSel);
          if (pile && pile.contains(hit)) return true;
        }
        if (overlaySel) {
          const layer = hit.closest(overlaySel);
          if (layer && !layer.contains(el)) return true;
        }
        return false;
      }

      function paintsAt(el: Element, x: number, y: number): boolean {
        if (/^(IMG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName)) return true;
        if (el instanceof SVGElement) return !(el instanceof SVGSVGElement);
        const s = getComputedStyle(el);
        if (Number(s.opacity) < 0.05 || s.visibility === "hidden") return false;
        if (s.backgroundImage !== "none") return true;
        const bg = s.backgroundColor.match(/[\d.]+/g)?.map(Number) ?? [];
        if (bg.length === 4 ? bg[3]! > 0.3 : bg.length === 3) return true;
        const t = ownTextRect(el);
        return !!t && x >= t.left && x <= t.right && y >= t.top && y <= t.bottom;
      }
      /**
       * Topmost element that visibly paints at (x, y). `elementsFromPoint`
       * skips `pointer-events: none`, which says nothing about what the user
       * sees, so hit-testing is forced on for the duration of the audit.
       */
      function topPainter(x: number, y: number): Element | null {
        for (const hit of document.elementsFromPoint(x, y)) {
          if (hit === document.documentElement || hit === document.body) return null;
          if (paintsAt(hit, x, y)) return hit;
        }
        return null;
      }

      if (document.documentElement.scrollWidth > vw + 1) {
        issues.push({
          kind: "hscroll",
          where: "html",
          text: "",
          detail: `scrollWidth ${document.documentElement.scrollWidth} > ${vw}`,
        });
      }

      for (const el of document.body.querySelectorAll("*")) {
        const s = getComputedStyle(el);
        if (!/(auto|scroll)/.test(s.overflowX) || el.scrollWidth <= el.clientWidth + 1) continue;
        if ((hscrollSel && el.closest(hscrollSel)) || !visible(el)) continue;
        issues.push({ kind: "hscroll", where: where(el), text: "", detail: `scrolls sideways (${el.scrollWidth} > ${el.clientWidth})` });
      }

      const interactive = "button, a[href], input, select, textarea, [role=button], [tabindex]:not([tabindex='-1'])";
      const all = [...document.body.querySelectorAll("*")].filter(
        (el) => !(ignoreSel && el.closest(ignoreSel)) && !["SCRIPT", "STYLE", "SVG", "PATH"].includes(el.tagName.toUpperCase()),
      );

      for (const el of all) {
        const isControl = el.matches(interactive) && !(el as HTMLButtonElement).disabled;
        let textBox = ownTextRect(el);
        if (!isControl && !textBox) continue;
        if (!visible(el)) continue;
        const rect = el.getBoundingClientRect();
        const s = getComputedStyle(el);

        // Ellipsis / line-clamp draw only what fits; the range still measures the full string.
        const truncatesOnPurpose = s.textOverflow === "ellipsis" || (s as unknown as { webkitLineClamp?: string }).webkitLineClamp !== "none";
        if (textBox && truncatesOnPurpose) {
          const l = Math.max(textBox.left, rect.left);
          const t = Math.max(textBox.top, rect.top);
          textBox = new DOMRect(l, t, Math.max(0, Math.min(textBox.right, rect.right) - l), Math.max(0, Math.min(textBox.bottom, rect.bottom) - t));
        }
        if (textBox) {
          const clipsX = s.overflowX !== "visible" && el.scrollWidth > el.clientWidth + 1;
          const clipsY = s.overflowY !== "visible" && el.scrollHeight > el.clientHeight + 1;
          if ((clipsX || clipsY) && !truncatesOnPurpose && !scrolls(el)) {
            add("clipped", el, `content ${el.scrollWidth}x${el.scrollHeight} in ${el.clientWidth}x${el.clientHeight}`);
          } else if (s.overflowX === "visible") {
            const over = Math.max(rect.left - textBox.left, textBox.right - rect.right);
            if (over > 3) add("spill", el, `text runs ${over.toFixed(0)}px past its box`);
          }
          const clip = clippingAncestor(el);
          if (clip && !scrolls(clip) && getComputedStyle(clip).textOverflow !== "ellipsis") {
            const c = clip.getBoundingClientRect();
            const over = Math.max(c.left - textBox.left, textBox.right - c.right, c.top - textBox.top, textBox.bottom - c.bottom);
            if (over > 3) add("spill", el, `text cut ${over.toFixed(0)}px by ${where(clip)}`);
          }
        }

        let box = textBox ?? rect;
        let inScroller = false;
        for (let cur = el.parentElement; cur; cur = cur.parentElement) {
          if (!scrolls(cur)) {
            if (getComputedStyle(cur).textOverflow === "ellipsis") {
              const c = cur.getBoundingClientRect();
              const l = Math.max(box.left, c.left);
              const t = Math.max(box.top, c.top);
              box = new DOMRect(l, t, Math.max(0, Math.min(box.right, c.right) - l), Math.max(0, Math.min(box.bottom, c.bottom) - t));
            }
            continue;
          }
          inScroller = true;
          const c = cur.getBoundingClientRect();
          const l = Math.max(box.left, c.left);
          const t = Math.max(box.top, c.top);
          box = new DOMRect(l, t, Math.max(0, Math.min(box.right, c.right) - l), Math.max(0, Math.min(box.bottom, c.bottom) - t));
        }
        if (box.width < 1 || box.height < 1) continue;
        // Cut off by the viewport (anything inside a scroll container is reachable by scrolling).
        // The planner page itself scrolls, so only fixed layers are checked vertically.
        if (!inScroller && !(offscreenSel && el.closest(offscreenSel))) {
          let fixed = false;
          for (let cur: Element | null = el; cur; cur = cur.parentElement) if (getComputedStyle(cur).position === "fixed") fixed = true;
          const over = Math.max(-box.left, box.right - vw, ...(fixed ? [-box.top, box.bottom - vh] : []));
          if (over > 2) add("offscreen", el, `${over.toFixed(0)}px outside the viewport`);
        }

        const lines = textBox ? ownTextLines(el).filter((r) => r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom) : [];
        const pts: Array<[number, number]> = lines.length
          ? lines.slice(0, 5).flatMap((r) => [
              [r.left + r.width / 2, r.top + r.height / 2] as [number, number],
              ...(r.width > 24 ? [[r.left + r.width * 0.2, r.top + r.height / 2] as [number, number], [r.left + r.width * 0.8, r.top + r.height / 2] as [number, number]] : []),
            ])
          : [
              [box.left + box.width / 2, box.top + box.height / 2],
              [box.left + box.width * 0.2, box.top + box.height * 0.3],
              [box.left + box.width * 0.8, box.top + box.height * 0.3],
              [box.left + box.width * 0.2, box.top + box.height * 0.7],
              [box.left + box.width * 0.8, box.top + box.height * 0.7],
            ];
        let blocked = 0;
        let sampled = 0;
        let centreBlocked = false;
        let by: Element | null = null;
        pts.forEach(([x, y], idx) => {
          if (x < 0 || y < 0 || x >= vw || y >= vh) return;
          if (x < box.left - 1 || x > box.right + 1 || y < box.top - 1 || y > box.bottom + 1) return;
          sampled += 1;
          const top = topPainter(x, y);
          if (!top || top === el || el.contains(top) || top.contains(el)) return;
          if (intentionalOverlap(el, top)) return;
          blocked += 1;
          if (idx === 0) centreBlocked = true;
          by ??= top;
        });
        if (by && ((isControl && centreBlocked) || blocked * 2 > sampled)) {
          const fan = (by as Element).closest(".hand-fan") && !el.closest(".hand-fan") ? " (in the hand fan)" : "";
          add("covered", el, `${blocked}/${sampled} points under ${where(by)}${fan}`);
        }
      }

      const seen = new Set<string>();
      return issues.filter((i) => {
        const k = `${i.kind}|${i.where}|${i.text}|${i.detail}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    },
    {
      stacks: opts.stacks ?? DEFAULT_STACKS,
      overlays: opts.overlays ?? DEFAULT_OVERLAYS,
      offscreenOk: opts.offscreenOk ?? DEFAULT_OFFSCREEN_OK,
      hscrollOk: DEFAULT_HSCROLL_OK,
      ignore: opts.ignore ?? [],
    },
  );
}

type Box = { x: number; y: number; width: number; height: number };

async function boxOf(trigger: Locator): Promise<Box> {
  const box = await trigger.boundingBox();
  if (!box) throw new Error("trigger has no bounding box (not visible?)");
  return box;
}

export async function expectStationary(trigger: Locator, toggle: () => Promise<void>, label: string): Promise<void> {
  await trigger.scrollIntoViewIfNeeded();
  const before = await boxOf(trigger);
  await toggle();
  await trigger.page().evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const after = await boxOf(trigger);
  const moved = (["x", "y", "width", "height"] as const).filter((k) => Math.abs(after[k] - before[k]) > 1);
  expect(moved, `${label}: trigger moved (${moved.map((k) => `${k} ${before[k].toFixed(1)} -> ${after[k].toFixed(1)}`).join(", ")})`).toEqual([]);
}
