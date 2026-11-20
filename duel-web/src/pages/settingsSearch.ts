import { textMatchesQuery } from "../board/settings/gameplayFields";

export type PanelId =
  | "account"
  | "theme"
  | "playmat"
  | "card-back"
  | "don-card"
  | "deck-editor"
  | "log-pose"
  | "about";

/** Title plus a few words a person might type to find the panel. Gameplay rows are searched row by row instead. */
export const PANEL_SEARCH: Record<PanelId, string> = {
  account: "Account profile username sign in sign out google guest match history bounty email",
  theme: "Appearance Theme colour color mode dark light auto crew",
  playmat: "Appearance Playmat mat background art dim transparency upload",
  "card-back": "Appearance Card back sleeve art upload opponents spectators playmats",
  "don-card": "Appearance DON!! card art don",
  "deck-editor": "Deck editor deck stats cost curve counters draw odds hints",
  "log-pose": "Log Pose analyst connector assistant ai claude link",
  about: "About version update feedback what's new patch notes private prototype",
};

/** Whether a non-Gameplay panel stays on screen for this search. A blank search keeps all of them. */
export function panelMatches(id: PanelId, query: string): boolean {
  return textMatchesQuery(query, PANEL_SEARCH[id]);
}

/** Whether the Gameplay panel as a whole matches (its title), which keeps every one of its rows. */
export function gameplayTitleMatches(query: string): boolean {
  return textMatchesQuery(query, "Gameplay");
}
