/**
 * Scenario puzzles (#677): a setup and a few steps from an engine scenario row, described in words, and one question about the
 * result. The gold is what the row states the engine does; scenarioRows.test.ts runs every row through the engine.
 */
import { Harness } from "@optcg/rules/src/testing/harness";
import type { CardScenario, FieldCard, SeatExpect, SeatSetup, Step, Where } from "@optcg/rules/src/testing/scenario";
import type { Seat } from "@optcg/rules";
import type { Catalog } from "../../src/catalog";
import { assemble, countedList, hasNewSet, labelOf, nameOf } from "./describe";
import type { Gold, Puzzle } from "./types";
import { SCENARIO_ROWS } from "./scenarioRows";

const FILLER_ID = "ST01-003";
const CARD_NUMBER = /^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$/;
const who = (seat: Seat) => (seat === 0 ? "you" : "your opponent");
const whose = (seat: Seat) => (seat === 0 ? "your" : "your opponent's");

/** Rows the generator can turn into a question: every step happens, and no prompt is left waiting at the end. */
export function usableRow(row: CardScenario): boolean {
  if ((row.steps ?? []).some((s) => "rejects" in s && s.rejects)) return false;
  const pending = row.expect.pending;
  return pending === undefined || pending === "none";
}

type Ask = { seat: Seat; key: string; gold: Exclude<Gold, { mode: "all" }>; question: (catalog: Catalog) => string; schema: string };

/** The questions a row can answer: one per statement it makes about hand, field, trash, Life, active DON!! and power. */
export function asksOf(row: CardScenario): Ask[] {
  const out: Ask[] = [];
  for (const seat of [0, 1] as Seat[]) {
    const e: SeatExpect | undefined = seat === 0 ? row.expect.me : row.expect.opp;
    if (!e) continue;
    const list = (key: string, ids: string[], question: string, schema: string) =>
      out.push({ seat, key, gold: { key, mode: "multiset", value: [...ids].sort() }, question: () => question, schema });
    if (e.hand) list("hand", e.hand, `After these steps, which cards are in ${whose(seat)} hand? List a card once for each copy.`, '{"hand": ["<card number>", ...]}');
    if (e.field) list("field", e.field, `After these steps, which Characters are on ${whose(seat)} field? List a card once for each copy.`, '{"field": ["<card number>", ...]}');
    if (e.trash) list("trash", e.trash, `After these steps, which cards are in ${whose(seat)} trash? List a card once for each copy.`, '{"trash": ["<card number>", ...]}');
    if (e.life !== undefined) {
      const n = typeof e.life === "number" ? e.life : e.life.length;
      out.push({ seat, key: "life", gold: { key: "life", mode: "number", value: n }, question: () => `After these steps, how many Life cards does ${who(seat) === "you" ? "you have" : "your opponent have"}?`, schema: '{"life": <number>}' });
    }
    if (e.don?.active !== undefined) {
      out.push({ seat, key: "active_don", gold: { key: "active_don", mode: "number", value: e.don.active }, question: () => `After these steps, how many active DON!! cards ${seat === 0 ? "do you have" : "does your opponent have"} in the cost area?`, schema: '{"active_don": <number>}' });
    }
    for (const [id, power] of Object.entries(e.power ?? {})) {
      out.push({ seat, key: `power:${id}`, gold: { key: "power", mode: "number", value: power }, question: (catalog) => `After these steps, what is the power of ${whose(seat)} ${labelOf(catalog, id)}?`, schema: '{"power": <number>}' });
    }
  }
  return out;
}

const fieldCard = (f: FieldCard) => (typeof f === "string" ? { card: f } : f);

function setupLines(row: CardScenario, catalog: Catalog): { lines: string[]; ids: string[] } {
  const ids: string[] = [];
  const see = (...xs: string[]) => ids.push(...xs);
  const h = new Harness({ leaders: [row.leaders?.me ?? "ST01-001", row.leaders?.opp ?? "ST01-001"] });
  const lines: string[] = [
    `Turn ${h.state.turnNumber}. It is your turn and you are in your Main Phase; both players have taken at least one turn, so Characters you control can attack unless a line below says otherwise. Every Character listed on a field below was played on an earlier turn.`,
    `Each player's deck is 40 copies of ${labelOf(catalog, FILLER_ID)} (a Character with no effect) apart from any cards named below, and every Life card is also a ${nameOf(catalog, FILLER_ID)} unless named.`,
  ];
  see(FILLER_ID);
  for (const seat of [0, 1] as Seat[]) {
    const s: SeatSetup | undefined = seat === 0 ? row.me : row.opp;
    const p = h.state.players[seat];
    const leader = seat === 0 ? (row.leaders?.me ?? "ST01-001") : (row.leaders?.opp ?? "ST01-001");
    see(leader);
    const name = seat === 0 ? "You" : "Your opponent";
    const own = seat === 0 ? "Your" : "Your opponent's";
    const rested = s?.don?.rested ?? p.costArea.filter((d) => d.rested).length;
    const active = s?.don?.active ?? p.costArea.filter((d) => !d.rested).length;
    const field = (s?.field ?? []).map(fieldCard);
    see(...(s?.hand ?? []), ...field.map((f) => f.card), ...(s?.stage ? [s.stage] : []), ...(s?.life ?? []), ...(s?.trash ?? []), ...(s?.deckTop ?? []));
    lines.push(
      `${own} Leader: ${labelOf(catalog, leader)}${s?.leaderDon ? `, with ${s.leaderDon} DON!! attached` : ""}.`,
      `${own} hand: ${s?.hand?.length ? s.hand.map((c) => labelOf(catalog, c)).join("; ") : "empty"}.`,
      `${own} Characters: ${field.length ? field.map((f) => `${labelOf(catalog, f.card)}, ${f.rested ? "rested" : "active"}${f.don ? `, ${f.don} DON!! attached` : ""}`).join("; ") : "none"}.`,
      `${own} Stage: ${s?.stage ? labelOf(catalog, s.stage) : "none"}.`,
      `${own} Life: ${s?.life ? `${s.life.length} cards, top first: ${s.life.map((c) => labelOf(catalog, c)).join(", ")}` : `${p.life.length} cards`}.`,
      `${own} trash: ${s?.trash?.length ? countedList(catalog, s.trash) : "empty"}.`,
      `${own} DON!!: ${active} active and ${rested} rested in the cost area.`,
    );
    if (s?.deckTop?.length) lines.push(`${name === "You" ? "Your" : "Your opponent's"} deck, top card first, starts: ${s.deckTop.map((c) => labelOf(catalog, c)).join(", ")}; the rest is ${nameOf(catalog, FILLER_ID)}.`);
  }
  return { lines, ids };
}

const where = (w: Where, catalog: Catalog) => `${whose(w.seat)} ${labelOf(catalog, w.card)}`;

function stepLines(row: CardScenario, catalog: Catalog): { lines: string[]; ids: string[] } {
  const ids: string[] = [];
  const lines: string[] = [];
  let active: Seat = 0;
  const abilities = (card: string, id: string) => catalog.abilities.get(card)?.find((a) => a.id === id);
  for (const step of row.steps ?? []) {
    const defender = (1 - active) as Seat;
    let line: string;
    if ("play" in step) {
      const seat = step.seat ?? active;
      ids.push(step.play);
      line = `${seat === 0 ? "You play" : "Your opponent plays"} ${labelOf(catalog, step.play)} from ${seat === 0 ? "your" : "their"} hand, paying its cost${step.extra?.trashCharacterId ? " and trashing a Character to make room" : ""}.`;
    } else if ("counter" in step) {
      ids.push(step.counter);
      line = `${who(defender) === "you" ? "You" : "Your opponent"} play${defender === 0 ? "" : "s"} the Counter Event ${labelOf(catalog, step.counter)} from ${defender === 0 ? "your" : "their"} hand.`;
    } else if ("counterCharacter" in step) {
      ids.push(step.counterCharacter);
      line = `${defender === 0 ? "You" : "Your opponent"} trash${defender === 0 ? "" : "es"} ${labelOf(catalog, step.counterCharacter)} from ${defender === 0 ? "your" : "their"} hand for its Counter value.`;
    } else if ("attack" in step) {
      ids.push(step.attack.card, ...(step.at === "leader" ? [] : [step.at.card]));
      line = `${active === 0 ? "You attack" : "Your opponent attacks"} with ${labelOf(catalog, step.attack.card)}, targeting ${step.at === "leader" ? `${whose(defender)} Leader` : where(step.at, catalog)}.`;
    } else if ("passBlock" in step) {
      line = `${defender === 0 ? "You do" : "Your opponent does"} not block.`;
    } else if ("passBattle" in step) {
      line = `${defender === 0 ? "You do" : "Your opponent does"} not block and use${defender === 0 ? "" : "s"} no Counter, so the battle resolves. A Life card that is taken goes to its owner's hand.`;
    } else if ("activate" in step) {
      ids.push(step.activate.card);
      const a = abilities(step.activate.card, step.ability);
      line = `${active === 0 ? "You activate" : "Your opponent activates"} the ability of ${where(step.activate, catalog)}${a ? `: ${a.text}` : ""}.`;
    } else if ("accept" in step) {
      line = "When an effect asks whether to use it, the player it asks says yes.";
    } else if ("decline" in step) {
      line = "When an effect asks whether to use it, the player it asks says no.";
    } else if ("pick" in step) {
      ids.push(...step.pick.filter((c) => CARD_NUMBER.test(c)));
      line = `When an effect asks for a choice, the choice made is: ${step.pick.map((c) => (CARD_NUMBER.test(c) ? labelOf(catalog, c) : c)).join(", ")}.`;
    } else {
      line = `${active === 0 ? "You end your" : "Your opponent ends their"} turn.`;
      active = defender;
    }
    lines.push(line);
  }
  return { lines: lines.map((l, i) => `${i + 1}. ${l}`), ids };
}

/** One puzzle per question a usable row can answer, ids "scenario-<n>-<key>". */
export function scenarioPuzzles(catalog: Catalog): Puzzle[] {
  const out: Puzzle[] = [];
  SCENARIO_ROWS.forEach(({ source, row }, n) => {
    if (!usableRow(row)) return;
    const setup = setupLines(row, catalog);
    const steps = stepLines(row, catalog);
    const ids = [...new Set([...setup.ids, ...steps.ids])];
    for (const ask of asksOf(row)) {
      const head = [...setup.lines, ...(steps.lines.length ? ["Then, in order:", ...steps.lines] : ["Nothing is played or activated; answer for the position as described."])];
      const question = ask.question(catalog);
      const text = assemble(catalog, head, ids, question, ask.schema);
      if (!text) continue;
      out.push({ id: `scenario-${n}-${ask.key}-s${ask.seat}`, type: "scenario", tags: [source], newSet: hasNewSet(ids), source: `scenario ${source}: ${row.card} ${row.name}`, position: text.position, cards: ids, question, schema: ask.schema, message: text.message, gold: ask.gold });
    }
  });
  return out;
}

/** The JSON field of one ask in a chain: "my_hand", "opp_trash", "my_power_<card number>". */
export const chainKey = (ask: Pick<Ask, "seat" | "key">): string => `${ask.seat === 0 ? "my" : "opp"}_${ask.key.replace(":", "_")}`;

const schemaOf = (gold: Gold): string => (gold.mode === "number" ? "<number>" : '["<card number>", ...]');

/** "After these steps, which cards ..." as a list item: the shared lead-in goes once above the list. */
const itemOf = (question: string): string => {
  const body = question.replace(/^After these steps, /, "");
  return body.charAt(0).toUpperCase() + body.slice(1);
};

/**
 * One puzzle per usable row with at least two statements (#685): all of the row's questions at once, answered in one JSON object.
 * It is right only when every part is, so a model that tracks the setup but slips on one number still misses.
 */
export function scenarioChainPuzzles(catalog: Catalog): Puzzle[] {
  const out: Puzzle[] = [];
  SCENARIO_ROWS.forEach(({ source, row }, n) => {
    if (!usableRow(row)) return;
    const asks = asksOf(row);
    if (asks.length < 2) return;
    const setup = setupLines(row, catalog);
    const steps = stepLines(row, catalog);
    const ids = [...new Set([...setup.ids, ...steps.ids])];
    const head = [...setup.lines, ...(steps.lines.length ? ["Then, in order:", ...steps.lines] : ["Nothing is played or activated; answer for the position as described."])];
    const parts: Gold[] = asks.map((a) => ({ ...a.gold, key: chainKey(a) }));
    const keys = parts.map((p) => p.key);
    const question = ["After these steps, answer every one of these. Put each answer in the JSON field named before it:", ...asks.map((a, i) => `- ${keys[i]}: ${itemOf(a.question(catalog))}`)].join("\n");
    const schema = `{${parts.map((p) => `"${p.key}": ${schemaOf(p)}`).join(", ")}}`;
    const text = assemble(catalog, head, ids, question, schema);
    if (!text) return;
    out.push({ id: `scenario_chain-${n}`, type: "scenario_chain", tags: [source, `${asks.length}-parts`], newSet: hasNewSet(ids), source: `scenario ${source}: ${row.card} ${row.name}`, position: text.position, cards: ids, question, schema, message: text.message, gold: { key: "all", mode: "all", parts } });
  });
  return out;
}
