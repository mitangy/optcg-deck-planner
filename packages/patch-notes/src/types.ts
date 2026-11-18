export type PatchApp = "duel" | "planner" | "both";

/** A card a note is about: `image` is the art URL (the base or an alt art), `label` names an alt art such as "Alternate Art". */
export type PatchNoteCard = { id: string; name: string; image: string; label?: string };

export type PatchNote = {
  date: string;
  app: PatchApp;
  title: string;
  text: string;
  pr?: number;
  cards?: PatchNoteCard[];
};
