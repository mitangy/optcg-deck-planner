/**
 * Pure rules for the Log Pose copilot on the board (the component is LogPoseCopilot.tsx): when it is offered,
 * the whitelisted snapshot of the game that goes to the analyst, and the executor that plays out a plan the
 * player approved, one legal intent per fresh view.
 */
import {
  CHOICE_OPTION_LIMIT,
  normalizeCardId,
  type ChoiceAnswer,
  type ChoiceOptionSnap,
  type GameSnapshot,
  type LegalAction,
  type PendingChoiceSnap,
  type PlanStep,
  type SnapCard,
  type TurnPlan,
} from "@optcg/analyst-client";
import type { CardView, ChoiceOptionView, Intent, PendingChoiceView, PlayerView, Seat } from "../net/protocol";
import { arrangementAnswer, groupAnswer } from "./deckOrder";
import { briefShown } from "./matchBrief";

/**
 * Whether the game offers the copilot at all: everything the matchup brief needs (an unranked room, a player, a
 * ticket, Log Pose on for the account) plus its own setting, and a seat the ticket was minted for. A plan keeps
 * going while this holds, even while the device shows the other seat (hotseat: the defender answers the attack).
 */
export function copilotAvailable(o: {
  ranked: boolean | null | undefined;
  role: "player" | "spectator";
  brief: unknown;
  logPoseEnabled: boolean | null;
  setting: boolean;
  ticketSeat: Seat | null | undefined;
}): boolean {
  if (o.ticketSeat == null) return false;
  return briefShown(o);
}

/**
 * Whether the live game is registered with Log Pose, so a chat can see the hand and board. Wider than
 * `copilotAvailable`: the matchup brief opens the Log Pose panel over the board during the mulligan, and the
 * player chats there with the copilot setting off. The same room, player, ticket and account checks apply; only
 * plans, the button and the executor need the copilot setting itself.
 */
export function gameAttached(o: Parameters<typeof copilotAvailable>[0] & { briefSetting: boolean }): boolean {
  return copilotAvailable({ ...o, setting: o.setting || o.briefSetting });
}

/**
 * Whether the board draws the copilot's button: the game offers it and the view is from the seat the ticket was
 * minted for. In hotseat the ticket is seat 0's, so the button is there for seat 0's turns only.
 */
export function copilotShown(o: Parameters<typeof copilotAvailable>[0] & { viewSeat: Seat | null | undefined }): boolean {
  if (o.viewSeat == null || o.viewSeat !== o.ticketSeat) return false;
  return copilotAvailable(o);
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

function optionSnap(o: ChoiceOptionView, seat: Seat): ChoiceOptionSnap {
  const defId = cardNumber(o.defId);
  return {
    id: o.id,
    ...(defId ? { defId } : {}),
    ...(o.label ? { label: o.label.slice(0, 120) } : {}),
    ...(o.instanceId ? { inst: o.instanceId.slice(0, 40) } : {}),
    ...(o.zone ? { zone: o.zone } : {}),
    ...(o.ownerSeat != null ? { owner: o.ownerSeat === seat ? ("you" as const) : ("opponent" as const) } : {}),
    eligible: o.eligible,
  };
}

/** The options of a request, eligible ones first when there are too many to send; `truncated` says some were left out. */
function optionsSnap(options: readonly ChoiceOptionView[], seat: Seat): { options: ChoiceOptionSnap[]; truncated?: true } {
  if (options.length <= CHOICE_OPTION_LIMIT) return { options: options.map((o) => optionSnap(o, seat)) };
  const kept = [...options.filter((o) => o.eligible), ...options.filter((o) => !o.eligible)].slice(0, CHOICE_OPTION_LIMIT);
  return { options: kept.map((o) => optionSnap(o, seat)), truncated: true };
}

/** The request as the analyst reads it. An order_effects prompt becomes an order of its abilities, named by their cards. */
function requestSnap(choice: PendingChoiceView, seat: Seat): PendingChoiceSnap["request"] {
  if (choice.kind === "order_effects") {
    const abilities = (choice.unorderedChoices ?? []).map((c): ChoiceOptionView => ({ id: c.id, defId: c.cardDefId, label: String(c.prompt ?? "").slice(0, 120), eligible: true }));
    return { type: "order", ...optionsSnap(abilities, seat) };
  }
  const r = choice.request;
  if (!r || r.type === "confirm") return { type: "confirm" };
  switch (r.type) {
    case "select":
      return { type: "select", min: r.min, max: r.max, ...optionsSnap(r.options, seat), ...(r.distinctNames ? { distinctNames: true } : {}) };
    case "mode":
      return { type: "mode", ...optionsSnap(r.options, seat) };
    case "order": {
      // Every card is needed to order them: more than fit means Log Pose cannot answer.
      const o = optionsSnap(r.options, seat);
      return { type: "order", ...o, ...(r.allowTopOrBottom ? { allowTopOrBottom: true } : {}) };
    }
    case "look": {
      const o = optionsSnap(r.options, seat);
      return { type: "look", min: r.minSelect, max: r.maxSelect, ...o, rest: r.rest };
    }
  }
}

/** The front pending choice, only when it is this seat's to answer: never one addressed to or private to the other seat. */
function choiceFor(view: PlayerView, choice: PendingChoiceView | null | undefined): GameSnapshot["choice"] {
  if (!choice || choice.seat !== view.seat) return null;
  if (choice.privateToSeat != null && choice.privateToSeat !== view.seat) return null;
  const declineOnly = (choice.kind === "life_trigger" && choice.noTrigger === true) || choice.unpayable === true;
  return {
    id: String(choice.id).slice(0, 80),
    prompt: String(choice.prompt ?? "").slice(0, SNAPSHOT_LIMITS.prompt),
    kind: choice.kind,
    optional: choice.optional === true || choice.kind === "life_trigger" || choice.unpayable === true,
    ...(declineOnly ? { declineOnly: true } : {}),
    request: requestSnap(choice, view.seat),
  };
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
    ...(view.firstSeat === undefined ? {} : { first: view.firstSeat === view.seat }),
    ...(view.phase === "mulligan" && typeof you.mulliganDone === "boolean" ? { mulliganDone: you.mulliganDone } : {}),
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
          // The engine's legal activations never carry a target: it is chosen when the ability resolves.
          (step.abilityId == null || i.abilityId === step.abilityId),
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
  /** Log Pose is playing the turn: it answers the run's choices and plans on when the run ends early (#725). */
  auto?: true;
};

/** Whether a run is still going (it holds the single plan slot). */
export const runActive = (run: PlanRun | null | undefined): run is PlanRun =>
  run != null && (run.state === "running" || run.state === "choice" || run.state === "blocked");

export const startRun = (plan: TurnPlan, auto = false): PlanRun => ({ plan, cursor: startCursor, state: "running", ...(auto ? { auto: true as const } : {}) });

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

/**
 * A fresh view from the other seat (hotseat: the device is with the defender, or with the opponent after the turn
 * passes). The plan only waits while it is still its own turn. Once the turn has moved on, a plan whose last move was
 * End turn is done, and any other plan can no longer be played.
 */
export function stepRunOtherSeat(run: PlanRun, view: PlayerView): PlanRun {
  if (!runActive(run) || view.turnNumber === run.plan.turn) return run;
  if (run.cursor.inFlight?.type === "end_turn") return { ...run, state: "done", reason: undefined, cursor: { step: run.plan.steps.length, done: 0, inFlight: null } };
  return stopRun(run, "The turn changed.");
}

/** Why Play this turn is unavailable for a plan, or null when it can start. */
export function playBlockReason(plan: TurnPlan, view: PlayerView | null, run: PlanRun | null | undefined, gameKey?: string | null): string | null {
  if (runActive(run)) return "Another plan is running. Stop it first.";
  if (!view || view.spectator) return "Waiting for the game.";
  if (view.winner != null) return "The game is over.";
  // Instance ids are per-game counters, so a plan from another game (or one with no game on record) names the wrong cards.
  if (gameKey && plan.gameKey !== gameKey) return "This plan was for an earlier game.";
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
  /** `auto`: Log Pose is playing the turn, so choices and a stopped step are its to handle. */
  | { kind: "running"; step: number; auto?: true }
  | { kind: "choice"; step: number; auto?: true }
  | { kind: "blocked"; step: number; reason: string; auto?: true }
  | { kind: "done" }
  | { kind: "stopped"; step: number; reason?: string };

/** What a Turn plan card shows: its own run if it has one (running or finished), else whether it may start. */
export function planCardMode(plan: TurnPlan, own: PlanRun | null | undefined, active: PlanRun | null | undefined, view: PlayerView | null, gameKey?: string | null): PlanCardMode {
  if (own) {
    const step = own.cursor.step;
    const auto = own.auto ? { auto: true as const } : {};
    switch (own.state) {
      case "running":
        return { kind: "running", step, ...auto };
      case "choice":
        return { kind: "choice", step, ...auto };
      case "blocked":
        return { kind: "blocked", step, reason: own.reason ?? "This step can't be played.", ...auto };
      case "done":
        return { kind: "done" };
      case "stopped":
        return { kind: "stopped", step, reason: own.reason };
    }
  }
  return { kind: "idle", disabledReason: playBlockReason(plan, view, active, gameKey) };
}

// ——— Log Pose plays the turn (#725) ———

/** Most automatic Log Pose requests one turn may make (answers to choices and plans for the rest of the turn). */
export const AUTO_ASK_CAP = 6;
export const AUTO_CAP_REASON = "Log Pose needs you to finish this turn.";
export const AUTO_UNDECIDED_REASON = "Log Pose couldn't decide; it's your call.";
export const AUTO_CONTINUE_QUESTION = "Plan and play the rest of my turn from here. End the turn when nothing useful is left.";

/** Whether another automatic request fits in this turn's cap, given how many were already made. */
export const autoAskAllowed = (asked: number): boolean => asked < AUTO_ASK_CAP;

/** A request the board makes for the player while Log Pose plays the turn. `key` is asked once. */
export type AutoAsk = { key: string; text: string; kind: "choice" | "continue" | "replan" };

/**
 * What Log Pose is asked next while it plays the turn, from the last run and the live view, or null to wait: the front
 * choice when it is this seat's (once per choice id); the rest of the turn when the run finished without ending it, but
 * only once nothing is going on (no battle, no choice); a new plan when a step is blocked. Only for a run Log Pose
 * started, on the turn it was planned for.
 */
export function autoAsk(run: PlanRun | null | undefined, view: PlayerView, fired: ReadonlySet<string>): AutoAsk | null {
  if (!run?.auto || view.winner != null || view.turnNumber !== run.plan.turn || view.seat == null) return null;
  const ask = (a: AutoAsk): AutoAsk | null => (fired.has(a.key) ? null : a);
  const front = view.pendingChoices?.[0];
  if (front) {
    if (front.seat !== view.seat) return null;
    const what = front.prompt.trim().replace(/\s+/g, " ").slice(0, 120);
    return ask({ key: `choice:${front.id}`, kind: "choice", text: `Answer my pending choice${what ? `: ${what}` : ""}` });
  }
  if (run.state === "blocked") {
    return ask({ key: `replan:${run.plan.id}:${run.cursor.step}`, kind: "replan", text: replanQuestion(run.plan, run.cursor.step, run.reason ?? "it can't be played") });
  }
  if (run.state === "done" && view.activeSeat === view.seat && view.phase === "main" && view.battle == null) {
    return ask({ key: `continue:${run.plan.id}`, kind: "continue", text: AUTO_CONTINUE_QUESTION });
  }
  return null;
}

const samePermutation = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && new Set(a).size === a.length && b.every((x) => a.includes(x));

/**
 * The intent that carries out Log Pose's answer to the front pending choice, built the way the board's own prompts
 * build theirs, or null when the answer does not fit the prompt: another choice's id, an option that is not offered or
 * not eligible, too many or too few picks, an order that is not a permutation, declining what cannot be declined. Only
 * the choice named in the answer, and only this seat's own, can be answered, so a late answer never lands on the next prompt.
 */
export function choiceAnswerIntent(choice: PendingChoiceView, answer: ChoiceAnswer, mySeat: Seat, nameOf: (defId: string) => string = () => ""): Intent | null {
  if (answer.choiceId !== choice.id || choice.seat !== mySeat) return null;
  if (choice.kind === "order_effects") {
    const ordered = answer.orderedOptionIds;
    const ids = (choice.unorderedChoices ?? []).map((c) => c.id);
    return answer.accept && ordered && samePermutation(ordered, ids) ? { type: "order_pending_effects", orderedIds: [...ordered] } : null;
  }
  if (!answer.accept) return choice.optional || choice.kind === "life_trigger" || choice.unpayable ? { type: "resolve_pending_choice", accept: false } : null;
  // A Life card without [Trigger] and a cost that can't be paid have one answer: decline.
  if ((choice.kind === "life_trigger" && choice.noTrigger) || choice.unpayable) return null;
  const r = choice.request;
  if (!r || r.type === "confirm") return { type: "resolve_pending_choice", accept: true };
  const cardName = (o: ChoiceOptionView): string | null => (o.defId && o.defId !== "HIDDEN" ? nameOf(o.defId) : null);
  const byId = new Map(r.options.map((o) => [o.id, o]));
  const selected = answer.selectedOptionIds ?? [];
  const eligiblePicks = (ids: readonly string[]) => new Set(ids).size === ids.length && ids.every((id) => byId.get(id)?.eligible === true);
  switch (r.type) {
    case "select": {
      if (!eligiblePicks(selected) || selected.length < r.min || selected.length > r.max) return null;
      if (r.distinctNames) {
        const names = selected.map((id) => cardName(byId.get(id)!)).filter((n): n is string => n != null);
        if (new Set(names).size !== names.length) return null;
      }
      return { type: "resolve_pending_choice", accept: true, selectedOptionIds: [...selected] };
    }
    case "mode":
      return selected.length === 1 && eligiblePicks(selected) ? { type: "resolve_pending_choice", accept: true, selectedOptionIds: [...selected] } : null;
    case "order": {
      const ordered = answer.orderedOptionIds;
      if (!ordered || !samePermutation(ordered, r.options.map((o) => o.id))) return null;
      if (!r.allowTopOrBottom) return { type: "resolve_pending_choice", accept: true, orderedOptionIds: [...ordered] };
      const top = (answer.topOptionIds ?? []).filter((id) => ordered.includes(id));
      return { type: "resolve_pending_choice", accept: true, ...arrangementAnswer({ top: ordered.filter((id) => top.includes(id)), bottom: ordered.filter((id) => !top.includes(id)) }) };
    }
    case "look": {
      if (!eligiblePicks(selected) || selected.length < r.minSelect || selected.length > r.maxSelect) return null;
      const rest = r.options.map((o) => o.id).filter((id) => !selected.includes(id));
      const ordered = answer.orderedOptionIds ?? rest;
      if (!samePermutation(ordered, rest)) return null;
      const top = answer.topOptionIds ?? [];
      if (r.rest === "top_or_bottom") {
        if (top.length && !samePermutation(top, rest)) return null;
        return { type: "resolve_pending_choice", accept: true, selectedOptionIds: [...selected], ...groupAnswer(ordered, top.length ? "top" : "bottom") };
      }
      return top.length ? null : { type: "resolve_pending_choice", accept: true, selectedOptionIds: [...selected], orderedOptionIds: [...ordered] };
    }
  }
}
