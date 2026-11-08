/**
 * Ops the compiler lowers to instructions: they must never reach the leaf executor.
 */
import type { OpTable } from "./shared.js";

export const loweredOps: OpTable<"choose_number" | "script" | "seq" | "if" | "may" | "pay" | "choose_one" | "select" | "delay" | "discard" | "hand_to_deck" | "hand_to_life" | "look"> = {
  choose_number: (effect) => { throw new Error(`Effect ${effect.do} must be compiled, not executed`); },
  script: (effect) => { throw new Error(`Effect ${effect.do} must be compiled, not executed`); },
  // Structural effects the compiler lowers to instructions; they never reach the leaf executor.
  seq: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  if: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  may: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  pay: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  choose_one: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  select: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  delay: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  discard: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  hand_to_deck: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  hand_to_life: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
  look: (effect) => { throw new Error(`Effect ${effect.do} has no leaf executor`); },
};
