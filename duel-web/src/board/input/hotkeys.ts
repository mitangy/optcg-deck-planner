export type HotkeyAction =
  | "primary"
  | "toggle_hand"
  | "hide_hand"
  | "sort_hand"
  | "help"
  | "escape"
  | "hand_prev"
  | "hand_next"
  | "fullscreen"
  | "mute_tab"
  | { kind: "slot"; n: number }
  | { kind: "letter"; letter: string }
  | null;

export type HotkeyInput = {
  key: string;
  code?: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

export type HotkeyContext = {
  typing: boolean;
  focus: "none" | "card" | "control";
  modalOpen: boolean;
  spectating: boolean;
  over: boolean;
  wide: boolean;
  cardKeys: boolean;
  escOwned: boolean;
  handHides: boolean;
  fullscreenOffered: boolean;
};

export function hotkeyAction(e: HotkeyInput, ctx: HotkeyContext): HotkeyAction {
  if (ctx.typing || ctx.over) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (ctx.modalOpen) return null;

  if (e.key === "?") return "help";
  if (e.key === " " || e.code === "Space") {
    // A held key would otherwise arm and then confirm End turn on its own.
    if (ctx.focus === "control" || ctx.spectating || e.repeat) return null;
    return "primary";
  }
  if (e.key.toLowerCase() === "f") {
    // A held key would otherwise flip in and out of full screen.
    if (!ctx.fullscreenOffered || e.repeat) return null;
    return "fullscreen";
  }
  if (e.key.toLowerCase() === "m") return e.repeat ? null : "mute_tab";
  if (ctx.spectating) return null;
  if (e.key === "Escape") return ctx.escOwned ? null : "escape";
  const k = e.key.toLowerCase();
  if (ctx.cardKeys) {
    if (e.key === "ArrowLeft") return "hand_prev";
    if (e.key === "ArrowRight") return "hand_next";
    // A held key would otherwise play or attack over and over.
    if (e.repeat) return null;
    if (/^[1-9]$/.test(e.key)) return { kind: "slot", n: Number(e.key) };
    if (MNEMONIC_LETTERS.has(k)) return { kind: "letter", letter: k };
  }
  if (k === "h") {
    if (!ctx.wide) return null;
    return ctx.handHides ? "hide_hand" : "toggle_hand";
  }
  if (k === "s") return "sort_hand";
  return null;
}

const MNEMONIC_BY_TYPE: Record<string, string> = {
  declare_attack: "a",
  activate_ability: "e",
  activate_leader: "e",
  play_card: "p",
  give_don: "d",
};
const MNEMONIC_LETTERS = new Set(Object.values(MNEMONIC_BY_TYPE));

export type ActionKeyTag = {
  num: number | null;
  letter: string | null;
  tag: string;
};

export function actionKeyTags(intents: { type: string }[], offset = 0): ActionKeyTag[] {
  const taken = new Set<string>();
  return intents.map((intent, i) => {
    const num = i + offset < 9 ? i + offset + 1 : null;
    const l = MNEMONIC_BY_TYPE[intent.type] ?? null;
    const letter = l && !taken.has(l) ? l : null;
    if (letter) taken.add(letter);
    return { num, letter, tag: letter ? letter.toUpperCase() : num != null ? String(num) : "" };
  });
}

export function stepHandSelection(order: number[], current: number | null, dir: 1 | -1): number | null {
  if (order.length === 0) return null;
  const at = current == null ? -1 : order.indexOf(current);
  if (at < 0) return order[0]!;
  return order[(at + dir + order.length) % order.length]!;
}

export type ConfirmKeyContext = {
  typing: boolean;
  focus: "none" | "card" | "control";
  modalOpen: boolean;
  optional: boolean;
};

export function confirmKeyAnswer(e: HotkeyInput, ctx: ConfirmKeyContext): boolean | null {
  if (ctx.typing || ctx.modalOpen) return null;
  if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return null;
  if (e.key === " " || e.code === "Space") return ctx.focus === "control" ? null : true;
  const letter = e.key.toLowerCase();
  if (letter === "y") return true;
  if (letter === "n") return ctx.optional ? false : null;
  return null;
}
