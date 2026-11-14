// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
// Every card currently has official art, so the card preview list can be empty: use a fixed one (#1299).
vi.mock("../../../../packages/ui/src/cardArt/previewArt.json", () => ({ default: ["OP18-003", "OP18-031"] }));

import { lookupCard } from "../../cards/atlas";
import { isPreviewArtPath } from "@optcg/ui/cardArt";
import previewIds from "../../../../packages/ui/src/cardArt/previewArt.json";
import catalog from "../../assets/cardCatalog.json";
import { resolveCardImageUrl } from "../../decks/artPrefs";
import type { BattleLogEntry, LogTone } from "../match/battleLog";
import { BattleLogPanel } from "./BattleLogPanel";

// A card with preview art and a TCGPlayer image in the catalog: the first try is the
// TCGPlayer CDN (which can 403 for new cards), then the thumbnail falls back to the preview.
// Taken from the preview list, so it follows sync_preview_art.py as previews come and go.
const PREVIEWED = previewIds.find((id) => (catalog as Record<string, { imageUrl?: string }>)[id]?.imageUrl)!;

function line(id: string, tone: LogTone, turn: number, defId: string, ownerSeat: 0 | 1, text = "x"): BattleLogEntry {
  return {
    id,
    turn,
    text,
    tone,
    important: false,
    segments: [{ kind: "card", defId, name: lookupCard(defId).name, ownerSeat }],
  };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  try {
    localStorage.removeItem("duel.battleLogFilter");
  } catch {
    // no storage in this environment
  }
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(entries: BattleLogEntry[], viewingSeat?: 0 | 1): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<BattleLogPanel entries={entries} alwaysOpen viewingSeat={viewingSeat} />));
  return host;
}

function press(el: HTMLElement, name: string) {
  const btn = [...el.querySelectorAll<HTMLButtonElement>(".battle-log-filter-btn")].find((b) => b.textContent === name)!;
  act(() => btn.click());
}

describe("Battle log card thumbnails (#1243)", () => {
  it("a thumbnail sits on card-use lines only, not on an attack line (#1243)", () => {
    const el = mount([line("a", "play", 1, PREVIEWED, 0), line("b", "attack", 1, PREVIEWED, 0)]);
    const rows = [...el.querySelectorAll(".log-line")];
    expect(rows).toHaveLength(2);
    expect(rows[0]!.querySelector(".log-thumb")).not.toBeNull();
    expect(rows[1]!.querySelector(".log-thumb")).toBeNull();
  });

  it("the thumbnail says who did what and on which turn (#1243)", () => {
    const el = mount([line("a", "play", 5, PREVIEWED, 1)], 0);
    const name = lookupCard(PREVIEWED).name;
    expect(el.querySelector(".log-thumb")!.getAttribute("aria-label")).toBe(`Opponent played ${name}, turn 5`);
  });

  it("the thumbnail falls back to preview art when TCGPlayer art fails (#604)", () => {
    const first = resolveCardImageUrl(PREVIEWED, { ownerSeat: 0 })!;
    // Guard: the first try is a CDN url, so the fallback is what the test is about.
    expect(first).toMatch(/^https:\/\/tcgplayer-cdn\./);
    const el = mount([line("a", "play", 1, PREVIEWED, 0)]);
    const img = el.querySelector<HTMLImageElement>(".log-thumb img")!;
    expect(img.getAttribute("src")).toBe(first);
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    const after = el.querySelector<HTMLImageElement>(".log-thumb img")!;
    expect(isPreviewArtPath(after.getAttribute("src"))).toBe(true);
    expect(after.getAttribute("src")).toContain(PREVIEWED);
  });

  it("clicking the thumbnail opens the card inspector (#1243)", () => {
    const el = mount([line("a", "play", 1, PREVIEWED, 0)]);
    expect(document.querySelector("[role='dialog']")).toBeNull();
    act(() => el.querySelector<HTMLButtonElement>(".log-thumb")!.click());
    expect(document.querySelector("[role='dialog']")).not.toBeNull();
  });
});

describe("Battle log Plays filter (#1243)", () => {
  const LOG = [
    line("a", "play", 1, PREVIEWED, 0),
    line("b", "attack", 1, PREVIEWED, 0),
    line("c", "attack", 2, PREVIEWED, 1),
    line("d", "counter", 3, PREVIEWED, 1),
  ];

  it("Plays hides other lines and turns with none, All brings them back (#1243)", () => {
    const el = mount(LOG);
    expect(el.querySelectorAll(".log-line")).toHaveLength(4);
    press(el, "Plays");
    expect(el.querySelectorAll(".log-line")).toHaveLength(2);
    expect([...el.querySelectorAll(".battle-log-turn-title")].map((h) => h.textContent)).toEqual(["Turn 1", "Turn 3"]);
    press(el, "All");
    expect(el.querySelectorAll(".log-line")).toHaveLength(4);
  });

  it("Plays says so when no card was played yet (#1243)", () => {
    const el = mount([line("b", "attack", 1, PREVIEWED, 0)]);
    press(el, "Plays");
    expect(el.querySelector(".battle-log-empty")!.textContent).toBe("No cards played yet.");
  });

  it("the chosen filter is remembered for the next time the log opens (#1243)", () => {
    const el = mount(LOG);
    press(el, "Plays");
    act(() => root!.unmount());
    host!.remove();
    const again = mount(LOG);
    expect(again.querySelectorAll(".log-line")).toHaveLength(2);
    expect(again.querySelector(".battle-log-filter-btn[aria-pressed='true']")!.textContent).toBe("Plays");
  });
});
