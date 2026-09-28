/**
 * Compile DSL effect trees into flat instruction lists. A resolution frame
 * stores only an instruction index and JSON bindings, so any paused program can
 * be serialized and resumed exactly.
 */
import type { Ability, Cond, Cost, Effect, LookPick, Placement, Rel, Selector, Target, Value } from "./types.js";

export type Instr =
  | { op: "select"; bind: string; selector: Selector; min: number; max: number; chooser: Rel; totalCostAtMost?: Value; totalPowerAtMost?: Value; distinctNames?: boolean; purpose: string; random?: boolean; countValue?: Value }
  /** Schedule the ability's `index`-th delayed effect for the end of this turn. */
  | { op: "delay"; index: number; when: "end_of_turn" | "end_of_battle" }
  /** Yes/no. When `costs` is set the prompt is skipped (as "no") unless they are payable. */
  | { op: "confirm"; bind: string; prompt: string; costs?: Cost[]; chooser?: Rel }
  | { op: "mode"; bind: string; labels: string[]; chooser: Rel }
  | { op: "jump"; to: number }
  | { op: "jumpIfNot"; cond: Cond; to: number }
  | { op: "jumpIfFalse"; name: string; to: number }
  | { op: "jumpIfModeNot"; name: string; index: number; to: number }
  | { op: "act"; effect: Effect }
  | { op: "look"; player: Rel; count: Value; picks: LookPick[]; rest: Placement; reveal: boolean };

export interface Program {
  abilityId: string;
  instrs: Instr[];
}

interface CompileCtx { modes: number; delays: number }

function describeTarget(target: Target): string {
  if (target.ref !== "choose") return "";
  const s = target.selector;
  const who = s.player === "you" ? "your" : s.player === "opponent" ? "your opponent's" : "any";
  return `${target.min === 0 ? `up to ${target.max}` : target.max} of ${who} ${s.zone.replace(/_/g, " ")} cards`;
}

function purposeOf(effect: Effect): string {
  switch (effect.do) {
    case "ko": return "K.O.";
    case "rest": return "rest";
    case "activate": return "set as active";
    case "to_hand": return "add to hand";
    case "to_deck": return `place at the ${effect.position} of the deck`;
    case "to_trash": return "trash";
    case "to_life": return "add to Life";
    case "play": return "play";
    case "power": return `${Number(typeof effect.amount === "number" ? effect.amount : 0) >= 0 ? "+" : ""}${typeof effect.amount === "number" ? effect.amount : "X"} power`;
    case "cost": return `${typeof effect.amount === "number" && effect.amount >= 0 ? "+" : ""}${typeof effect.amount === "number" ? effect.amount : "X"} cost`;
    case "base_power": return "set base power";
    case "keyword": return `gain [${effect.keyword.replace(/_/g, " ")}]`;
    case "restrict": return effect.restriction.replace(/_/g, " ");
    case "negate": return "negate effects";
    case "give_don": return "receive DON!!";
    case "redirect_attack": return "become the new attack target";
    default: return effect.do.replace(/_/g, " ");
  }
}

export function compileAbilityProgram(ability: Ability, opts: { optionalCosts: boolean }): Program {
  const instrs: Instr[] = [];
  const ctx: CompileCtx = { modes: 0, delays: 0 };
  const costs = ability.costs ?? [];
  if (costs.length) {
    if (opts.optionalCosts) {
      const end: Instr = { op: "jump", to: -1 };
      instrs.push({ op: "confirm", bind: "_paid", prompt: "pay the cost", costs });
      instrs.push({ op: "jumpIfFalse", name: "_paid", to: -1 });
      const skipIndex = instrs.length - 1;
      for (const cost of costs) compileCost(cost, instrs);
      if (ability.effect) compileEffect(ability.effect, instrs, ctx);
      (instrs[skipIndex] as Extract<Instr, { op: "jumpIfFalse" }>).to = instrs.length;
      void end;
      return { abilityId: ability.id, instrs };
    }
    for (const cost of costs) compileCost(cost, instrs);
  }
  if (ability.effect) compileEffect(ability.effect, instrs, ctx);
  return { abilityId: ability.id, instrs };
}

/** Compile a standalone effect (replacement "instead" bodies). */
export function compileStandalone(abilityId: string, effect: Effect): Program {
  const instrs: Instr[] = [];
  compileEffect(effect, instrs, { modes: 0, delays: 0 });
  return { abilityId, instrs };
}

/** Delayed effect bodies in the same pre-order used to number `delay` instructions. */
export function delayedEffects(ability: Ability): Effect[] {
  const out: Effect[] = [];
  const walk = (e: Effect | undefined): void => {
    if (!e) return;
    switch (e.do) {
      case "seq": e.steps.forEach(walk); return;
      case "if": walk(e.then); walk(e.else); return;
      case "may": case "pay": walk(e.then); return;
      case "choose_one": e.options.forEach((o) => walk(o.effect)); return;
      case "delay": out.push(e.effect); return;
      default: return;
    }
  };
  walk(ability.effect);
  return out;
}

export function compileDelayed(ability: Ability, index: number): Program {
  const body = delayedEffects(ability)[index];
  if (!body) throw new Error(`Ability ${ability.id} has no delayed effect ${index}`);
  const instrs: Instr[] = [];
  compileEffect(body, instrs, { modes: 0, delays: 0 });
  return { abilityId: `${ability.id}#delay${index}`, instrs };
}

function selectFor(target: Extract<Target, { ref: "choose" }>, purpose: string, out: Instr[]): string {
  const bind = target.bind ?? "_last";
  out.push({
    op: "select",
    bind,
    selector: target.selector,
    min: target.min,
    max: target.max,
    chooser: target.chooser ?? "you",
    ...(target.totalCostAtMost != null ? { totalCostAtMost: target.totalCostAtMost } : {}),
    ...(target.totalPowerAtMost != null ? { totalPowerAtMost: target.totalPowerAtMost } : {}),
    ...(target.distinctNames ? { distinctNames: true } : {}),
    purpose: purpose || describeTarget(target),
  });
  return bind;
}

function withResolvedTarget(effect: Effect & { target: Target }, out: Instr[]): void {
  if (effect.target.ref === "choose") {
    const bind = selectFor(effect.target, purposeOf(effect), out);
    out.push({ op: "act", effect: { ...effect, target: { ref: "var", name: bind } } as Effect });
    return;
  }
  out.push({ op: "act", effect });
}

/** Expand one cost into selection + action instructions. Costs are exact (min = max). */
export function compileCost(cost: Cost, out: Instr[]): void {
  const select = (selector: Selector, count: number, purpose: string) => {
    out.push({ op: "select", bind: "_cost", selector, min: count, max: count, chooser: "you", purpose });
  };
  const self: Target = { ref: "self" };
  const costVar: Target = { ref: "var", name: "_cost" };
  switch (cost.k) {
    case "rest_don": out.push({ op: "act", effect: { do: "rest_don", player: "you", count: cost.count } }); return;
    case "return_don": out.push({ op: "act", effect: { do: "return_don", player: "you", count: cost.count } }); return;
    case "trash_hand": select({ player: "you", zone: "hand", filter: { ...(cost.filter ?? {}), excludeSelf: true } }, cost.count, "trash (cost)"); out.push({ op: "act", effect: { do: "to_trash", target: costVar } }); return;
    case "reveal_hand": select({ player: "you", zone: "hand", filter: { ...(cost.filter ?? {}), excludeSelf: true } }, cost.count, "reveal (cost)"); out.push({ op: "act", effect: { do: "reveal", target: costVar } }); return;
    case "hand_to_deck_bottom": select({ player: "you", zone: "hand", filter: { ...(cost.filter ?? {}), excludeSelf: true } }, cost.count, "place at the bottom of the deck (cost)"); out.push({ op: "act", effect: { do: "to_deck", target: costVar, position: "bottom" } }); return;
    case "rest_self": out.push({ op: "act", effect: { do: "rest", target: self } }); return;
    case "trash_self": out.push({ op: "act", effect: { do: "to_trash", target: self } }); return;
    case "self_to_hand": out.push({ op: "act", effect: { do: "to_hand", target: self } }); return;
    case "self_to_deck_bottom": out.push({ op: "act", effect: { do: "to_deck", target: self, position: "bottom" } }); return;
    case "rest_cards": select({ ...cost.selector, filter: { ...(cost.selector.filter ?? {}), rested: false } }, cost.count, "rest (cost)"); out.push({ op: "act", effect: { do: "rest", target: costVar } }); return;
    case "trash_cards": select(cost.selector, cost.count, "trash (cost)"); out.push({ op: "act", effect: { do: "to_trash", target: costVar } }); return;
    case "return_cards_to_hand": select(cost.selector, cost.count, "return to hand (cost)"); out.push({ op: "act", effect: { do: "to_hand", target: costVar } }); return;
    case "cards_to_deck_bottom": select(cost.selector, cost.count, "place at the bottom of the deck (cost)"); out.push({ op: "act", effect: { do: "to_deck", target: costVar, position: "bottom" } }); return;
    case "trash_to_deck_bottom": select({ player: "you", zone: "trash", ...(cost.filter ? { filter: cost.filter } : {}) }, cost.count, "place at the bottom of the deck (cost)"); out.push({ op: "act", effect: { do: "to_deck", target: costVar, position: "bottom" } }); return;
    case "life_to_hand": out.push({ op: "act", effect: { do: "life_to_hand", player: "you", count: cost.count, position: cost.position } }); return;
    case "trash_life": out.push({ op: "act", effect: { do: "trash_life", player: "you", count: cost.count, ...(cost.position ? { position: cost.position } : {}) } }); return;
    case "return_active_don": out.push({ op: "act", effect: { do: "return_don", player: "you", count: cost.count, activeOnly: true } }); return;
    case "ko_cards": select(cost.selector, cost.count, "K.O. (cost)"); out.push({ op: "act", effect: { do: "ko", target: costVar } }); return;
    case "give_don": select(cost.selector, 1, "receive DON!! (cost)"); out.push({ op: "act", effect: { do: "give_don", target: costVar, count: cost.count, donState: "active" } }); return;
    case "life_face_down": out.push({ op: "act", effect: { do: "life_face", player: "you", count: cost.count, faceUp: false } }); return;
    case "life_face_up": out.push({ op: "act", effect: { do: "life_face", player: "you", count: cost.count, faceUp: true } }); return;
    case "mill": out.push({ op: "act", effect: { do: "mill", player: "you", count: cost.count } }); return;
    case "power": out.push({ op: "act", effect: { do: "power", target: cost.target === "self" ? self : { ref: "leader", player: "you" }, amount: cost.amount, duration: "turn" } }); return;
    case "give_opponent_don": out.push({ op: "select", bind: "_cost", selector: { player: "opponent", zone: "character" }, min: 1, max: 1, chooser: "you", purpose: "receive your opponent's DON!! (cost)" }); out.push({ op: "act", effect: { do: "give_don", target: costVar, count: cost.count, donState: "rested", player: "opponent" } }); return;
    case "play_from_hand": select({ player: "you", zone: "hand", filter: { ...(cost.filter ?? {}), excludeSelf: true } }, cost.count, "play (cost)"); out.push({ op: "act", effect: { do: "play", target: costVar } }); return;
    case "trash_to_deck_shuffle": select({ player: "you", zone: "trash" }, cost.count, "return to the deck (cost)"); out.push({ op: "act", effect: { do: "to_deck", target: costVar, position: "bottom" } }); out.push({ op: "act", effect: { do: "shuffle", player: "you" } }); return;
    case "place_self_in_life": out.push({ op: "act", effect: { do: "to_life", target: self, position: "top", faceUp: cost.faceUp } }); return;
  }
}

export function compileEffect(effect: Effect, out: Instr[], ctx: CompileCtx = { modes: 0, delays: 0 }): void {
  switch (effect.do) {
    case "seq":
      for (const step of effect.steps) compileEffect(step, out, ctx);
      return;
    case "if": {
      const jumpIndex = out.length;
      out.push({ op: "jumpIfNot", cond: effect.cond, to: -1 });
      compileEffect(effect.then, out, ctx);
      if (effect.else) {
        const skipElse = out.length;
        out.push({ op: "jump", to: -1 });
        (out[jumpIndex] as Extract<Instr, { op: "jumpIfNot" }>).to = out.length;
        compileEffect(effect.else, out, ctx);
        (out[skipElse] as Extract<Instr, { op: "jump" }>).to = out.length;
      } else {
        (out[jumpIndex] as Extract<Instr, { op: "jumpIfNot" }>).to = out.length;
      }
      return;
    }
    case "may": {
      const bind = effect.bind ?? "_did";
      out.push({ op: "confirm", bind, prompt: effect.prompt ?? "use this effect", ...(effect.costs?.length ? { costs: effect.costs } : {}), ...(effect.chooser ? { chooser: effect.chooser } : {}) });
      const jumpIndex = out.length;
      out.push({ op: "jumpIfFalse", name: bind, to: -1 });
      for (const cost of effect.costs ?? []) compileCost(cost, out);
      compileEffect(effect.then, out, ctx);
      (out[jumpIndex] as Extract<Instr, { op: "jumpIfFalse" }>).to = out.length;
      return;
    }
    case "pay": {
      for (const cost of effect.costs) compileCost(cost, out);
      compileEffect(effect.then, out, ctx);
      return;
    }
    case "choose_one": {
      const bind = `_mode${ctx.modes++}`;
      out.push({ op: "mode", bind, labels: effect.options.map((option) => option.label), chooser: effect.chooser ?? "you" });
      const ends: number[] = [];
      effect.options.forEach((option, index) => {
        const skip = out.length;
        out.push({ op: "jumpIfModeNot", name: bind, index, to: -1 });
        compileEffect(option.effect, out, ctx);
        ends.push(out.length);
        out.push({ op: "jump", to: -1 });
        (out[skip] as Extract<Instr, { op: "jumpIfModeNot" }>).to = out.length;
      });
      for (const index of ends) (out[index] as Extract<Instr, { op: "jump" }>).to = out.length;
      return;
    }
    case "select":
      out.push({ op: "select", bind: effect.bind, selector: effect.selector, min: effect.min, max: effect.max, chooser: effect.chooser ?? "you", ...(effect.totalCostAtMost != null ? { totalCostAtMost: effect.totalCostAtMost } : {}), ...(effect.totalPowerAtMost != null ? { totalPowerAtMost: effect.totalPowerAtMost } : {}), ...(effect.distinctNames ? { distinctNames: true } : {}), ...(effect.random ? { random: true } : {}), purpose: "select" });
      return;
    case "delay":
      out.push({ op: "delay", index: ctx.delays++, when: effect.when });
      return;
    case "discard": {
      const count = typeof effect.count === "number" ? effect.count : 0;
      const bind = "_discard";
      out.push({ op: "select", bind, selector: { player: effect.player, zone: "hand", ...(effect.filter ? { filter: effect.filter } : {}) }, min: effect.min ?? count, max: count, chooser: effect.chooser ?? effect.player, purpose: "trash from hand", ...(effect.random ? { random: true } : {}), ...(typeof effect.count === "number" ? {} : { countValue: effect.count }) });
      out.push({ op: "act", effect: { do: "to_trash", target: { ref: "var", name: bind } } });
      return;
    }
    case "hand_to_deck": {
      const bind = "_handToDeck";
      out.push({ op: "select", bind, selector: { player: effect.player, zone: "hand", ...(effect.filter ? { filter: effect.filter } : {}) }, min: effect.min ?? effect.count, max: effect.count, chooser: effect.chooser ?? effect.player, purpose: `place at the ${effect.position} of the deck` });
      out.push({ op: "act", effect: { do: "to_deck", target: { ref: "var", name: bind }, position: effect.position } });
      return;
    }
    case "hand_to_life": {
      const bind = "_handToLife";
      out.push({ op: "select", bind, selector: { player: "you", zone: "hand", ...(effect.filter ? { filter: effect.filter } : {}) }, min: effect.min ?? effect.count, max: effect.count, chooser: "you", purpose: "add to Life" });
      out.push({ op: "act", effect: { do: "to_life", target: { ref: "var", name: bind }, position: effect.position, faceUp: effect.faceUp } });
      return;
    }
    case "look":
      out.push({ op: "look", player: effect.player, count: effect.count, picks: effect.picks, rest: effect.rest, reveal: effect.reveal ?? true });
      return;
    case "ko": case "rest": case "activate": case "to_hand": case "to_deck": case "to_trash": case "to_life": case "play":
    case "power": case "cost": case "base_power": case "set_power": case "set_cost": case "keyword": case "restrict": case "negate": case "give_don": case "redirect_attack":
    case "activate_event": case "reveal":
      withResolvedTarget(effect, out);
      return;
    default:
      out.push({ op: "act", effect });
  }
}
