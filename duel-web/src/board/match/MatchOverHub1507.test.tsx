// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { DeckMissingCost } from "../../net/api";
import { MatchOverHub, type MatchHub } from "./MatchOverHub";
import { RoomInvite } from "./RoomShare";

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

const cost = (over: Partial<DeckMissingCost> = {}): DeckMissingCost => ({
  missing_cards: 4,
  missing_copies: 9,
  cost_usd: 42.5,
  planner_deck_id: 77,
  ...over,
});

async function show(hub: MatchHub, load: (id: string) => Promise<DeckMissingCost | null>) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(<MatchOverHub hub={hub} loadMissing={load} />);
  });
  return host;
}

const signedIn = (over: Partial<MatchHub> = {}): MatchHub => ({ deckId: "d1", signedIn: true, onInvite: () => {}, ...over });

describe("match over hub cost chip (#1507)", () => {
  it("hides the chip for a guest and never asks for a price (#1507)", async () => {
    const load = vi.fn(async () => cost());
    const el = await show(signedIn({ signedIn: false }), load);
    expect(load).not.toHaveBeenCalled();
    expect(el.querySelector(".match-hub-cost")).toBeNull();
    expect(el.textContent).not.toContain("missing");
  });

  it("says You own every card when nothing is missing, without a planner link (#1507)", async () => {
    const el = await show(signedIn(), async () => cost({ missing_cards: 0, missing_copies: 0, cost_usd: 0 }));
    expect(el.querySelector(".match-hub-cost")?.textContent).toBe("You own every card");
    expect(el.querySelector(".match-hub-cost a")).toBeNull();
  });

  it("shows what the deck is missing and links to the deck in the planner (#1507)", async () => {
    const el = await show(signedIn(), async () => cost());
    const link = el.querySelector<HTMLAnchorElement>(".match-hub-cost a");
    expect(link?.textContent).toContain("This deck is missing $42.50");
    expect(link?.getAttribute("href")).toBe("https://optcg-deck-planner.app/decks/77?from=duel");
  });

  it("shows no chip when the deck has no planner twin (#1507)", async () => {
    const el = await show(signedIn(), async () => null);
    expect(el.querySelector(".match-hub-chip")).toBeNull();
  });

  it("Invite someone else calls onInvite (#1507)", async () => {
    const onInvite = vi.fn();
    const el = await show(signedIn({ signedIn: false, onInvite }), async () => null);
    act(() => el.querySelector<HTMLButtonElement>(".match-hub-invite")!.click());
    expect(onInvite).toHaveBeenCalledTimes(1);
  });
});

describe("waiting room after Invite someone else (#1507)", () => {
  it("copies the join link, not the bare room id, as soon as the room opens (#1507)", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root!.render(<RoomInvite roomId="ROOM42" autoCopy link />);
    });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/join/ROOM42`);
    expect(host.textContent).toContain("Invite link copied");
  });
});
