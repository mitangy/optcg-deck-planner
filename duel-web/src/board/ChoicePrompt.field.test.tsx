import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ChoiceOptionView, PendingChoiceView, PlayerView } from "../net/protocol";

vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
const { ChoicePrompt } = await import("./ChoicePrompt");
const { updateSettings } = await import("../settings");

const view = {
  seat: 0,
  you: {
    leader: { id: "L0", defId: "ST01-001", power: 5000 },
    characters: [{ id: "c1", defId: "ST01-004" }, { id: "c2", defId: "ST01-008", attachedDonCount: 1 }],
    stage: null,
    hand: [],
  },
  opponent: { leader: { id: "L1", defId: "ST01-001", power: 5000 }, characters: [], stage: null },
} as unknown as PlayerView;

const choice = (options: ChoiceOptionView[], min = 1, max = 1): PendingChoiceView =>
  ({
    id: "p1",
    seat: 0,
    kind: "effect",
    cardDefId: "ST01-004",
    optional: false,
    prompt: "Pick one.",
    request: { type: "select", min, max, options },
  }) as PendingChoiceView;

const render = (c: PendingChoiceView) => renderToStaticMarkup(<ChoicePrompt choice={c} mySeat={0} view={view} onSend={() => {}} />);
const onField: ChoiceOptionView = { id: "o0", defId: "ST01-004", zone: "character", ownerSeat: 0, instanceId: "c1", eligible: true };
const inHand: ChoiceOptionView = { id: "o1", defId: "ST01-003", zone: "hand", ownerSeat: 0, instanceId: "h9", eligible: true };

describe("select choices over field cards", () => {
  it("are answered on the board with a slim bar, no card grid (#254)", () => {
    const html = render(choice([onField]));
    expect(html).toContain("field-bar");
    expect(html).not.toContain("choice-grid");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Confirm<\/button>/);
  });

  it("keep the pop-up when a pickable card is not on the field (#254)", () => {
    const html = render(choice([onField, inHand]));
    expect(html).toContain("choice-grid");
    expect(html).not.toContain("field-bar");
  });

  it("drop the Confirm button under One-tap actions when exactly one is picked (#254)", () => {
    updateSettings({ oneTapActions: true });
    try {
      expect(render(choice([onField]))).not.toContain(">Confirm<");
      expect(render(choice([onField], 0, 1))).toContain(">Choose none<");
    } finally {
      updateSettings({ oneTapActions: false });
    }
  });

  it("DON!! −N is answered on the board: cost-area chips and the DON!! host outlined, no DON!! grid (#PR_I)", () => {
    const html = render(
      choice(
        [
          { id: "d0", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "Active DON!!", rested: false },
          { id: "d1", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Nico Robin", rested: false },
        ],
        2,
        2,
      ),
    );
    expect(html).toContain("field-bar");
    expect(html).not.toContain("choice-don");
    expect(html).toContain('.don-strip-you .don-chip-btn[data-don-rested="false"] .don-chip { outline: 2px dashed');
    expect(html).toContain('.card-tile[data-instance-id="c2"] { outline: 2px dashed');
  });

  it("keeps the DON!! grid when the DON!! host can't be found on the board (#PR_I)", () => {
    const html = render(choice([{ id: "d1", defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label: "DON!! on Karoo", rested: false }]));
    expect(html).toContain("choice-don");
    expect(html).not.toContain("field-bar");
  });
});
