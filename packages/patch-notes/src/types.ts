export type PatchApp = "duel" | "planner" | "both";

/** A card a note is about: `image` is the art URL (the base or an alt art), `label` names an alt art such as "Alternate Art". */
export type PatchNoteCard = { id: string; name: string; image: string; label?: string };

/** Filter chips on the What's new page. */
export type Topic = "cards" | "ranked" | "phone" | "shared";

export type PatchNote = {
  date: string;
  app: PatchApp;
  title: string;
  text: string;
  pr?: number;
  cards?: PatchNoteCard[];
  /** Replaces the topics worked out from the words of the note. */
  topics?: Topic[];
};
