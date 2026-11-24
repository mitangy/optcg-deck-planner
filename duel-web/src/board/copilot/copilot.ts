import { normalizeCardId } from "@optcg/card-core";
import {
  CHOICE_OPTION_LIMIT,
  type ChoiceAnswer,
  type ChoiceOptionSnap,
  type GameSnapshot,
  type LegalAction,
  type PendingChoiceSnap,
  type PlanStep,
  type SnapCard,
  type TurnPlan,
} from "@optcg/analyst-client";
import type { CardView, ChoiceOptionView, Intent, PendingChoiceView, PlayerView, Seat } from "../../net/protocol";
import { arrangementAnswer, groupAnswer } from "../zones/deckOrder";
import { briefShown } from "../match/matchBriefModel";
import type { PlayCardIntent } from "../prompts/intentFields";

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

export function gameAttached(o: Parameters<typeof copilotAvailable>[0] & { briefSetting: boolean }): boolean {
  return copilotAvailable({ ...o, setting: o.setting || o.briefSetting });
}

// In hotseat the ticket is seat 0's, so the button shows for seat 0's turns only.
export function copilotShown(o: Parameters<typeof copilotAvailable>[0] & { viewSeat: Seat | null | undefined }): boolean {
  if (o.viewSeat == null || o.viewSeat !== o.ticketSeat) return false;
  return copilotAvailable(o);
}

// The analyst's limits (analyst/src/copilot.ts): more is refused, so the snapshot is cut to it.
export const SNAPSHOT_LIMITS = { characters: 12, hand: 20, trash: 60, legal: 120, log: 40, logLine: 200, prompt: 300 };

const CARD_NUMBER = /^(P-\d{3}|[A-Z]{2,4}\d{2}-\d{3})$/;

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

function optionsSnap(options: readonly ChoiceOptionView[], seat: Seat): { options: ChoiceOptionSnap[]; truncated?: true } {
  if (options.length <= CHOICE_OPTION_LIMIT) return { options: options.map((o) => optionSnap(o, seat)) };
  const kept = [...options.filter((o) => o.eligible), ...options.filter((o) => !o.eligible)].slice(0, CHOICE_OPTION_LIMIT);
  return { options: kept.map((o) => optionSnap(o, seat)), truncated: true };
}

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

// Never one addressed to or private to the other seat.
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

// A whitelist, so a field added to the view later never leaves the browser by accident.
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

export function recentLog(lines: ReadonlyArray<{ text: string }>): string[] {
  return lines
    .slice(-SNAPSHOT_LIMITS.log)
    .map((l) => l.text.slice(0, SNAPSHOT_LIMITS.logLine))
    .filter(Boolean);
}

export type PlanCursor = { step: number; done: number; inFlight: Intent | null };

export type NextIntent =
  | { kind: "waiting"; cursor: PlanCursor }
  | { kind: "choice"; cursor: PlanCursor }
  | { kind: "send"; intent: Intent; cursor: PlanCursor }
  | { kind: "blocked"; reason: string; cursor: PlanCursor }
  | { kind: "stale"; reason: string }
  | { kind: "done" };

export const startCursor: PlanCursor = { step: 0, done: 0, inFlight: null };

const sameIntent = (a: Intent, b: Intent): boolean => JSON.stringify(a) === JSON.stringify(b);
const legalHas = (view: PlayerView, intent: Intent): boolean => view.legalIntents.some((l) => sameIntent(l, intent));

export function intentsFor(step: PlanStep): number {
  return step.action === "give_don" ? step.count : 1;
}

function takenEffect(step: PlanStep, sent: Intent, view: PlayerView): boolean {
  if (step.action === "play") return !view.you.hand.some((c) => c.id === step.card);
  return !legalHas(view, sent);
}

function playIntent(step: Extract<PlanStep, { action: "play" }>, view: PlayerView): Intent | string {
  const handIndex = view.you.hand.findIndex((c) => c.id === step.card);
  if (handIndex < 0) return "That card is no longer in your hand.";
  const options = view.legalIntents.filter((i): i is PlayCardIntent => i.type === "play_card" && i.handIndex === handIndex);
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

// Sends once, then waits until a later view shows the move taken, so two sends never ride on one view.
export function nextIntent(plan: TurnPlan, cursor: PlanCursor, view: PlayerView): NextIntent {
  let { step, done, inFlight } = cursor;
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

export type RunState = "running" | "choice" | "blocked" | "done" | "stopped";

export type PlanRun = {
  plan: TurnPlan;
  cursor: PlanCursor;
  state: RunState;
  reason?: string;
  auto?: true;
};

export const runActive = (run: PlanRun | null | undefined): run is PlanRun =>
  run != null && (run.state === "running" || run.state === "choice" || run.state === "blocked");

export const startRun = (plan: TurnPlan, auto = false): PlanRun => ({ plan, cursor: startCursor, state: "running", ...(auto ? { auto: true as const } : {}) });

export const stopRun = (run: PlanRun, reason?: string): PlanRun => (runActive(run) ? { ...run, state: "stopped", reason } : run);

export function skipStep(run: PlanRun): PlanRun {
  if (run.state !== "blocked") return run;
  return { ...run, state: "running", reason: undefined, cursor: { step: run.cursor.step + 1, done: 0, inFlight: null } };
}

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

// Hotseat: the device is with the other seat after the turn passes. The plan only waits while it is still its own turn.
export function stepRunOtherSeat(run: PlanRun, view: PlayerView): PlanRun {
  if (!runActive(run) || view.turnNumber === run.plan.turn) return run;
  if (run.cursor.inFlight?.type === "end_turn") return { ...run, state: "done", reason: undefined, cursor: { step: run.plan.steps.length, done: 0, inFlight: null } };
  return stopRun(run, "The turn changed.");
}

export function playBlockReason(plan: TurnPlan, view: PlayerView | null, run: PlanRun | null | undefined, gameKey?: string | null): string | null {
  if (runActive(run)) return "Another plan is running. Stop it first.";
  if (!view || view.spectator) return "Waiting for the game.";
  if (view.winner != null) return "The game is over.";
  if (gameKey && plan.gameKey !== gameKey) return "This plan was for an earlier game.";
  if (plan.turn !== view.turnNumber) return "This plan was for an earlier turn.";
  if (view.activeSeat !== view.seat) return "It isn't your turn.";
  return null;
}

export function replanQuestion(plan: TurnPlan, step: number, reason: string): string {
  const s = plan.steps[step];
  return `The plan stopped at step ${step + 1} (${s?.label ?? "a step"}): ${reason.trim().replace(/\.$/, "")}. Plan the rest of my turn from here.`;
}

export type PlanCardMode =
  | { kind: "idle"; disabledReason: string | null }
  | { kind: "running"; step: number; auto?: true }
  | { kind: "choice"; step: number; auto?: true }
  | { kind: "blocked"; step: number; reason: string; auto?: true }
  | { kind: "done" }
  | { kind: "stopped"; step: number; reason?: string };

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

export const AUTO_ASK_CAP = 6;
export const AUTO_CAP_REASON = "Log Pose needs you to finish this turn.";
export const AUTO_UNDECIDED_REASON = "Log Pose couldn't decide; it's your call.";
export const AUTO_CONTINUE_QUESTION = "Plan and play the rest of my turn from here. End the turn when nothing useful is left.";

export const autoAskAllowed = (asked: number): boolean => asked < AUTO_ASK_CAP;

export type AutoAsk = { key: string; text: string; kind: "choice" | "continue" | "replan" };

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

// Only the choice named in the answer, and only this seat's own, can be answered, so a late answer never lands on the next prompt.
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
