import { describe, expect, it } from "vitest";
import type { ChoiceOptionView, PendingChoiceView } from "../../net/protocol";
import { answersAtPick, boardPickSpots, createDoubleTap, doublePick, doubleTapBoardSpot, isHandPick, nameTakenIds, pickCaption, resolvesOnPick, tapBoardSpot, toggleSelection, type BoardCardInfo } from "./fieldTargets";

const board = new Map<string, BoardCardInfo>([
  ["c1", { seat: 0, name: "Karoo" }],
  ["c2", { seat: 0, name: "Nico Robin", attachedDonCount: 1 }],
  ["L1", { seat: 0, name: "Monkey.D.Luffy", attachedDonCount: 2 }],
  ["oc", { seat: 1, name: "Nico Robin", attachedDonCount: 1 }],
]);
const opt = (id: string, extra: Partial<ChoiceOptionView> = {}): ChoiceOptionView =>
  ({ id, defId: "ST01-003", zone: "character", ownerSeat: 0, instanceId: id, eligible: true, ...extra }) as ChoiceOptionView;
const don = (id: string, label: string, extra: Partial<ChoiceOptionView> = {}): ChoiceOptionView =>
  ({ id, defId: "DON", zone: "don", ownerSeat: 0, eligible: true, label, rested: label.startsWith("Rested"), ...extra }) as ChoiceOptionView;
const onBoard = (options: ChoiceOptionView[]) => boardPickSpots(options, board, 0) != null;

describe("field target choices", () => {
  it("are picked on the board when every eligible option is a field card (#254)", () => {
    expect(onBoard([opt("c1"), opt("L1", { zone: "leader" })])).toBe(true);
  });

  it("keep the pop-up when an eligible option is off the field (#254)", () => {
    expect(onBoard([opt("c1"), opt("h1", { zone: "hand" })])).toBe(false);
    expect(onBoard([opt("c1"), opt("c9")])).toBe(false);
  });

  it("keep the pop-up for DON!! options the board can't place (#254)", () => {
    expect(onBoard([opt("c1", { zone: "don" })])).toBe(false);
    expect(onBoard([don("d1", "Attached DON!!")])).toBe(false);
  });

  it("ignore ineligible off-field options but never pick an empty set (#254)", () => {
    expect(onBoard([opt("c1"), opt("h1", { zone: "hand", eligible: false })])).toBe(true);
    expect(onBoard([opt("c1", { eligible: false })])).toBe(false);
  });
});

describe("DON!! choices on the board", () => {
  it("DON!! −N picks cost-area DON!! by state, yours or the opponent's (#258)", () => {
    const spots = boardPickSpots([don("d1", "Active DON!!"), don("d2", "Rested DON!!"), don("d3", "Rested DON!!", { ownerSeat: 1 })], board, 0);
    expect(spots && Object.fromEntries(spots)).toEqual({ d1: "don:you:active", d2: "don:you:rested", d3: "don:opp:rested" });
  });

  it("attached DON!! are picked by tapping the card they sit under, on the owner's side (#258)", () => {
    const spots = boardPickSpots([don("d1", "DON!! on Monkey.D.Luffy"), don("d2", "DON!! on Nico Robin")], board, 0);
    expect(spots && Object.fromEntries(spots)).toEqual({ d1: "host:L1", d2: "host:c2" });
  });

  it("keep the pop-up when two cards share the DON!! host's name (#258)", () => {
    const twins = new Map(board).set("c3", { seat: 0, name: "Nico Robin", attachedDonCount: 2 });
    expect(boardPickSpots([don("d1", "DON!! on Nico Robin")], twins, 0)).toBeNull();
  });

  it("keep the pop-up when the named host has no DON!! under it (#258)", () => {
    expect(boardPickSpots([don("d1", "DON!! on Karoo")], board, 0)).toBeNull();
  });
});

describe("tapping board spots", () => {
  const spots = new Map([
    ["a1", "don:you:active"],
    ["a2", "don:you:active"],
    ["r1", "don:you:rested"],
    ["h1", "host:L1"],
    ["h2", "host:L1"],
    ["c1", "card:c1"],
  ]);
  const empty = { selected: [], chips: {} };

  it("a cost-area chip picks one DON!! of its state and a second tap on it drops it (#258)", () => {
    const one = tapBoardSpot(empty, spots, "don:you:active", 3, "chipA");
    expect(one).toEqual({ selected: ["a1"], chips: { a1: "chipA" } });
    const two = tapBoardSpot(one, spots, "don:you:active", 3, "chipB");
    expect(two).toEqual({ selected: ["a1", "a2"], chips: { a1: "chipA", a2: "chipB" } });
    expect(tapBoardSpot(two, spots, "don:you:active", 3, "chipA")).toEqual({ selected: ["a2"], chips: { a2: "chipB" } });
  });

  it("a chip of a state with every DON!! already picked adds nothing (#258)", () => {
    const both = { selected: ["a1", "a2"], chips: { a1: "chipA", a2: "chipB" } };
    expect(tapBoardSpot(both, spots, "don:you:active", 5, "chipC")).toEqual(both);
  });

  it("a card with DON!! under it counts up per tap, then drops them all (#258)", () => {
    const one = tapBoardSpot(empty, spots, "host:L1", 3);
    const two = tapBoardSpot(one, spots, "host:L1", 3);
    expect(two.selected).toEqual(["h1", "h2"]);
    expect(tapBoardSpot(two, spots, "host:L1", 3).selected).toEqual([]);
  });

  it("stops at the maximum and a single pick swaps (#258)", () => {
    const full = { selected: ["c1"], chips: {} };
    expect(tapBoardSpot(full, spots, "host:L1", 1).selected).toEqual(["h1"]);
    expect(tapBoardSpot(full, spots, "don:you:rested", 1, "x")).toEqual({ selected: ["r1"], chips: { r1: "x" } });
    expect(tapBoardSpot(full, spots, "host:L1", 1).selected).not.toContain("c1");
    expect(tapBoardSpot({ selected: ["c1", "h1"], chips: {} }, spots, "don:you:rested", 2, "x").selected).toEqual(["c1", "h1"]);
  });

  it("tapping a card again takes back its DON!! pick when one pick is allowed (#258)", () => {
    const one = tapBoardSpot(empty, spots, "host:L1", 1);
    expect(one.selected).toEqual(["h1"]);
    expect(tapBoardSpot(one, spots, "host:L1", 1)).toEqual(empty);
  });

  it("tapping a card at the maximum takes back its DON!! picks so others can be chosen (#258)", () => {
    const three = new Map([...spots, ["h3", "host:L1"]]);
    const one = tapBoardSpot(empty, three, "host:L1", 2);
    const two = tapBoardSpot(one, three, "host:L1", 2);
    expect(two.selected).toEqual(["h1", "h2"]);
    const back = tapBoardSpot(two, three, "host:L1", 2);
    expect(back).toEqual(empty);
    expect(tapBoardSpot(back, three, "don:you:active", 2, "chipA")).toEqual({ selected: ["a1"], chips: { a1: "chipA" } });
  });
});

describe("pick helpers", () => {
  it("a single pick swaps and a second tap clears it (#254)", () => {
    expect(toggleSelection(["a"], "b", 1)).toEqual(["b"]);
    expect(toggleSelection(["a"], "a", 1)).toEqual([]);
  });

  it("stops adding at the maximum (#254)", () => {
    expect(toggleSelection(["a", "b"], "c", 2)).toEqual(["a", "b"]);
    expect(toggleSelection(["a"], "b", 2)).toEqual(["a", "b"]);
  });

  it("one-tap answers only for exactly one required pick (#254)", () => {
    expect(resolvesOnPick(true, 1, 1)).toBe(true);
    expect(resolvesOnPick(false, 1, 1)).toBe(false);
    expect(resolvesOnPick(true, 0, 1)).toBe(false);
    expect(resolvesOnPick(true, 1, 2)).toBe(false);
  });

  it("one-tap answers an exactly-N request on the Nth pick and no sooner (#502)", () => {
    expect(answersAtPick(true, 2, 2, 2)).toBe(true);
    expect(answersAtPick(true, 3, 3, 3)).toBe(true);
    expect(answersAtPick(true, 2, 2, 1)).toBe(false);
    expect(answersAtPick(false, 2, 2, 2)).toBe(false);
  });

  it("one-tap keeps Confirm for \"up to\" and optional picks (#502)", () => {
    expect(answersAtPick(true, 1, 2, 2)).toBe(false);
    expect(answersAtPick(true, 0, 2, 2)).toBe(false);
    expect(answersAtPick(true, 0, 0, 0)).toBe(false);
  });

  it("captions the range and the running count (#254)", () => {
    expect(pickCaption(1, 1, 0)).toBe("Choose 1");
    expect(pickCaption(0, 2, 1)).toBe("Choose up to 2 · selected 1");
    expect(pickCaption(1, 3, 2)).toBe("Choose 1–3 · selected 2");
  });
});

describe("hand choices", () => {
  const hand = (id: string, extra: Partial<ChoiceOptionView> = {}) => opt(id, { zone: "hand", ...extra });
  const select = (options: ChoiceOptionView[], seat = 0) =>
    ({ id: "p1", seat, kind: "effect", cardDefId: "OP15-002", optional: false, prompt: "", request: { type: "select", min: 0, max: 2, options } }) as PendingChoiceView;

  it("are picked by tapping your own hand cards (#263)", () => {
    expect(boardPickSpots([hand("h1"), hand("h2"), hand("h3", { eligible: false })], board, 0)).toEqual(
      new Map([["h1", "hand:h1"], ["h2", "hand:h2"]]),
    );
    expect(isHandPick(select([hand("h1")]), 0)).toBe(true);
  });

  it("keep the pop-up for the opponent's hand, unnamed hand cards, or a mix with the field (#263)", () => {
    expect(onBoard([hand("h1", { ownerSeat: 1 })])).toBe(false);
    expect(onBoard([hand("h1", { instanceId: undefined })])).toBe(false);
    expect(isHandPick(select([hand("h1"), opt("c1")]), 0)).toBe(false);
    expect(isHandPick(select([hand("h1")], 1), 0)).toBe(false);
  });
});

describe("different card names picks", () => {
  // OP13-082 Five Elders: two St. Jaygarcia Saturn and a St. Topman Warcury in the trash.
  const names: Record<string, string> = { "OP13-083": "St. Jaygarcia Saturn", "OP13-089": "St. Topman Warcury" };
  const trash = [opt("o0", { defId: "OP13-083", zone: "trash" }), opt("o1", { defId: "OP13-083", zone: "trash" }), opt("o2", { defId: "OP13-089", zone: "trash" })];
  const nameOf = (o: ChoiceOptionView) => names[o.defId!] ?? null;

  it("greys out the other copy once one Saturn is picked (#298)", () => {
    expect([...nameTakenIds(trash, ["o0"], true, nameOf)]).toEqual(["o1"]);
    expect([...nameTakenIds(trash, ["o0", "o2"], true, nameOf)]).toEqual(["o1"]);
  });

  it("leaves every copy pickable when the effect has no name rule (#298)", () => {
    expect(nameTakenIds(trash, ["o0"], undefined, nameOf).size).toBe(0);
  });
});

describe("double pick (#1287)", () => {
  it("a double on an already picked single pick keeps it and answers, it does not un-pick (#1287)", () => {
    expect(doublePick(["b"], "b", 1, 1)).toEqual({ selected: ["b"], answer: true });
  });

  it("a double on an unpicked option picks it and answers when that makes the picks valid (#1287)", () => {
    expect(doublePick([], "b", 1, 1)).toEqual({ selected: ["b"], answer: true });
    expect(doublePick(["a"], "b", 1, 1)).toEqual({ selected: ["b"], answer: true });
  });

  it("a double where more picks are still needed picks but does not answer (#1287)", () => {
    expect(doublePick([], "a", 2, 2)).toEqual({ selected: ["a"], answer: false });
    expect(doublePick(["a"], "a", 2, 2)).toEqual({ selected: ["a"], answer: false });
  });

  it("a double completing the picks answers with all of them (#1287)", () => {
    expect(doublePick(["a"], "b", 2, 2)).toEqual({ selected: ["a", "b"], answer: true });
  });

  it("an up-to-N pick (min 0) answers with one pick (#1287)", () => {
    expect(doublePick([], "a", 0, 3)).toEqual({ selected: ["a"], answer: true });
  });

  it("a double on an option the full pick can't take does not answer (#1287)", () => {
    expect(doublePick(["a", "b"], "c", 1, 2)).toEqual({ selected: ["a", "b"], answer: false });
  });
});

describe("double tap on a board spot (#1287)", () => {
  const spots = new Map([
    ["a1", "don:you:active"],
    ["a2", "don:you:active"],
    ["h1", "host:L1"],
    ["h2", "host:L1"],
    ["c1", "card:c1"],
    ["c2", "card:c2"],
  ]);
  const empty = { selected: [], chips: {} };

  it("a double on a picked card keeps the pick and answers, it does not drop it (#1287)", () => {
    const one = { selected: ["c1"], chips: {} };
    expect(doubleTapBoardSpot(one, spots, "card:c1", 1, 1)).toEqual({ pick: one, answer: true });
  });

  it("a double on a card with 2 DON!! under it, 2 wanted, adds the second and answers (#1287)", () => {
    const one = tapBoardSpot(empty, spots, "host:L1", 2);
    expect(one.selected).toEqual(["h1"]);
    const r = doubleTapBoardSpot(one, spots, "host:L1", 2, 2);
    expect(r.pick.selected).toEqual(["h1", "h2"]);
    expect(r.answer).toBe(true);
  });

  it("a double on that card with 1 wanted keeps the one pick and answers (#1287)", () => {
    const one = tapBoardSpot(empty, spots, "host:L1", 1);
    expect(doubleTapBoardSpot(one, spots, "host:L1", 1, 1)).toEqual({ pick: one, answer: true });
  });

  it("a double that leaves too few picks does not answer (#1287)", () => {
    const r = doubleTapBoardSpot(empty, spots, "card:c1", 2, 2);
    expect(r.pick.selected).toEqual(["c1"]);
    expect(r.answer).toBe(false);
  });

  it("a double on a cost-area chip keeps that chip picked and answers (#1287)", () => {
    const one = tapBoardSpot(empty, spots, "don:you:active", 1, "chipA");
    const r = doubleTapBoardSpot(one, spots, "don:you:active", 1, 1, "chipA");
    expect(r).toEqual({ pick: one, answer: true });
  });

  it("a double on a spot the full pick can't take does not answer (#1287)", () => {
    const full = { selected: ["c1", "c2"], chips: {} };
    const r = doubleTapBoardSpot(full, spots, "host:L1", 1, 2);
    expect(r).toEqual({ pick: full, answer: false });
  });
});

describe("double tap timing (#1287)", () => {
  const clock = () => {
    let t = 1000;
    return { now: () => t, advance: (ms: number) => void (t += ms) };
  };

  it("the same key twice within the window is a double (#1287)", () => {
    const c = clock();
    const d = createDoubleTap(280, c.now);
    expect(d.isDouble("a")).toBe(false);
    c.advance(280);
    expect(d.isDouble("a")).toBe(true);
  });

  it("a second tap beyond the window, or on another key, is not a double (#1287)", () => {
    const c = clock();
    const d = createDoubleTap(280, c.now);
    d.isDouble("a");
    c.advance(281);
    expect(d.isDouble("a")).toBe(false);
    c.advance(100);
    expect(d.isDouble("b")).toBe(false);
  });

  it("a third quick tap starts over instead of being another double (#1287)", () => {
    const c = clock();
    const d = createDoubleTap(280, c.now);
    d.isDouble("a");
    c.advance(50);
    expect(d.isDouble("a")).toBe(true);
    c.advance(50);
    expect(d.isDouble("a")).toBe(false);
  });
});
