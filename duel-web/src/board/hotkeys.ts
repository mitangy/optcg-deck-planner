export type HotkeyAction = "primary" | "toggle_hand" | "sort_hand" | "help" | null;

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
  const k = e.key.toLowerCase();
  if (k === "h") return ctx.wide ? "toggle_hand" : null;
  if (k === "s") return "sort_hand";
  return null;
}
