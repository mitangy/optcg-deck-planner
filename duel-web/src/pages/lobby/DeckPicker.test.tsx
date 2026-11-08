// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BOT_META_DECKS } from "@optcg/rules/botMetaDecks";
import type { SavedDeck } from "../../decks/storage";
import { BOT_DECK_RANDOM_META, metaDeckValue } from "../../home/botGame";
import { DeckPicker } from "./DeckSwitcher";

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(HTMLElement.prototype, "innerText", { configurable: true, get() { return (this as HTMLElement).textContent; } });
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const mine = (id: string, name: string): SavedDeck => ({ id, name, leaderId: "ST01-001", cards: Array.from({ length: 50 }, () => "ST01-003"), updatedAt: 1 });

async function openPicker(ui: React.ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(ui));
  await act(async () => {
    document.getElementById("bot-deck")!.click();
    await wait();
  });
  return [...document.querySelectorAll<HTMLElement>('[role="option"]')];
}

const botPicker = (decks: SavedDeck[], value = BOT_DECK_RANDOM_META) => (
  <DeckPicker id="bot-deck" label="Bot's deck" decks={decks} value={value} onChange={() => {}} botMeta />
);

describe("Bot's deck picker (#1180)", () => {
  it("lists Random meta deck, the 10 meta decks, then Your decks with each saved deck, and no longer mirrors yours (#1180)", async () => {
    const rows = await openPicker(botPicker([mine("d1", "Alpha"), mine("d2", "Beta")]));
    const text = rows.map((r) => r.textContent ?? "");
    expect(text[0]).toContain("Random meta deck");
    BOT_META_DECKS.forEach((m, i) => expect(text[1 + i]).toContain(m.name));
    expect(text[11]).toContain("Your decks");
    expect(rows[11]!.hasAttribute("data-disabled")).toBe(true);
    expect(text[12]).toContain("Alpha");
    expect(text[13]).toContain("Beta");
    expect(rows).toHaveLength(14);
    expect(text.join("|")).not.toMatch(/Same as your deck|Random deck/);
  });

  it("shows no Your decks header without saved decks, and says where the meta lists come from (#1180)", async () => {
    const rows = await openPicker(botPicker([]));
    expect(rows).toHaveLength(11);
    expect(document.body.textContent).toContain("Limitless TCG");
  });

  it("the closed picker shows the meta deck picked by its Leader name (#1180)", async () => {
    const pick = BOT_META_DECKS[1]!;
    await openPicker(botPicker([mine("d1", "Alpha")], metaDeckValue(pick.leaderId)));
    expect(document.getElementById("bot-deck")!.textContent).toContain(pick.name);
    // Its Leader art (or the art placeholder while the image loads), not the "?" of a random pick.
    expect(document.querySelector("img.deck-picker-art, .deck-picker-art-empty")).not.toBeNull();
    expect(document.querySelector(".deck-picker-art-random")).toBeNull();
  });

  it("random meta deck shows the ? placeholder instead of a Leader (#1180)", async () => {
    await openPicker(botPicker([mine("d1", "Alpha")]));
    expect(document.querySelector(".deck-picker-art-random")?.textContent).toBe("?");
  });
});
