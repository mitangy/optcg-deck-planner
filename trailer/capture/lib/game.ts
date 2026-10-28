/** Getting a vs-Bot match to a chosen moment without the camera rolling (the lobby clips show the lobby). */
import type { Page } from "playwright";
import { sleep } from "./util";

/** Lobby -> Play -> Play vs Bot -> Start game, then keep the opening hand. Uses plain clicks: nobody is watching. */
export async function startBotGame(page: Page, opts: { level?: "Easy" | "Normal" | "Hard"; botDeck?: string } = {}): Promise<void> {
  await page.getByRole("button", { name: /^Play/ }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: /^Play vs Bot/ }).click();
  if (opts.level) await page.getByRole("radio", { name: opts.level }).click();
  if (opts.botDeck) await page.getByLabel("Bot's deck").selectOption(opts.botDeck);
  await page.getByRole("button", { name: "Start game" }).click();
  await page.getByRole("button", { name: "Keep opening hand" }).waitFor({ timeout: 30_000 });
}

export const boardRoot = (page: Page) => page.locator(".board-root");

export async function phase(page: Page): Promise<{ turn: number; phase: string; seat: string }> {
  return page.evaluate(() => {
    const r = document.querySelector<HTMLElement>(".board-root");
    return { turn: Number(r?.dataset.turn ?? -1), phase: r?.dataset.phase ?? "", seat: r?.dataset.seat ?? "" };
  });
}

export async function waitFor(page: Page, pred: (s: { turn: number; phase: string; seat: string }) => boolean, ms = 40_000): Promise<void> {
  const t0 = Date.now();
  for (;;) {
    if (pred(await phase(page))) return;
    if (Date.now() - t0 > ms) throw new Error(`board never reached the wanted state: ${JSON.stringify(await phase(page))}`);
    await sleep(150);
  }
}

/** End the turn (the button asks for a second tap when you still have unspent DON!!). */
export async function endTurn(page: Page): Promise<void> {
  const end = page.locator(".intent-btn-primary", { hasText: /End turn/ });
  await end.click();
  await sleep(300);
  const again = page.locator(".intent-btn-primary", { hasText: /(Tap|Click) again|End turn\?/ });
  if (await again.isVisible().catch(() => false)) await again.click();
}

/** Change a duel setting from outside the UI (the same call the Settings screen makes), so a theme can flip on cue. */
export async function applySettings(page: Page, patch: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (p) => {
    const path = "/src/settings.ts";
    const mod = await import(/* @vite-ignore */ path);
    (mod as { updateSettings: (x: Record<string, unknown>) => void }).updateSettings(p);
  }, patch);
}

/** Bot match with the seeded shuffle, played to the start of your second turn (3 DON!!, a full hand). */
export async function toSecondTurn(page: Page, botDeck = "d-wano"): Promise<void> {
  await startBotGame(page, { botDeck });
  await page.getByRole("button", { name: "Keep opening hand" }).click();
  await waitFor(page, (s) => s.phase === "main" && s.turn === 1);
  await sleep(600);
  await endTurn(page);
  await waitFor(page, (s) => s.phase === "main" && s.turn === 3, 60_000);
  await sleep(3200);
}
