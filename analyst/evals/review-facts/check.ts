/**
 * Checks one claim against the replay's facts (#675). Rules:
 * - A claim with a turn is looked for in that turn. Found elsewhere in the game for the same player: wrong_turn.
 *   Found nowhere: contradicted. With no turn the whole game is searched.
 * - Card names are matched by normalized name (case, punctuation and "Monkey.D.Luffy" / "Monkey D. Luffy" spacing
 *   ignored), by a card number such as OP01-025, or by a partial name whose distinctive words all appear in exactly
 *   one card name of this game ("Zoro" for "Roronoa Zoro"). A partial name that fits several cards, or none, is
 *   unverifiable. A full name that is a real card but is in neither deck is contradicted: it cannot have been played.
 * - When the facts cannot decide (hidden info not tracked, a game that stopped replaying, a claim with no kind we
 *   can read), the verdict is unverifiable, never contradicted.
 */
import type { Catalog } from "../../src/catalog";
import type { Seat } from "@optcg/rules";
import type { Claim } from "./extract";
import { nameOfCard, seatOf, type GameFacts, type TurnFacts } from "./facts";

export type Verdict = "supported" | "contradicted" | "wrong_turn" | "unverifiable";
export type Checked = { verdict: Verdict; reason: string };

const norm = (s: string): string =>
  s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const STOP = new Set(["the", "of", "a", "an", "leader", "character", "event", "stage", "card"]);
const tokens = (s: string): string[] => norm(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));
const CARD_NUMBER = /\b([A-Z]{1,3}\d{2}-\d{3}|P-\d{3})\b/i;

type Resolved = { status: "ok"; name: string } | { status: "not_in_game"; name: string } | { status: "ambiguous"; why: string } | { status: "none"; why: string };

/** Which card name of this game a written card name means. */
export function resolveCard(written: string, facts: GameFacts, catalog: Catalog): Resolved {
  const gameNames = new Map<string, string>();
  for (const id of facts.universe) gameNames.set(norm(nameOfCard(id)), nameOfCard(id));
  const id = written.match(CARD_NUMBER)?.[1]?.toUpperCase();
  if (id) {
    const row = catalog.cards.get(id);
    if (row) return facts.universe.includes(id) || gameNames.has(norm(row.name)) ? { status: "ok", name: norm(row.name) } : { status: "not_in_game", name: row.name };
  }
  const full = norm(written);
  if (gameNames.has(full)) return { status: "ok", name: full };
  const want = tokens(written);
  if (!want.length) return { status: "none", why: `"${written}" names no card` };
  const fits = [...gameNames.keys()].filter((n) => {
    const have = new Set(tokens(n));
    return want.every((t) => have.has(t));
  });
  if (fits.length === 1) return { status: "ok", name: fits[0]! };
  if (fits.length > 1) return { status: "ambiguous", why: `"${written}" fits ${fits.length} cards in this game (${fits.slice(0, 3).map((n) => gameNames.get(n)).join(", ")})` };
  for (const c of catalog.cards.values()) if (norm(c.name) === full) return { status: "not_in_game", name: c.name };
  return { status: "none", why: `"${written}" matches no card in this game` };
}

/** One thing that happened, reduced to what a claim can be compared with. */
type Item = { turn: number; seat: Seat; card?: string; target?: string };

const sameCard = (item: string | undefined, want: string): boolean | "unknown" => (item === undefined ? "unknown" : norm(nameOfCard(item)) === want);

const REASONS: Record<string, string[]> = {
  life: ["leader_battle_at_zero_life"],
  deck_out: ["deck_out"],
  effect: ["card_effect"],
  concede: ["concede", "conceded", "resign", "forfeit"],
  timeout: ["timeout", "time_out", "timed_out"],
};

export function checkClaim(claim: Claim, facts: GameFacts, seat: Seat, catalog: Catalog): Checked {
  const unverifiable = (reason: string): Checked => ({ verdict: "unverifiable", reason });
  const who = (a: Claim["actor"]) => (a ? seatOf(a, seat) : null);
  const actor = who(claim.actor);
  const label = (s: Seat) => (s === seat ? "you" : "the opponent");
  const turnOf = (n: number): TurnFacts | undefined => facts.turns.find((t) => t.turn === n);

  switch (claim.kind) {
    case "other":
      return unverifiable("no checkable event in this claim");
    case "went_first": {
      if (actor === null) return unverifiable("no player named");
      return facts.firstSeat === actor
        ? { verdict: "supported", reason: `${label(actor)} went first` }
        : { verdict: "contradicted", reason: `${label(facts.firstSeat)} went first, not ${label(actor)}` };
    }
    case "mulligan": {
      const did = actor === null ? null : facts.mulligans[actor];
      if (actor === null || claim.number === null) return unverifiable("claim does not say who or whether");
      if (did === null) return unverifiable("mulligan not recorded in this game");
      return did === (claim.number === 1)
        ? { verdict: "supported", reason: `${label(actor)} ${did ? "mulliganed" : "kept"}` }
        : { verdict: "contradicted", reason: `${label(actor)} ${did ? "mulliganed" : "kept"}` };
    }
    case "result": {
      const { winner, reason } = facts.result;
      if (winner === null || actor === null) return unverifiable(winner === null ? "the game has no recorded winner" : "no winner named");
      if (winner !== actor) return { verdict: "contradicted", reason: `${label(winner)} won, not ${label(actor)}` };
      const want = claim.target ? REASONS[norm(claim.target).replace(/ /g, "_")] : undefined;
      if (want && reason) {
        const known = Object.values(REASONS).flat();
        if (want.includes(reason)) return { verdict: "supported", reason: `${label(winner)} won by ${reason}` };
        if (known.includes(reason)) return { verdict: "contradicted", reason: `${label(winner)} won, but by ${reason}, not ${claim.target}` };
        return unverifiable(`winner is right; the recorded end reason "${reason}" is not one we can compare`);
      }
      return { verdict: "supported", reason: `${label(winner)} won` };
    }
    case "life_total": {
      if (actor === null || claim.number === null) return unverifiable("claim does not say whose Life or how much");
      if (claim.turn !== null) {
        const t = turnOf(claim.turn);
        if (!t) return facts.divergedAt ? unverifiable("turn is past where the replay stopped") : { verdict: "contradicted", reason: `the game had no turn ${claim.turn}` };
        const [lo, hi] = t.lifeRange[actor];
        return claim.number >= lo && claim.number <= hi
          ? { verdict: "supported", reason: `${label(actor)} had ${lo}-${hi} Life during turn ${claim.turn} (start ${t.lifeAtStart[actor]}, end ${t.lifeAtEnd[actor]})` }
          : { verdict: "contradicted", reason: `${label(actor)} had ${lo}-${hi} Life during turn ${claim.turn} (start ${t.lifeAtStart[actor]}, end ${t.lifeAtEnd[actor]}), not ${claim.number}` };
      }
      // No turn: a claim about how the game ended is compared to the final Life; any other to every total the player had.
      if (/\b(end|ended|finish|finished|final|finally|left with)\b/i.test(claim.quote)) {
        return facts.finalLife[actor] === claim.number
          ? { verdict: "supported", reason: `${label(actor)} finished on ${claim.number} Life` }
          : { verdict: "contradicted", reason: `${label(actor)} finished on ${facts.finalLife[actor]} Life, not ${claim.number}` };
      }
      return facts.lifeSeen[actor].includes(claim.number)
        ? { verdict: "supported", reason: `${label(actor)} had ${claim.number} Life at some point` }
        : { verdict: "contradicted", reason: `${label(actor)} never had ${claim.number} Life (saw ${facts.lifeSeen[actor].sort((a, b) => b - a).join(", ")})` };
    }
    default:
  }

  // Event kinds: build the items of this kind, then look for the claim among them.
  const items: Item[] = [];
  for (const t of facts.turns) {
    if (claim.kind === "played") for (const p of t.plays) items.push({ turn: t.turn, seat: p.seat, card: p.card });
    if (claim.kind === "attacked") for (const a of t.attacks) items.push({ turn: t.turn, seat: a.seat, card: a.attacker === "unknown" ? undefined : a.attacker, target: a.target === "unknown" ? undefined : a.target });
    if (claim.kind === "ko") for (const k of t.kos) items.push({ turn: t.turn, seat: k.seat, card: k.card });
    if (claim.kind === "life_taken") for (const l of t.lifeTaken) items.push({ turn: t.turn, seat: l.seat, card: l.card });
    if (claim.kind === "countered") for (const a of t.attacks) for (const c of a.counters) items.push({ turn: t.turn, seat: (1 - a.seat) as Seat, card: c });
    if (claim.kind === "blocked") for (const a of t.attacks) if ("blockedBy" in a) items.push({ turn: t.turn, seat: (1 - a.seat) as Seat, card: a.blockedBy });
    if (claim.kind === "trigger") for (const x of t.triggersAccepted) items.push({ turn: t.turn, seat: x.seat, card: x.card });
  }

  let wantCard: string | null = null;
  if (claim.card) {
    const r = resolveCard(claim.card, facts, catalog);
    if (r.status === "ambiguous" || r.status === "none") return unverifiable(r.why);
    if (r.status === "not_in_game") return { verdict: "contradicted", reason: `${r.name} is in neither deck` };
    wantCard = r.name;
  }
  let wantTarget: string | null = null;
  if (claim.kind === "attacked" && claim.target) {
    if (/^(the |your |their |opponent'?s? )*(leader|player)$/i.test(claim.target.trim())) wantTarget = "leader";
    else {
      const r = resolveCard(claim.target, facts, catalog);
      if (r.status === "ambiguous" || r.status === "none") return unverifiable(r.why);
      if (r.status === "not_in_game") return { verdict: "contradicted", reason: `${r.name} is in neither deck` };
      wantTarget = r.name;
    }
  }
  if (claim.kind === "attacked" && !claim.card && !wantTarget) return unverifiable("claim names neither attacker nor target");

  const matches = (i: Item): boolean | "unknown" => {
    if (actor !== null && i.seat !== actor) return false;
    let result: boolean | "unknown" = true;
    const fold = (m: boolean | "unknown") => {
      if (m === false) result = false;
      else if (m === "unknown" && result === true) result = "unknown";
    };
    if (wantCard) fold(sameCard(i.card, wantCard));
    if (wantTarget) fold(wantTarget === "leader" ? i.target === "leader" : i.target === undefined ? "unknown" : i.target === "leader" ? false : sameCard(i.target, wantTarget));
    return result;
  };
  const verdicts = items.map((i) => ({ i, m: matches(i) }));
  const turnsOf = (xs: typeof verdicts) => [...new Set(xs.map((x) => x.i.turn))].join(", ");
  const diverged = facts.divergedAt !== undefined;
  const absent = (what: string): Checked => (diverged ? unverifiable(`${what}; the replay stopped early, so later turns are unknown`) : { verdict: "contradicted", reason: what });
  const who2 = actor === null ? "either player" : label(actor);
  const desc = `${claim.kind}${claim.card ? ` ${claim.card}` : ""}${claim.target ? ` -> ${claim.target}` : ""}`;

  const here = claim.turn === null ? verdicts : verdicts.filter((x) => x.i.turn === claim.turn);
  const yes = here.filter((x) => x.m === true);
  if (yes.length) {
    if ((claim.kind === "life_taken" || claim.kind === "ko") && claim.number !== null && claim.turn !== null && yes.length !== claim.number) {
      return { verdict: "contradicted", reason: `${who2} had ${yes.length} ${claim.kind} on turn ${claim.turn}, not ${claim.number}` };
    }
    return { verdict: "supported", reason: `${desc} by ${who2}${claim.turn !== null ? ` on turn ${claim.turn}` : ""}` };
  }
  if (here.some((x) => x.m === "unknown")) return unverifiable(`${claim.kind} happened but the card is not recorded, so it cannot be matched`);
  if (claim.turn !== null) {
    const elsewhere = verdicts.filter((x) => x.i.turn !== claim.turn && x.m === true);
    if (elsewhere.length) return { verdict: "wrong_turn", reason: `${desc} by ${who2} happened on turn ${turnsOf(elsewhere)}, not turn ${claim.turn}` };
    if (verdicts.some((x) => x.m === "unknown")) return unverifiable(`${claim.kind} with an unrecorded card happened on another turn`);
    return absent(`${desc} by ${who2} never happened${turnOf(claim.turn) ? "" : `; the game had no turn ${claim.turn}`}`);
  }
  return absent(`${desc} by ${who2} never happened`);
}
