/**
 * Playwright fixtures for click-through tests against a real game server.
 *
 * The browser talks to the local game server for real (Colyseus rooms, the
 * @optcg/rules engine). The FastAPI backend is replaced by `page.route`: the
 * only calls a practice match needs are `/health` and the guest token mint,
 * and tokens are signed here with the game server's GAME_TOKEN_SECRET.
 */
import { createHmac } from "node:crypto";
import { test as base, expect, type Page } from "@playwright/test";
import { auditPage, formatIssues, issueKey, type AuditIssue } from "./audit";

export const GAME_TOKEN_SECRET = "e2e-secret";
export const FAKE_API = "http://127.0.0.1:8765";
export const GAME_SERVER = "http://127.0.0.1:2567";

export type DeckList = { leaderId: string; cards: string[] };

/**
 * A 1280x720 window gets the Grid hand by default (the "auto" hand layout, any
 * desktop window at least 680 px tall). Tests about the fanned hand call this
 * after their own settings init scripts: it adds `handLayout: "fan"` to the
 * stored settings unless a test already chose a layout.
 */
export async function preferFan(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const key = "optcg-duel:settings";
    const stored = JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    if (stored.handLayout === undefined) localStorage.setItem(key, JSON.stringify({ ...stored, handLayout: "fan" }));
  });
}

/** 50-card mono-red list of plain Characters: games are decided by attacks, not effects. */
export const RED_VANILLA: DeckList = {
  leaderId: "ST01-001",
  cards: ["ST01-003", "ST01-006", "ST01-008", "ST01-009", "OP12-002"].flatMap((id) => [id, id, id, id]),
};

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Same format as FastAPI's game token (`body.sig`, HMAC-SHA256). */
export function mintGameToken(uid: number, name: string): string {
  const body = b64url(JSON.stringify({ uid, email: `${name}@e2e.test`, exp: Math.floor(Date.now() / 1000) + 3600, name }));
  return `${body}.${b64url(createHmac("sha256", GAME_TOKEN_SECRET).update(body).digest())}`;
}

type Duel = {
  /** Lobby → Practice → Start practice, with fixed decks and a fixed shuffle seed. */
  startPractice(opts: { seed: number; you?: DeckList; opponent?: DeckList }): Promise<void>;
  /** Audit the current screen; issues matching `known` keys are dropped. */
  audit(opts?: { ignore?: string[] }): Promise<AuditIssue[]>;
  /** Page errors and console errors collected so far (network noise excluded). */
  errors: string[];
};

export const test = base.extend<{ duel: Duel }>({
  duel: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
    page.on("console", (m) => {
      // Card art and fonts come from CDNs a CI box may not reach.
      // Chrome blocks haptics before the first tap; not an app error.
      if (m.type() === "error" && !/Failed to load resource|net::ERR_|navigator\.vibrate/.test(m.text())) {
        errors.push(`console: ${m.text()}`);
      }
    });

    let uid = 1;
    await page.route(`${FAKE_API}/**`, (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === "/health") return route.fulfill({ json: { ok: true } });
      if (path === "/duel/guest-token") {
        const id = uid++;
        return route.fulfill({
          json: { token: mintGameToken(id, `seat${id}`), expires_at: 0, user_id: id, email: `seat${id}@e2e.test`, rating: 1000, games_played: 0 },
        });
      }
      return route.fulfill({ status: 404, json: { detail: "not in e2e fake API" } });
    });

    const duel: Duel = {
      errors,
      async startPractice({ seed, you = RED_VANILLA, opponent = RED_VANILLA }) {
        // The browser never sends a seed; add one to the room-create request so
        // shuffles (and therefore the whole game) repeat run to run.
        await page.route(`${GAME_SERVER}/matchmake/create/**`, (route) => {
          const body = JSON.parse(route.request().postData() ?? "{}");
          return route.continue({ postData: JSON.stringify({ ...body, seed }) });
        });
        const decks = [
          { id: "e2e-you", name: "E2E You", ...you, updatedAt: 1 },
          { id: "e2e-opp", name: "E2E Opponent", ...opponent, updatedAt: 0 },
        ];
        await page.addInitScript((d) => {
          if (sessionStorage.getItem("e2e-seeded")) return;
          sessionStorage.setItem("e2e-seeded", "1");
          localStorage.clear();
          localStorage.setItem("optcg.duel.savedDecks.v1", JSON.stringify(d));
          localStorage.setItem("optcg.duel.selectedDeckId.v1", "e2e-you");
        }, decks);
        await page.goto("/");
        await page.getByRole("button", { name: "Play", exact: true }).click();
        await page.getByRole("button", { name: /^Practice/ }).click();
        await page.getByLabel("Opponent deck").selectOption("e2e-opp");
        await page.getByRole("button", { name: "Start practice" }).click();
        await expect(page.getByRole("button", { name: "Keep opening hand" })).toBeVisible({ timeout: 30_000 });
      },
      async audit(opts) {
        const issues = await auditPage(page, { ignore: opts?.ignore });
        return issues;
      },
    };
    await use(duel);
  },
});

export { expect, formatIssues, issueKey };
export type { Page };
