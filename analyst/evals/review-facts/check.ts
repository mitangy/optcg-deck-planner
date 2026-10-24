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
 * Loosened after the #687 audit, where 7 of 8 "wrong" claims were the checker's or the extractor's mistake:
 * - A stated count of Life cards taken or K.O.s is "at least": only a count below the claim's number contradicts it.
 * - Life lost to an effect counts as Life taken (a turn's count is the larger of the Life hits and the Life lost), and
 *   a Life claim may name the card that caused the loss (one the other player played or attacked with that turn).
 * - An event claim (any kind) that fails for the named player but would hold for the other one is unverifiable (#695): the
 *   extractor often mixes up who owned a card or whose Life it was.
 * - A card name counts only as far as the quote states it. A name the quote does not contain was inferred by the
 *   extractor: if it makes the claim wrong but dropping it makes the claim hold, the claim is unverifiable. When the
 *   quote has only part of the name ("a Luffy" for Monkey.D.Luffy), only that part is looked up.
 * - A name that fits several cards is checked as each of them (up to 5): supported if any reading holds, wrong only if
 *   every reading is wrong, otherwise unverifiable. Digits are part of a name ("Mr.1" is not "Mr.2").
 * - "A, B" and "A and B" card lists are split and every part must hold.
 * - An unnamed Character target ("a Character") matches any attack that did not go for the Leader.
 * - DON!! counts, hand size, cards on the field and cards put into the trash are checked against the range or set the
 *   player had at any point of the turn.
 */
import type { Catalog } from "../../src/catalog";
import type { Seat } from "@optcg/rules";
import type { Claim } from "./extract";
import { nameOfCard, seatOf, type DonRanges, type GameFacts, type Range, type TurnFacts } from "./facts";

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
// A single digit is a word of a name ("Mr.1"); a single letter is not ("D" in Monkey.D.Luffy).
const tokens = (s: string): string[] => norm(s).split(" ").filter((t) => (t.length > 1 || /^\d$/.test(t)) && !STOP.has(t));
const CARD_NUMBER = /\b([A-Z]{1,3}\d{2}-\d{3}|P-\d{3})\b/i;

type Resolved = { status: "ok"; name: string } | { status: "not_in_game"; name: string } | { status: "ambiguous"; why: string; names: string[] } | { status: "none"; why: string };

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
  if (fits.length > 1) return { status: "ambiguous", names: fits, why: `"${written}" fits ${fits.length} cards in this game (${fits.slice(0, 3).map((n) => gameNames.get(n)).join(", ")})` };
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

const MAX_READINGS = 5;
const RANK: Record<Verdict, number> = { contradicted: 3, wrong_turn: 2, unverifiable: 1, supported: 0 };
const EVENT_KINDS = new Set<Claim["kind"]>(["played", "attacked", "ko", "life_taken", "countered", "blocked", "trigger", "on_board", "trashed"]);

/** The tokens of a card name that the quote itself contains; the card as far as the review states it. */
function statedPart(written: string, quote: string): { all: boolean; none: boolean; part: string } {
  const want = tokens(written);
  if (!want.length) return { all: true, none: false, part: written };
  const said = new Set(norm(quote).split(" "));
  const present = want.filter((t) => said.has(t));
  return { all: present.length === want.length, none: present.length === 0, part: present.join(" ") };
}

export function checkClaim(claim: Claim, facts: GameFacts, seat: Seat, catalog: Catalog): Checked {
  if (!EVENT_KINDS.has(claim.kind)) return checkOne(claim, facts, seat, catalog);

  // A list of cards ("A, B"): every one must hold.
  if (claim.card && /,\s|\sand\s/i.test(claim.card)) {
    const r = resolveCard(claim.card, facts, catalog);
    const parts = claim.card.split(/,\s+(?:and\s+)?|\s+and\s+/i).map((x) => x.trim()).filter(Boolean);
    if (r.status !== "ok" && r.status !== "not_in_game" && parts.length > 1) {
      const results = parts.map((card) => checkClaim({ ...claim, card }, facts, seat, catalog));
      const worst = results.reduce((a, b) => (RANK[b.verdict] > RANK[a.verdict] ? b : a));
      return worst.verdict === "supported" ? { verdict: "supported", reason: results.map((x) => x.reason).join("; ") } : { ...worst, reason: `${worst.reason} (one of ${parts.length} cards: ${parts.join(", ")})` };
    }
  }

  // Card names count only as far as the quote states them.
  let stated: Claim = claim;
  const inferred: ("card" | "target")[] = [];
  for (const field of claim.kind === "attacked" ? (["card", "target"] as const) : (["card"] as const)) {
    const value = stated[field];
    if (!value || (field === "target" && isLeaderWord(value)) || (field === "target" && CHARACTER_WORD.test(value.trim()))) continue;
    const q = statedPart(value, claim.quote);
    if (q.none) inferred.push(field);
    else if (!q.all) stated = { ...stated, [field]: q.part };
  }
  const first = checkReadings(stated, facts, seat, catalog);
  if (inferred.length && (first.verdict === "contradicted" || first.verdict === "wrong_turn")) {
    const without = { ...stated, ...Object.fromEntries(inferred.map((f) => [f, null])) } as Claim;
    const again = checkReadings(without, facts, seat, catalog);
    if (again.verdict === "supported") return { verdict: "unverifiable", reason: `the card was inferred from context, not stated in the quote (${inferred.join(", ")}); without it the claim holds: ${again.reason}` };
  }
  return first;
}

/** Seat mix-ups: any event that fails for the named player but holds for the other one cannot be called wrong (#695). */
function checkReadings(claim: Claim, facts: GameFacts, seat: Seat, catalog: Catalog): Checked {
  const r = checkAmbiguous(claim, facts, seat, catalog);
  if (claim.actor && (r.verdict === "contradicted" || r.verdict === "wrong_turn")) {
    const other = checkAmbiguous({ ...claim, actor: claim.actor === "you" ? "opponent" : "you" }, facts, seat, catalog);
    if (other.verdict === "supported") return { verdict: "unverifiable", reason: `${r.reason}; but it matched the other player (${other.reason}), so the owner or the cause may be mixed up` };
  }
  return r;
}

/** A name that fits several cards is checked as each of them. */
function checkAmbiguous(claim: Claim, facts: GameFacts, seat: Seat, catalog: Catalog): Checked {
  for (const field of claim.kind === "attacked" ? (["card", "target"] as const) : (["card"] as const)) {
    const value = claim[field];
    if (!value || (field === "target" && (isLeaderWord(value) || CHARACTER_WORD.test(value.trim())))) continue;
    const r = resolveCard(value, facts, catalog);
    if (r.status !== "ambiguous") continue;
    if (r.names.length > MAX_READINGS) return { verdict: "unverifiable", reason: r.why };
    const results = r.names.map((name) => ({ name, r: checkAmbiguous({ ...claim, [field]: name }, facts, seat, catalog) }));
    const pick = (v: Verdict) => results.find((x) => x.r.verdict === v);
    const hit = pick("supported") ?? pick("wrong_turn");
    if (hit) return { verdict: hit.r.verdict, reason: `${r.why}; read as ${hit.name}: ${hit.r.reason}` };
    if (results.every((x) => x.r.verdict === "contradicted")) return { verdict: "contradicted", reason: `${r.why}; no reading holds (${results[0]!.r.reason})` };
    return { verdict: "unverifiable", reason: `${r.why}; no reading is clearly right` };
  }
  return checkOne(claim, facts, seat, catalog);
}

const isLeaderWord = (t: string): boolean => /^(the |your |their |opponent'?s? )*(leader|player)$/i.test(t.trim());
const CHARACTER_WORD = /^(an? |the |their |your |opponent'?s? |any )*characters?$/i;

/** Which of a DON!! count's kinds a claim means. */
const donKind = (target: string | null): keyof DonRanges | "total" => {
  const t = (target ?? "").toLowerCase();
  if (t.includes("rest")) return "rested";
  if (t.includes("activ")) return "active";
  if (t.includes("attach")) return "attached";
  return "total";
};

function checkOne(claim: Claim, facts: GameFacts, seat: Seat, catalog: Catalog): Checked {
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
      // No turn: a claim about how the game ended is compared to the final Life; any other to every total the player had (#695).
      const q = claim.quote;
      if ((/\b(game|match)\b/i.test(q) && /\b(end|ends|ended|ending|finish|finished|final)\b/i.test(q)) || /\b(final|finally)\b|\bat the end\b/i.test(q)) {
        return facts.finalLife[actor] === claim.number
          ? { verdict: "supported", reason: `${label(actor)} finished on ${claim.number} Life` }
          : { verdict: "contradicted", reason: `${label(actor)} finished on ${facts.finalLife[actor]} Life, not ${claim.number}` };
      }
      return facts.lifeSeen[actor].includes(claim.number)
        ? { verdict: "supported", reason: `${label(actor)} had ${claim.number} Life at some point` }
        : { verdict: "contradicted", reason: `${label(actor)} never had ${claim.number} Life (saw ${facts.lifeSeen[actor].sort((a, b) => b - a).join(", ")})` };
    }
    case "don":
    case "hand_size": {
      if (actor === null || claim.number === null) return unverifiable("claim does not say whose or how many");
      const want = claim.number;
      const what = claim.kind === "hand_size" ? "cards in hand" : `${donKind(claim.target)} DON!!`;
      const rangesOf = (t: TurnFacts): Range[] => {
        if (claim.kind === "hand_size") return [t.handRange[actor]];
        const k = donKind(claim.target);
        // "DON!! on the field": the cost area alone or with the DON!! given to cards, whichever the review counted.
        return k === "total" ? [t.don[actor].area, t.don[actor].field] : [t.don[actor][k]];
      };
      const fits = (t: TurnFacts) => rangesOf(t).some(([lo, hi]) => want >= lo && want <= hi);
      const show = (t: TurnFacts) => rangesOf(t).map(([lo, hi]) => `${lo}-${hi}`).join(" / ");
      if (claim.turn !== null) {
        const t = turnOf(claim.turn);
        if (!t) return facts.divergedAt ? unverifiable("turn is past where the replay stopped") : { verdict: "contradicted", reason: `the game had no turn ${claim.turn}` };
        return fits(t)
          ? { verdict: "supported", reason: `${label(actor)} had ${show(t)} ${what} during turn ${claim.turn}` }
          : { verdict: "contradicted", reason: `${label(actor)} had ${show(t)} ${what} during turn ${claim.turn}, not ${want}` };
      }
      const hit = facts.turns.find(fits);
      if (hit) return { verdict: "supported", reason: `${label(actor)} had ${want} ${what} on turn ${hit.turn}` };
      return facts.divergedAt ? unverifiable(`${label(actor)} never had ${want} ${what}; the replay stopped early`) : { verdict: "contradicted", reason: `${label(actor)} never had ${want} ${what}` };
    }
    default:
  }

  // Event kinds: build the items of this kind, then look for the claim among them.
  const items: Item[] = [];
  for (const t of facts.turns) {
    if (claim.kind === "played") {
      for (const p of t.plays) items.push({ turn: t.turn, seat: p.seat, card: p.card });
      // A counter is played from hand by the defender too (#695).
      for (const a of t.attacks) for (const c of a.counters) items.push({ turn: t.turn, seat: (1 - a.seat) as Seat, card: c });
    }
    if (claim.kind === "attacked") for (const a of t.attacks) items.push({ turn: t.turn, seat: a.seat, card: a.attacker === "unknown" ? undefined : a.attacker, target: a.target === "unknown" ? undefined : a.target });
    if (claim.kind === "ko") for (const k of t.kos) items.push({ turn: t.turn, seat: k.seat, card: k.card });
    if (claim.kind === "life_taken") {
      for (const l of t.lifeTaken) items.push({ turn: t.turn, seat: l.seat, card: l.card });
      for (const s of [0, 1] as const) {
        const hits = t.lifeTaken.filter((l) => l.seat === s).length;
        // Life an effect removed has no life_taken event. With no card named, the loss itself is the item.
        if (!claim.card) for (let k = hits; k < t.lifeLost[s]; k++) items.push({ turn: t.turn, seat: s, card: undefined });
        // A named card may be the cause: one either player played or attacked with, or one on this seat's own field (its effect), on a turn this seat lost Life (#695).
        else if (t.lifeLost[s] > 0) {
          for (const p of t.plays) items.push({ turn: t.turn, seat: s, card: p.card });
          for (const a of t.attacks) if (a.attacker !== "unknown") items.push({ turn: t.turn, seat: s, card: a.attacker });
          for (const id of t.onBoard[s]) items.push({ turn: t.turn, seat: s, card: id });
        }
      }
    }
    if (claim.kind === "on_board") for (const s of [0, 1] as const) for (const id of t.onBoard[s]) items.push({ turn: t.turn, seat: s, card: id });
    if (claim.kind === "trashed") for (const s of [0, 1] as const) for (const id of t.trashed[s]) items.push({ turn: t.turn, seat: s, card: id });
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
  } else if (claim.kind === "on_board" || claim.kind === "trashed") {
    return unverifiable("claim names no card");
  }
  let wantTarget: string | null = null;
  if (claim.kind === "attacked" && claim.target) {
    if (isLeaderWord(claim.target)) wantTarget = "leader";
    else if (CHARACTER_WORD.test(claim.target.trim())) wantTarget = "character";
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
    if (wantTarget) fold(wantTarget === "leader" ? i.target === "leader" : wantTarget === "character" ? (i.target === undefined ? "unknown" : i.target !== "leader") : i.target === undefined ? "unknown" : i.target === "leader" ? false : sameCard(i.target, wantTarget));
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
    if ((claim.kind === "life_taken" || claim.kind === "ko") && claim.number !== null && claim.turn !== null) {
      // With a card named, each play or attack is its own item, so the item count is not the Life lost: compare the real loss (#692).
      const t = facts.turns.find((x) => x.turn === claim.turn);
      const lost = claim.kind === "life_taken" && t ? ([0, 1] as const).filter((s) => actor === null || s === actor).reduce<number>((n, s) => n + Math.max(t.lifeTaken.filter((l) => l.seat === s).length, t.lifeLost[s]), 0) : yes.length;
      if (lost < claim.number) return { verdict: "contradicted", reason: `${who2} had ${lost} ${claim.kind} on turn ${claim.turn}, fewer than the ${claim.number} claimed` };
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
