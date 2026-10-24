// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { lookupCard } from "../cards/atlas";
import { isPreviewArtPath } from "@optcg/ui/cardArt";
import { resolveCardImageUrl } from "../decks/artPrefs";
import type { BattleLogEntry } from "./battleLog";
import { RecentPlaysStrip } from "./RecentPlaysStrip";

// EB05 art is not on TCGplayer's CDN yet, so the thumbnail's first try 403s.
const EB05 = "EB05-001";

function play(defId: string): BattleLogEntry {
  return {
    id: "a",
    turn: 1,
    text: "x",
    tone: "play",
    important: false,
    segments: [{ kind: "card", defId, name: lookupCard(defId).name, ownerSeat: 0 }],
  };
}

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(defId: string): HTMLImageElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<RecentPlaysStrip entries={[play(defId)]} youSeat={0} />));
  return host.querySelector<HTMLImageElement>(".recent-play-thumb img")!;
}

describe("recent plays thumbnail art", () => {
  it("Recent plays thumbnail falls back to preview art when TCGPlayer art fails (#604)", () => {
    const first = resolveCardImageUrl(EB05, { ownerSeat: 0 })!;
    // Guard: the first try is a CDN url, so the fallback is what the test is about.
    expect(first).toMatch(/^https:\/\/tcgplayer-cdn\./);
    const img = mount(EB05);
    expect(img.getAttribute("src")).toBe(first);
    act(() => {
      img.dispatchEvent(new Event("error"));
    });
    const after = host!.querySelector<HTMLImageElement>(".recent-play-thumb img")!;
    expect(isPreviewArtPath(after.getAttribute("src"))).toBe(true);
    expect(after.getAttribute("src")).toContain(EB05);
  });
});
