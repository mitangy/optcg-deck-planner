/**
 * Pure rules for the Log Pose copilot on the board (the component is LogPoseCopilot.tsx): when it is offered,
 * the whitelisted snapshot of the game that goes to the analyst, and the executor that plays out a plan the
 * player approved, one legal intent per fresh view.
 */
import { normalizeCardId, type GameSnapshot, type LegalAction, type PlanStep, type SnapCard, type TurnPlan } from "@optcg/analyst-client";
import type { CardView, Intent, PendingChoiceView, PlayerView, Seat } from "../net/protocol";
import { briefShown } from "./matchBrief";

/**
 * Whether the board offers the copilot. Everything the matchup brief needs (an unranked room, a player, a ticket,
 * Log Pose on for the account) plus its own setting, and the view must be from the seat the ticket was minted for:
 * in hotseat the ticket is seat 0's, so the copilot is there for seat 0's turns only.
 */
export function copilotShown(o: {
  ranked: boolean | null | undefined;
  role: "player" | "spectator";
  brief: unknown;
  logPoseEnabled: boolean | null;
  setting: boolean;
  viewSeat: Seat | null | undefined;
  ticketSeat: Seat | null | undefined;
}): boolean {
  if (o.viewSeat == null || o.ticketSeat == null || o.viewSeat !== o.ticketSeat) return false;
  return briefShown(o);
}

/** The analyst's limits (analyst/src/copilot.ts): more than this is refused, so the snapshot is cut to it. */
export const SNAPSHOT_LIMITS = { characters: 12, hand: 20, trash: 60, legal: 120, log: 40, logLine: 200, prompt: 300 };

const CARD_NUMBER = /^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$/;

/** A card number the analyst accepts, or null (a hidden or unknown card never goes out). */
function cardNumber(defId: unknown): string | null {
  if (typeof defId !== "string") return null;
  const id = normalizeCardId(defId);
  return CARD_NUMBER.test(id) ? id : null;
}

function snapCard(c: CardView | null | undefined): SnapCard | null {
  if (!c) return null;
  const defId = cardNumber(c.defId);
  if (!defId) return null;
  const out: SnapCard = { id: c.id, defId };
  if (c.rested) out.rested = true;
  if (c.attachedDonCount) out.don = c.attachedDonCount;
  if (typeof c.power === "number") out.power = c.power;
  if (typeof c.fieldCost === "number") out.cost = c.fieldCost;
  if (c.summoningSick) out.sick = true;
  if (c.rush) out.rush = true;
  if (c.statusLabels?.length) out.status = c.statusLabels.filter((s) => typeof s === "string").slice(0, 6);
  return out;
}

const leaderCard = (c: CardView): SnapCard => snapCard(c) ?? { id: c.id, defId: String(c.defId) };

const cards = (list: readonly CardView[] | undefined): SnapCard[] =>
  (list ?? []).map(snapCard).filter((c): c is SnapCard => c !== null).slice(0, SNAPSHOT_LIMITS.characters);

const numbers = (list: readonly unknown[] | undefined, max: number): string[] =>
  (list ?? []).map(cardNumber).filter((c): c is string => c !== null).slice(-max);

const faceUp = (list: ReadonlyArray<{ defId: string }> | undefined): string[] => numbers((list ?? []).map((f) => f.defId), SNAPSHOT_LIMITS.trash);

/** The front pending choice, only when it is this seat's to answer: never one addressed to or private to the other seat. */
function choiceFor(view: PlayerView, choice: PendingChoiceView | null | undefined): GameSnapshot["choice"] {
  if (!choice || choice.seat !== view.seat) return null;
  if (choice.privateToSeat != null && choice.privateToSeat !== view.seat) return null;
  return { prompt: String(choice.prompt ?? "").slice(0, SNAPSHOT_LIMITS.prompt), kind: choice.kind };
}

/** The legal intents as the analyst reads them: instance ids instead of hand indexes, one give_don per target. */
export function compactLegal(view: PlayerView): LegalAction[] {
  const hand = view.you.hand;
  const out: LegalAction[] = [];
  const seen = new Set<string>();
  const push = (a: LegalAction) => {
    const key = JSON.stringify(a);
    if (seen.has(key)) return;
    seen.add(key);
    out.push(a);
  };
  const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;
  for (const i of view.legalIntents) {
    switch (i.type) {
      case "play_card": {
        const card = typeof i.handIndex === "number" ? hand[i.handIndex]?.id : undefined;
        if (card) push(str(i.trashCharacterId) ? { type: "play_card", card, trash: i.trashCharacterId } : { type: "play_card", card });
        break;
      }
      case "give_don":
        if (str(i.targetId)) push({ type: "give_don", target: i.targetId });
        break;
      case "activate_ability":
        if (str(i.sourceId) && str(i.abilityId)) {
          push({ type: "activate_ability", source: i.sourceId, abilityId: i.abilityId, ...(str(i.targetId) ? { target: i.targetId } : {}) });
        }
        break;
      case "declare_attack": {
        const t = i.target as { kind?: unknown; instanceId?: unknown } | undefined;
        const target = t?.kind === "leader" ? view.opponent.leader.id : t?.kind === "character" && str(t.instanceId) ? t.instanceId : null;
        if (str(i.attackerId) && target) push({ type: "declare_attack", attacker: i.attackerId, target });
        break;
      }
      case "declare_block":
        if (str(i.blockerId)) push({ type: "declare_block", blocker: i.blockerId });
        break;
      case "counter_from_hand":
      case "counter_event": {
        const card = typeof i.handIndex === "number" ? hand[i.handIndex]?.id : undefined;
        if (card) push({ type: i.type, card });
        break;
      }
      case "pass_block":
      case "pass_counter":
      case "end_turn":
        push({ type: i.type });
        break;
      default:
        break;
    }
  }
  return out.slice(0, SNAPSHOT_LIMITS.legal);
}

/**
 * The game as one seat sees it, for the analyst. A whitelist: only the fields listed here are copied, so a field
 * added to the view later never leaves the browser by accident. The opponent's hand is a count and nothing else
 * (`opponent.hand` and `revealedHands` are never read); a pending choice goes out only when it is this seat's.
 */
export function buildSnapshot(view: PlayerView, battleLine: string | null | undefined, choice: PendingChoiceView | null | undefined): GameSnapshot {
  const you = view.you;
  const opp = view.opponent;
  const rested = (you.costArea ?? []).filter((d) => d.rested).length;
  return {
    seat: view.seat,
    turn: view.turnNumber,
    phase: view.phase,
    yourTurn: view.activeSeat === view.seat,
    you: {
      leader: leaderCard(you.leader),
      characters: cards(you.characters),
      stage: snapCard(you.stage),
      hand: you.hand
        .map((c) => {
          const defId = cardNumber(c.defId);
          if (!defId) return null;
          return {
            id: c.id,
            defId,
            ...(typeof c.playCost === "number" ? { cost: c.playCost } : {}),
            ...(typeof c.counter === "number" ? { counter: c.counter } : {}),
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null)
        .slice(0, SNAPSHOT_LIMITS.hand),
      deck: you.deckCount,
      life: you.lifeCount,
      faceUpLife: faceUp(you.faceUpLife),
      trash: numbers(you.trash, SNAPSHOT_LIMITS.trash),
      donActive: you.activeDonCount,
      donRested: rested,
      donDeck: you.donDeckCount,
    },
    opponent: {
      leader: leaderCard(opp.leader),
      characters: cards(opp.characters),
      stage: snapCard(opp.stage),
      hand: opp.handCount,
      deck: opp.deckCount,
      life: opp.lifeCount,
      faceUpLife: faceUp(opp.faceUpLife),
      trash: numbers(opp.trash, SNAPSHOT_LIMITS.trash),
      donActive: opp.activeDonCount,
      donTotal: opp.costAreaCount,
      donDeck: opp.donDeckCount,
    },
    battle: battleLine ? battleLine : null,
    choice: choiceFor(view, choice),
    legal: compactLegal(view),
  };
}

/** Up to 40 recent battle log lines as the player saw them, each cut to 200 characters. */
export function recentLog(lines: ReadonlyArray<{ text: string }>): string[] {
  return lines
    .slice(-SNAPSHOT_LIMITS.log)
    .map((l) => l.text.slice(0, SNAPSHOT_LIMITS.logLine))
    .filter(Boolean);
}

// ——— Executor ———

/** Where a running plan stands: the step, how many of its intents the view has shown taking effect, and the one sent but not yet seen. */
export type PlanCursor = { step: number; done: number; inFlight: Intent | null };

export type NextIntent =
  /** Not this seat's move yet: the opponent, a battle, or an intent just sent. */
  | { kind: "waiting"; cursor: PlanCursor }
  /** A pending choice is this seat's to answer; the plan resumes after. */
  | { kind: "choice"; cursor: PlanCursor }
  | { kind: "send"; intent: Intent; cursor: PlanCursor }
  /** The step can't be done from here: skip it, stop, or re-plan. */
  | { kind: "blocked"; reason: string; cursor: PlanCursor }
  /** The plan can't go on at all: its turn is over or the game is. */
  | { kind: "stale"; reason: string }
  | { kind: "done" };

export const startCursor: PlanCursor = { step: 0, done: 0, inFlight: null };

const sameIntent = (a: Intent, b: Intent): boolean => JSON.stringify(a) === JSON.stringify(b);
const legalHas = (view: PlayerView, intent: Intent): boolean => view.legalIntents.some((l) => sameIntent(l, intent));

/** How many intents a step takes: a give_don once per DON!! asked for, everything else once. */
export function intentsFor(step: PlanStep): number {
  return step.action === "give_don" ? step.count : 1;
}

/** Whether the view shows the sent intent taking effect. A played card leaves the hand; anything else is no longer legal. */
function takenEffect(step: PlanStep, sent: Intent, view: PlayerView): boolean {
  if (step.action === "play") return !view.you.hand.some((c) => c.id === step.card);
  return !legalHas(view, sent);
}

function playIntent(step: Extract<PlanStep, { action: "play" }>, view: PlayerView): Intent | string {
  const handIndex = view.you.hand.findIndex((c) => c.id === step.card);
  if (handIndex < 0) return "That card is no longer in your hand.";
  const options = view.legalIntents.filter((i) => i.type === "play_card" && i.handIndex === handIndex);
  if (!options.length) return "That card can't be played right now.";
  const plain = options.find((i) => i.trashCharacterId == null);
  if (plain) return plain;
  const replace = step.trash ? options.find((i) => i.trashCharacterId === step.trash) : undefined;
  return replace ?? "Your Character area is full. Choose the Character to replace and play the card yourself.";
}

function stepIntent(step: PlanStep, view: PlayerView): Intent | string {
  const legal = view.legalIntents;
  const find = (pred: (i: Intent) => boolean, missing: string): Intent | string => legal.find(pred) ?? missing;
  switch (step.action) {
    case "play":
      return playIntent(step, view);
    case "give_don":
      return find((i) => i.type === "give_don" && i.targetId === step.target, "No active DON!! left to give.");
    case "activate":
      return find(
        (i) =>
          i.type === "activate_ability" &&
          i.sourceId === step.source &&
          (step.abilityId == null || i.abilityId === step.abilityId) &&
          (step.target == null || i.targetId === step.target),
        "That ability can't be used right now.",
      );
    case "attack":
      return find(
        (i) => {
          if (i.type !== "declare_attack" || i.attackerId !== step.attacker) return false;
          const t = i.target as { kind?: string; instanceId?: string } | undefined;
          return t?.kind === "leader" ? step.target === view.opponent.leader.id : t?.kind === "character" && t.instanceId === step.target;
        },
        "That attack isn't possible any more.",
      );
    case "end_turn":
      return find((i) => i.type === "end_turn", "You can't end the turn right now.");
  }
}

/**
 * The next thing the executor does for a plan the player approved, from the live view. It never invents a move: a
 * step becomes an intent only when that exact intent is in `view.legalIntents`, on this seat's own main phase with no
 * battle and no pending choice. It sends once and then waits until a later view shows the move taken (so two sends never
 * ride on one view), and a step moves on only after that.
 */
export function nextIntent(plan: TurnPlan, cursor: PlanCursor, view: PlayerView): NextIntent {
  let { step, done, inFlight } = cursor;
  // The view after a send: has the move taken effect?
  if (inFlight) {
    const cur = plan.steps[step];
    if (cur && !takenEffect(cur, inFlight, view)) return { kind: "waiting", cursor: { step, done, inFlight } };
    done += 1;
    inFlight = null;
  }
  while (step < plan.steps.length && done >= intentsFor(plan.steps[step]!)) {
    step += 1;
    done = 0;
  }
  if (step >= plan.steps.length) return { kind: "done" };
  if (view.winner != null) return { kind: "stale", reason: "The game is over." };
  if (view.turnNumber !== plan.turn) return { kind: "stale", reason: "The turn changed." };
  const at: PlanCursor = { step, done, inFlight: null };

  const front = view.pendingChoices?.[0];
  if (front) return front.seat === view.seat ? { kind: "choice", cursor: at } : { kind: "waiting", cursor: at };
  if (view.activeSeat !== view.seat || view.phase !== "main" || view.battle != null) return { kind: "waiting", cursor: at };

  const intent = stepIntent(plan.steps[step]!, view);
  if (typeof intent === "string") return { kind: "blocked", reason: intent, cursor: at };
  return { kind: "send", intent, cursor: { step, done, inFlight: intent } };
}

// ——— A plan being played ———

export type RunState = "running" | "choice" | "blocked" | "done" | "stopped";

export type PlanRun = {
  plan: TurnPlan;
  cursor: PlanCursor;
  state: RunState;
  /** Why it is blocked or stopped. */
  reason?: string;
};

/** Whether a run is still going (it holds the single plan slot). */
export const runActive = (run: PlanRun | null | undefined): run is PlanRun =>
  run != null && (run.state === "running" || run.state === "choice" || run.state === "blocked");

export const startRun = (plan: TurnPlan): PlanRun => ({ plan, cursor: startCursor, state: "running" });

export const stopRun = (run: PlanRun, reason?: string): PlanRun => (runActive(run) ? { ...run, state: "stopped", reason } : run);

/** Leaves a blocked step out and goes on with the next. */
export function skipStep(run: PlanRun): PlanRun {
  if (run.state !== "blocked") return run;
  return { ...run, state: "running", reason: undefined, cursor: { step: run.cursor.step + 1, done: 0, inFlight: null } };
}

/** Runs the executor on a fresh view: the new run state, and the one intent to send (if any). */
export function stepRun(run: PlanRun, view: PlayerView): { run: PlanRun; send: Intent | null } {
  if (!runActive(run)) return { run, send: null };
  const next = nextIntent(run.plan, run.cursor, view);
  switch (next.kind) {
    case "done":
      return { run: { ...run, state: "done", reason: undefined, cursor: { step: run.plan.steps.length, done: 0, inFlight: null } }, send: null };
    case "stale":
      return { run: { ...run, state: "stopped", reason: next.reason }, send: null };
    case "send":
      return { run: { ...run, state: "running", reason: undefined, cursor: next.cursor }, send: next.intent };
    case "waiting":
      return { run: { ...run, state: "running", reason: undefined, cursor: next.cursor }, send: null };
    case "choice":
      return { run: { ...run, state: "choice", reason: undefined, cursor: next.cursor }, send: null };
    case "blocked":
      return { run: { ...run, state: "blocked", reason: next.reason, cursor: next.cursor }, send: null };
  }
}

/** Why Play this turn is unavailable for a plan, or null when it can start. */
export function playBlockReason(plan: TurnPlan, view: PlayerView | null, run: PlanRun | null | undefined): string | null {
  if (runActive(run)) return "Another plan is running. Stop it first.";
  if (!view || view.spectator) return "Waiting for the game.";
  if (view.winner != null) return "The game is over.";
  if (plan.turn !== view.turnNumber) return "This plan was for an earlier turn.";
  if (view.activeSeat !== view.seat) return "It isn't your turn.";
  return null;
}

/** The re-plan question Log Pose is asked when a plan stops on a step. */
export function replanQuestion(plan: TurnPlan, step: number, reason: string): string {
  const s = plan.steps[step];
  return `The plan stopped at step ${step + 1} (${s?.label ?? "a step"}): ${reason.trim().replace(/\.$/, "")}. Plan the rest of my turn from here.`;
}

export type PlanCardMode =
  /** Not played yet; `disabledReason` says why Play this turn can't be tapped. */
  | { kind: "idle"; disabledReason: string | null }
  | { kind: "running"; step: number }
  | { kind: "choice"; step: number }
  | { kind: "blocked"; step: number; reason: string }
  | { kind: "done" }
  | { kind: "stopped"; step: number; reason?: string };

/** What a Turn plan card shows: its own run if it has one (running or finished), else whether it may start. */
export function planCardMode(plan: TurnPlan, own: PlanRun | null | undefined, active: PlanRun | null | undefined, view: PlayerView | null): PlanCardMode {
  if (own) {
    const step = own.cursor.step;
    switch (own.state) {
      case "running":
        return { kind: "running", step };
      case "choice":
        return { kind: "choice", step };
      case "blocked":
        return { kind: "blocked", step, reason: own.reason ?? "This step can't be played." };
      case "done":
        return { kind: "done" };
      case "stopped":
        return { kind: "stopped", step, reason: own.reason };
    }
  }
  return { kind: "idle", disabledReason: playBlockReason(plan, view, active) };
}
