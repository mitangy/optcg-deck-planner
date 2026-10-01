/**
 * Golden duel-protocol fixtures, generated from the real engine.
 *
 * Server → client: the `view` message a seat receives in each situation the
 * engine can produce (one per pending-choice kind, plus battle steps).
 * Client → server: the `intent` message a client sends to answer it, taken from
 * the view's own `legalIntents` or answered against the engine.
 *
 * Committed under `packages/rules/protocol-fixtures`; game-server, duel-web and
 * mobile load the same files so a wire-shape change breaks all of them at once.
 * Regenerate with `npm run export-protocol-fixtures -w @optcg/rules`.
 */
import { applyIntent, createMatch, getPlayerView, listLegalIntents } from "../engine.js";
import { RULES_PROTOCOL_VERSION } from "../state/snapshot.js";
import type { Intent, MatchState, Seat } from "../types.js";
import { FILLER, Harness } from "./harness.js";

export type ChoiceFixtureKind = "confirm" | "select" | "mode" | "order" | "look" | "order_effects" | "life_trigger";

export type ServerFixture = {
  name: string;
  /** Message name the game-server sends it under. */
  message: "view" | "welcome";
  viewerSeat: Seat;
  /** Request type (or "order_effects" / "life_trigger") of the front pending choice; null when none. */
  choice: ChoiceFixtureKind | null;
  /** True when the viewer is the seat that must answer the front choice. */
  answerable: boolean;
  body: Record<string, unknown>;
};

export type ClientFixture = {
  name: string;
  /** Always "intent": the message name the game-server listens on. */
  message: "intent";
  intentType: Intent["type"];
  /** Server fixture whose view this intent answers, when it answers a choice. */
  answers: string | null;
  body: { protocolVersion: number; intent: Intent };
};

export type ProtocolFixtures = {
  protocolVersion: number;
  server: ServerFixture[];
  client: ClientFixture[];
};

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export function buildProtocolFixtures(): ProtocolFixtures {
  const server: ServerFixture[] = [];
  const client: ClientFixture[] = [];

  const viewBody = (state: MatchState, seat: Seat) => ({ protocolVersion: RULES_PROTOCOL_VERSION, view: clone(getPlayerView(state, seat)) });

  const addServer = (name: string, state: MatchState, seat: Seat, choice: ChoiceFixtureKind | null): void => {
    const front = state.pendingChoices[0];
    server.push({ name, message: "view", viewerSeat: seat, choice, answerable: choice != null && front?.seat === seat, body: viewBody(state, seat) });
  };

  const addClient = (name: string, h: Harness, seat: Seat, intent: Intent, answers: string | null): void => {
    // Every client fixture must be accepted by the engine against the state it answers.
    const r = applyIntent(h.state, intent, { seat, rng: h.rng });
    if (!r.ok) throw new Error(`fixture ${name}: engine rejected ${JSON.stringify(intent)}: ${r.error?.message}`);
    client.push({ name, message: "intent", intentType: intent.type, answers, body: { protocolVersion: RULES_PROTOCOL_VERSION, intent: clone(intent) } });
  };

  // Mulligan: before either seat has chosen.
  {
    const state = createMatch({ seed: 1, firstSeat: 0, players: [{ leaderId: "ST01-001", deck: Array(40).fill(FILLER) }, { leaderId: "ST01-001", deck: Array(40).fill(FILLER) }] });
    const h = new Harness();
    h.state = state;
    addServer("mulligan", state, 0, null);
    addClient("mulligan-keep", h, 0, { type: "mulligan", doMulligan: false }, null);
    addClient("mulligan-redraw", h, 0, { type: "mulligan", doMulligan: true }, null);
  }

  // Main phase: every action a plain turn offers.
  {
    const h = new Harness();
    h.don(0, 1, 1);
    h.hand(0, FILLER);
    h.field(0, FILLER);
    const [target] = h.field(1, FILLER);
    target!.rested = true;
    addServer("main", h.state, 0, null);
    const legal = listLegalIntents(h.state, 0);
    const first = (pred: (i: Intent) => boolean): Intent => {
      const found = legal.find(pred);
      if (!found) throw new Error("main scenario lacks an expected legal intent");
      return found;
    };
    addClient("end-turn", h, 0, first((i) => i.type === "end_turn"), null);
    addClient("play-card", h, 0, first((i) => i.type === "play_card"), null);
    addClient("give-don", h, 0, first((i) => i.type === "give_don"), null);
    addClient("activate-ability", h, 0, first((i) => i.type === "activate_ability"), null);
    addClient("attack-leader", h, 0, first((i) => i.type === "declare_attack" && i.target.kind === "leader"), null);
    addClient("attack-character", h, 0, first((i) => i.type === "declare_attack" && i.target.kind === "character"), null);
  }

  // Main phase with a full field: playing a Character names the one to trash.
  {
    const h = new Harness();
    h.don(0, 1);
    h.field(0, FILLER, FILLER, FILLER, FILLER, FILLER);
    h.hand(0, FILLER);
    addServer("main-full-field", h.state, 0, null);
    const replace = listLegalIntents(h.state, 0).find((i) => i.type === "play_card" && i.trashCharacterId != null);
    if (!replace) throw new Error("full-field scenario lacks a replacing play");
    addClient("play-card-replace", h, 0, replace, null);
  }

  // Block step, then counter step (defender's view).
  {
    const h = new Harness();
    h.field(1, "ST01-006");
    h.hand(1, FILLER, "ST01-014");
    h.don(1, 3);
    h.attack(h.state.players[0].leader, "leader");
    addServer("block-step", h.state, 1, null);
    const blocker = listLegalIntents(h.state, 1).find((i) => i.type === "declare_block");
    if (!blocker) throw new Error("block scenario lacks declare_block");
    addClient("declare-block", h, 1, blocker, null);
    addClient("pass-block", h, 1, { type: "pass_block" }, null);
    h.act(1, { type: "pass_block" });
    addServer("counter-step", h.state, 1, null);
    addClient("pass-counter", h, 1, { type: "pass_counter" }, null);
    const legal = listLegalIntents(h.state, 1);
    const fromHand = legal.find((i) => i.type === "counter_from_hand");
    const event = legal.find((i) => i.type === "counter_event");
    if (!fromHand || !event) throw new Error("counter scenario lacks counter intents");
    addClient("counter-from-hand", h, 1, fromHand, null);
    addClient("counter-event", h, 1, event, null);
    // The counter event's [Counter] asks which Character to power up: a select.
    h.act(1, event);
    const choice = h.choice;
    if (choice?.request?.type !== "select") throw new Error("counter event should open a select");
    addServer("choice-select", h.state, 1, "select");
    addServer("choice-select-opponent", h.state, 0, "select");
    const option = choice.request.options.find((o) => o.eligible);
    if (!option) throw new Error("select has no eligible option");
    addClient("resolve-select", h, 1, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [option.id] }, "choice-select");
  }

  // Optional yes / no (OP02-062 pays a cost to K.O.).
  {
    const h = new Harness();
    h.hand(0, "OP02-062", FILLER, FILLER);
    h.don(0, 6);
    h.field(1, FILLER);
    h.play(0, "OP02-062");
    if (h.choice?.request?.type !== "confirm") throw new Error("OP02-062 should open a confirm");
    addServer("choice-confirm", h.state, 0, "confirm");
    addServer("choice-confirm-opponent", h.state, 1, "confirm");
    addClient("resolve-accept", h, 0, { type: "resolve_pending_choice", accept: true }, "choice-confirm");
    addClient("resolve-decline", h, 0, { type: "resolve_pending_choice", accept: false }, "choice-confirm");
  }

  // Mode: pick one labelled option (OP11-081 names a cost).
  {
    const h = new Harness();
    h.hand(0, "OP11-081");
    h.don(0, 6);
    h.field(1, FILLER);
    h.deckTop(1, FILLER);
    h.play(0, "OP11-081");
    const request = h.choice?.request;
    if (request?.type !== "mode") throw new Error("OP11-081 should open a mode");
    addServer("choice-mode", h.state, 0, "mode");
    addClient("resolve-mode", h, 0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: [request.options[0]!.id] }, "choice-mode");
  }

  // Order: put a looked-at Life card back (EB02-053), hidden from the opponent.
  {
    const h = new Harness();
    h.hand(0, "EB02-053");
    h.don(0, 3);
    h.life(1, "OP01-016", FILLER, FILLER);
    h.play(0, "EB02-053");
    h.pick("Opponent's Life");
    if (h.choice?.request?.type !== "order") throw new Error("EB02-053 should open an order");
    addServer("choice-order", h.state, 0, "order");
    addServer("choice-order-opponent", h.state, 1, "order");
    addClient("resolve-order", h, 0, { type: "resolve_pending_choice", accept: true, orderedOptionIds: ["o0"], topOptionIds: [] }, "choice-order");
  }

  // Look: search the top of the deck (OP01-016 Nami), private to its owner.
  {
    const h = new Harness();
    h.hand(0, "OP01-016");
    h.don(0, 1);
    h.deckTop(0, "OP01-013", "OP01-014", "OP01-015", "OP01-017", "OP01-025");
    h.play(0, "OP01-016");
    if (h.choice?.request?.type !== "look") throw new Error("OP01-016 should open a look");
    addServer("choice-look", h.state, 0, "look");
    addServer("choice-look-opponent", h.state, 1, "look");
    addClient("resolve-look", h, 0, { type: "resolve_pending_choice", accept: true, selectedOptionIds: ["o0"], orderedOptionIds: ["o1", "o2", "o3", "o4"] }, "choice-look");
  }

  // Simultaneous effects: two copies of OP06-014 answer the same attack.
  {
    const h = new Harness();
    h.field(1, "OP06-014", "OP06-014");
    h.attack(h.state.players[0].leader, "leader");
    const front = h.choice;
    if (front?.kind !== "order_effects") throw new Error("two OP06-014 should open order_effects");
    addServer("choice-order-effects", h.state, 1, "order_effects");
    addServer("choice-order-effects-opponent", h.state, 0, "order_effects");
    const ids = (front.unorderedChoices ?? []).map((c) => c.id).reverse();
    addClient("order-effects", h, 1, { type: "order_pending_effects", orderedIds: ids }, "choice-order-effects");
  }

  // Life trigger: the defender may activate the revealed [Trigger].
  {
    const h = new Harness();
    h.life(1, "ST01-014", FILLER);
    h.attack(h.state.players[0].leader, "leader").passBattle();
    if (h.choice?.kind !== "life_trigger") throw new Error("ST01-014 in Life should open life_trigger");
    addServer("choice-life-trigger", h.state, 1, "life_trigger");
    addServer("choice-life-trigger-opponent", h.state, 0, "life_trigger");
    addClient("resolve-trigger", h, 1, { type: "resolve_pending_choice", accept: true }, "choice-life-trigger");
  }

  // Welcome wraps the same view with the seat and player names.
  {
    const base = server.find((s) => s.name === "choice-confirm")!;
    server.push({
      name: "welcome",
      message: "welcome",
      viewerSeat: 0,
      choice: base.choice,
      answerable: base.answerable,
      body: { protocolVersion: RULES_PROTOCOL_VERSION, matchId: "match-fixture", seat: 0, role: "player", view: (base.body as { view: unknown }).view, players: [{ name: "Alice" }, { name: "Bob" }] },
    });
  }

  return { protocolVersion: RULES_PROTOCOL_VERSION, server, client };
}

/** The committed files: file name → JSON value. */
export function protocolFixtureFiles(): Record<string, unknown> {
  const f = buildProtocolFixtures();
  return {
    "protocol.json": { protocolVersion: f.protocolVersion },
    "server-messages.json": f.server,
    "client-messages.json": f.client,
  };
}
