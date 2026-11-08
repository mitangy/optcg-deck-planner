// Names of the keys the engine and the effect compiler put into `ResolutionFrame.bindings` and
// `PendingChoice.bindings`. The string VALUES are part of the serialized match state (frames are
// saved and replayed), so they must never change; the constants only exist so that a typo is a
// compile error instead of a silently-undefined read.
import type { BindingValue } from "../types.js";
import type { ReplacementEvent } from "./types.js";

/** Engine-private VM state on a frame. Card data never names these. */
export const B = {
  /** Ids an `act` is applying to, kept across a replacement-effect pause. */
  actTargets: "_actTargets",
  /** Index of the target the paused `act` resumes at. */
  actIndex: "_actIndex",
  /** Replacement events the paused `act` was raising. */
  actEvents: "_actEvents",
  actByOpponent: "_actByOpponent",
  /** JSON of the select's total-cost / total-power / distinct-name limits, read when the choice is answered. */
  selectMeta: "_selectMeta",
  /** Id of the pending choice this frame is waiting on. */
  await: "_await",
  /** Delayed-effect index for end-of-turn "delay" frames. */
  delay: "_delay",
  /** Answers to the engine's own top/bottom and which-player mode choices. */
  lifeEnd: "_lifeEnd",
  lifeFace: "_lifeFace",
  lifeSeat: "_lifeSeat",
  end: "_end",
  /** Instance id of the event card (`ref: "event_card"`). */
  event: "_event",
  /** Trash-for-space frame inputs. */
  rested: "_rested",
  costPaid: "_costPaid",
  fromZone: "_fromZone",
  /** Replacement frame inputs: the card being replaced and the act frame that raised it. */
  target: "_target",
  parent: "_parent",
  /** Set when the player declined an optional step / when any `act` ran (trigger bookkeeping). */
  declined: "__declined",
  acted: "__acted",
} as const;

/** Prefix of the per-target "replacement already handled" flags (`_repl:<instanceId>`). */
export const REPL_PREFIX = "_repl:";
export const replKey = (instanceId: string): string => `${REPL_PREFIX}${instanceId}`;

/**
 * Variables the effect compiler synthesizes for costs and sub-steps and that the DSL can read back with
 * `{ ref: "var", name }`. Card data also writes its own (`_rev`, `_ret`, ...); these are the ones the
 * engine owns a meaning for.
 */
export const V = {
  last: "_last",
  cost: "_cost",
  /** Ids the previous `act` touched; the engine writes it after every act. */
  affected: "_affected",
  did: "_did",
  paid: "_paid",
  either: "_either",
  discard: "_discard",
  handToDeck: "_handToDeck",
  handToLife: "_handToLife",
  from: "_from",
  to: "_to",
  with: "_with",
  space: "_space",
  tax: "_tax",
  taxCount: "_taxCount",
} as const;

type Bound = { bindings: Record<string, BindingValue> };

/** Append an id to `_affected` (the ids the latest `act` touched). */
export function recordAffected(frame: Bound, id: string): void {
  const prev = frame.bindings[V.affected];
  frame.bindings[V.affected] = [...(Array.isArray(prev) ? prev : []), id];
}

/** Variable for the n-th `choose_mode` of an ability. */
export const modeVar = (n: number): string => `_mode${n}`;

/** Keys of `PendingChoice.bindings` (a separate record from the frame's). */
export const CB = {
  /** Frame binding the answer is stored under. */
  bind: "__bind",
  /** Present when answering must not advance the frame (a follow-up choice reads the binding). */
  repeat: "__repeat",
  /** Marks the start-of-game stage choice. */
  startStage: "__startStage",
} as const;

/** Value type of each engine-private binding that has a typed accessor. */
interface BindingTypes {
  [B.actTargets]: string[];
  [B.actIndex]: number;
  [B.actEvents]: ReplacementEvent[];
  [B.actByOpponent]: boolean;
  [B.selectMeta]: string;
  [B.await]: string;
  [B.delay]: number;
  [B.event]: string;
  [B.target]: string;
  [B.parent]: string;
}

/** Read an engine-private binding; undefined when absent or of the wrong runtime type. */
export function getBinding<K extends keyof BindingTypes>(frame: Bound, key: K): BindingTypes[K] | undefined {
  const v = frame.bindings[key];
  switch (key) {
    case B.actTargets: case B.actEvents: return (Array.isArray(v) ? v : undefined) as BindingTypes[K] | undefined;
    case B.actIndex: case B.delay: return (typeof v === "number" ? v : undefined) as BindingTypes[K] | undefined;
    case B.actByOpponent: return (typeof v === "boolean" ? v : undefined) as BindingTypes[K] | undefined;
    default: return (typeof v === "string" ? v : undefined) as BindingTypes[K] | undefined;
  }
}

export function setBinding<K extends keyof BindingTypes>(frame: Bound, key: K, value: BindingTypes[K]): void {
  frame.bindings[key] = value as BindingValue;
}
