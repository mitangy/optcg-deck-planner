import { test, expect, formatIssues, issueKey, type Page } from "./fixtures";
import type { AuditIssue } from "./audit";
import { isKnown } from "./known-issues";

const SEEDS = (process.env.SEEDS ?? "7").split(",").map(Number);
const MAX_CLICKS = Number(process.env.MAX_CLICKS ?? 2000);
const MAX_CLICKS_PER_TURN = 150;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Candidate = { label: string; weight: number; x: number; y: number };

async function candidates(page: Page): Promise<Candidate[]> {
  return page.evaluate(() => {
    const out: Array<{ label: string; weight: number; x: number; y: number }> = [];
    function clickPoint(el: Element, r: DOMRect): [number, number] | null {
      for (const fy of [0.5, 0.3, 0.7, 0.15, 0.85]) {
        for (const fx of [0.5, 0.25, 0.75, 0.1, 0.9]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
          const hit = document.elementFromPoint(x, y);
          if (hit && (hit === el || el.contains(hit))) return [x, y];
        }
      }
      return null;
    }
    const dialog = document.querySelector(".float-layer:not(.float-layer-peek), [role=dialog][aria-label], .choice-prompt, .field-bar");
    const buttonScopes = ".intent-bar, .primary-dock, .card-actions, .ability-prompt, .choice-prompt, .field-bar, .float-layer, .defend-tray";
    const cardScopes =
      ".hand-fan-cards .card-tile, .hand-row-inner .card-tile, .rail-hand-cards .card-tile, .hand-dock-cards .card-tile, .side-field .card-tile[data-instance-id]";
    const els = [
      ...document.querySelectorAll<HTMLElement>(`:is(${buttonScopes}) :is(button, .choice-option)`),
      ...document.querySelectorAll<HTMLElement>(dialog ? ".side-field .card-tile[data-instance-id]" : cardScopes),
    ];
    for (const el of els) {
      if ((el as HTMLButtonElement).disabled || el.classList.contains("disabled")) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || getComputedStyle(el).visibility === "hidden") continue;
      const label = (el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
      if (/^(Undo|Leave|Return home)/.test(label)) continue;
      let weight = el.classList.contains("card-tile") ? 1 : 4;
      if (/^Attack/.test(label)) weight = 12;
      else if (/^(Play|Give( all)? (DON|\d)|Activate|\+\d|All \()/.test(label)) weight = 8;
      else if (/(Tap|Click) again/.test(label)) weight = 60;
      else if (/End turn/.test(label)) weight = 3;
      else if (/^Cancel/.test(label)) weight = 0.3;
      const at = clickPoint(el, r);
      if (!at) continue;
      out.push({ label: el.classList.contains("card-tile") ? `card ${label}` : label, weight, x: at[0], y: at[1] });
    }
    return out;
  });
}

function pick(list: Candidate[], rand: () => number): Candidate {
  const total = list.reduce((s, c) => s + c.weight, 0);
  let x = rand() * total;
  for (const c of list) if ((x -= c.weight) < 0) return c;
  return list[list.length - 1]!;
}

async function boardState(page: Page) {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>(".board-root");
    return {
      turn: Number(root?.dataset.turn ?? -1),
      phase: root?.dataset.phase ?? "",
      over: !!document.querySelector(".match-result"),
      error: document.querySelector(".error-banner")?.textContent?.trim() ?? null,
    };
  });
}

for (const seed of SEEDS) {
  test(`practice match plays to the end by clicking (seed ${seed})`, async ({ page, duel }, info) => {
    test.setTimeout(15 * 60_000);
    await duel.startPractice({ seed });
    const rand = rng(seed);
    const uiIssues = new Map<string, AuditIssue>();
    const trail: string[] = [];

    async function auditNow(tag: string) {
      for (const issue of await duel.audit()) {
        const key = issueKey(issue);
        if (isKnown(issue) || uiIssues.has(key)) continue;
        uiIssues.set(key, issue);
        await page.screenshot({ path: info.outputPath(`ui-issue-${uiIssues.size}-${tag}.png`) });
      }
    }

    let turn = -1;
    let clicksThisTurn = 0;
    let state = await boardState(page);
    await auditNow("mulligan");
    for (let click = 0; click < MAX_CLICKS && !state.over; click += 1) {
      const list = await candidates(page);
      expect(list, `nothing clickable at turn ${state.turn} (${state.phase})\n${trail.slice(-15).join("\n")}`).not.toHaveLength(0);
      const choice = pick(list, rand);
      trail.push(`T${state.turn} ${state.phase}: ${choice.label}`);
      await page.mouse.click(choice.x, choice.y);
      await page.waitForTimeout(120);
      state = await boardState(page);

      expect(duel.errors, trail.slice(-15).join("\n")).toEqual([]);
      expect(state.error, `server rejected a click the UI offered\n${trail.slice(-15).join("\n")}`).toBeNull();
      if (state.turn !== turn) {
        turn = state.turn;
        clicksThisTurn = 0;
        await auditNow(`turn${turn}`);
      } else {
        clicksThisTurn += 1;
        expect(clicksThisTurn, `turn ${turn} is stuck\n${trail.slice(-25).join("\n")}`).toBeLessThan(MAX_CLICKS_PER_TURN);
      }
    }

    await info.attach("click-trail.txt", { body: trail.join("\n"), contentType: "text/plain" });
    if (state.over) await auditNow("result");
    expect(state.over, `no winner after ${MAX_CLICKS} clicks (turn ${state.turn})`).toBe(true);
    expect([...uiIssues.values()], `UI problems seen during the match:\n${formatIssues([...uiIssues.values()])}`).toEqual([]);
  });
}
