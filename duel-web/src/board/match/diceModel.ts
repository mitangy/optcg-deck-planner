import type { DiceCall, DiceStateMessage, Seat } from "../../net/protocol";

/** The dice state a viewer sees: who they are (null = spectator) and whether the die is still tumbling. */
export type DiceView = Pick<DiceStateMessage, "roller" | "caller" | "step" | "call" | "roll" | "winner"> & {
  me: Seat | null;
  tumbling: boolean;
};

/** What fills the fixed action slot of the dice card at one step. */
export type DiceSlot =
  | { kind: "call"; enabled: boolean; picked: DiceCall | null }
  | { kind: "roll"; enabled: boolean }
  | { kind: "choose"; enabled: boolean }
  | { kind: "wait"; text: string };

const callName = (call: DiceCall) => (call === "high" ? "High" : "Low");
/** The side of the die a roll falls on: High is 4-6, Low is 1-3. */
export const rollSide = (roll: number): DiceCall => (roll >= 4 ? "high" : "low");

/** The one line under the die. `nameOf` gives "You" for the viewer's own seat. */
export function diceStatus(v: DiceView, nameOf: (seat: Seat) => string): string {
  const caller = nameOf(v.caller);
  const roller = nameOf(v.roller);
  if (v.roll !== null) {
    if (v.tumbling) return "Rolling…";
    const winner = v.winner;
    const result = winner === null ? "" : v.me !== null && winner === v.me ? " You win!" : ` ${nameOf(winner)} wins`;
    return `Rolled ${v.roll}: ${callName(rollSide(v.roll))}.${result}`;
  }
  if (v.step === "call") {
    if (v.me === v.caller) return "You call it: High or Low?";
    return v.me === v.roller ? `Waiting for ${caller} to call…` : `${caller} is calling…`;
  }
  const called = v.call ? callName(v.call) : "";
  if (v.me === v.roller) return `${caller} called ${called}. Roll the die!`;
  if (v.me === v.caller) return `You called ${called}. ${roller} is rolling…`;
  return `${caller} called ${called}. ${roller} is rolling…`;
}

/** The controls (or waiting text) in the action slot. The slot keeps one height, so the card never jumps between steps. */
export function diceSlot(v: DiceView, nameOf: (seat: Seat) => string): DiceSlot {
  if (v.step === "call") {
    if (v.me === v.caller) return { kind: "call", enabled: true, picked: null };
    if (v.me === v.roller) return { kind: "roll", enabled: false };
    return { kind: "wait", text: `${nameOf(v.caller)} is calling…` };
  }
  if (v.step === "roll") {
    if (v.me === v.roller) return { kind: "roll", enabled: true };
    if (v.me === v.caller) return { kind: "call", enabled: false, picked: v.call };
    return { kind: "wait", text: `${nameOf(v.roller)} is rolling…` };
  }
  if (v.step === "choose" && v.winner !== null) {
    if (v.me === v.winner) return { kind: "choose", enabled: !v.tumbling };
    return { kind: "wait", text: `${nameOf(v.winner)} is choosing…` };
  }
  return { kind: "wait", text: "Starting the game…" };
}
