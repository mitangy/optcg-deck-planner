export type PatchApp = "duel" | "planner" | "both";

export type PatchNote = {
  date: string;
  app: PatchApp;
  title: string;
  text: string;
  pr?: number;
};
