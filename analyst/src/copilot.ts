/**
 * Log Pose copilot (#416): Log Pose in casual and practice games. The app sends a whitelisted snapshot of the
 * player's own seat view with the matchup-brief ticket; this module re-validates it (unknown keys dropped),
 * checks the ticket with the planner, turns the board into a <game> block for the model, and offers the
 * propose_turn_plan tool, which checks a whole turn against the snapshot and writes nothing.
 */
import { z } from "zod";
import type { Catalog } from "./catalog";
import { PlannerApiError, plannerCall, type PlannerApi } from "./matches";
import type { ToolDef } from "./server";

export const PLAN_TOOL = "propose_turn_plan";
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

const gameSnapshot = z.object({
  seat: z.union([z.literal(0), z.literal(1)]),
  turn: z.number().int().min(0).max(1000),
  phase: z.string().max(40),
  yourTurn: z.boolean(),
  you: z.object({
    ...board,
    hand: z.array(z.object({ id: instId, defId, cost: count.optional(), counter: count.optional() })).max(20),
    donRested: count,
  }),
  opponent: z.object({
    ...board,
    hand: count,
    donTotal: count,
  }),
  battle: z.string().max(300).nullable().optional(),
  choice: z.object({ prompt: z.string().max(300), kind: z.string().max(60) }).nullable().optional(),
  legal: z.array(legalAction).max(120),
});

/** `context.game` of a /chat request. Limits must stay in step with the app's snapshot builder. */
export const gameContext = z.object({
  ticket: z.string().min(10).max(4000),
  snapshot: gameSnapshot,
  log: z.array(z.string().max(200)).max(40).optional(),
});

export type GameContext = z.infer<typeof gameContext>;
export type GameSnapshot = z.infer<typeof gameSnapshot>;
type SnapCard = z.infer<typeof snapCard>;
type LegalAction = z.infer<typeof legalAction>;

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
    ...side("Your", s.you),
    `Your rested DON!!: ${s.you.donRested}`,
    `Your hand: ${s.you.hand.length ? s.you.hand.map((h) => `${nameOfDef(catalog, h.defId)} [${h.id}] (cost ${h.cost ?? catalog.cards.get(h.defId)?.cost ?? "?"}${h.counter ? `, counter ${h.counter}` : ""})`).join("; ") : "empty"}`,
    ...side("Opponent", s.opponent),
    `Opponent hand: ${s.opponent.hand} cards (hidden), DON!! total ${s.opponent.donTotal}`,
    `Battle: ${s.battle || "none"}`,
    `Pending choice for you: ${s.choice ? `${s.choice.prompt} (${s.choice.kind})` : "none"}`,
    "Legal actions:",
    ...s.legal.map((a) => `- ${describeLegal(a, named)}`),
  ];
  if (game.log?.length) lines.push("Recent log:", ...game.log);
  const deck = claims.deck.map((d) => `${d.copies}x ${d.id} ${nameOfDef(catalog, d.id)}`);
  lines.push(`Your deck (${claims.deck.reduce((n, d) => n + d.copies, 0)} cards besides the Leader, whole list, not what is left):`, ...deck);
  const ids = new Set<string>([...inst.values(), ...s.you.faceUpLife, ...s.opponent.faceUpLife, ...s.you.trash, ...s.opponent.trash]);
  lines.push("Card reference:");
  for (const id of ids) {
    const c = catalog.cards.get(id);
    if (!c) continue;
    const stats = [c.type, c.cost !== undefined ? `cost ${c.cost}` : "", c.power !== undefined ? `power ${c.power}` : "", c.counter ? `counter ${c.counter}` : ""].filter(Boolean);
    const text = c.text.length > MAX_TEXT ? `${c.text.slice(0, MAX_TEXT - 1)}…` : c.text;
    lines.push(`- ${c.id} ${c.name} (${stats.join(", ")})${text ? `: ${text}` : ""}`);
  }
  return `<game>\n${lines.join("\n")}\n</game>`;
}

function describeLegal(a: LegalAction, named: (id: string) => string): string {
  switch (a.type) {
    case "play_card":
      return `play ${named(a.card)}${a.trash ? ` replacing ${named(a.trash)}` : ""}`;
    case "give_don":
      return `give DON!! to ${named(a.target)}`;
    case "activate_ability":
      return `activate ${named(a.source)} ability ${a.abilityId}${a.target ? ` on ${named(a.target)}` : ""}`;
    case "declare_attack":
      return `attack ${named(a.target)} with ${named(a.attacker)}`;
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

export const COPILOT_INSTRUCTIONS = `

The player turned on Log Pose for their live casual game. Their message starts with a <game> block: the board as they see it, their hand, the legal actions, the recent log, their deck list and the cards on the table. You coach; you do not play.
You only know what is in the <game> block. Never guess the opponent's hand or deck order; reason about what their leader usually plays and call it your read. Card text for cards on the table is in the block's card reference; look up anything else with get_cards.
Be brief: the player reads this on a phone between moves. Lead with the play, then a short why.
When they ask you to plan or play their turn, call propose_turn_plan once with the whole turn (every step, in order, ending with end_turn when the turn is done), then say in one or two sentences what the plan does and that they tap Play this turn to run it. If the tool refuses, fix the plan and call it again. Never say you made a move: only the player runs the plan.
Choices that come up mid-turn (searches, targets, triggers) are the player's; mention what you would pick. For defensive questions (block or counter) answer in text and don't propose a plan.`;

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
};

const spentTooMuch = (at: string, don: number, active: number) =>
  `${at}: the plan uses ${don} DON!! in all (card costs plus DON!! given) but the player has only ${active} active. If an effect in the plan adds DON!!, plan only up to that effect and plan again after it.`;

/** Checks a plan against the snapshot. Returns the plan without an id, or the reason the model should fix. */
export function checkTurnPlan(catalog: Catalog, game: GameContext, input: { summary: string; steps: PlanStepInput[] }): { ok: true; plan: Omit<TurnPlan, "id"> } | { ok: false; error: string } {
  const s = game.snapshot;
  const fail = (error: string) => ({ ok: false as const, error });
  if (!s.yourTurn) return fail("It isn't the player's turn, so there is nothing to plan. Answer in text.");
  if (s.choice) return fail("The player has a choice to make first. Tell them what you'd pick and plan again after they answer.");
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
        return a.type === "activate_ability" && a.source === first.source && (!first.abilityId || a.abilityId === first.abilityId) && (!first.target || a.target === first.target);
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
      "Give every step in order. Actions: play (card = hand id, trash = character to replace), give_don (target, count), activate (source, abilityId, target), attack (attacker, target = the opponent's Leader or character id), end_turn (last only). " +
      "Characters played earlier in the plan can act in later steps by their hand id. The plan is checked against the board and refused with the reason when a step can't work.",
    inputSchema: {
      summary: z.string().trim().min(3).max(300),
      steps: z.array(planStep).min(1).max(MAX_STEPS),
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
    run: async (args) => {
      if (!game) return refusal(NO_GAME_ERROR);
      const r = checkTurnPlan(catalog, game, args as { summary: string; steps: PlanStepInput[] });
      return r.ok ? { content: [{ type: "text" as const, text: JSON.stringify(r.plan) }] } : refusal(r.error);
    },
  };
}
