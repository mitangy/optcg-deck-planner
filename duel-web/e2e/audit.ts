/**
 * UI quality audit for whatever the page shows right now. Runs inside the
 * browser (`page.evaluate`) and returns one issue per problem:
 *
 * - `hscroll`   the page, or a panel, scrolls sideways
 * - `clipped`   text cut off by its own box (overflow hidden, no ellipsis)
 * - `spill`     text drawn outside its box, or outside a clipping ancestor
 * - `covered`   a control or a line of text hidden under another element
 * - `offscreen` a control or text cut off by the viewport edge
 *
 * Intentional overlap is exempt: anything under an open dialog's scrim, and
 * cards stacked in the same pile (hand fan, deck, DON!! rows).
 */
import type { Page } from "@playwright/test";

export type AuditIssue = {
  kind: "hscroll" | "clipped" | "spill" | "covered" | "offscreen";
  /** Short CSS-ish path of the element, e.g. `.intent-bar > button.intent-btn`. */
  where: string;
  /** First 40 chars of the element's text. */
  text: string;
  detail: string;
};

/** Stable id for an issue (no pixel values), for known-issue lists. */
export function issueKey(i: AuditIssue): string {
  return `${i.kind} ${i.where} "${i.text}"`;
}

export function formatIssues(issues: AuditIssue[]): string {
  return issues.map((i) => `  ${issueKey(i)}: ${i.detail}`).join("\n");
}

/** Piles whose members overlap on purpose; an element covered by a sibling in the same pile is fine. */
const DEFAULT_STACKS = [
  ".hand-fan-cards",
  ".hand-row-inner",
  ".rail-hand-cards",
  ".hand-dock-cards",
  ".opp-hand-fan-cards",
  ".opp-hand-backs",
  ".don-strip",
  ".deck-stack",
];

/** Elements that intentionally hang off a screen edge (the fanned hand peeks up from the bottom). */
const DEFAULT_OFFSCREEN_OK = [".hand-fan-cards"];

/** Containers that scroll sideways on purpose. */
/** `.hand-row`: a portrait hand of more than 8 cards scrolls as a strip (#271). */
const DEFAULT_HSCROLL_OK: string[] = [".hand-row"];

/** Layers that intentionally sit over the board (a covered board under them is expected). */
const DEFAULT_OVERLAYS = [
  "[role=dialog]",
  "[aria-modal=true]",
  ".sheet-backdrop",
  ".modal-backdrop",
  ".float-scrim",
  ".lp-overlay-backdrop",
  // The attack arrow and target reticle are drawn over the cards on purpose.
  ".attack-overlay",
  // Undo request pops up over the board and waits for an answer.
  ".undo-request",
  // On-board target picks: the slim instruction bar sits over the bottom of
  // the board while the player taps cards (it replaced a full pop-up).
  ".field-bar",
  // A selected card's actions float over the card and the board edge beside it.
  ".card-actions",
];

export async function auditPage(
  page: Page,
  opts: { stacks?: string[]; overlays?: string[]; offscreenOk?: string[]; ignore?: string[] } = {},
): Promise<AuditIssue[]> {
  // Let entrance animations (turn splash, card motion) finish; ignore infinite ones.
  await page
    .waitForFunction(
      () => document.getAnimations().every((a) => a.playState !== "running" || a.effect?.getTiming().iterations === Infinity),
      undefined,
      { timeout: 5000 },
    )
    .catch(() => undefined);
  const style = await page.addStyleTag({ content: "*, *::before, *::after { pointer-events: auto !important; }" });
  try {
    return await runAudit(page, opts);
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
        // ≤ 2px: visually-hidden (screen-reader only) text.
        if (r.width <= 2 || r.height <= 2) return false;
        for (let cur: Element | null = el; cur; cur = cur.parentElement) {
          const s = getComputedStyle(cur);
          if (s.display === "none" || s.visibility === "hidden" || Number(s.opacity) < 0.05) return false;
        }
        return true;
      }
      /** One rect per rendered line of `el`'s own text. */
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
      /** Nearest ancestor that clips its content. */
      function clippingAncestor(el: Element): Element | null {
        for (let cur = el.parentElement; cur && cur !== document.documentElement; cur = cur.parentElement) {
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

      /** Does `el` itself put pixels at (x, y)? Transparent wrappers do not. */
      function paintsAt(el: Element, x: number, y: number): boolean {
        if (/^(IMG|CANVAS|VIDEO|INPUT|SELECT|TEXTAREA)$/i.test(el.tagName)) return true;
        // An <svg> box is transparent; its shapes hit-test on their painted geometry.
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

      // A panel that scrolls sideways hides part of every row; only piles
      // meant to scroll sideways (card rows, hands) may.
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
        // Text cut off by its own box.
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
          if (clip && !scrolls(clip)) {
            const c = clip.getBoundingClientRect();
            const over = Math.max(c.left - textBox.left, textBox.right - c.right, c.top - textBox.top, textBox.bottom - c.bottom);
            if (over > 3) add("spill", el, `text cut ${over.toFixed(0)}px by ${where(clip)}`);
          }
        }

        // Clip to scroll containers: a log line scrolled out of view is hidden, not covered.
        let box = textBox ?? rect;
        let inScroller = false;
        for (let cur = el.parentElement; cur; cur = cur.parentElement) {
          if (!scrolls(cur)) continue;
          inScroller = true;
          const c = cur.getBoundingClientRect();
          const l = Math.max(box.left, c.left);
          const t = Math.max(box.top, c.top);
          box = new DOMRect(l, t, Math.max(0, Math.min(box.right, c.right) - l), Math.max(0, Math.min(box.bottom, c.bottom) - t));
        }
        if (box.width < 1 || box.height < 1) continue;
        // Cut off by the viewport (anything inside a scroll container is reachable by scrolling).
        if (!inScroller && !(offscreenSel && el.closest(offscreenSel))) {
          const over = Math.max(-box.left, box.right - vw, -box.top, box.bottom - vh);
          if (over > 2) add("offscreen", el, `${over.toFixed(0)}px outside the viewport`);
        }

        // Covered: sample each text line's centre (wrapped inline text has gaps
        // in its bounding box), or the centre and four inset points of a control.
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
          sampled += 1;
          const top = topPainter(x, y);
          // An ancestor paints below its descendants, so it never hides them.
          if (!top || top === el || el.contains(top) || top.contains(el)) return;
          if (intentionalOverlap(el, top)) return;
          blocked += 1;
          if (idx === 0) centreBlocked = true;
          by ??= top;
        });
        // A control is broken if its centre is hidden; text if most of it is.
        if (by && ((isControl && centreBlocked) || blocked * 2 > sampled)) {
          // A hand card's own badge path doesn't say it's in the hand; name the fan.
          const fan = (by as Element).closest(".hand-fan") && !el.closest(".hand-fan") ? " (in the hand fan)" : "";
          add("covered", el, `${blocked}/${sampled} points under ${where(by)}${fan}`);
        }
      }

      // One report per element+kind.
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
      // Card id shown only when card art fails to load (no CDN access in CI or sandboxes).
      ignore: [".card-fallback", ...(opts.ignore ?? [])],
    },
  );
}
