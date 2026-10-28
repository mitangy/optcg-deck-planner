/**
 * Screenshots for the help infographics (trailer/video/src/infographics). Same local stack and fake backend as the
 * clips; run with `npm run infographics:shots` in trailer/video (or `TRAILER_MAIN=infographics.ts ./run.sh [group ...]`).
 * Groups: lobby, match, hand, phone. PNGs land in trailer/video/public/infographics/shots/ (gitignored).
 */
import type { Page, Route } from "playwright";
import { cors } from "./lib/fakeApi";
import { applySettings, endTurn, startBotGame, waitFor } from "./lib/game";
import { openStill, type Still, type StillOpts } from "./lib/stills";
import { sleep } from "./lib/util";
import { WEB_ORIGIN } from "./lib/env";

/** The two POSTs the infographics submit: answered in the browser, nothing is stored anywhere. */
const extra: StillOpts["extra"] = async (route: Route, path: string, method: string) => {
  if (method === "POST" && (path === "/feedback" || path === "/duel/card-reports")) {
    await route.fulfill({ status: 200, headers: cors(route.request().headers()["origin"]), json: { ok: true } });
    return true;
  }
  return false;
};

/** Bot match, played to the start of Miko's second turn (3 DON!!, a full hand), the same way clip 02 does. */
async function toTurn3(p: Page): Promise<void> {
  await p.goto(`${WEB_ORIGIN}/`);
  await sleep(1800);
  await startBotGame(p, { botDeck: "d-wano" });
  await p.getByRole("button", { name: "Keep opening hand" }).click();
  await waitFor(p, (s) => s.phase === "main" && s.turn === 1);
  await sleep(600);
  await endTurn(p);
  await waitFor(p, (s) => s.phase === "main" && s.turn === 3, 60_000);
  await sleep(3500);
}

const MSG_FEEDBACK = "The Sort button is easy to miss. A short tip on the first match would help new players.";
const MSG_CARD = "Played it with 3 DON!! but the Blocker never got the option to rest when I attacked.";

async function lobby(): Promise<void> {
  const s = await openStill({ kind: "desktop", extra });
  const p = s.page;
  try {
    await p.goto(`${WEB_ORIGIN}/`);
    await sleep(2500);
    await s.shot("fb-lobby", { friendWatch: p.getByRole("button", { name: "Watch", exact: true }).first(), spectate: p.getByRole("button", { name: /^Spectate/ }), send: p.getByRole("button", { name: "Send feedback" }) });
    await p.getByRole("button", { name: "Send feedback" }).click();
    await sleep(700);
    await s.shot("fb-dialog-empty", { card: p.locator(".feedback-card"), kinds: p.locator(".feedback-kinds"), text: p.locator(".feedback-text"), send: p.locator(".feedback-btn-primary") });
    await p.getByRole("radio", { name: "Idea" }).click();
    await p.getByLabel("Message").fill(MSG_FEEDBACK);
    await sleep(300);
    await s.shot("fb-dialog-filled", { card: p.locator(".feedback-card"), kinds: p.locator(".feedback-kinds"), idea: p.getByRole("radio", { name: "Idea" }), text: p.locator(".feedback-text"), send: p.locator(".feedback-btn-primary") });
    await p.getByRole("button", { name: "Send", exact: true }).click();
    await p.getByText("Thanks, we got it.").waitFor();
    await sleep(400);
    await s.shot("fb-dialog-sent", { card: p.locator(".feedback-card"), thanks: p.locator(".feedback-thanks") });
    await p.getByRole("button", { name: "Close" }).click();
    await p.goto(`${WEB_ORIGIN}/settings#about`);
    await sleep(1800);
    await p.locator("#about").scrollIntoViewIfNeeded();
    await sleep(500);
    await s.shot("fb-settings-about", { about: p.locator("#about"), send: p.locator("#about").getByRole("button", { name: "Send feedback" }) });
    // Spectate card in the lobby (watch infographic).
    await p.goto(`${WEB_ORIGIN}/`);
    await sleep(1800);
    await p.getByRole("button", { name: /^Spectate/ }).click();
    await sleep(700);
    await s.shot("watch-dialog", { input: p.getByPlaceholder("Paste the room id"), watch: p.getByRole("dialog").getByRole("button", { name: "Watch", exact: true }) });
  } finally {
    if (s.errors.length) console.log(s.errors);
    await s.close();
  }
}

async function match(): Promise<void> {
  const s = await openStill({ kind: "desktop", extra, settings: { layoutGrips: true } });
  const p = s.page;
  try {
    await toTurn3(p);
    await p.mouse.move(700, 500);
    await sleep(300);
    const killer = p.locator(".side-opp .card-tile", { hasText: "Killer" }).first();
    await s.shot("m-board", { end: p.locator(".intent-btn-primary").first(), menu: p.getByRole("button", { name: "Match menu" }), undo: p.getByRole("button", { name: "Undo" }), killer, hand: p.locator(".hand-fan-toggle") });
    // Match menu: Report a problem / Copy spectate link.
    await p.getByRole("button", { name: "Match menu" }).click();
    await sleep(500);
    await s.shot("m-menu", { list: p.locator(".match-menu"), report: p.locator(".match-menu-item", { hasText: "Report a problem" }), spectate: p.locator(".match-menu-item", { hasText: "Copy spectate link" }), button: p.getByRole("button", { name: "Match menu" }) });
    await p.keyboard.press("Escape");
    await sleep(300);
    // Shortcuts sheet.
    await p.keyboard.press("?");
    await sleep(600);
    await s.shot("m-help", { sheet: p.locator(".sheet"), space: p.locator(".hotkey-row").nth(0), yn: p.locator(".hotkey-row").nth(1) });
    await p.keyboard.press("Escape");
    await sleep(400);
    // Card inspect and the report form.
    await killer.click({ button: "right" });
    await sleep(900);
    await s.shot("r-inspect", { ability: p.locator(".card-inspect-effect").first(), report: p.getByRole("button", { name: /Report a problem with this card/ }), dialog: p.locator(".card-inspect") });
    await p.getByRole("button", { name: /Report a problem with this card/ }).click();
    await sleep(500);
    await s.shot("r-form-empty", { label: p.locator(".card-report label"), text: p.locator(".card-report-text"), send: p.getByRole("button", { name: "Send report" }), dialog: p.locator(".card-inspect") });
    await p.getByLabel("What's broken?").fill(MSG_CARD);
    await sleep(300);
    await s.shot("r-form-filled", { label: p.locator(".card-report label"), text: p.locator(".card-report-text"), send: p.getByRole("button", { name: "Send report" }), dialog: p.locator(".card-inspect") });
    await p.getByRole("button", { name: "Send report" }).click();
    await p.getByText("Thanks, your report was sent.").waitFor();
    await sleep(400);
    await s.shot("r-form-sent", { sent: p.locator(".card-report-sent"), dialog: p.locator(".card-inspect") });
    await p.keyboard.press("Escape");
    await sleep(500);
    // Action keys on a selected card.
    await p.locator(".side-you .card-tile.attack-ready", { hasText: "Monkey.D.Luffy" }).first().click();
    await sleep(600);
    await s.shot("k-actions", { actions: p.locator(".card-actions"), first: p.locator(".card-actions button").first() });
    await p.keyboard.press("Escape");
    await sleep(400);
    // Undo: two actions this turn, so both rows exist.
    await p.mouse.move(420, 888);
    await sleep(800);
    await p.locator(".hand-fan-cards .card-tile", { hasText: "Sanji" }).first().click();
    await sleep(500);
    await p.locator(".card-actions button", { hasText: /Play/ }).first().click();
    await sleep(1300);
    await p.locator(".side-you .card-tile.attack-ready", { hasText: "Monkey.D.Luffy" }).first().click();
    await sleep(500);
    await p.locator(".card-actions button", { hasText: /^\+1/ }).first().click();
    await sleep(1200);
    await p.mouse.move(520, 260);
    await s.shot("u-before", { undo: p.getByRole("button", { name: "Undo" }), sanji: p.locator(".side-you .card-tile", { hasText: "Sanji" }) });
    await p.getByRole("button", { name: "Undo" }).click();
    await sleep(600);
    await s.shot("u-menu", { undo: p.getByRole("button", { name: "Undo" }), list: p.locator(".undo-menu"), last: p.locator(".undo-menu-item").nth(0), turn: p.locator(".undo-menu-item").nth(1) });
    await p.locator(".undo-menu-item").nth(1).click();
    await sleep(2500);
    await s.shot("u-after", { log: p.getByText("You undid the whole turn."), undo: p.locator(".hud-undo-btn").first() });
  } finally {
    if (s.errors.length) console.log(s.errors);
    await s.close();
  }
}

async function hand(): Promise<void> {
  const s: Still = await openStill({ kind: "compact", settings: { layoutGrips: true } });
  const p = s.page;
  try {
    await toTurn3(p);
    // Capture-only: the hover card pop-up would sit over the hand while it is dragged.
    await p.addStyleTag({ content: ".card-preview-popup{display:none!important}" });
    await p.mouse.move(520, 260);
    await sleep(500);
    await s.shot("h-tucked", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first() });
    await p.locator(".hand-fan-toggle").hover();
    await sleep(900);
    await s.shot("h-hover", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first() });
    // Click Hand: keep it up.
    await p.locator(".hand-fan-toggle").click();
    await p.mouse.move(520, 260);
    await sleep(900);
    await s.shot("h-pinned", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first() });
    await p.locator(".hand-fan-toggle").click();
    await p.mouse.move(520, 260);
    await sleep(900);
    // Sort.
    await p.locator(".hand-sort-btn").click();
    await p.locator(".hand-fan-toggle").hover();
    await sleep(900);
    await s.shot("h-sorted", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first() });
    await p.locator(".hand-sort-btn").click();
    await sleep(500);
    // Drag a card to reorder (mid-drag).
    const cards = p.locator(".hand-fan-cards .card-tile");
    const a = (await cards.nth(1).boundingBox())!;
    const b = (await cards.nth(4).boundingBox())!;
    await p.mouse.move(a.x + a.width / 2, a.y + a.height * 0.5);
    await p.mouse.down();
    await p.mouse.move(a.x + a.width / 2 + 40, a.y + 20, { steps: 8 });
    await p.mouse.move(b.x + b.width / 2, b.y + b.height * 0.45, { steps: 14 });
    await sleep(500);
    await s.shot("h-reorder", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first(), c1: p.locator(".hand-fan-cards .card-tile").nth(0) });
    await p.mouse.up();
    await sleep(700);
    await s.shot("h-reordered", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first() });
    // Keep hand open: Hide / Show.
    await applySettings(p, { keepHandOpen: true });
    await sleep(900);
    await p.mouse.move(520, 260);
    await s.shot("h-keep", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first(), hide: p.locator(".hand-hide-btn") });
    await p.locator(".hand-hide-btn").click();
    await p.mouse.move(520, 260);
    await sleep(800);
    await s.shot("h-hidden", { hide: p.locator(".hand-hide-btn"), toggle: p.locator(".hand-fan-toggle") });
    await p.locator(".hand-hide-btn").click();
    await applySettings(p, { keepHandOpen: false });
    await sleep(600);
    // Move the hand by its grip.
    const grip = p.locator(".hand-fan-grip");
    console.log("grip", await grip.count());
    await p.mouse.move(520, 260);
    await sleep(400);
    await s.shot("h-grip", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first() });
    const g = await grip.boundingBox();
    if (g) {
      await p.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
      await p.mouse.down();
      await p.mouse.move(g.x + 330, g.y - 300, { steps: 20 });
      await sleep(500);
      await s.shot("h-moved", { toggle: p.locator(".hand-fan-toggle"), sort: p.locator(".hand-sort-btn"), grip: p.locator(".hand-fan-grip"), fan: p.locator(".hand-fan-cards .card-tile").first() });
      await p.mouse.up();
      await sleep(600);
    }
  } finally {
    if (s.errors.length) console.log(s.errors);
    await s.close();
  }
}


async function phone(): Promise<void> {
  const s = await openStill({ kind: "phone", extra });
  const p = s.page;
  try {
    await p.goto(`${WEB_ORIGIN}/`);
    await sleep(2500);
    await s.shot("p-lobby");
    await p.getByRole("button", { name: "Send feedback" }).scrollIntoViewIfNeeded();
    await sleep(300);
    await s.shot("p-lobby-footer", { send: p.getByRole("button", { name: "Send feedback" }) });
    await p.getByRole("button", { name: "Send feedback" }).click();
    await sleep(700);
    await p.getByRole("radio", { name: "Problem" }).click();
    await p.getByLabel("Message").fill("The End turn button stayed grey after my opponent passed.");
    await sleep(300);
    await s.shot("p-fb-filled", { card: p.locator(".feedback-card"), kinds: p.locator(".feedback-kinds"), text: p.locator(".feedback-text"), send: p.locator(".feedback-btn-primary") });
    await p.keyboard.press("Escape");
    await sleep(500);
    await toTurn3(p);
    const pk = p.locator(".side-opp .card-tile", { hasText: "Killer" }).first();
    await s.shot("p-board", { menu: p.getByRole("button", { name: "Match menu" }), undo: p.getByRole("button", { name: "Undo" }), killer: pk, sort: p.getByRole("button", { name: /^Sort/ }).first(), hide: p.locator(".hand-collapse-btn") });
    await p.getByRole("button", { name: "Match menu" }).click();
    await sleep(600);
    await s.shot("p-menu", { list: p.locator(".match-menu"), report: p.locator(".match-menu-item", { hasText: "Report a problem" }), spectate: p.locator(".match-menu-item", { hasText: "Copy spectate link" }), button: p.getByRole("button", { name: "Match menu" }) });
    await p.keyboard.press("Escape");
    await sleep(400);
    // Long-press a card: inspect.
    const killer = p.locator(".side-opp .card-tile", { hasText: "Killer" }).first();
    const b = (await killer.boundingBox())!;
    await p.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await p.mouse.down();
    await sleep(700);
    await p.mouse.up();
    await sleep(900);
    await s.shot("p-inspect", { dialog: p.locator(".card-inspect") });
    const rep = p.getByRole("button", { name: /Report a problem with this card/ });
    await rep.scrollIntoViewIfNeeded();
    await sleep(300);
    await s.shot("p-inspect-scrolled", { ability: p.locator(".card-inspect-effect").first(), report: rep, dialog: p.locator(".card-inspect") });
    await rep.click();
    await sleep(500);
    await p.getByLabel("What's broken?").fill("Blocker would not rest when I attacked. Nothing happened.");
    await sleep(300);
    await p.getByRole("button", { name: "Send report" }).scrollIntoViewIfNeeded();
    await sleep(300);
    await s.shot("p-form", { label: p.locator(".card-report label"), text: p.locator(".card-report-text"), send: p.getByRole("button", { name: "Send report" }), dialog: p.locator(".card-inspect") });
    await p.keyboard.press("Escape");
    await sleep(600);
    // Hand row: Sort / Hide.
    await p.getByRole("button", { name: /^Sort/ }).first().click();
    await sleep(700);
    await s.shot("p-sorted", { sort: p.getByRole("button", { name: /^Sort/ }).first(), hide: p.locator(".hand-collapse-btn") });
    await p.getByRole("button", { name: /^Sort/ }).first().click();
    await p.getByRole("button", { name: /Hide your hand/ }).click();
    await sleep(800);
    await s.shot("p-hand-folded", { show: p.locator(".hand-collapse-btn") });
    await p.getByRole("button", { name: /Show your hand/ }).click();
    await sleep(700);
    // Undo needs two actions this turn.
    await p.locator(".hand-row-inner .card-tile, .hand-fan-cards .card-tile", { hasText: "Sanji" }).first().click();
    await sleep(600);
    await s.shot("p-selected");
    await p.locator(".card-actions button", { hasText: /Play/ }).first().click();
    await sleep(1300);
    await p.locator(".side-you .card-tile.attack-ready", { hasText: "Monkey.D.Luffy" }).first().click();
    await sleep(500);
    await s.shot("p-leader");
    await p.locator(".card-actions button", { hasText: /^\+1/ }).first().click();
    await sleep(1200);
    await p.getByRole("button", { name: "Undo" }).click();
    await sleep(700);
    await s.shot("p-undo", { undo: p.getByRole("button", { name: "Undo" }), list: p.locator(".undo-menu"), last: p.locator(".undo-menu-item").nth(0), turn: p.locator(".undo-menu-item").nth(1) });
  } finally {
    if (s.errors.length) console.log(s.errors);
    await s.close();
  }
}

const groups: Record<string, () => Promise<void>> = { lobby, match, hand, phone };
const want = process.argv.slice(2).filter((a) => !a.startsWith("-"));
for (const g of want.length ? want : Object.keys(groups)) {
  if (!groups[g]) throw new Error(`unknown group ${g}`);
  console.log(`== ${g}`);
  await groups[g]();
}
process.exit(0);
