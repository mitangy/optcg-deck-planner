/** Which app a note is about. "both" shows in the duel app and the planner. */
export type PatchApp = "duel" | "planner" | "both";

export type PatchNote = {
  /** YYYY-MM-DD (UTC) of the change going live. */
  date: string;
  app: PatchApp;
  /** A few words a player would recognise. */
  title: string;
  /** One or two plain sentences: what players can do now. */
  text: string;
  /** The pull request that shipped it, for maintainers (not shown to players). */
  pr?: number;
};
