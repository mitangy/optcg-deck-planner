// The string VALUES are part of the serialized match state (frames are saved and replayed), so they cannot change.
import type { BindingValue } from "../types.js";
import type { ReplacementEvent } from "./types.js";

export const B = {
  actTargets: "_actTargets",
  actIndex: "_actIndex",
  actEvents: "_actEvents",
  actByOpponent: "_actByOpponent",
  selectMeta: "_selectMeta",
  await: "_await",
  delay: "_delay",
  lifeEnd: "_lifeEnd",
  lifeFace: "_lifeFace",
  lifeSeat: "_lifeSeat",
  end: "_end",
  event: "_event",
  rested: "_rested",
  costPaid: "_costPaid",
  fromZone: "_fromZone",
  target: "_target",
  parent: "_parent",
  declined: "__declined",
  acted: "__acted",
} as const;

export const REPL_PREFIX = "_repl:";
export const replKey = (instanceId: string): string => `${REPL_PREFIX}${instanceId}`;

export const V = {
  last: "_last",
  cost: "_cost",
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

export function recordAffected(frame: Bound, id: string): void {
  const prev = frame.bindings[V.affected];
  frame.bindings[V.affected] = [...(Array.isArray(prev) ? prev : []), id];
}

export const modeVar = (n: number): string => `_mode${n}`;

export const CB = {
  bind: "__bind",
  repeat: "__repeat",
  startStage: "__startStage",
} as const;

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
