export type HotkeyAction =
  | "primary"
  | "toggle_hand"
  | "sort_hand"
  | "help"
  | "escape"
  | "hand_prev"
  | "hand_next"
  /** 1-9: the Nth secondary action button. */
  | { kind: "slot"; n: number }
  /** A/E/P/D: the button for this mnemonic letter (lowercase). */
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
  /** Focus is in a text field (input, textarea, select, contenteditable), e.g. chat. */
  typing: boolean;
  /** Keyboard-focused (focus-visible) button or link: let Space/Enter activate it natively. */
  keyboardFocusedControl: boolean;
  /** A modal, dialog or sheet is open (card inspect, settings, trash viewer, prompts). */
  modalOpen: boolean;
  spectating: boolean;
  over: boolean;
  wide: boolean;
  /** Desktop rail layout (wide, not a landscape phone): card-action keys are live. */
  cardKeys: boolean;
  /** A popover that closes itself on Esc (match menu, landscape panel) is open. */
  escOwned: boolean;
};

/** Maps a keydown to a desktop shortcut; the DOM facts arrive in `ctx` so this stays pure. */
export function hotkeyAction(e: HotkeyInput, ctx: HotkeyContext): HotkeyAction {
  if (ctx.typing || ctx.over) return null;
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  if (ctx.modalOpen) return null;

  if (e.key === "?") return "help";
  if (e.key === " " || e.code === "Space") {
    // A held key would otherwise arm and then confirm End turn on its own.
    if (ctx.keyboardFocusedControl || ctx.spectating || e.repeat) return null;
    return "primary";
  }
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
  if (k === "h") return ctx.wide ? "toggle_hand" : null;
  if (k === "s") return "sort_hand";
  return null;
}

/** Intent type to mnemonic letter for the selected card's action buttons. */
const MNEMONIC_BY_TYPE: Record<string, string> = {
  declare_attack: "a",
  activate_ability: "e",
  activate_leader: "e",
  play_card: "p",
  give_don: "d",
};
const MNEMONIC_LETTERS = new Set(Object.values(MNEMONIC_BY_TYPE));

export type ActionKeyTag = {
  /** Number key (1-9) that presses this button; null past the ninth. */
  num: number | null;
  /** Mnemonic letter, only on the first button of its kind. */
  letter: string | null;
  /** What the corner badge shows: the letter when there is one, else the number. */
  tag: string;
};

/** Key tags for the visible secondary buttons, in display order. */
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

/**
 * Next hand slot for the arrow keys. `order` is the hand's display order (hand
 * indexes); with nothing selected (or a stale index) it starts at the first card.
 */
export function stepHandSelection(order: number[], current: number | null, dir: 1 | -1): number | null {
  if (order.length === 0) return null;
  const at = current == null ? -1 : order.indexOf(current);
  if (at < 0) return order[0]!;
  return order[(at + dir + order.length) % order.length]!;
}
