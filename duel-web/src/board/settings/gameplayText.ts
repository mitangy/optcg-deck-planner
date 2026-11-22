import type { RowKey } from "./gameplayFields";

/**
 * The label and hint of every Gameplay row, in one place. The rows render these strings and the Settings
 * search reads them, so what you can search for is always what you see. `keywords` adds words a row should
 * be found by that its visible text does not say (an option name, a device-specific wording).
 */
export type RowText = { label: string; hint: string; keywords?: string };

/** What the Settings search matches a row against: its label, hint and any extra keywords. */
export function rowSearchText(key: RowKey): string {
  const t = ROW_TEXT[key];
  return `${t.label} ${t.hint} ${t.keywords ?? ""}`;
}

export const ROW_TEXT: Record<RowKey, RowText> = {
  sortHandByCost: { label: "Sort hand by cost", hint: "Starts each match with the hand's Sort button on." },
  keepHandOpen: {
    label: "Keep hand open",
    hint: "The hand stays up instead of tucking away. Press H during a match to hide it.",
  },
  layoutGrips: {
    label: "Drag handles",
    hint: "Shows grips for moving the side panels and the hand. Your layout stays when it's off.",
  },
  oneTapActions: {
    label: "One-tap actions",
    hint: "Skips the confirm tap: one-button actions, Counters, Blockers and DON!! happen on the first tap.",
  },
  dimUnplayable: { label: "Gray out unplayable cards", hint: "In your main phase, fades hand cards you can't play." },
  handCounters: {
    label: "Counter values on hand cards",
    hint: "Shows each hand card's Counter value as a badge.",
  },
  cantAttackWarning: { label: "Can't attack warning", hint: "A card that can't attack flashes red and says why." },
  battleArrow: { label: "Battle arrow", hint: "Draws an arc from the attacker to its target." },
  attackGlow: { label: "Attack-ready glow", hint: "Cards that can attack right now glow green." },
  compactOwnBoard: {
    label: "Simple board on phones",
    hint: "Portrait phones: your Life, Deck, DON!! and Trash become counts, so your cards get bigger.",
  },
  previewBigCard: {
    label: "Show card text beneath card",
    hint: "Adds the card's stats and effect text under the art. Off shows just the card, as big as it fits.",
  },
  previewPopup: {
    label: "Card preview pop-up",
    hint: "Shows the card preview as a pop-up you can drag, instead of a side panel. Needs Card preview on.",
  },
  donUpright: { label: "Upright DON!! on rested cards", hint: "DON!! stays upright when the card it's on rests." },
  totalPower: {
    label: "Show total power",
    hint: "Shows only the total power: green when raised, red when lowered. Hover a card for the breakdown.",
  },
  shortcutTags: {
    label: "Shortcut key tags",
    hint: "Shows each action's key on its button. The keys work either way.",
    keywords: "keyboard hotkeys",
  },
  oppHandTopRight: {
    label: "Opponent hand, top right",
    hint: "Shows the opponent's hand on the right of their side instead of the left.",
  },
  tiltedBoard: { label: "Tilted board", hint: "The board leans away from you like a real table." },
  bigBoard: {
    label: "Bigger playing area",
    hint: "Gives the playmats as much of the window as it can: hides the top bar and trims the columns and margins.",
  },
  actionsBeside: {
    label: "Buttons beside the board",
    hint: "Puts the action buttons beside the mats so the mats touch. Off puts them in a strip between the mats.",
  },
  turnSplash: { label: "Turn banner", hint: "Shows “Your turn” / “Opponent's turn” over the board." },
  gameHints: {
    label: "Opening hand tips",
    hint: "Explains Keep, Mulligan and who goes first during the mulligan.",
  },
  reduceMotion: { label: "Reduce animations", hint: "Calmer attack arcs, banners and hand motion." },
  turnAlert: {
    label: "Vibration",
    hint: "Buzzes on supported phones (Android) for card moves, attacks and your turn.",
    keywords: "tab alert browser tab",
  },
  turnSound: {
    label: "Sounds",
    hint: "A chime on your turn, plus short sounds for plays, attacks, K.O.s and more. Works on iPhone too.",
    keywords: "audio volume chime sound",
  },
  spectatorSound: {
    label: "Sound while watching",
    hint: "Game sounds while you spectate a match. Off keeps watching tabs quiet. Needs Sounds on.",
  },
  quietWatchTabs: {
    label: "Quiet watch tabs",
    hint: "A tab where you're spectating or watching a replay stays silent while another tab has your match open.",
  },
  endTurnConfirm: {
    label: "Confirm before ending turn",
    hint: "The middle option asks only while you have active DON!! or a ready attacker.",
    keywords: "always ask never ask",
  },
  responseStops: {
    label: "Stop for block and counter",
    hint: "Auto passes when you can't block or counter. Smart also passes when your Counters can't save the card.",
    keywords: "always stop auto smart",
  },
  handLayout: {
    label: "Hand layout",
    hint: "Automatic uses Grid on tall windows and Fan elsewhere. Fan tucks under the board; Grid is a side panel you can move.",
  },
  screenOrientation: {
    label: "Screen orientation",
    hint: "Locks rotation during a match where the browser allows it (Android, full screen or installed).",
    keywords: "portrait landscape rotate rotation",
  },
  oppHandSpot: {
    label: "Opponent hand position",
    hint: "Where the opponent's hand sits: in a side panel, or pinned to their half of the mat.",
  },
  sidePanels: {
    label: "Side panels",
    hint: "With Drag handles on, drag a panel's grip to move it, or an edge to resize it (double-click to reset). Reset layout puts every panel, hand and pop-up back.",
  },
  textSize: {
    label: "Text size",
    hint: "Makes text and card power numbers bigger or smaller.",
    keywords: "font small medium large",
  },
  lifeFan: {
    label: "Life stack direction",
    hint: "Which way your Life cards fan out. The opponent's Life mirrors yours.",
  },
  sideColumns: {
    label: "Side columns",
    hint: "One column gives the board more room. Both keeps a column on each side.",
  },
  animationSpeed: {
    label: "Animation speed",
    hint: "How fast cards move for draws, plays and K.O.s.",
    keywords: "normal fast off",
  },
  cardSpotlight: {
    label: "Spotlight played and K.O.'d cards",
    hint: "Cards that are played, used as a Counter, K.O.'d or trashed show big for a moment. Off when Animation speed is Off.",
  },
  popupSize: {
    label: "Pop-up size",
    hint: "Size of choice, search and action pop-ups. The − and + in a pop-up’s top bar change it too.",
  },
  previewPopupSize: {
    label: "Card pop-up size",
    hint: "Size of the hover card pop-up. The − and + in its top bar change it too.",
  },
  showOnScreen: {
    label: "Show on screen",
    hint: "Hide extras you don't use. Hidden panels keep their place in your layout.",
    keywords: "card preview chat",
  },
};
