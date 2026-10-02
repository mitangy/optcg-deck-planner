import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Intent, PlayerView } from "../net/protocol";
import { updateSettings } from "../settings";
import { ReplacePrompt } from "./ReplacePrompt";

// Card art reads saved art prefs; server rendering has no storage.
vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });

function fullBoardView(): PlayerView {
  const chars = ["c1", "c2", "c3", "c4", "c5"].map((id) => ({ id, defId: "ST01-004" }));
  return {
    seat: 0,
    you: {
      leader: { id: "L0", defId: "ST01-001", power: 5000 },
      characters: chars,
      stage: null,
      hand: [{ id: "h1", defId: "ST01-003" }],
      deckCount: 10,
      trash: [],
      lifeCount: 5,
      donDeckCount: 8,
      costArea: [],
      activeDonCount: 0,
    },
    opponent: {
      leader: { id: "L1", defId: "ST01-001", power: 5000 },
      characters: [],
      stage: null,
      handCount: 5,
      deckCount: 10,
      trash: [],
      lifeCount: 5,
      donDeckCount: 8,
      costAreaCount: 0,
      activeDonCount: 0,
    },
    activeSeat: 0,
    phase: "main",
    turnNumber: 3,
    battle: null,
    pendingTrigger: null,
    winner: null,
    winReason: null,
    legalIntents: [],
  } as PlayerView;
}

describe("replace prompt", () => {
  it("outlines only the Characters the play may trash and waits for a pick (#254)", () => {
    const view = fullBoardView();
    const intents: Intent[] = ["c1", "c3"].map((id) => ({ type: "play_card", handIndex: 0, trashCharacterId: id }));
    const html = renderToStaticMarkup(
      <ReplacePrompt view={view} intents={intents} handIndex={0} mySeat={0} onSend={() => {}} onCancel={() => {}} />,
    );
    expect(html).toContain('data-instance-id="c1"');
    expect(html).toContain('data-instance-id="c3"');
    expect(html).not.toContain('data-instance-id="c2"');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Trash &amp; play<\/button>/);
    expect(html).toContain(">Cancel</button>");
  });

  it("has no Trash & play button under One-tap actions: the pick answers (#254)", () => {
    updateSettings({ oneTapActions: true });
    try {
      const intents: Intent[] = [{ type: "play_card", handIndex: 0, trashCharacterId: "c1" }];
      const html = renderToStaticMarkup(
        <ReplacePrompt view={fullBoardView()} intents={intents} handIndex={0} mySeat={0} onSend={() => {}} onCancel={() => {}} />,
      );
      expect(html).not.toContain("Trash &amp; play");
      expect(html).toContain(">Cancel</button>");
    } finally {
      updateSettings({ oneTapActions: false });
    }
  });
});
