/**
 * Log Pose copilot (#416): Log Pose in casual and practice games. The app sends a whitelisted snapshot of the
 * player's own seat view with the matchup-brief ticket; this module re-validates it (unknown keys dropped),
 * checks the ticket with the planner, turns the board into a <game> block for the model, and offers the
 * propose_turn_plan tool, which checks a whole turn against the snapshot and writes nothing.
 */
import { z } from "zod";
import type { Catalog, CardRow } from "./catalog";
import { PlannerApiError, plannerCall, type PlannerApi } from "./matches";
import type { ToolDef } from "./server";

export const PLAN_TOOL = "propose_turn_plan";
export const CHOICE_TOOL = "answer_choice";
export const COPILOT_REFUSAL = "Log Pose can only help in casual and practice games.";
export const NO_GAME_ERROR = "No live game is attached; ask from the board.";

const CARD_ID = /^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$/;
const defId = z.string().regex(CARD_ID);
const instId = z.string().min(1).max(40);
const count = z.number().int().min(0).max(1000);

const snapCard = z.object({
  id: instId,
  defId,
  rested: z.boolean().optional(),
  don: count.optional(),
  power: z.number().int().min(-100000).max(1000000).optional(),
  cost: count.optional(),
  sick: z.boolean().optional(),
  rush: z.boolean().optional(),
  status: z.array(z.string().max(40)).max(10).optional(),
});

const board = {
  leader: snapCard,
  characters: z.array(snapCard).max(12),
  stage: snapCard.nullable(),
  deck: count,
  life: count,
  faceUpLife: z.array(defId).max(20),
  trash: z.array(defId).max(60),
  donActive: count,
  donDeck: count,
};

const legalAction = z.discriminatedUnion("type", [
  z.object({ type: z.literal("play_card"), card: instId, trash: instId.optional() }),
  z.object({ type: z.literal("give_don"), target: instId }),
  z.object({ type: z.literal("activate_ability"), source: instId, abilityId: z.string().max(60), target: instId.optional() }),
  z.object({ type: z.literal("declare_attack"), attacker: instId, target: instId }),
  z.object({ type: z.literal("declare_block"), blocker: instId }),
  z.object({ type: z.literal("pass_block") }),
  z.object({ type: z.enum(["counter_from_hand", "counter_event"]), card: instId }),
  z.object({ type: z.literal("pass_counter") }),
  z.object({ type: z.literal("end_turn") }),
]);

/** The most options a choice request carries; a request with more is marked `truncated` and cannot be answered by Log Pose. */
export const MAX_CHOICE_OPTIONS = 40;

const choiceOption = z.object({
  id: z.string().min(1).max(80),
  defId: defId.optional(),
  label: z.string().max(120).optional(),
  /** The card's instance id when it is on a board, so the model can tell two copies apart in the <game> block. */
  inst: instId.optional(),
  zone: z.string().max(20).optional(),
  owner: z.enum(["you", "opponent"]).optional(),
  eligible: z.boolean(),
});

const choiceRequest = z.object({
  type: z.enum(["confirm", "select", "mode", "order", "look"]),
  min: count.optional(),
  max: count.optional(),
  options: z.array(choiceOption).max(MAX_CHOICE_OPTIONS).optional(),
  allowTopOrBottom: z.boolean().optional(),
  distinctNames: z.boolean().optional(),
  /** look: where the cards not taken go (deck_bottom, top_or_bottom, ...). */
  rest: z.string().max(40).optional(),
  /** The request had more options than fit: Log Pose cannot answer it. */
  truncated: z.boolean().optional(),
});

const pendingChoice = z.object({
  id: z.string().min(1).max(80).optional(),
  prompt: z.string().max(300),
  kind: z.string().max(60),
  /** Declining is legal. */
  optional: z.boolean().optional(),
  /** Only declining is legal (a Life card with no [Trigger], a cost that can't be paid). */
  declineOnly: z.boolean().optional(),
  request: choiceRequest.optional(),
});

const gameSnapshot = z.object({
  seat: z.union([z.literal(0), z.literal(1)]),
  turn: z.number().int().min(0).max(1000),
  phase: z.string().max(40),
  yourTurn: z.boolean(),
  first: z.boolean().optional(),
  mulliganDone: z.boolean().optional(),
  you: z.object({
    ...board,
    hand: z.array(z.object({ id: instId, defId, cost: count.optional(), counter: z.number().int().min(0).max(10000).optional() })).max(20),
    donRested: count,
  }),
  opponent: z.object({
    ...board,
    hand: count,
    donTotal: count,
  }),
  battle: z.string().max(300).nullable().optional(),
  choice: pendingChoice.nullable().optional(),
  legal: z.array(legalAction).max(120),
});

/** `context.game` of a /chat request. Limits must stay in step with the app's snapshot builder. */
export const gameContext = z.object({
  ticket: z.string().min(10).max(4000),
  snapshot: gameSnapshot,
  /** False when the player has not turned on the copilot setting: Log Pose coaches in words and plans are refused. */
  plans: z.boolean().optional(),
  /** The app is playing the turn for the player (they asked Log Pose to play it): choices are answered with answer_choice. */
  autopilot: z.boolean().optional(),
  log: z.array(z.string().max(200)).max(40).optional(),
});

export type GameContext = z.infer<typeof gameContext>;
export type GameSnapshot = z.infer<typeof gameSnapshot>;
type SnapCard = z.infer<typeof snapCard>;
type LegalAction = z.infer<typeof legalAction>;
type ChoiceOption = z.infer<typeof choiceOption>;

/** What the planner's brief ticket says about the game. */
export type GameClaims = { leader: string; opponent: string; deck: { id: string; copies: number }[] };

/**
 * Checks the game server's ticket with the planner (a ranked or forged one is refused) and that the snapshot is
 * of the game the ticket names. Throws a 400 ChatHttpError; call it before anything that costs money.
 */
export async function verifyGame(api: PlannerApi, token: string, catalog: Catalog, game: GameContext): Promise<GameClaims> {
  // Loaded here because chat.ts imports this module's schema when it is evaluated.
  const { ChatHttpError, briefVariant } = await import("./chat");
  const refuse = () => new ChatHttpError(400, COPILOT_REFUSAL, "bad_request");
  let found: { leader_id: string; opponent_id: string; deck: { id: string; copies: number }[] };
  try {
    found = await plannerCall(api, token, "/analyst/briefs/lookup", true, { ticket: game.ticket, variant: briefVariant(catalog) });
  } catch (err) {
    if (err instanceof PlannerApiError && (err.status === 403 || err.status === 400 || err.status === 422)) throw refuse();
    throw err;
  }
  const { you, opponent } = game.snapshot;
  if (you.leader.defId !== found.leader_id || opponent.leader.defId !== found.opponent_id) throw refuse();
  return { leader: found.leader_id, opponent: found.opponent_id, deck: found.deck };
}

const nameOfDef = (catalog: Catalog, id: string) => catalog.cards.get(id)?.name ?? id;

/** Instance id -> card definition id, for everything the snapshot shows. */
function instances(s: GameSnapshot): Map<string, string> {
  const m = new Map<string, string>();
  for (const side of [s.you, s.opponent]) {
    for (const c of [side.leader, ...side.characters, ...(side.stage ? [side.stage] : [])]) m.set(c.id, c.defId);
  }
  for (const h of s.you.hand) m.set(h.id, h.defId);
  return m;
}

function summarize(catalog: Catalog, ids: string[]): string {
  if (!ids.length) return "none";
  const n = new Map<string, number>();
  for (const id of ids) n.set(id, (n.get(id) ?? 0) + 1);
  return [...n].map(([id, k]) => `${nameOfDef(catalog, id)}${k > 1 ? ` x${k}` : ""}`).join(", ");
}

const MAX_TEXT = 400;

const MAX_TRIGGER = 200;
const cap = (t: string, max: number) => (t.length > max ? `${t.slice(0, max - 1)}…` : t);

/** One card of a card reference: id, name, type, colors, life, cost, power, counter, traits, the (truncated) rules text and the card's own "[Trigger] ..." text. */
export function cardReferenceLine(c: CardRow): string {
  const stats = [
    c.type,
    c.colors.length ? c.colors.join("/") : "",
    c.life !== undefined ? `life ${c.life}` : "",
    c.cost !== undefined ? `cost ${c.cost}` : "",
    c.power !== undefined ? `power ${c.power}` : "",
    c.counter ? `counter ${c.counter}` : "",
    c.traits.length ? `traits: ${c.traits.join("/")}` : "",
  ].filter(Boolean);
  const text = cap(c.text, MAX_TEXT);
  const trigger = c.trigger.trim() ? ` ${cap(c.trigger.trim(), MAX_TRIGGER)}` : "";
  return `- ${c.id} ${c.name} (${stats.join(", ")})${text ? `: ${text}` : ""}${trigger}`;
}

/** The <game> block that starts the user message: the board as the player sees it, readable by the model. */
export function gameContextBlock(catalog: Catalog, game: GameContext, claims: GameClaims): string {
  const s = game.snapshot;
  const inst = instances(s);
  const nm = (id: string) => nameOfDef(catalog, inst.get(id) ?? "");
  const named = (id: string) => (inst.has(id) ? `${nm(id)} [${id}]` : `[${id}]`);
  const card = (c: SnapCard) => {
    const bits = [
      c.power !== undefined ? `${c.power} power` : "",
      c.rested ? "rested" : "",
      c.don ? `${c.don} DON!! attached` : "",
      c.sick ? "summoning sick" : "",
      c.rush ? "rush" : "",
      ...(c.status ?? []),
    ].filter(Boolean);
    return `${nameOfDef(catalog, c.defId)} [${c.id}]${bits.length ? ` (${bits.join(", ")})` : ""}`;
  };
  const powers = boardPowers(s);
  const powerOf = (id: string) => powers.get(id);
  const side = (label: string, p: GameSnapshot["you"] | GameSnapshot["opponent"]) => [
    `${label} Leader: ${card(p.leader)}`,
    `${label} Characters: ${p.characters.length ? p.characters.map(card).join("; ") : "none"}`,
    `${label} Stage: ${p.stage ? card(p.stage) : "none"}`,
    `${label} counts: deck ${p.deck}, Life ${p.life}, active DON!! ${p.donActive}, DON!! deck ${p.donDeck}`,
    `${label} face-up Life: ${summarize(catalog, p.faceUpLife)}`,
    `${label} trash (${p.trash.length}): ${summarize(catalog, p.trash)}`,
  ];
  const lines: string[] = [
    `turn ${s.turn}, phase ${s.phase}, ${s.yourTurn ? "your turn" : "opponent's turn"}`,
    ...(s.first === undefined ? [] : [s.first ? "You go first." : "You go second."]),
    ...(s.phase === "mulligan"
      ? [`Mulligan step: Your hand is your opening 5 cards. You may keep it or mulligan once (return all 5, shuffle, draw 5).${s.mulliganDone ? " You already chose." : ""}`]
      : []),
    ...side("Your", s.you),
    `Your rested DON!!: ${s.you.donRested}`,
    `Your hand: ${s.you.hand.length ? s.you.hand.map((h) => `${nameOfDef(catalog, h.defId)} [${h.id}] (${handBits(catalog, h).join(", ")})`).join("; ") : "empty"}`,
    ...side("Opponent", s.opponent),
    `Opponent hand: ${s.opponent.hand} cards (hidden), DON!! total ${s.opponent.donTotal}`,
    `Battle: ${s.battle ? `${s.battle}${battleMark(s.battle)}` : "none"}`,
    `Pending choice for you: ${s.choice ? `${s.choice.prompt} (${s.choice.kind})` : "none"}`,
    ...(s.choice ? choiceLines(catalog, s.choice) : []),
    "Legal actions:",
    ...s.legal.map((a) => `- ${describeLegal(a, named, powerOf)}`),
  ];
  if (game.log?.length) lines.push("Recent log:", ...game.log);
  const deck = claims.deck.map((d) => `${d.copies}x ${d.id} ${nameOfDef(catalog, d.id)}`);
  lines.push(`Your deck (${claims.deck.reduce((n, d) => n + d.copies, 0)} cards besides the Leader, whole list, not what is left):`, ...deck);
  const ids = new Set<string>([...inst.values(), ...s.you.faceUpLife, ...s.opponent.faceUpLife, ...s.you.trash, ...s.opponent.trash]);
  lines.push("Card reference:");
  for (const id of ids) {
    const c = catalog.cards.get(id);
    if (!c) continue;
    lines.push(cardReferenceLine(c));
  }
  return `<game>\n${lines.join("\n")}\n</game>`;
}

function optionName(catalog: Catalog, o: ChoiceOption): string {
  return o.label || (o.defId ? nameOfDef(catalog, o.defId) : o.id);
}

/** The pending choice's id and options, so the model can answer it with answer_choice. */
function choiceLines(catalog: Catalog, c: NonNullable<GameSnapshot["choice"]>): string[] {
  const r = c.request;
  const lines: string[] = [];
  if (c.id) lines.push(`Choice id: ${c.id}`);
  if (c.declineOnly) lines.push("Only declining is allowed.");
  else if (c.optional) lines.push("You may decline.");
  if (!r) return lines;
  if (r.truncated) lines.push("This choice has too many options to list; the player must make it.");
  const range = r.min !== undefined && r.max !== undefined ? ` (pick ${r.min === r.max ? r.min : `${r.min} to ${r.max}`})` : "";
  lines.push(`Choice type: ${r.type}${range}${r.distinctNames ? ", all picks need different names" : ""}${r.allowTopOrBottom ? ", each card may go on top or bottom" : ""}${r.rest ? `, the rest go: ${r.rest}` : ""}`);
  for (const o of r.options ?? []) {
    const where = [o.owner === "opponent" ? "opponent's" : o.owner === "you" ? "yours" : "", o.zone ?? "", o.inst ? `[${o.inst}]` : ""].filter(Boolean).join(" ");
    lines.push(`- option ${o.id}: ${optionName(catalog, o)}${where ? ` (${where})` : ""}${o.eligible ? "" : " (not allowed)"}`);
  }
  return lines;
}

/** Cost, then the counter the hand card can give: the app's value, else the printed one, and "counter event" for a [Counter] Event. */
function handBits(catalog: Catalog, h: GameSnapshot["you"]["hand"][number]): string[] {
  const row = catalog.cards.get(h.defId);
  const counter = h.counter ?? row?.counter;
  return [`cost ${h.cost ?? row?.cost ?? "?"}`, ...(counter ? [`counter ${counter}`] : []), ...(row?.type === "event" && row.text.includes("[Counter]") ? ["counter event"] : [])];
}

/** Power of each Leader and Character on the board, by id, as the snapshot shows it. */
function boardPowers(s: GameSnapshot): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of [s.you.leader, ...s.you.characters, s.opponent.leader, ...s.opponent.characters]) if (c.power !== undefined) m.set(c.id, c.power);
  return m;
}

/** An attack wins when the attacker's power is greater than or equal to the target's (ties go to the attacker). */
const attackWins = (attacker: number, target: number) => attacker >= target;

/** The note after a battle line like "Your Leader 5000 → their Leader 5000": who is ahead before blocks and counters. */
function battleMark(battle: string): string {
  const m = /(\d+)\s*→.*?(\d+)\s*$/.exec(battle);
  if (!m) return "";
  const [attacker, target] = [Number(m[1]), Number(m[2])];
  return attackWins(attacker, target) ? " (attacker ahead or tied: hits as is, ties go to the attacker)" : ` (attacker ${target - attacker} short as is)`;
}

function describeLegal(a: LegalAction, named: (id: string) => string, powerOf: (id: string) => number | undefined): string {
  switch (a.type) {
    case "play_card":
      return `play ${named(a.card)}${a.trash ? ` replacing ${named(a.trash)}` : ""}`;
    case "give_don":
      return `give DON!! to ${named(a.target)}`;
    case "activate_ability":
      return `activate ${named(a.source)} ability ${a.abilityId}${a.target ? ` on ${named(a.target)}` : ""}`;
    case "declare_attack": {
      const [mine, theirs] = [powerOf(a.attacker), powerOf(a.target)];
      const mark =
        mine === undefined || theirs === undefined
          ? ""
          : attackWins(mine, theirs)
            ? ` (${mine} vs ${theirs}: wins as is unless they block or counter)`
            : ` (${mine} vs ${theirs}: loses as is, ${theirs - mine} short)`;
      return `attack ${named(a.target)} with ${named(a.attacker)}${mark}`;
    }
    case "declare_block":
      return `block with ${named(a.blocker)}`;
    case "pass_block":
      return "don't block";
    case "counter_from_hand":
      return `counter with ${named(a.card)} from hand`;
    case "counter_event":
      return `play counter event ${named(a.card)}`;
    case "pass_counter":
      return "don't counter";
    case "end_turn":
      return "end turn";
  }
}

/**
 * Added after COPILOT_INSTRUCTIONS when the app is playing the turn for the player (context.game.autopilot): the
 * app runs your plans and asks you for each choice and for what comes next, so answer, don't discuss.
 */
export const AUTOPILOT_INSTRUCTIONS = `
The app is playing this turn for the player right now: they asked you to. Don't coach and don't ask them anything.
If the <game> block has a pending choice, answer it with answer_choice (its Choice id, then accept, and the option ids it lists) and nothing else. Otherwise plan the rest of the turn with propose_turn_plan and play_now true, ending with end_turn when nothing useful is left. If a tool refuses, fix the call and try again.
Say at most one short line.`;

/** Added after COPILOT_INSTRUCTIONS when the copilot setting is off: the game is attached but plans are not. */
export const NO_PLANS_INSTRUCTIONS = `
Turn play-out is off for this game, so propose_turn_plan is refused: give the line in words. If they want turns played out, they can turn on the Log Pose copilot setting in duel settings.`;

export const COPILOT_INSTRUCTIONS = `

The player turned on Log Pose for their live casual game. Their message starts with a <game> block: the board as they see it, their hand, the legal actions, the recent log, their deck list and the cards on the table. You coach by default; you play only when the player asks you to play their turn, and then the app plays the plan you propose.
You only know what is in the <game> block. Never guess the opponent's hand or deck order; reason about what their leader usually plays and call it your read. Card text for cards on the table is in the block's card reference; look up anything else with get_cards.
Be brief: the player reads this on a phone between moves. Keep in-game answers to about 60 words in at most three short lines, with no headings: the play first in one line (for example "Attack their Leader with Luffy, +2 DON!!"), then one or two sentences of why. Add an alternative, a risk or a number only when it would change their decision. Don't recap the board, their hand or the legal actions, and don't quote card text back; they can see it. Go deeper only when they ask for more.
When they ask you to plan their turn, call propose_turn_plan once with the whole turn (every step, in order, ending with end_turn when the turn is done), then say in one sentence what the plan does and that they tap Play this turn to run it; don't list the steps again, the plan card shows them. When they ask you to play, take or do their turn for them, call it the same way with play_now true, then say in one sentence that you're playing it now and they can tap Stop to take over. Set play_now only when they asked you to play the turn, never for "plan my turn" or "what should I do". Keep each step's why to a few words, and leave it out when the step is obvious. If the tool refuses, fix the plan and call it again. Never say you made a move you didn't propose: the app runs the plan, nothing else moves.
In the mulligan step, judge keep or mulligan from Your hand, your deck list and whether they go first; never ask them for their hand, it is in the block.
Choices that come up mid-turn (searches, targets, triggers) are the player's unless the app is playing the turn for them; otherwise mention what you would pick. For defensive questions (block or counter) answer in one or two sentences, without a plan: block or not, which counter, and why.
Judge an attack by the powers in Legal actions (ties go to the attacker), and treat the opponent's hidden hand as possible counters whatever their DON!!. When there is a pending choice, answer it.`;

const planStep = z.object({
  action: z.enum(["play", "give_don", "activate", "attack", "end_turn"]),
  card: z.string().max(40).optional(),
  trash: z.string().max(40).optional(),
  target: z.string().max(40).optional(),
  count: z.number().int().min(1).max(10).optional(),
  source: z.string().max(40).optional(),
  abilityId: z.string().max(60).optional(),
  attacker: z.string().max(40).optional(),
  why: z.string().trim().max(200).optional(),
  boost: z.string().trim().max(120).optional(),
});
type PlanStepInput = z.infer<typeof planStep>;

const refusal = (error: string) => ({ isError: true, content: [{ type: "text" as const, text: error }] });

const MAX_STEPS = 15;

/** The turn plan the app shows (the tool answer plus the tool_use id as `id`). */
export type TurnPlan = {
  id: string;
  turn: number;
  summary: string;
  steps: ({ label: string; why?: string } & Record<string, unknown>)[];
  /** The player asked Log Pose to play the turn: the app starts the plan by itself. */
  autoplay?: true;
};

const spentTooMuch = (at: string, don: number, active: number) =>
  `${at}: the plan uses ${don} DON!! in all (card costs plus DON!! given) but the player has only ${active} active. If an effect in the plan adds DON!!, plan only up to that effect and plan again after it.`;

/** Checks a plan against the snapshot. Returns the plan without an id, or the reason the model should fix. */
export function checkTurnPlan(catalog: Catalog, game: GameContext, input: { summary: string; steps: PlanStepInput[] }): { ok: true; plan: Omit<TurnPlan, "id"> } | { ok: false; error: string } {
  const s = game.snapshot;
  const fail = (error: string) => ({ ok: false as const, error });
  if (!s.yourTurn) return fail("It isn't the player's turn, so there is nothing to plan. Answer in text.");
  if (s.choice) {
    return fail(game.autopilot ? "There is a pending choice first. Answer it with answer_choice; the app asks you to plan again after it." : "The player has a choice to make first. Tell them what you'd pick and plan again after they answer.");
  }
  if (s.phase !== "main") return fail(`It's the ${s.phase} phase; a turn plan can only be made in the main phase.`);
  if (input.steps.length < 1 || input.steps.length > MAX_STEPS) return fail(`A plan has 1 to ${MAX_STEPS} steps.`);

  const inst = instances(s);
  const nm = (id: string) => nameOfDef(catalog, inst.get(id) ?? "");
  const hand = new Map(s.you.hand.map((h) => [h.id, h]));
  // Ids that can take DON!!, attack or activate: the player's board, then characters the plan plays.
  const actors = new Set<string>([s.you.leader.id, ...s.you.characters.map((c) => c.id)]);
  const sources = new Set<string>([...actors, ...(s.you.stage ? [s.you.stage.id] : [])]);
  const targets = new Set<string>([s.opponent.leader.id, ...s.opponent.characters.map((c) => c.id)]);
  const opponents = new Set<string>([...targets, ...(s.opponent.stage ? [s.opponent.stage.id] : [])]);
  const played = new Set<string>();
  // Power at the moment of each step: the snapshot's, plus DON!! given in the plan; played characters start at their printed power.
  const power = boardPowers(s);
  let don = 0;
  const steps: Omit<TurnPlan, "id">["steps"] = [];

  for (const [i, st] of input.steps.entries()) {
    const at = `Step ${i + 1}`;
    const why = st.why ? { why: st.why } : {};
    const own = (id: string, set: Set<string>, what: string) => {
      if (set.has(id)) return null;
      if (opponents.has(id)) return `${at}: ${id} (${nm(id)}) is the opponent's card; ${what} must be one of yours.`;
      return `${at}: ${id} isn't a card on the board. Use the ids in the <game> block.`;
    };
    if (steps.at(-1)?.action === "end_turn") return fail(`${at}: end_turn must be the last step.`);
    switch (st.action) {
      case "play": {
        if (!st.card) return fail(`${at}: play needs the hand card's id as "card".`);
        const h = hand.get(st.card);
        if (!h) return fail(`${at}: ${st.card} isn't in the player's hand. Use the hand ids in the <game> block.`);
        if (played.has(st.card)) return fail(`${at}: ${nm(st.card)} [${st.card}] is already played earlier in the plan.`);
        if (st.trash) {
          const bad = own(st.trash, new Set(s.you.characters.map((c) => c.id)), "the character to replace");
          if (bad) return fail(bad);
        }
        played.add(st.card);
        const kind = catalog.cards.get(h.defId)?.type;
        if (kind === "character") {
          actors.add(st.card);
          sources.add(st.card);
          const printed = catalog.cards.get(h.defId)?.power;
          if (printed !== undefined) power.set(st.card, printed);
        } else if (kind === "stage") sources.add(st.card);
        const cost = h.cost ?? catalog.cards.get(h.defId)?.cost;
        // Playing a card rests DON!! for its cost, so it comes out of the same active DON!! as giving it.
        don += cost ?? 0;
        if (don > s.you.donActive) return fail(spentTooMuch(at, don, s.you.donActive));
        steps.push({ label: `Play ${nm(st.card)}${cost !== undefined ? ` (cost ${cost})` : ""}${st.trash ? `, replacing ${nm(st.trash)}` : ""}`, ...why, action: "play", card: st.card, ...(st.trash ? { trash: st.trash } : {}) });
        break;
      }
      case "give_don": {
        if (!st.target || !st.count) return fail(`${at}: give_don needs "target" and "count".`);
        const bad = own(st.target, actors, "the DON!! target");
        if (bad) return fail(bad);
        const before = power.get(st.target);
        if (before !== undefined) power.set(st.target, before + 1000 * st.count);
        don += st.count;
        if (don > s.you.donActive) return fail(spentTooMuch(at, don, s.you.donActive));
        steps.push({ label: `Give ${st.count} DON!! to ${nm(st.target)}`, ...why, action: "give_don", target: st.target, count: st.count });
        break;
      }
      case "activate": {
        if (!st.source) return fail(`${at}: activate needs the card's id as "source".`);
        const bad = own(st.source, sources, "the source");
        if (bad) return fail(bad);
        steps.push({
          label: `Activate ${nm(st.source)}'s ability`,
          ...why,
          action: "activate",
          source: st.source,
          ...(st.abilityId ? { abilityId: st.abilityId } : {}),
          ...(st.target ? { target: st.target } : {}),
        });
        break;
      }
      case "attack": {
        if (!st.attacker || !st.target) return fail(`${at}: attack needs "attacker" and "target".`);
        const bad = own(st.attacker, actors, "the attacker");
        if (bad) return fail(bad);
        if (!targets.has(st.target)) {
          return fail(
            actors.has(st.target) || sources.has(st.target)
              ? `${at}: ${st.target} (${nm(st.target)}) is the player's own card; attack the opponent's Leader or one of their characters.`
              : `${at}: ${st.target} isn't the opponent's Leader or one of their characters.`,
          );
        }
        const [mine, theirs] = [power.get(st.attacker), power.get(st.target)];
        if (!st.boost && mine !== undefined && theirs !== undefined && !attackWins(mine, theirs)) {
          const need = Math.ceil((theirs - mine) / 1000);
          return fail(
            `${at}: ${nm(st.attacker)} (${mine}) attacking ${nm(st.target)} (${theirs}) loses as is (ties go to the attacker, so it needs ${theirs}). Give it ${need} DON!! first, drop the attack, or if an effect earlier in the plan raises its power, set "boost" on this step saying which.`,
          );
        }
        const who = st.target === s.opponent.leader.id ? "the opponent's Leader" : nm(st.target);
        steps.push({ label: `Attack ${who} with ${nm(st.attacker)}`, ...why, action: "attack", attacker: st.attacker, target: st.target });
        break;
      }
      case "end_turn":
        steps.push({ label: "End your turn", ...why, action: "end_turn" });
        break;
    }
  }

  const first = input.steps[0]!;
  const ok = s.legal.some((a) => {
    switch (first.action) {
      case "play":
        return a.type === "play_card" && a.card === first.card && (!first.trash || a.trash === first.trash);
      case "give_don":
        return a.type === "give_don" && a.target === first.target;
      case "activate":
        return a.type === "activate_ability" && a.source === first.source && (!first.abilityId || a.abilityId === first.abilityId);
      case "attack":
        return a.type === "declare_attack" && a.attacker === first.attacker && a.target === first.target;
      case "end_turn":
        return a.type === "end_turn";
    }
  });
  if (!ok) return fail("The first step isn't a legal action right now (see the Legal actions in the <game> block). Start the plan with one that is.");
  return { ok: true, plan: { turn: s.turn, summary: input.summary, steps } };
}

/**
 * propose_turn_plan, bound to the attached game. With no game it is a stub that refuses, so a tool_use kept in
 * the thread's history still matches a tool.
 */
export function turnPlanTool(catalog: Catalog, game: GameContext | undefined): ToolDef {
  return {
    name: PLAN_TOOL,
    title: "Plan the turn",
    description:
      "Plan the player's whole turn from the <game> block. Nothing is played: the app shows the steps as a card the player can run with Play this turn. " +
      "Give every step in order. Actions: play (card = hand id, trash = character to replace), give_don (target, count), activate (source, abilityId; the target, if any, is chosen when the ability resolves and is the player's to pick), attack (attacker, target = the opponent's Leader or character id), end_turn (last only). " +
      "An attack whose power is below its target's (ties go to the attacker) is refused unless you set boost on that step to say which earlier effect raises its power. " +
      "Characters played earlier in the plan can act in later steps by their hand id. The plan is checked against the board and refused with the reason when a step can't work. " +
      "Set play_now only when the player asked you to play their turn for them: the app then starts the plan by itself.",
    inputSchema: {
      summary: z.string().trim().min(3).max(300),
      steps: z.array(planStep).min(1).max(MAX_STEPS),
      play_now: z.boolean().optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      if (!game) return refusal(NO_GAME_ERROR);
      if (game.plans === false) return refusal("Turn play-out is off for this game; describe the line in words instead.");
      const input = args as { summary: string; steps: PlanStepInput[]; play_now?: boolean };
      const r = checkTurnPlan(catalog, game, input);
      // Playing is the player's to ask for; the app asking Log Pose to go on (autopilot) is the same request.
      if (!r.ok) return refusal(r.error);
      const plan = { ...r.plan, ...(input.play_now === true || game.autopilot === true ? { autoplay: true as const } : {}) };
      return { content: [{ type: "text" as const, text: JSON.stringify(plan) }] };
    },
  };
}

/** What the app applies for an answered choice (the answer_choice tool's result, plus the tool_use id as `id` on the SSE event). */
export type ChoiceAnswer = {
  id: string;
  choiceId: string;
  accept: boolean;
  selectedOptionIds?: string[];
  orderedOptionIds?: string[];
  topOptionIds?: string[];
  /** One line for the player: "Chose Nami, Zoro", "Declined". */
  summary: string;
};

type ChoiceInput = { choiceId: string; accept: boolean; selected?: string[]; ordered?: string[]; top?: string[]; why?: string };

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && new Set(a).size === a.length && b.every((x) => a.includes(x));

/**
 * Checks an answer against the pending choice in the snapshot. Returns the answer in the shapes the game takes
 * (resolve_pending_choice's selected / ordered / top ids), or the reason the model should fix.
 */
export function checkChoiceAnswer(catalog: Catalog, game: GameContext, input: ChoiceInput): { ok: true; answer: Omit<ChoiceAnswer, "id"> } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  const c = game.snapshot.choice;
  if (!c) return fail("There is no pending choice to answer.");
  if (!c.id || c.id !== input.choiceId) return fail(`The pending choice is ${c.id ?? "unnamed"}, not ${input.choiceId}. Use the Choice id from the <game> block.`);
  const r = c.request;
  const base = { choiceId: c.id };
  const canDecline = c.optional === true || c.kind === "life_trigger";
  if (!input.accept) {
    if (!canDecline) return fail("This choice can't be declined; answer it with accept true.");
    return { ok: true, answer: { ...base, accept: false, summary: "Declined" } };
  }
  if (c.declineOnly) return fail("Only declining is allowed here; call again with accept false.");
  if (!r || r.type === "confirm") return { ok: true, answer: { ...base, accept: true, summary: "Accepted" } };
  if (r.truncated) return fail("This choice has too many options to answer; the player makes it.");
  const options = r.options ?? [];
  const byId = new Map(options.map((o) => [o.id, o]));
  const names = (ids: string[]) => ids.map((id) => optionName(catalog, byId.get(id)!)).join(", ");
  const unique = (ids: string[], what: string) => (new Set(ids).size === ids.length ? null : `${what} lists an option twice.`);
  const unknown = (ids: string[], what: string) => {
    const bad = ids.find((id) => !byId.has(id));
    return bad ? `${what}: ${bad} isn't one of this choice's options.` : null;
  };
  const picks = (ids: string[], min: number, max: number) => {
    const err = unknown(ids, "selected") ?? unique(ids, "selected");
    if (err) return err;
    const ineligible = ids.find((id) => !byId.get(id)!.eligible);
    if (ineligible) return `selected: ${ineligible} can't be chosen.`;
    if (ids.length < min || ids.length > max) return `Pick ${min === max ? min : `${min} to ${max}`} option${max === 1 ? "" : "s"}; you picked ${ids.length}.`;
    if (r.distinctNames) {
      const seen = new Set(ids.map((id) => optionName(catalog, byId.get(id)!)));
      if (seen.size !== ids.length) return "Every pick needs a different card name.";
    }
    return null;
  };
  switch (r.type) {
    case "select": {
      const selected = input.selected ?? [];
      const err = picks(selected, r.min ?? 0, r.max ?? options.length);
      if (err) return fail(err);
      return { ok: true, answer: { ...base, accept: true, selectedOptionIds: selected, summary: selected.length ? `Chose ${names(selected)}` : "Chose none" } };
    }
    case "mode": {
      const selected = input.selected ?? [];
      const err = picks(selected, 1, 1);
      if (err) return fail(err);
      return { ok: true, answer: { ...base, accept: true, selectedOptionIds: selected, summary: `Chose ${names(selected)}` } };
    }
    case "order": {
      const ordered = input.ordered ?? [];
      const err = unknown(ordered, "ordered") ?? unique(ordered, "ordered");
      if (err) return fail(err);
      if (!sameSet(ordered, options.map((o) => o.id))) return fail("ordered must list every option exactly once, first = placed first.");
      const top = input.top ?? [];
      if (top.length) {
        if (!r.allowTopOrBottom) return fail("These cards can't be split between top and bottom; leave top out.");
        const bad = unknown(top, "top") ?? unique(top, "top");
        if (bad) return fail(bad);
      }
      // With a top/bottom split the answer lists the top cards first, as the board's own order prompt does.
      const arranged = r.allowTopOrBottom ? [...ordered.filter((id) => top.includes(id)), ...ordered.filter((id) => !top.includes(id))] : ordered;
      return { ok: true, answer: { ...base, accept: true, orderedOptionIds: arranged, ...(r.allowTopOrBottom ? { topOptionIds: top.filter((id) => ordered.includes(id)) } : {}), summary: `Ordered ${names(arranged)}` } };
    }
    case "look": {
      const selected = input.selected ?? [];
      const err = picks(selected, r.min ?? 0, r.max ?? 0);
      if (err) return fail(err);
      const rest = options.map((o) => o.id).filter((id) => !selected.includes(id));
      const ordered = input.ordered ?? rest;
      const bad = unknown(ordered, "ordered") ?? unique(ordered, "ordered");
      if (bad) return fail(bad);
      if (!sameSet(ordered, rest)) return fail("ordered must list exactly the options you did not select, once each.");
      const top = input.top ?? [];
      // Top or bottom moves the cards that are left together: all on top, or none.
      if (r.rest === "top_or_bottom") {
        if (top.length && !sameSet(top, rest)) return fail("top must be every card you did not select (all on top) or empty (all on the bottom).");
      } else if (top.length) return fail("The cards left over can't be split between top and bottom; leave top out.");
      const placed = r.rest === "top_or_bottom" ? { orderedOptionIds: ordered, topOptionIds: top.length ? ordered : [] } : { orderedOptionIds: ordered };
      return { ok: true, answer: { ...base, accept: true, selectedOptionIds: selected, ...placed, summary: selected.length ? `Took ${names(selected)}` : "Took none" } };
    }
  }
}

/**
 * answer_choice, bound to the attached game. Only while the app is playing the turn (autopilot): otherwise
 * choices are the player's. With no game it is a stub that refuses, so a tool_use kept in the history still matches a tool.
 */
export function answerChoiceTool(catalog: Catalog, game: GameContext | undefined): ToolDef {
  return {
    name: CHOICE_TOOL,
    title: "Answer the pending choice",
    description:
      "Answer the player's pending choice while the app is playing their turn for them. choiceId = the Choice id in the <game> block. accept false declines (only when the block says you may). " +
      "select / mode: selected = the option ids to take (mode: exactly one). order: ordered = every option id, first = placed first (top = the ones that go on top, when the block says each may go on top or bottom). " +
      "look: selected = the cards to take; ordered = the others in the order they go back; top = all the others to put them on top (leave out for the bottom, when the block says top or bottom). " +
      "Effect-order prompts: ordered = the ability ids, first = resolves first. The answer is checked against the choice and refused with the reason when it can't work.",
    inputSchema: {
      choiceId: z.string().min(1).max(80),
      accept: z.boolean(),
      selected: z.array(z.string().max(80)).max(MAX_CHOICE_OPTIONS).optional(),
      ordered: z.array(z.string().max(80)).max(MAX_CHOICE_OPTIONS).optional(),
      top: z.array(z.string().max(80)).max(MAX_CHOICE_OPTIONS).optional(),
      why: z.string().trim().max(200).optional(),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      if (!game) return refusal(NO_GAME_ERROR);
      if (game.plans === false) return refusal("Turn play-out is off for this game; say what you would pick instead.");
      if (!game.autopilot) return refusal("The player makes their own choices unless they asked you to play their turn; say what you would pick.");
      const r = checkChoiceAnswer(catalog, game, args as ChoiceInput);
      return r.ok ? { content: [{ type: "text" as const, text: JSON.stringify(r.answer) }] } : refusal(r.error);
    },
  };
}
